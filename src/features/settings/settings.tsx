"use client";

import { TimePicker } from "@/components/time-picker";
import { Select } from "@/components/select";
import { useRef, useState } from "react";
import { Clock3, Download, HardDrive, Palette, Plus, Settings2, Target, Trash2, Upload } from "lucide-react";
import { Button, Dialog, Field, IconButton } from "@/components/ui";
import { decodeBackup, encodeBackup } from "@/features/backup/schema";
import { settingsSchema } from "@/features/backup/schema";
import { GoalFields, readGoal } from "@/features/goals/goal-fields";
import { duration, fa, latin, normalizeTime, todayIn, weekdays } from "@/features/calendar/dates";
import type { Category, PlannerData, Settings as Preferences } from "@/types/planner";

function saveFile(contents: Blob, name: string) {
  const url = URL.createObjectURL(contents);
  const download = document.createElement("a");
  download.href = url;
  download.download = name;
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadBackup(data: PlannerData) {
  const name = `planner-${todayIn(Date.now(), data.settings.zone)}.json`;
  saveFile(new Blob([encodeBackup(data)], { type: "application/json" }), name);
}

export function downloadAttachment(name: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  saveFile(new Blob([bytes], { type: "application/pdf" }), name);
}

export function BackupPanel({ data, corruptRaw, revision, restore, clear, saveError }: {
  saveError?: string; data: PlannerData | null; corruptRaw?: string | null; revision: number;
  restore: (data: PlannerData, revision: number) => boolean; clear: (revision: number) => boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<(ReturnType<typeof decodeBackup> & { revision: number }) | null>(null);
  const [erase, setErase] = useState<number | null>(null);
  const [error, setError] = useState("");
  return <section className="panel padded settings-card">
    <div className="panel-heading"><span className="tile blue"><HardDrive size={20} /></span><div><h2>پشتیبان‌گیری و بازیابی</h2><p>داده‌ها فقط در حافظهٔ همین مرورگر و همین آدرس هستند.</p></div></div>
    <p>برای انتقال به دامنهٔ Vercel یا دستگاه دیگر، بکاپ بگیر و در مقصد بازیابی کن. فایل بکاپ می‌تواند شامل اطلاعات شخصی، لینک جلسات و پیوست‌ها باشد.</p>
    <div className="action-row">
      {data && <Button onClick={() => downloadBackup(data)}><Download size={17} /> دانلود بکاپ JSON</Button>}
      {corruptRaw && <Button onClick={() => saveFile(new Blob([corruptRaw], { type: "text/plain" }), "planner-recovery.txt")}><Download size={17} /> دریافت دادهٔ خام</Button>}
      <Button onClick={() => ref.current?.click()}><Upload size={17} /> بازیابی از فایل</Button>
      <input type="file" aria-label="فایل بکاپ JSON" ref={ref} hidden accept=".json,application/json" onChange={async (event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        setError("");
        try {
          if (file.size > 16 * 1024 * 1024) throw new Error("حجم فایل پشتیبان بیشتر از ۱۶ مگابایت است.");
          setPreview({ ...decodeBackup(await file.text()), revision });
        } catch (issue) { setError((issue as Error).message); }
      }} />
      <Button variant="danger" onClick={() => setErase(revision)}><Trash2 size={17} /> حذف همهٔ داده‌های برنامه</Button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {preview && <Dialog title="بازیابی نسخهٔ پشتیبان" close={() => setPreview(null)}>
      <div className="form">
        <p>تاریخ خروجی {new Intl.DateTimeFormat("fa-IR", { calendar: data?.settings.calendar ?? "persian", dateStyle: "medium", timeStyle: "short", timeZone: data?.settings.zone ?? "Asia/Tehran" }).format(new Date(preview.exportedAt))}</p>
        <p><strong>{fa(preview.data.events.length)} رویداد، {fa(preview.data.categories.length)} دسته و {fa(preview.data.tasks.length)} کار</strong>{preview.data.notes.length > 0 && <span> · {fa(preview.data.notes.length)} یادداشت</span>}{preview.data.lessons.length > 0 && <span> · {fa(preview.data.lessons.length)} درس</span>}</p>
        <p className="warning">با تأیید، داده‌های فعلی این مرورگر با محتوای بکاپ جایگزین می‌شوند.</p>
        {saveError && <p className="error" role="alert">{saveError}</p>}
        {preview.revision !== revision && <p className="error" role="alert">داده‌ها در تب دیگری تغییر کرده‌اند. فایل را دوباره انتخاب کنید.</p>}
        <div className="dialog-actions">
          {data && <Button onClick={() => downloadBackup(data)}><Download size={16} /> دانلود بکاپ فعلی</Button>}
          <Button onClick={() => setPreview(null)}>انصراف</Button>
          <Button variant="primary" disabled={preview.revision !== revision} onClick={() => {
            if (restore(preview.data, preview.revision)) setPreview(null);
          }}>تأیید جایگزینی</Button>
        </div>
      </div>
    </Dialog>}
    {erase !== null && <Dialog title="حذف همهٔ داده‌ها" close={() => setErase(null)}>
      <p>رویدادها، دسته‌ها، کارها، یادداشت‌ها، پیوست‌ها و تنظیمات برنامه از این مرورگر پاک می‌شوند.</p>
      {saveError && <p className="error" role="alert">{saveError}</p>}
      {erase !== revision && <p className="error" role="alert">داده‌ها در تب دیگری تغییر کرده‌اند. دوباره تأیید را باز کنید.</p>}
      <div className="dialog-actions">
        {data && <Button onClick={() => downloadBackup(data)}>دانلود بکاپ فعلی</Button>}
        <Button onClick={() => setErase(null)}>انصراف</Button>
        <Button variant="danger" disabled={erase !== revision} onClick={() => { if (clear(erase)) setErase(null); }}>تأیید حذف همه</Button>
      </div>
    </Dialog>}
  </section>;
}

const knownZones = ["Asia/Tehran", "Asia/Dubai", "Asia/Kabul", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC"];

export function SettingsForm({ current, revision, save }: {
  current: Preferences; revision: number; save: (settings: Preferences) => boolean;
}) {
  const [edit, setEdit] = useState<{ value: Preferences; revision: number } | null>(null);
  const [error, setError] = useState("");
  const settings = edit?.value ?? current;
  const stale = edit !== null && edit.revision !== revision;
  const change = (patch: Partial<Preferences>) => setEdit({ value: { ...settings, ...patch }, revision: edit?.revision ?? revision });
  const updateDay = (day: number, ranges: Preferences["active"][number]) => change({ active: settings.active.map((value, index) => index === day ? ranges : value) });

  return <form className="settings-flow" onSubmit={(event) => {
    event.preventDefault();
    if (stale) return;
    const checked = settingsSchema.safeParse({
      ...settings,
      active: settings.active.map((ranges) => ranges.map(({ start, end }) => ({ start: normalizeTime(start), end: normalizeTime(end) }))),
    });
    if (!checked.success) {
      setError("منطقهٔ زمانی، حداقل مدت و ساعت‌های فعال را بررسی کنید. پایان هر بازه باید بعد از شروع باشد.");
      return;
    }
    setError("");
    if (save(checked.data)) setEdit(null);
  }}>
    <section className="panel padded settings-card">
      <div className="panel-heading"><span className="tile violet"><Settings2 size={20} /></span><div><h2>نمایش و تقویم</h2><p>زبان نمایش فارسی و ساعت‌ها ۲۴ساعته‌اند.</p></div></div>
      <div className="form-grid">
        <Field label="نام نمایشی"><input autoComplete="nickname" value={settings.displayName ?? ""} maxLength={50} onChange={(event) => change({ displayName: event.target.value })} /></Field>
        <Field label="تقویم"><Select value={settings.calendar} onValueChange={(choice) => change({ calendar: choice as Preferences["calendar"] })}>
          <option value="persian">شمسی</option><option value="gregory">میلادی</option></Select></Field>
        <Field label="تم"><Select compact value={settings.theme} onValueChange={(choice) => change({ theme: choice as Preferences["theme"] })}>
          <option value="system">سیستم</option><option value="light">روشن</option><option value="dark">تاریک</option></Select></Field>
        <Field label="منطقهٔ زمانی" hint="نام IANA را انتخاب یا وارد کنید.">
          <input dir="ltr" list="time-zones" value={settings.zone} required onChange={(event) => change({ zone: event.target.value.trim() })} />
        </Field>
        <datalist id="time-zones">{Array.from(new Set([...knownZones, ...Intl.supportedValuesOf("timeZone")])).map((value) => <option value={value} key={value} />)}</datalist>
        <Field label="شروع هفته"><Select value={settings.weekStart} onValueChange={(choice) => change({ weekStart: Number(choice) })}>
          {weekdays.map((value, index) => <option key={value} value={index}>{value}</option>)}</Select></Field>
      </div>
    </section>
    <section className="panel padded settings-card">
      <div className="panel-heading"><span className="tile mint"><Clock3 size={20} /></span><div><h2>ساعات فعال و استراحت</h2><p>روز بدون محدودهٔ زمانی غیرفعال است. پایان روز را می‌توان ۲۴:۰۰ وارد کرد.</p></div></div>
      <div className="form-grid">
        <Field label="حداقل بازهٔ آزاد (دقیقه)"><input inputMode="numeric" value={Number.isFinite(settings.minimum) ? fa(settings.minimum) : ""} onChange={(event) => change({ minimum: event.target.value ? Number(latin(event.target.value)) : NaN })} /></Field>
        <Field label="حاشیهٔ استراحت (دقیقه)" hint="قبل و بعد از هر رویداد در پیشنهادها اعمال می‌شود."><input inputMode="numeric" value={Number.isFinite(settings.buffer) ? fa(settings.buffer) : ""} onChange={(event) => change({ buffer: event.target.value ? Number(latin(event.target.value)) : NaN })} /></Field>
      </div>
      <div className="active-week">{weekdays.map((_, index) => (index + current.weekStart) % 7).map((index) =>
        <div className="active-day" key={index}><strong>{weekdays[index]}</strong><div className="active-ranges">
          {settings.active[index].map((range, rangeIndex) => <div className="active-range" key={rangeIndex}>
            {(["start", "end"] as const).map((key) => <TimePicker key={key} compact endOfDay={key === "end"}
              label={`${weekdays[index]}، ${key === "start" ? "شروع" : "پایان"} بازهٔ ${fa(rangeIndex + 1)}`}
              time={range[key]} onChange={(time) => updateDay(index, settings.active[index].map((item, position) =>
                position === rangeIndex ? { ...item, [key]: latin(time) } : item))} />)}
            <IconButton label={`حذف بازهٔ ${weekdays[index]}`} onClick={() => updateDay(index, settings.active[index].filter((_, position) => position !== rangeIndex))}><Trash2 size={16} /></IconButton>
          </div>)}
          {!settings.active[index].length && <span className="muted">غیرفعال</span>}
        </div><Button variant="ghost" disabled={settings.active[index].length >= 24} onClick={() => updateDay(index, [...settings.active[index], { start: "09:00", end: "13:00" }])}><Plus size={16} /> بازه</Button></div>)}</div>
      {error && <p className="error" role="alert">{error}</p>}
      {stale && <p className="error" role="alert">داده‌ها در تب دیگری تغییر کرده‌اند. برای ادامه، تغییرات این فرم را کنار بگذارید.</p>}
      <div className="action-row">
        <Button variant="primary" type="submit" disabled={!edit || stale}>ذخیرهٔ تنظیمات</Button>
        {edit && <Button onClick={() => { setEdit(null); setError(""); }}>کنار گذاشتن تغییرات</Button>}
      </div>
    </section>
  </form>;
}

export function Categories({ categories, revision, save, saveError }: {
  categories: Category[]; revision: number; save: (categories: Category[]) => boolean; saveError?: string;
}) {
  const [error, setError] = useState("");
  const [goal, setGoal] = useState<{ category: Category; revision: number } | null>(null);
  const [goalError, setGoalError] = useState("");
  return <section className="panel padded settings-card">
    <div className="panel-heading"><span className="tile amber"><Palette size={20} /></span><div><h2>دسته‌بندی‌ها</h2><p>رنگ دسته‌ها را تنظیم کن یا یک دستهٔ تازه بساز.</p></div></div>
    <div className="category-list">{categories.map((category) => <label key={category.id}>
      <input type="color" aria-label={`تغییر رنگ ${category.name}`} value={category.color} onChange={(event) => {
        save(categories.map((entry) => entry.id === category.id ? { ...entry, color: event.target.value } : entry));
      }} /> {category.name}
    </label>)}</div>
    <div className="action-row">{categories.map((category) => <Button key={category.id} variant="ghost" onClick={() => {
      setGoalError(""); setGoal({ category, revision });
    }}><Target size={15} /> هدف هفتگی {category.name}{category.weeklyMinutes ? ` · ${duration(category.weeklyMinutes)}` : ""}</Button>)}</div>
    <form className="category-add" onSubmit={(event) => {
      event.preventDefault();
      const target = event.currentTarget;
      const form = new FormData(target);
      const name = String(form.get("name")).trim();
      if (!name || categories.some((entry) => entry.name === name)) { setError("نام تازه و غیرتکراری وارد کنید."); return; }
      setError("");
      if (save([...categories, { id: crypto.randomUUID(), name, color: String(form.get("color")), weeklyMinutes: 0 }])) target.reset();
    }}>
      <Field label="نام دستهٔ جدید"><input name="name" required maxLength={40} /></Field>
      <Field label="رنگ"><input name="color" type="color" defaultValue="#7654dc" /></Field>
      <Button type="submit"><Plus size={17} /> افزودن دسته</Button>
    </form>
    {goal && <Dialog title={`هدف هفتگی ${goal.category.name}`} close={() => setGoal(null)}>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        if (goal.revision !== revision) return;
        try {
          const weeklyMinutes = readGoal(new FormData(event.currentTarget));
          if (save(categories.map((entry) => entry.id === goal.category.id ? { ...entry, weeklyMinutes } : entry))) setGoal(null);
        } catch (issue) { setGoalError((issue as Error).message); }
      }}>
        <GoalFields minutes={goal.category.weeklyMinutes} />
        <p className="muted">برای حذف هدف، ساعت و دقیقه را صفر بگذار.</p>
        {(goalError || saveError) && <p className="error" role="alert">{goalError || saveError}</p>}
        {goal.revision !== revision && <p className="error" role="alert">داده‌ها تغییر کرده‌اند. فرم را دوباره باز کن.</p>}
        <footer className="dialog-actions"><Button onClick={() => setGoal(null)}>انصراف</Button>
          <Button type="submit" variant="primary" disabled={goal.revision !== revision}>ذخیرهٔ هدف</Button></footer>
      </form>
    </Dialog>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
