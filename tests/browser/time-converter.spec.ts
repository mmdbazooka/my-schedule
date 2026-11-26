import { expect, test, type Page } from "@playwright/test";
import { decodeBackup, encodeBackup } from "../../src/features/backup/schema";
import { defaults } from "../../src/lib/defaults";
import { storageKey } from "../../src/lib/storage";

async function choose(page: Page, field: string, value: string) {
  await page.getByRole("combobox", { name: field, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

test("foreign AM/PM time converts to Tehran and retains the exact meeting instant in the calendar", async ({ page }) => {
  const data = defaults();
  data.settings.calendar = "gregory";
  data.settings.zone = "America/New_York";
  await page.addInitScript(({ key, raw }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
  }, { key: storageKey, raw: encodeBackup(data) });
  await page.clock.setFixedTime(new Date("2026-11-25T08:30:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "تبدیل ساعت" }).click();
  const zone = (name: string) => page.getByRole("article", { name, exact: true });
  await expect(zone("GMT")).toContainText("8:30 AM");
  await expect(zone("نیویورک")).toContainText("3:30 AM");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await choose(page, "منطقهٔ مبدأ", "GMT");
  await page.getByLabel("تاریخ مبدأ", { exact: true }).fill("2026/07/22");
  await choose(page, "ساعت", "1");
  await choose(page, "دقیقه", "30");
  await choose(page, "AM / PM", "PM");
  const book = page.getByRole("button", { name: "ثبت جلسه در تقویم" });
  await expect(book).toBeDisabled();
  const convert = page.getByRole("button", { name: "تبدیل ساعت", exact: true }).last();
  await convert.click();
  await expect(page.getByRole("region", { name: "زمان تبدیل‌شدهٔ تهران" })).toContainText("۱۷:۰۰");
  await expect(zone("GMT")).toContainText("1:30 PM");
  await expect(zone("EST")).toContainText("8:30 AM");
  await expect(zone("نیویورک")).toContainText("9:30 AM");
  await expect(zone("لندن")).toContainText("2:30 PM");
  await expect(zone("WAT")).toContainText("2:30 PM");
  await expect(zone("برزیل · برازیلیا و سائوپائولو")).toContainText("10:30 AM");

  await choose(page, "ساعت", "8");
  await convert.click();
  await expect(zone("GMT")).toContainText("روز قبل");
  await expect(page.getByRole("region", { name: "زمان تبدیل‌شدهٔ تهران" })).toContainText("۰۰:۰۰");
  await choose(page, "دقیقه", "00");
  await convert.click();
  await expect(zone("توکیو")).toContainText("روز بعد");
  await book.click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByLabel("ساعت شروع", { exact: true })).toHaveValue("۲۳:۳۰");
  await expect(editor.getByLabel("ساعت پایان", { exact: true })).toHaveValue("۰۰:۳۰");
  await expect(editor.getByLabel("تاریخ پایان", { exact: true })).toHaveValue("۲۰۲۶/۰۷/۲۳");
  await editor.getByLabel("عنوان", { exact: true }).fill("جلسه با تیم برزیل");
  await editor.getByRole("button", { name: "ذخیرهٔ رویداد" }).click();
  await expect(editor).toHaveCount(0);
  const raw = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  expect(decodeBackup(raw!).data.events[0]).toMatchObject({
    categoryId: "meeting",
    timing: { zone: "Asia/Tehran", start: "2026-07-22T20:00:00Z", end: "2026-07-22T21:00:00Z" },
  });
});
