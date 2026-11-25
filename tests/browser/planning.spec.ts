import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { addDays, atTime, dateInput, instantISO, weekday } from "../../src/features/calendar/dates";
import { decodeBackup, encodeBackup } from "../../src/features/backup/schema";
import { defaults } from "../../src/lib/defaults";
import { storageKey } from "../../src/lib/storage";
import type { PlannerEvent } from "../../src/types/planner";

const date = "2026-11-25";
const zone = "Asia/Tehran";
const fixedTime = new Date("2026-11-25T10:45:00Z");
const nextDay = addDays(date, 1);
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "ناوبری اصلی" }).getByRole("button", { name, exact: true });
const modal = (page: Page) => page.getByRole("dialog");
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const exactField = (page: Page, label: string) => modal(page).getByLabel(label, { exact: true });
const backupInput = (page: Page) => page.locator('input[type="file"][aria-label="فایل بکاپ JSON"]');

function event(id: string, title: string, start: string, end: string, categoryId: string): PlannerEvent {
  return {
    id, title, categoryId, timing: { allDay: false, zone, start: instantISO(atTime(date, start, zone)), end: instantISO(atTime(date, end, zone)) },
    kind: "general", lessonId: null, travelBefore: 0, travelAfter: 0, location: "", links: [], attachments: [],
    link: "", description: "", status: "planned", busy: true, recurrence: null, exceptions: {},
  };
}

function legacyBackup() {
  const data = defaults();
  const categories = data.categories.map(({ id, name, color }) => ({ id, name, color }));
  const events = [
    event("past-study", "مطالعهٔ عقب‌افتاده", "09:00", "10:00", "study"),
    { ...event("fixed-class", "کلاس ثابت آزمایشی", "14:00", "15:00", "university"),
      recurrence: { frequency: "weekly", calendar: "persian", weekdays: [weekday(date)], end: { type: "never" } } },
    event("late-task", "کار با مهلت گذشته", "11:00", "12:00", "university"),
  ].map(({ id, title, categoryId, timing, location, links, attachments, link, description, status, busy, recurrence, exceptions }) =>
    ({ id, title, categoryId, timing, location, links, attachments, link, description, status, busy, recurrence, exceptions }));
  const tasks = [
    { id: "study-task", title: "مطالعهٔ عقب‌افتاده", minutes: 60, priority: "medium", due: date, eventId: "past-study" },
    { id: "expired", title: "کار با مهلت گذشته", minutes: 60, priority: "high", due: addDays(date, -1), eventId: "late-task" },
  ];
  return JSON.stringify({ version: 2, exportedAt: "2026-11-25T00:00:00Z", data: { categories, tasks, events, settings: data.settings } });
}
async function readPlanner(page: Page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  if (!raw) throw new Error("Expected planner data in localStorage");
  return decodeBackup(raw).data;
}
async function initialize(page: Page) {
  await page.clock.setFixedTime(fixedTime);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^(صبح بخیر|ظهر بخیر|عصر بخیر|شب‌بخیر)/ })).toBeVisible();
}
async function importBackup(page: Page, buffer: Buffer) {
  await nav(page, "تنظیمات").click();
  await backupInput(page).setInputFiles({ name: "planner.json", mimeType: "application/json", buffer });
  await modal(page).getByRole("button", { name: "تأیید جایگزینی" }).click();
  await expect(modal(page)).toHaveCount(0);
}

