"use client";

import { TimePicker } from "@/components/time-picker";
import { Select } from "@/components/select";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Paperclip, Plus, Save, Trash2 } from "lucide-react";
import { Button, Check, DateField, Field } from "@/components/ui";
import { addDays, atTime, clockLabel, epoch, eventTime, fullDay, instantISO, latin, localTime, minute, normalizeTime, parseDateInput, timingInterval, todayIn, weekday, weekdays } from "@/features/calendar/dates";
import { conflicts } from "@/features/availability/availability";
import { eventFieldsSchema } from "@/features/backup/schema";
import { expandEvents, seriesDate, validOccurrenceDate } from "./recurrence";
import { LessonSelect } from "@/features/lessons/lesson-select";
import { eventKinds, kindForCategory, statusLabels } from "@/lib/defaults";
import type { Attachment, EventFields, EventKind, Interval, PlannerData, PlannerEvent, Recurrence, Timing } from "@/types/planner";

export interface EventDraft {
  title?: string;
  date: string;
  slot?: Interval;
  zone?: string;
  categoryId?: string;
  fields?: EventFields;
  series?: PlannerEvent;
  occurrence?: string;
  taskId?: string;
  lessonId?: string;
  kind?: EventKind;
}

export function EventForm({ data, draft, cancel, stale, save }: {
  data: PlannerData; draft: EventDraft; cancel: () => void; stale: boolean;
  save: (event: PlannerEvent, taskId?: string) => boolean;
}) {
  const { calendar, zone, weekStart } = data.settings;
  const fields = draft.fields;
  const editZone = fields?.timing.allDay === false ? fields.timing.zone : draft.zone ?? zone;
  const initial = fields?.timing;
  const rule = draft.occurrence ? null : draft.series?.recurrence;
  const linkedTask = data.tasks.find((task) => task.id === draft.taskId || task.eventId === draft.series?.id);
  const category = fields?.categoryId ?? draft.categoryId ?? linkedTask?.categoryId ?? data.categories[0].id;
  const [kind, setKind] = useState<EventKind>(fields?.kind ?? draft.kind ?? (linkedTask ? "general" : kindForCategory(category)));
  const [kindTouched, setKindTouched] = useState(Boolean(fields || draft.kind || linkedTask));
  const startDate = initial ? seriesDate(initial) : draft.slot ? todayIn(draft.slot.start, editZone) : draft.date;
  const endDate = initial?.allDay ? addDays(initial.end, -1)
    : initial ? todayIn(epoch(initial.end), editZone) : draft.slot ? todayIn(draft.slot.end, editZone) : startDate;
  const startTime = initial && !initial.allDay ? localTime(epoch(initial.start), editZone) : draft.slot ? localTime(draft.slot.start, editZone) : "09:00";
  const endTime = initial && !initial.allDay ? localTime(epoch(initial.end), editZone) : draft.slot ? localTime(draft.slot.end, editZone) : "10:00";
  const [allDay, setAllDay] = useState(initial?.allDay ?? draft.kind === "exam");
  const [frequency, setFrequency] = useState(rule?.frequency ?? "");
  const [endType, setEndType] = useState(rule?.end.type ?? "never");
  const [links, setLinks] = useState(fields?.links ?? []);
  const [attachments, setAttachments] = useState(fields?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<{ messages: string[]; event: PlannerEvent } | null>(null);
  const week = Array.from({ length: 7 }, (_, index) => (index + weekStart) % 7);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || stale) return;
    setPending(true);
    setError("");
    setWarning(null);
    try {
      const form = new FormData(event.currentTarget);
      const get = (name: string) => String(form.get(name) ?? "").trim();
      const start = parseDateInput(get("startDate"), calendar);
      const end = parseDateInput(get("endDate"), calendar);
      let timing: Timing;
      if (allDay) {
        if (end < start) throw new Error("تاریخ پایان پیش از تاریخ شروع است.");
        timing = { allDay: true, start, end: addDays(end, 1) };
      } else {
        const times = [get("startTime"), get("endTime")].map(normalizeTime);
        if (times.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) throw new Error("ساعت را با قالب ۲۴ ساعته، مانند ۰۹:۳۰، وارد کنید.");
        const timed = (date: string, time: string, previous?: string) => {
          if (previous && todayIn(epoch(previous), editZone) === date && localTime(epoch(previous), editZone) === time) return previous;
          try { return instantISO(atTime(date, time, editZone, "reject")); }
          catch { throw new Error("این ساعت در منطقهٔ زمانی رویداد ناموجود یا مبهم است. ساعت دیگری انتخاب کنید."); }
        };
        const originalTiming = initial?.allDay === false ? initial : draft.zone && draft.slot
          ? { start: instantISO(draft.slot.start), end: instantISO(draft.slot.end) } : undefined;
        timing = {
          allDay: false, zone: editZone,
          start: timed(start, times[0], originalTiming?.start),
          end: timed(end, times[1], originalTiming?.end),
        };
        if (epoch(timing.end) <= epoch(timing.start)) throw new Error("پایان باید بعد از شروع باشد. برای عبور از نیمه‌شب، تاریخ پایان را تغییر دهید.");
      }

      if (attachments.length + files.length > 3) throw new Error("هر رویداد حداکثر سه پیوست می‌پذیرد.");
      const readFiles = await Promise.all(files.map(async (file): Promise<Attachment> => {
        if (file.size > 1_048_576 || !/\.pdf$/i.test(file.name)) throw new Error("هر پیوست باید PDF و حداکثر ۱ مگابایت باشد.");
        if (await file.slice(0, 5).text() !== "%PDF-") throw new Error("محتوای یکی از فایل‌های پیوست PDF نیست.");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("خواندن فایل پیوست ممکن نبود."));
          reader.readAsDataURL(file);
        });
        return { name: file.name, base64 };
      }));
      if (!active.current) return;
      const travelBefore = Number(latin(get("travelBefore")));
      const travelAfter = Number(latin(get("travelAfter")));
      if ([travelBefore, travelAfter].some((value) => !Number.isInteger(value) || value < 0 || value > 720)) {
        throw new Error("زمان رفت‌وآمد باید بین صفر و ۷۲۰ دقیقه باشد.");
      }
      const checked = eventFieldsSchema.safeParse({
        title: get("title"), categoryId: get("category"), lessonId: get("lesson") || null, kind, travelBefore, travelAfter, timing, location: get("location"), link: get("link"),
        description: get("description"), links, attachments: [...attachments, ...readFiles], status: get("status"), busy: form.has("busy"),
      });
      if (!checked.success) throw new Error("عنوان و مقادیر رویداد را بررسی کنید. لینک جلسه باید با http یا https شروع شود.");
      const values = checked.data;

      let recurrence: Recurrence | null = null;
      if (frequency === "daily" || frequency === "weekly" || frequency === "monthly") {
        const months = get("monthCalendar") === "gregory" ? "gregory" : "persian";
        const weekdays = frequency === "weekly" ? form.getAll("weekdays").map(Number) : [];
        if (frequency === "weekly" && !weekdays.includes(weekday(start))) throw new Error("روز تاریخ شروع را در میان روزهای تکرار هفتگی انتخاب کنید.");
        let ending: Recurrence["end"] = { type: "never" };
        if (endType === "until") {
          const date = parseDateInput(get("until"), calendar);
          if (date < start) throw new Error("پایان تکرار باید در تاریخ شروع یا بعد از آن باشد.");
          ending = { type: "until", date };
        }
        if (endType === "count") {
          const count = Number(latin(get("count")));
          if (!Number.isInteger(count) || count < 1 || count > 100000) throw new Error("تعداد نوبت‌ها باید بین ۱ و ۱۰۰٬۰۰۰ باشد.");
          ending = { type: "count", count };
        }
        recurrence = { frequency, weekdays, calendar: months, end: ending };
      }

      const edited: PlannerEvent = draft.series && draft.occurrence
        ? { ...draft.series, exceptions: { ...draft.series.exceptions, [draft.occurrence]: values } }
        : { ...values, id: draft.series?.id ?? crypto.randomUUID(), recurrence, exceptions: draft.series?.exceptions ?? {} };
      const removed = Object.keys(edited.exceptions).filter((date) => !edited.recurrence || !validOccurrenceDate(edited, date));
      edited.exceptions = Object.fromEntries(Object.entries(edited.exceptions).filter(([date]) => !removed.includes(date)));
      const messages: string[] = removed.length ? ["با تغییر قانون سری، بعضی استثناهای قبلی دیگر نوبت معتبری ندارند و حذف می‌شوند."] : [];

      if ((values.busy || values.travelBefore || values.travelAfter) && values.status !== "cancelled") {
        const interval = timingInterval(values.timing, zone);
        const from = todayIn(interval.start, zone);
        const horizon = edited.recurrence && !draft.occurrence ? 366 : 1;
        const to = addDays(todayIn(interval.end - 1, zone), horizon);
        const others = expandEvents(data.events.filter((entry) => !draft.series || draft.occurrence || entry.id !== draft.series.id), addDays(from, -1), addDays(to, 1), zone);
        const candidates = edited.recurrence && !draft.occurrence
          ? expandEvents([edited], from, to, zone)
          : [{ ...values, eventId: edited.id, date: start }];
        const warningEntries = new Set<string>();
        for (const candidate of candidates) {
          const sharedEvents = conflicts(candidate, edited.recurrence && !draft.occurrence ? [...others, ...candidates] : others, zone,
            { eventId: edited.id, date: draft.occurrence ?? candidate.date }, true);
          for (const { event, shared } of sharedEvents) {
            const displayRange = `${clockLabel(shared.start, zone)} تا ${clockLabel(shared.end, zone)}`;
            const dayLabel = fullDay(todayIn(shared.start, zone), calendar);
            const endDay = todayIn(shared.end, zone);
            const cross = endDay !== todayIn(shared.start, zone) ? ` تا ${fullDay(endDay, calendar)}` : "";
            warningEntries.add(`«${event.title}» (${eventTime(event.timing, zone)})، ${dayLabel}${cross} · اشتراک ${displayRange}`);
            if (warningEntries.size >= 12) break;
          }
          if (warningEntries.size >= 12) break;
        }
        messages.push(...warningEntries);
      }

      if (linkedTask && values.status !== "cancelled") {
        const interval = timingInterval(values.timing, zone);
        if (interval.end - interval.start < linkedTask.minutes * minute) throw new Error("مدت رویداد از مدت تخمینی کار کوتاه‌تر است.");
        if (linkedTask.due && todayIn(interval.end - 1, zone) > linkedTask.due) throw new Error("زمان‌بندی پس از مهلت کار است.");
      }
      if (messages.length) setWarning({ messages, event: edited });
      else save(edited, draft.taskId);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "ثبت رویداد ممکن نبود."); }
    finally { setPending(false); }
  }

  return <form className="form event-editor" onSubmit={submit} onChange={() => { if (warning) setWarning(null); }}>
    {draft.occurrence && <p className="info">تغییرات این فرم فقط روی نوبت انتخاب‌شده اعمال می‌شود.</p>}
    {stale && <p className="error" role="alert">داده‌ها در تب دیگری تغییر کرده‌اند. فرم را ببندید و دوباره باز کنید.</p>}
    <Field label="عنوان"><input name="title" required maxLength={160} autoFocus defaultValue={fields?.title ?? draft.title ?? linkedTask?.title ?? ""} placeholder="مثلاً کلاس مبانی طراحی" /></Field>
    <div className="form-grid">
      <Field label="دسته‌بندی"><Select name="category" defaultValue={category}
        onValueChange={(choice) => { if (!kindTouched) setKind(kindForCategory(choice)); }}>
        {data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </Select></Field>
      <Field label="وضعیت"><Select name="status" defaultValue={fields?.status ?? "planned"}>
        {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select></Field>
    </div>
    <div className="form-grid">
      <Field label="نوع رویداد"><Select value={kind} onValueChange={(choice) => { setKindTouched(true); setKind(choice as EventKind); }}>
        {Object.entries(eventKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select></Field>
      {data.lessons.length > 0 && <LessonSelect lessons={data.lessons} value={fields ? fields.lessonId : draft.lessonId ?? linkedTask?.lessonId} />}
    </div>
    <div className="check-row"><Check checked={allDay} onChange={(event) => setAllDay(event.target.checked)}>تمام‌روز</Check><Check name="busy" defaultChecked={fields?.busy ?? true}>زمان را اشغال می‌کند</Check></div>
    <div className="form-grid">
      <DateField label="تاریخ شروع" date={startDate} calendar={calendar} weekStart={weekStart} onPick={() => setWarning(null)} name="startDate" required />
      <DateField label={allDay ? "آخرین روز رویداد" : "تاریخ پایان"} date={endDate} calendar={calendar} weekStart={weekStart} onPick={() => setWarning(null)} name="endDate" required />
      {!allDay && <><TimePicker label="ساعت شروع" name="startTime" time={startTime} /><TimePicker label="ساعت پایان" name="endTime" time={endTime} /></>}
    </div>
    {!allDay && <small className="muted">منطقهٔ زمانی رویداد <bdi>{editZone}</bdi></small>}
    {!draft.occurrence && !linkedTask && <>
      <Field label="تکرار"><Select value={frequency} onValueChange={(choice) => setFrequency(choice)}>
        <option value="">بدون تکرار</option><option value="daily">روزانه</option><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option>
      </Select></Field>
      {frequency === "weekly" && <fieldset><legend>روزهای تکرار</legend><div className="check-row">{week.map((value) => <Check key={value} name="weekdays" value={value}
        defaultChecked={rule?.weekdays.includes(value) || weekday(startDate) === value}>{weekdays[value]}</Check>)}</div></fieldset>}
      {frequency === "monthly" && <Field label="مبنای تکرار ماهانه" hint="در ماهی که روز انتخاب‌شده وجود ندارد، آن نوبت رد می‌شود.">
        <Select name="monthCalendar" defaultValue={rule?.calendar ?? calendar}><option value="persian">همان روزِ ماه شمسی</option><option value="gregory">همان روزِ ماه میلادی</option></Select>
      </Field>}
      {frequency && <><div className="form-grid">
        <Field label="پایان تکرار"><Select value={endType} onValueChange={(choice) => setEndType(choice as typeof endType)}>
          <option value="never">بدون پایان</option><option value="until">تا تاریخ مشخص</option><option value="count">پس از تعداد نوبت</option>
        </Select></Field>
        {endType === "until" && <DateField label="آخرین تاریخ تکرار" name="until" date={rule?.end.type === "until" ? rule.end.date : startDate} calendar={calendar} weekStart={weekStart} onPick={() => setWarning(null)} required />}
        {endType === "count" && <Field label="تعداد نوبت‌ها"><input name="count" inputMode="numeric" required defaultValue={rule?.end.type === "count" ? rule.end.count : 10} /></Field>}
      </div><small className="muted">تداخل نوبت‌های سری تا یک سال از شروع بررسی می‌شود.</small></>}
    </>}
    <div className="form-grid">
      <Field label="مکان"><input name="location" maxLength={300} defaultValue={fields?.location} placeholder="اختیاری" /></Field>
      <Field label="لینک جلسه"><input name="link" type="url" dir="ltr" maxLength={1500} defaultValue={fields?.link} placeholder="https://" /></Field>
    </div>
    <fieldset className="form"><legend>رفت‌وآمد</legend>
      <div className="form-grid">
        <Field label="رفت‌وآمد قبل (دقیقه)"><input name="travelBefore" inputMode="numeric" defaultValue={fields?.travelBefore || ""} placeholder="۰" /></Field>
        <Field label="رفت‌وآمد بعد (دقیقه)"><input name="travelAfter" inputMode="numeric" defaultValue={fields?.travelAfter || ""} placeholder="۰" /></Field>
      </div>
      <small className="muted">این زمان در پیشنهادها اشغال است و جدا از مدت رویداد حساب می‌شود.</small>
    </fieldset>
    <Field label="توضیحات"><textarea name="description" rows={2} maxLength={3000} defaultValue={fields?.description} placeholder="اختیاری" /></Field>
    <fieldset className="form"><legend><Paperclip size={16} /> لینک‌ها و پیوست‌ها</legend>
      {links.map((link, index) => <div key={index} className="link-inputs">
        <Field label="عنوان لینک"><input required maxLength={100} value={link.label} onChange={(event) => setLinks(links.map((item, current) => current === index ? { ...item, label: event.target.value } : item))} placeholder="مثلاً شرح موقعیت شغلی" /></Field>
        <Field label="آدرس لینک"><input type="url" required dir="ltr" maxLength={1500} value={link.url} onChange={(event) => setLinks(links.map((item, current) => current === index ? { ...item, url: event.target.value } : item))} placeholder="https://" /></Field>
        <Button aria-label="حذف لینک" onClick={() => { setLinks(links.filter((_, current) => current !== index)); setWarning(null); }}><Trash2 size={17} /></Button>
      </div>)}
      <div><Button disabled={links.length >= 10} onClick={() => { setLinks([...links, { label: "", url: "" }]); setWarning(null); }}><Plus size={16} /> افزودن لینک</Button></div>
      {attachments.map((attachment, index) => <div key={index} className="attachment-row">
        <bdi>{attachment.name}</bdi><Button variant="ghost" onClick={() => { setAttachments(attachments.filter((_, current) => current !== index)); setWarning(null); }}>برداشتن</Button>
      </div>)}
      <Field label="پیوست PDF" hint="تا ۳ فایل، حداکثر ۱ مگابایت برای هر فایل. فایل‌ها در بکاپ هم قرار می‌گیرند.">
        <input type="file" multiple accept=".pdf,application/pdf" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
      </Field>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    {warning && <div className="warning" role="alert">
      <strong><AlertTriangle size={17} /> بررسی تداخل و تغییرات سری</strong><ul>{warning.messages.map((message) => <li key={message}>{message}</li>)}</ul>
    </div>}
    <footer className="dialog-actions"><Button onClick={cancel}>انصراف</Button>
      {warning ? <Button variant="primary" disabled={stale || pending} onClick={() => save(warning.event, draft.taskId)}>تأیید و ذخیره</Button>
        : <Button type="submit" variant="primary" disabled={stale || pending}><Save size={17} /> ذخیرهٔ رویداد</Button>}
    </footer>
  </form>;
}
