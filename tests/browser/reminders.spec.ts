import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encodeBackup } from "../../src/features/backup/schema";
import { atTime, instantISO } from "../../src/features/calendar/dates";
import { defaults } from "../../src/lib/defaults";
import type { PlannerEvent } from "../../src/types/planner";

const date = "2026-11-27";
const zone = "Asia/Tehran";

test("device reminders notify from an already-open offline page and export a calendar alarm", async ({ page, context }) => {
  const data = defaults();
  const meeting: PlannerEvent = {
    id: "demo-meeting", title: "جلسهٔ آزمایشی یادآوری", categoryId: "meeting", kind: "general", lessonId: null,
    timing: { allDay: false, zone, start: instantISO(atTime(date, "10:00", zone)), end: instantISO(atTime(date, "10:30", zone)) },
    status: "planned", busy: true, travelBefore: 0, travelAfter: 0, location: "", link: "", description: "",
    links: [], attachments: [], recurrence: null, exceptions: {},
  };
  data.events = [meeting, { ...meeting, id: "demo-class", title: "کلاس آزمایشی", kind: "class", categoryId: "university" }];
  await context.grantPermissions(["notifications"]);
  await page.addInitScript((raw) => {
    if (!localStorage.getItem("planner:data")) localStorage.setItem("planner:data", raw);
  }, encodeBackup(data));
  await page.clock.install({ time: new Date(atTime(date, "09:40", zone)) });
  await page.goto("/");
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const reminders = page.locator("section").filter({ has: page.getByRole("heading", { name: "یادآوری‌ها", exact: true }) });
  await reminders.getByRole("combobox", { name: "زمان یادآوری" }).click();
  await page.getByRole("option", { name: "۱۰ دقیقه پیش از شروع" }).click();
  await reminders.getByRole("button", { name: "فعال‌کردن یادآوری این دستگاه" }).click();
  await expect(reminders.getByRole("status")).toContainText("فعال شد");

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(await manifest.json()).toMatchObject({ display: "standalone", start_url: "/" });
  await nav.getByRole("button", { name: "تقویم", exact: true }).click();
  await page.getByRole("button", { name: "روز", exact: true }).click();
  await page.locator(".timeline-event").filter({ hasText: "جلسهٔ آزمایشی یادآوری" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"),
    page.getByRole("button", { name: "دانلود یادآوری تقویم" }).click()]);
  const file = await readFile((await download.path())!, "utf8");
  expect(file).toContain("TRIGGER:-PT10M");
  expect(file).toContain("DTSTART:20261127T063000Z");
  await page.getByRole("dialog").press("Escape");

  const notifications = () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.getNotifications()).map(({ title }) => title);
  });
  await context.setOffline(true);
  expect(await notifications()).toEqual([]);
  await page.clock.fastForward(10 * 60_000 + 1000);
  await expect.poll(notifications).toEqual(["جلسهٔ آزمایشی یادآوری"]);
  await page.evaluate(async () => {
    for (const notice of await (await navigator.serviceWorker.ready).getNotifications()) notice.close();
  });
  await page.clock.fastForward(30_000);
  expect(await notifications()).toEqual([]);
});
