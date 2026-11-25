import { createHash } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const dialog = (p: Page) => p.getByRole("dialog");
const go = (p: Page,name: string) => p.getByRole("navigation").getByRole("button",{name,exact:true}).click();
async function capture(p: Page, title: string) {
  await p.getByRole("button",{name:"ثبت سریع",exact:true}).click();
  await dialog(p).getByLabel("چه کاری داری؟").fill(title);
  await dialog(p).getByLabel("چه کاری داری؟").press("Enter");
  await expect(dialog(p)).toHaveCount(0);
}

test("two isolated devices exchange encrypted snapshots and retain competing offline edits", async ({browser, page, context}) => {
  const blobs = new Map<string,string>();
  let sha = "";
  async function github(c: BrowserContext) {
    await c.route("https://api.github.com/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!request.headers().authorization) return route.fulfill({status:401});
      if (path === "/repos/test/private") return route.fulfill({json:{private:true}});
      if (path.includes("/git/blobs/")) return route.fulfill({json:{encoding:"base64",content:blobs.get(path.split("/").pop()!)}});
      if (request.method() === "GET") return route.fulfill({json:{type:"file",sha,size:1000}});
      const body = request.postDataJSON();
      if ((body.sha ?? "") !== sha) return route.fulfill({status:409});
      sha = createHash("sha1").update(body.content).digest("hex");
      blobs.set(sha,body.content);
      return route.fulfill({json:{content:{sha}}});
    });
  }
  await github(context);
  await page.goto("/");
  await capture(page,"کار آزمایشی مبدأ");
  await go(page,"یادداشت‌ها");
  await page.getByRole("button",{name:"یادداشت جدید"}).click();
  await dialog(page).getByLabel("متن یادداشت").fill("این متن فقط برای همگام‌سازی آزمایشی است.");
  await dialog(page).getByRole("button",{name:"ذخیرهٔ یادداشت"}).click();
  await page.getByRole("button",{name:"تغییر تم روشن و تاریک"}).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme",/light|dark/);
  await go(page,"تنظیمات");
  await page.getByRole("button",{name:"راه‌اندازی همگام‌سازی"}).click();
  await dialog(page).getByLabel("مخزن خصوصی").fill("test/private");
  await dialog(page).getByLabel("توکن دستگاه").fill("test-only");
  await dialog(page).getByRole("button",{name:"رمزگذاری و اتصال"}).click();
  const code = await dialog(page).getByLabel("کد اتصال",{exact:true}).inputValue();
  expect(code).not.toContain("test-only");
  expect(Buffer.from(blobs.get(sha)!,"base64").toString()).not.toContain("کار آزمایشی مبدأ");
  await dialog(page).press("Escape");
  const mobile = await browser.newContext({viewport:{width:390,height:844}});
  try {
    await github(mobile);
    const phone = await mobile.newPage();
    await phone.goto(page.url());
    await phone.getByRole("button",{name:"ورود با کد اتصال"}).click();
    await dialog(phone).getByLabel("کد دستگاه اول").fill(code);
    await dialog(phone).getByLabel("توکن دستگاه").fill("second-test-token");
    await dialog(phone).getByRole("button",{name:"مشاهدهٔ نسخهٔ دستگاه"}).click();
    await dialog(phone).getByRole("button",{name:"جایگزینی داده‌های این دستگاه"}).click();
    await go(phone,"یادداشت‌ها");
    await expect(phone.getByRole("button",{name:/این متن فقط برای همگام‌سازی آزمایشی است/})).toBeVisible();
    await go(phone,"کارهای بدون زمان");
    await expect(phone.getByText("کار آزمایشی مبدأ",{exact:true})).toBeVisible();
    const old = sha;
    await context.setOffline(true);
    await capture(page,"کار محلی مستقل");
    await capture(phone,"تغییر گوشی");
    await expect.poll(() => sha).not.toBe(old);
    await context.setOffline(false);
    await expect(page.getByRole("dialog",{name:"انتخاب نسخهٔ همگام‌سازی"})).toBeVisible();
    await dialog(page).getByRole("button",{name:"جایگزینی داده‌های این دستگاه"}).click();
    await go(page,"کارهای بدون زمان");
    await expect(page.getByText("تغییر گوشی",{exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByText("تغییر گوشی",{exact:true})).toBeVisible();
    await go(page,"مرور هفتگی");
    await expect(page.getByRole("heading",{name:"زمان هر دسته"})).toBeVisible();
  } finally { await mobile.close(); }
});

test("create a timed event using the header shortcut and review it by category", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-25T10:07:00Z"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "ثبت سریع", exact: true })).toBeVisible();
  await page.keyboard.press("n");
  const form = dialog(page);
  await form.getByLabel("چه کاری داری؟").fill("تمرین ارائه");
  await form.getByRole("button", { name: "۶۰ دقیقه" }).click();
  await form.getByRole("button", { name: "ثبت به‌صورت رویداد…" }).click();
  await expect(form.getByLabel("عنوان", { exact: true })).toHaveValue("تمرین ارائه");
  const category = form.getByRole("combobox", { name: "دسته‌بندی" });
  await category.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: "دانشگاه", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "شخصی", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(category).toHaveText("شخصی");
  await form.getByRole("button", { name: "ذخیرهٔ رویداد" }).click();
  await expect(form).toHaveCount(0);
  await go(page, "مرور هفتگی");
  await expect(page.getByText("شخصی", { exact: true })).toBeVisible();
  await expect(page.getByText("۰ دقیقه انجام‌شده · ۱ ساعت در وضعیت برنامه‌ریزی‌شده")).toBeVisible();
});