test("restore v2, manage a lesson, rank travel-aware suggestions, and copy a week with preview", async ({ page, browser }) => {
  await initialize(page);
  await importBackup(page, Buffer.from(legacyBackup()));
  let data = await readPlanner(page);
  expect(data.events).toHaveLength(3);
  expect(data.events.find((entry) => entry.id === "fixed-class")?.kind).toBe("class");
  expect(data.tasks).toHaveLength(2);

  await nav(page, "درس‌ها").click();
  await button(page, "درس جدید").click();
  await exactField(page, "نام درس").fill("منطق آزمایشی");
  await exactField(page, "ساعت هدف هفتگی").fill("۴");
  await button(page, "ذخیرهٔ درس").click();
  await expect(page.getByRole("heading", { name: "منطق آزمایشی" })).toBeVisible();

  await button(page, "جلسهٔ مطالعه").click();
  await expect(exactField(page, "درس")).toHaveText("منطق آزمایشی");
  await exactField(page, "عنوان").fill("مطالعهٔ دو ساعته");
  await exactField(page, "ساعت شروع").fill("۱۷:۰۰");
  await exactField(page, "ساعت پایان").fill("۱۹:۰۰");
  await button(page, "ذخیرهٔ رویداد").click();
  await expect(modal(page)).toHaveCount(0);

  await button(page, "امتحان").click();
  await expect(exactField(page, "تمام‌روز")).toBeChecked();
  await exactField(page, "عنوان").fill("امتحان آزمایشی");
  await exactField(page, "تاریخ شروع").fill(dateInput(nextDay, "persian"));
  await exactField(page, "آخرین روز رویداد").fill(dateInput(nextDay, "persian"));
  await button(page, "ذخیرهٔ رویداد").click();
  await expect(page.getByText("۱ روز تا امتحان")).toBeVisible();
  await expect(page.getByText("۲ ساعت مطالعهٔ برنامه‌ریزی‌شده تا امتحان")).toBeVisible();

  await button(page, "تکلیف").click();
  await exactField(page, "عنوان کار").fill("تحویل تمرین آزمایشی");
  await exactField(page, "تاریخ مهلت (اختیاری)").fill(dateInput(nextDay, "persian"));
  await exactField(page, "انجام‌شده").check();
  await button(page, "ذخیرهٔ کار").click();
  await expect(page.getByText(/انجام‌شده · مهلت/)).toBeVisible();

  await nav(page, "داشبورد").click();
  await expect(page.getByText("۲ ساعت دیگر برای برنامه‌ریزی")).toBeVisible();
  await page.locator(".schedule-entries").getByRole("button", { name: /کلاس ثابت آزمایشی/ }).click();
  await button(page, "ویرایش").click();
  await button(page, "کل سری").click();
  await exactField(page, "رفت‌وآمد بعد (دقیقه)").fill("۳۰");
  await exactField(page, "درس").click();
  await page.getByRole("option", { name:"منطق آزمایشی", exact:true }).click();
  await button(page, "ذخیرهٔ رویداد").click();
  await expect(modal(page)).toHaveCount(0);

  await nav(page, "تنظیمات").click();
  await button(page, "زمان ترجیحی جدید").click();
  await exactField(page, "روز ترجیح").click();
  await page.getByRole("option", { name:"چهارشنبه", exact:true }).click();
  await exactField(page, "شروع ترجیح").fill("۱۵:۰۰");
  await exactField(page, "پایان ترجیح").fill("۱۷:۰۰");
  await button(page, "ذخیرهٔ ترجیح").click();
  await expect(modal(page)).toHaveCount(0);
  await button(page, "هدف هفتگی مطالعه").click();
  await exactField(page, "ساعت هدف هفتگی").fill("۵");
  await button(page, "ذخیرهٔ هدف").click();
  await expect(modal(page)).toHaveCount(0);

  await nav(page, "تقویم").click();
  await button(page, "روز").click();
  await page.getByLabel("پیشنهاد برای دسته").click();
  await page.getByRole("option", { name:"مطالعه", exact:true }).click();
  await expect(page.locator(".free-section").getByRole("button", { name: /۱۵:۳۰ تا ۱۶:۳۰.*مطابق ترجیح/ })).toBeVisible();

  await nav(page, "داشبورد").click();
  const categoryGoal = page.locator(".goal-card").filter({ has: page.getByRole("heading", { name: "مطالعه", exact: true }) });
  await expect(categoryGoal).toContainText("هدف ۵ ساعت");
  const overdue = page.locator("section").filter({ has: page.getByRole("heading", { name: "عقب‌افتاده‌ها", exact: true }) });
  await overdue.locator("article").filter({ hasText: "کار با مهلت گذشته" }).getByRole("button", { name: "پیشنهاد زمان جدید" }).click();
  await expect(modal(page).getByText("تا پایان مهلت، بازهٔ آزادی با مدت لازم پیدا نشد.")).toBeVisible();
  await modal(page).press("Escape");
  await overdue.locator("article").filter({ hasText: "مطالعهٔ عقب‌افتاده" }).getByRole("button", { name: "پیشنهاد زمان جدید" }).click();
  await expect(modal(page).getByRole("button", { name: /۱۵:۳۰ تا ۱۶:۳۰.*مطابق ترجیح/ })).toBeVisible();
  const proposals = modal(page).getByRole("button", { name: /تا \d|تا [۰-۹]{2}:/ });
  expect(await proposals.count()).toBeLessThanOrEqual(3);
  await modal(page).getByRole("button", { name: /۱۵:۳۰ تا ۱۶:۳۰/ }).click();
  await expect(modal(page).getByText(/زمان قبلی.*۰۹:۰۰/)).toBeVisible();
  await expect(modal(page).getByText(/زمان جدید.*۱۵:۳۰/)).toBeVisible();
  await button(page, "تأیید جابه‌جایی").click();
  data = await readPlanner(page);
  expect(data.tasks.find((entry) => entry.id === "study-task")?.eventId).toBe("past-study");
  expect(data.events.filter((entry) => entry.id === "past-study")).toHaveLength(1);
  expect(data.events.find((entry) => entry.id === "past-study")?.timing.start).toBe(instantISO(atTime(date, "15:30", zone)));
  expect(data.events.find((entry) => entry.id === "fixed-class")?.timing.start).toBe(instantISO(atTime(date, "14:00", zone)));

  await nav(page, "تقویم").click();
  await button(page, "هفته").click();
  await button(page, "کپی برنامه به هفتهٔ بعد").click();
  await expect(modal(page).getByRole("checkbox", { name: "کلاس ثابت آزمایشی" })).toHaveCount(0);
  for (const title of ["مطالعهٔ عقب‌افتاده", "کار با مهلت گذشته", "امتحان آزمایشی"]) {
    await modal(page).getByRole("checkbox", { name: title, exact: true }).uncheck();
  }
  await exactField(page, "ساعت مقصد مطالعهٔ دو ساعته").fill("۱۴:۱۵");
  await expect(modal(page).getByText("تداخل در مقصد")).toBeVisible();
  await expect(modal(page).getByText(/«کلاس ثابت آزمایشی»/)).toBeVisible();
  await exactField(page, "ساعت مقصد مطالعهٔ دو ساعته").fill("۱۷:۳۰");
  await expect(modal(page).getByText("تداخل در مقصد")).toHaveCount(0);
  await button(page, "تأیید و کپی").click();
  data = await readPlanner(page);
  const copies = data.events.filter((entry) => entry.title === "مطالعهٔ دو ساعته");
  expect(copies).toHaveLength(2);
  expect(copies[0].id).not.toBe(copies[1].id);
  expect(copies[1].timing.start).toBe(instantISO(atTime(addDays(date, 7), "17:30", zone)));
  expect(copies[1].timing.end).toBe(instantISO(atTime(addDays(date, 7), "19:30", zone)));
  expect(copies[1].lessonId).toBe(data.lessons[0].id);
  expect(copies[1].categoryId).toBe("study");
  expect(data.events.filter((entry) => entry.title === "کلاس ثابت آزمایشی")).toHaveLength(1);

  await nav(page, "تنظیمات").click();
  const downloaded = page.waitForEvent("download");
  await button(page, "دانلود بکاپ JSON").click();
  const file = await readFile((await (await downloaded).path())!);
  expect(JSON.parse(file.toString()).version).toBe(3);
  const profile = await browser.newContext();
  try {
    const fresh = await profile.newPage();
    await initialize(fresh);
    await importBackup(fresh, file);
    expect(await readPlanner(fresh)).toEqual(data);
    await fresh.reload();
    await expect(fresh.getByText("چهارشنبه · ۱۵:۰۰ تا ۱۷:۰۰")).toBeVisible();
    await nav(fresh, "درس‌ها").click();
    await button(fresh, "جزئیات منطق آزمایشی").click();
    await expect(fresh.getByText("۱ روز تا امتحان")).toBeVisible();
  } finally {
    await profile.close();
  }
});

