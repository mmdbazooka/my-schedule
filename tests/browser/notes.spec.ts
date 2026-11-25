import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaults } from "../../src/lib/defaults";
import { decodeBackup } from "../../src/features/backup/schema";

test("legacy data migrates and notes can be searched, edited, backed up and deleted", async ({ page }) => {
  const { notes, ...legacy } = defaults();
  expect(notes).toEqual([]);
  const raw = JSON.stringify({ version: 3, exportedAt: "2026-11-25T00:00:00Z", data: legacy });
  await page.addInitScript((data) => {
    if (!localStorage.getItem("planner:data")) localStorage.setItem("planner:data", data);
  }, raw);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#notes");
  await expect(page.getByText("هنوز یادداشتی نداری")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: "یادداشت جدید" }).click();
  const editor = page.getByRole("dialog");
  const body = editor.getByLabel("متن یادداشت");
  const save = editor.getByRole("button", { name: "ذخیرهٔ یادداشت" });
  await body.fill("  ");
  await expect(save).toBeDisabled();
  await editor.getByLabel("عنوان (اختیاری)").fill("ایده‌ها");
  await body.fill("یک طرح برای کارگاه\nسؤال‌های هفته");
  await save.click();
  await page.reload();
  const card = page.getByRole("button", { name: /ایده‌ها/ });
  await expect(card).toContainText("سؤال‌های هفته");
  const search = page.getByRole("searchbox", { name: "جست‌وجوی یادداشت‌ها" });
  await search.focus();
  await expect(search).toHaveCSS("border-top-width", "0px");
  await expect(search).toHaveCSS("outline-style", "none");
  await expect(page.locator(".notes-search")).toHaveCSS("outline-style", "solid");
  await search.fill("کارگاه");
  await expect(card).toBeVisible();
  await search.fill("عبارت ناموجود");
  await expect(page.getByText("یادداشتی پیدا نشد")).toBeVisible();
  await page.getByRole("button", { name: "پاک‌کردن جست‌وجو" }).click();

  await card.click();
  await body.fill("متن ویرایش‌شده");
  await editor.getByRole("button", { name: "حذف یادداشت" }).click();
  await editor.getByRole("button", { name: "بازگشت" }).click();
  await expect(body).toHaveValue("متن ویرایش‌شده");
  await save.click();
  await expect(card).toContainText("متن ویرایش‌شده");

  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: "تنظیمات", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "دانلود بکاپ JSON" }).click(),
  ]);
  const file = await readFile((await download.path())!, "utf8");
  expect(decodeBackup(file).data.notes[0]).toMatchObject({ title: "ایده‌ها", body: "متن ویرایش‌شده" });
  await nav.getByRole("button", { name: "یادداشت‌ها", exact: true }).click();
  await card.click();
  await editor.getByRole("button", { name: "حذف یادداشت" }).click();
  await editor.getByRole("button", { name: "تأیید حذف" }).click();
  await expect(page.getByText("هنوز یادداشتی نداری")).toBeVisible();

  await nav.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.getByLabel("فایل بکاپ JSON").setInputFiles({ name: "planner.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await expect(editor.getByText(/۱ یادداشت/)).toBeVisible();
  await editor.getByRole("button", { name: "تأیید جایگزینی" }).click();
  await nav.getByRole("button", { name: "یادداشت‌ها", exact: true }).click();
  await expect(card).toContainText("متن ویرایش‌شده");
});
