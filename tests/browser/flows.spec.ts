import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays, dateInput, fullDay } from "../../src/features/calendar/dates";
import { storageKey } from "../../src/lib/storage";

const day = "2026-11-25";
const clock = new Date("2026-11-25T05:30:00Z");
const pdf = Buffer.from("%PDF-1.4\n% Synthetic attachment for the browser test\n%%EOF\n");
const backupInput = (page: Page) => page.locator('input[type="file"]').filter({ visible: false });
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "ناوبری اصلی" }).getByRole("button", { name, exact: true });
const dialog = (page: Page) => page.getByRole("dialog");

async function openPlanner(page: Page) {
  await page.clock.setFixedTime(clock);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /، محمد/ })).toBeVisible();
}

async function listDay(page: Page, date: string) {
  const heading = page.getByRole("heading", { name: fullDay(date, "persian"), exact: true });
  await expect(heading).toBeVisible();
  return heading.locator("..");
}

async function newProfile(browser: Browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await openPlanner(page);
  return { context, page };
}

test("class exceptions, meeting conflict, linked task, attachment and atomic backup recovery", async ({ page, browser }) => {
  await openPlanner(page);

  await page.getByRole("button", { name: "کلاس", exact: true }).click();
  await dialog(page).getByLabel("عنوان", { exact: true }).fill("کلاس آزمایشی");
  await dialog(page).getByLabel("ساعت شروع").fill("۱۰:۰۰");
  await dialog(page).getByLabel("ساعت پایان").fill("۱۱:۰۰");
  await dialog(page).getByLabel("تکرار", { exact: true }).click();
  await page.getByRole("option", { name:"هفتگی", exact:true }).click();
  await dialog(page).getByLabel("دوشنبه", { exact: true }).check();
  await dialog(page).getByLabel("پایان تکرار", { exact: true }).click();
  await page.getByRole("option", { name:"تا تاریخ مشخص", exact:true }).click();
  await dialog(page).getByLabel("آخرین تاریخ تکرار", { exact: true }).fill(dateInput(addDays(day, 21), "persian"));
  await dialog(page).getByRole("button", { name: "ذخیرهٔ رویداد" }).click();
  await expect(dialog(page)).toHaveCount(0);

  await nav(page, "تقویم").click();
  await page.getByRole("button", { name: "فهرست", exact: true }).click();
  const exceptionDay = addDays(day, 7);
  await (await listDay(page, exceptionDay)).getByRole("button", { name: /کلاس آزمایشی/ }).click();
  await dialog(page).getByRole("button", { name: "لغو رویداد", exact: true }).click();
  await dialog(page).getByRole("button", { name: "فقط این نوبت" }).click();
  await expect((await listDay(page, exceptionDay)).getByRole("button", { name: /لغوشده/ })).toBeVisible();
  await expect((await listDay(page, addDays(day, 14))).getByRole("button", { name: /کلاس آزمایشی/ })).not.toContainText("لغوشده");

  await nav(page, "داشبورد").click();
  await page.getByRole("button", { name: "جلسه", exact: true }).click();
  await dialog(page).getByLabel("عنوان", { exact: true }).fill("جلسهٔ آزمایشی");
  await dialog(page).getByLabel("ساعت شروع").fill("۱۰۱۵");
  await dialog(page).getByLabel("ساعت پایان").fill("۱۰:۴۵");
  await dialog(page).getByLabel("لینک جلسه").fill("https://example.org/meeting");
  await dialog(page).getByRole("button", { name: "افزودن لینک" }).click();
  await dialog(page).getByLabel("عنوان لینک").fill("شرح موقعیت شغلی");
  await dialog(page).getByLabel("آدرس لینک").fill("https://example.org/job");
  await dialog(page).getByLabel(/پیوست PDF/).setInputFiles({ name: "guide.pdf", mimeType: "application/pdf", buffer: pdf });
  await dialog(page).getByRole("button", { name: "ذخیرهٔ رویداد" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("کلاس آزمایشی");
  await expect(dialog(page).getByRole("alert")).toContainText("۱۰:۱۵ تا ۱۰:۴۵");
  await dialog(page).getByRole("button", { name: "تأیید و ذخیره" }).click();
  await expect(dialog(page)).toHaveCount(0);

  await nav(page, "تنظیمات").click();
  await page.getByLabel("حاشیهٔ استراحت (دقیقه)").fill("۱۵");
  await page.getByRole("button", { name: "ذخیرهٔ تنظیمات" }).click();
  await expect(page.getByRole("status")).toContainText("تنظیمات ذخیره شدند");

  await nav(page, "کارهای بدون زمان").click();
  await page.getByRole("button", { name: "کار جدید" }).click();
  await dialog(page).getByLabel("عنوان کار").fill("تمرین آزمایشی");
  await dialog(page).getByLabel("مدت تخمینی به دقیقه").fill("۹۰");
  await dialog(page).getByLabel("تاریخ مهلت (اختیاری)", { exact: true }).fill(dateInput(day, "persian"));
  await dialog(page).getByRole("button", { name: "ذخیرهٔ کار" }).click();
  await page.getByRole("button", { name: "پیشنهاد زمان" }).click();
  await dialog(page).getByRole("button", { name: /۱۱:۱۵ تا ۱۲:۴۵/ }).click();
  await expect(dialog(page).getByLabel("ساعت شروع")).toHaveValue("۱۱:۱۵");
  await expect(dialog(page).getByLabel("ساعت پایان")).toHaveValue("۱۲:۴۵");
  await dialog(page).getByRole("button", { name: "ذخیرهٔ رویداد" }).click();
  await expect(page.getByText("زمان‌بندی شده", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "پیشنهاد زمان" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("زمان‌بندی شده", { exact: true })).toBeVisible();

  await nav(page, "تنظیمات").click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "دانلود بکاپ JSON" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^mohammad-planner-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = await readFile((await download.path())!);

  const { context, page: fresh } = await newProfile(browser);
  try {
    expect(await fresh.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
    await nav(fresh, "تنظیمات").click();
    const input = backupInput(fresh);
    await input.setInputFiles({ name: "planner.json", mimeType: "application/json", buffer: backup });
    await expect(dialog(fresh)).toContainText("۳ رویداد، ۶ دسته و ۱ کار");
    await dialog(fresh).getByRole("button", { name: "تأیید جایگزینی" }).click();
    await expect(fresh.getByLabel("حاشیهٔ استراحت (دقیقه)")).toHaveValue("۱۵");

    const restored = await fresh.evaluate((key) => localStorage.getItem(key), storageKey);
    await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{invalid") });
    await expect(fresh.getByRole("alert").filter({ hasText: "JSON خوانا نیست" })).toBeVisible();
    expect(await fresh.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(restored);

    await input.setInputFiles({ name: "planner.json", mimeType: "application/json", buffer: backup });
    await expect(dialog(fresh).getByRole("button", { name: "تأیید جایگزینی" })).toBeVisible();
    await fresh.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException("test failure", "QuotaExceededError"); };
      Object.defineProperty(window, "removeTestFailure", { value: () => { Storage.prototype.setItem = original; }, configurable: true });
    });
    await dialog(fresh).getByRole("button", { name: "تأیید جایگزینی" }).click();
    await expect(dialog(fresh).getByRole("alert")).toContainText("ذخیره انجام نشد");
    expect(await fresh.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(restored);
    await dialog(fresh).getByRole("button", { name: "انصراف" }).click();
    await fresh.evaluate(() => Reflect.get(window, "removeTestFailure")());

    await nav(fresh, "تقویم").click();
    await fresh.getByRole("button", { name: "فهرست", exact: true }).click();
    await expect((await listDay(fresh, exceptionDay)).getByRole("button", { name: /لغوشده/ })).toBeVisible();
    await (await listDay(fresh, day)).getByRole("button", { name: /جلسهٔ آزمایشی/ }).click();
    await expect(dialog(fresh).getByRole("link", { name: "شرح موقعیت شغلی" })).toHaveAttribute("href", "https://example.org/job");
    const attachmentDownload = fresh.waitForEvent("download");
    await dialog(fresh).getByRole("button", { name: "guide.pdf" }).click();
    expect(await readFile((await (await attachmentDownload).path())!)).toEqual(pdf);
    await dialog(fresh).getByRole("button", { name: "بستن" }).click();
    await nav(fresh, "کارهای بدون زمان").click();
    await fresh.getByRole("button", { name: "لغو زمان‌بندی" }).click();
    await expect(fresh.getByRole("button", { name: "پیشنهاد زمان" })).toBeVisible();
    await nav(fresh, "تقویم").click();
    await fresh.getByRole("button", { name: "فهرست", exact: true }).click();
    await expect((await listDay(fresh, day)).getByRole("button", { name: /تمرین آزمایشی/ })).toContainText("لغوشده");
  } finally {
    await context.close();
  }
});

test("storage changes stale an open form and corrupt data is kept for recovery", async ({ context, page }) => {
  await openPlanner(page);
  const other = await context.newPage();
  await openPlanner(other);
  await page.getByRole("button", { name: "کلاس", exact: true }).click();
  await dialog(page).getByLabel("عنوان", { exact: true }).fill("فرم قدیمی");
  await other.getByRole("button", { name: "بارگذاری دادهٔ نمونه" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("تب دیگری");
  await expect(dialog(page).getByRole("button", { name: "ذخیرهٔ رویداد" })).toBeDisabled();
  await dialog(page).press("Escape");
  await expect(page.getByRole("button", { name: /کلاس طراحی رابط/ })).toBeVisible();

  await other.evaluate((key) => localStorage.setItem(key, "{invalid"), storageKey);
  await expect(page.getByRole("heading", { name: "داده‌های مرورگر خوانده نشد" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "داده‌های مرورگر خوانده نشد" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("{invalid");
  await page.evaluate(() => localStorage.setItem("unrelated", "keep"));
  await page.getByRole("button", { name: "حذف همهٔ داده‌های برنامه" }).click();
  await dialog(page).getByRole("button", { name: "تأیید حذف همه" }).click();
  expect(await page.evaluate(() => localStorage.getItem("unrelated"))).toBe("keep");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("RTL desktop and mobile calendar controls, keyboard dialogs and no page overflow", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openPlanner(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await nav(page, "تقویم").click();
    await page.getByRole("button", { name: "روز", exact: true }).click();
    const dateButton = page.getByRole("button", { name: fullDay(day, "persian"), exact: true });
    await dateButton.click();
    await dialog(page).getByRole("button", { name: "انتخاب تاریخ", exact: true }).click();
    await dialog(page).getByRole("button", { name: fullDay(addDays(day, 1), "persian"), exact: true }).click();
    await dialog(page).getByRole("button", { name: "برو به تاریخ" }).click();
    await page.getByRole("button", { name: "هفته", exact: true }).click();
    await page.getByRole("button", { name: "روز", exact: true }).click();
    await expect(page.getByRole("button", { name: fullDay(addDays(day, 1), "persian"), exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    const newEvent = page.getByRole("button", { name: "رویداد جدید", exact: true });
    await newEvent.focus();
    await newEvent.press("Enter");
    await expect(dialog(page).getByLabel("تاریخ شروع", { exact: true })).toHaveValue(dateInput(addDays(day, 1), "persian"));
    await dialog(page).press("Escape");
    await expect(newEvent).toBeFocused();
  }
});
