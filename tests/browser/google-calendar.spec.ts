import { expect, test } from "@playwright/test";
import { decodeBackup } from "../../src/features/backup/schema";
import { googleScopes, googleClientKey } from "../../src/features/google-calendar/google-calendar";
import { storageKey } from "../../src/lib/storage";

test("Google Meet imports once, reconciles changes and removes cancelled meetings without storing OAuth tokens", async ({ page }) => {
  const token = "mock-google-access-token";
  let phase = "initial";
  let sawNextPage = false;
  await page.clock.setFixedTime(new Date("2026-11-26T07:30:00Z"));
  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.google = { accounts: { oauth2: { initTokenClient(config) {
      return { requestAccessToken() {
        if (config.scope !== ${JSON.stringify(googleScopes)} || config.include_granted_scopes) throw new Error("Unexpected OAuth scope");
        config.callback({ access_token: ${JSON.stringify(token)}, expires_in: 3600, scope: config.scope });
      } };
    } } } };`,
  }));
  const meeting = (id: string, summary: string, hour: string) => ({
    id, summary, start: { dateTime: `2026-11-26T${hour}:00:00+03:30` },
    end: { dateTime: `2026-11-26T${hour}:30:00+03:30` }, hangoutLink: "https://meet.google.com/abc-defg-hij",
  });
  await page.route((url) => url.origin === "https://www.googleapis.com" &&
    url.pathname.startsWith("/calendar/v3/calendars/primary"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method()).toBe("GET");
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    if (!url.pathname.endsWith("/events")) return route.fulfill({ json: { id: "synthetic@example.invalid", timeZone: "Asia/Tehran" } });
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.searchParams.get("timeMin")).toBeTruthy();
    if (phase === "expired") return route.fulfill({ status: 401 });
    if (phase === "updated") return route.fulfill({ json: { kind: "calendar#events", items: [
      meeting("meeting1", "جلسهٔ جابه‌جا شده", "14"),
      { id: "meeting2", status: "cancelled" },
    ] } });
    if (url.searchParams.get("pageToken") === "next-page") {
      sawNextPage = true;
      return route.fulfill({ json: { kind: "calendar#events", items: [meeting("meeting2", "جلسهٔ دوم", "16")] } });
    }
    return route.fulfill({ json: { kind: "calendar#events", nextPageToken: "next-page", items: [
      meeting("meeting1", "جلسهٔ اول", "12"),
      { ...meeting("unrelated", "رویداد نامرتبط", "15"), hangoutLink: "https://example.org" },
    ] } });
  });

  await page.goto("/");
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Google Calendar", exact: true }) });
  await panel.getByRole("button", { name: "راه‌اندازی اتصال گوگل" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("شناسهٔ OAuth Client").fill("test-app.apps.googleusercontent.com");
  await dialog.getByRole("button", { name: "ذخیرهٔ شناسه" }).click();
  await panel.getByRole("button", { name: "اتصال به Google Calendar" }).click();
  const status = panel.getByRole("status");
  await expect(status).toContainText("۲ جلسه");
  expect(sawNextPage).toBe(true);
  const records = () => page.evaluate((key) => localStorage.getItem(key), storageKey);
  const first = (await records())!;
  expect(decodeBackup(first).data.events).toHaveLength(2);
  expect(first).not.toContain(token);
  expect(first).not.toContain("synthetic@example.invalid");

  await panel.getByRole("button", { name: "همگام‌سازی اکنون" }).click();
  await expect(panel.getByRole("button", { name: "همگام‌سازی اکنون" })).toBeEnabled();
  expect(await records()).toBe(first);
  phase = "updated";
  await panel.getByRole("button", { name: "همگام‌سازی اکنون" }).click();
  await expect(status).toContainText("۱ جلسه");
  const updated = decodeBackup((await records())!).data.events;
  expect(updated).toHaveLength(1);
  expect(updated[0]).toMatchObject({ id: decodeBackup(first).data.events[0].id, timing: { start: "2026-11-26T10:30:00Z" } });

  await nav.getByRole("button", { name: "تقویم", exact: true }).click();
  await page.getByRole("button", { name: /جلسهٔ جابه‌جا شده/ }).first().click();
  await expect(dialog.getByRole("link", { name: /باز کردن لینک جلسه/ })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  await expect(dialog.getByRole("button", { name: "ویرایش", exact: true })).toHaveCount(0);
  await dialog.press("Escape");
  await nav.getByRole("button", { name: "تنظیمات", exact: true }).click();
  phase = "expired";
  await panel.getByRole("button", { name: "همگام‌سازی اکنون" }).click();
  await expect(status).toContainText("مجوز جلسه پایان یافته");
  expect(decodeBackup((await records())!).data.events).toHaveLength(1);

  await page.reload();
  await expect(panel.getByRole("button", { name: "اتصال به Google Calendar" })).toBeEnabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), googleClientKey)).toBe("test-app.apps.googleusercontent.com");
  await panel.getByRole("button", { name: "حذف جلسه‌های واردشده" }).click();
  await dialog.getByRole("button", { name: "تأیید حذف" }).click();
  expect(decodeBackup((await records())!).data.events).toHaveLength(0);
});