test("moving one past occurrence updates the exception and preserves its series after refresh", async ({ page }) => {
  await initialize(page);
  const data = defaults();
  data.events = [{ ...event("study-series", "مطالعهٔ تکراری", "08:00", "09:00", "study"), kind: "study",
    recurrence: { frequency: "daily", calendar: "persian", weekdays: [], end: { type: "never" } } }];
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: encodeBackup(data) });
  await page.reload();
  await button(page, "پیشنهاد زمان جدید").click();
  await modal(page).getByRole("button", { name: /۱۴:۱۵ تا ۱۵:۱۵/ }).click();
  await button(page, "تأیید جابه‌جایی").click();
  await page.reload();
  await expect(button(page, "پیشنهاد زمان جدید")).toHaveCount(0);
  const saved = await readPlanner(page);
  expect(saved.events).toHaveLength(1);
  expect(saved.events[0].recurrence).toEqual(data.events[0].recurrence);
  expect(saved.events[0].timing).toEqual(data.events[0].timing);
  expect(saved.events[0].exceptions[date]?.timing.start).toBe(instantISO(atTime(date, "14:15", zone)));
});

test("legacy localStorage loads without rewriting the original value", async ({ page }) => {
  await initialize(page);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: legacyBackup() });
  await page.reload();
  await expect(page.getByRole("heading", { name: "عقب‌افتاده‌ها" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "کار با مهلت گذشته" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(legacyBackup());
});
