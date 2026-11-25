import { expect, test } from "@playwright/test";
import { decodeBackup, encodeBackup } from "../../src/features/backup/schema";
import { defaults } from "../../src/lib/defaults";
import { storageKey } from "../../src/lib/storage";

test("converts Tehran time across day and DST boundaries, then saves the exact meeting instant", async ({ page }) => {
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
  await expect(zone("GMT")).toContainText("۰۸:۳۰");
  await expect(zone("نیویورک")).toContainText("۰۳:۳۰");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByLabel("تاریخ ایران", { exact: true }).fill("2026/07/22");
  const book = page.getByRole("button", { name: "ثبت جلسه در تقویم" });
  await expect(book).toBeDisabled();
  await page.getByRole("group", { name: "ساعت‌های پرکاربرد" }).getByRole("button", { name: "۱۲:۰۰" }).click();
  await expect(zone("EST")).toContainText("۰۳:۳۰");
  await expect(zone("نیویورک")).toContainText("۰۴:۳۰");
  await expect(zone("GMT")).toContainText("۰۸:۳۰");
  await expect(zone("لندن")).toContainText("۰۹:۳۰");
  await expect(zone("WAT")).toContainText("۰۹:۳۰");
  await expect(zone("برزیل · برازیلیا و سائوپائولو")).toContainText("۰۵:۳۰");

  const time = page.getByLabel("ساعت ایران", { exact: true });
  const convert = page.getByRole("button", { name: "تبدیل ساعت", exact: true }).last();
  await time.fill("۲۵:۰۰");
  await convert.click();
  await expect(page.getByRole("alert").filter({ hasText: "۲۴ ساعته" })).toBeVisible();
  await expect(book).toBeDisabled();
  await time.fill("۰۰:۳۰");
  await convert.click();
  await expect(zone("EST")).toContainText("روز قبل");

  await time.fill("۲۳:۳۰");
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
