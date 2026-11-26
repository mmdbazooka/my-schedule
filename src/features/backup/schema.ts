import { z } from "zod";
import { addDays, day, epoch, weekday } from "@/features/calendar/dates";
import { seriesDate, validOccurrenceDate } from "@/features/events/recurrence";
import { kindForCategory } from "@/lib/defaults";
import type { PlannerData } from "@/types/planner";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try { return value >= "1900-01-01" && value <= "2200-01-01" && day(value).toString() === value; } catch { return false; }
});
const instant = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/).refine((value) => {
  try { return Number.isFinite(epoch(value)) && value.slice(0, 10) >= "1899-12-30" && value.slice(0, 10) <= "2200-01-02"; } catch { return false; }
});
const zone = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat("fa", { timeZone: value }); return true; } catch { return false; }
});
const title = z.string().trim().min(1).max(160);
const calendar = z.enum(["persian", "gregory"]);
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const weekdayNumber = z.number().int().min(0).max(6);
const safeLink = z.string().max(1500).refine((value) => {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
});
const timing = z.discriminatedUnion("allDay", [
  z.object({ allDay: z.literal(true), start: date, end: date }),
  z.object({ allDay: z.literal(false), start: instant, end: instant, zone }),
]).refine((value) => {
  try { return value.allDay ? value.end > value.start : epoch(value.end) > epoch(value.start); } catch { return false; }
});
const weeklyMinutes = z.number().int().min(0).max(10080);
const travel = z.number().int().min(0).max(720);
const hours = z.object({ start: clock, end: clock.or(z.literal("24:00")) }).refine((range) => range.start < range.end);
export const eventFieldsSchema = z.object({
  title, categoryId: id, timing, kind: z.enum(["general", "class", "exam", "study"]), lessonId: id.nullable(),
  travelBefore: travel, travelAfter: travel, location: z.string().max(300), link: safeLink,
  links: z.array(z.object({ label: z.string().trim().min(1).max(100), url: safeLink.refine(Boolean) })).max(10).default([]),
  attachments: z.array(z.object({
    name: z.string().min(5).max(180).regex(/\.pdf$/i),
    base64: z.string().max(1_398_104).regex(/^JVBERi[0123][A-Za-z0-9+/]*={0,2}$/).refine((value) => {
      const size = (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
      return value.length % 4 === 0 && size <= 1_048_576;
    }),
  })).max(3).default([]),
  description: z.string().max(3000), status: z.enum(["planned", "done", "cancelled"]), busy: z.boolean(),
});
const recurrence = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  weekdays: z.array(weekdayNumber).max(7).refine((values) => new Set(values).size === values.length),
  calendar,
  end: z.discriminatedUnion("type", [
    z.object({ type: z.literal("never") }),
    z.object({ type: z.literal("until"), date }),
    z.object({ type: z.literal("count"), count: z.number().int().min(1).max(100_000) }),
  ]),
});
const event = eventFieldsSchema.extend({ id, googleCalendar: z.string().regex(/^[a-f0-9]{64}$/).optional(), recurrence: recurrence.nullable(), exceptions: z.record(date, eventFieldsSchema.nullable()) });
const task = z.object({
  id, title, minutes: z.number().int().min(1).max(1440), priority: z.enum(["low", "medium", "high"]),
  due: date.nullable(), eventId: id.nullable(), lessonId: id.nullable(), categoryId: id.nullable(), done: z.boolean(),
});
export const settingsSchema = z.object({
  displayName: z.string().trim().max(50).optional(),
  calendar, zone, weekStart: weekdayNumber, theme: z.enum(["light", "dark", "system"]),
  minimum: z.number().int().min(1).max(720), buffer: z.number().int().min(0).max(180),
  active: z.array(z.array(hours).max(24)).length(7),
});

export const noteBodyLimit = 20_000;
const note = z.object({
  id,
  title: z.string().trim().max(160),
  body: z.string().trim().min(1).max(noteBodyLimit),
  updatedAt: instant,
});

const dataSchema = z.object({
  categories: z.array(z.object({ id, name: title.max(40), color, weeklyMinutes })).min(1).max(200),
  lessons: z.array(z.object({ id, name: title.max(80), weeklyMinutes })).max(500),
  preferences: z.array(hours.safeExtend({ id, categoryId: id, weekday: weekdayNumber })).max(500),
  events: z.array(event).max(10000),
  tasks: z.array(task).max(10000),
  notes: z.array(note).max(10000),
  settings: settingsSchema,
});
const envelope = z.object({ version: z.number().int(), exportedAt: z.iso.datetime({ offset: true }), data: z.unknown() });
const unique = (values: string[]) => new Set(values).size === values.length;

export const version = 5;

export function validateData(input: unknown): PlannerData {
  const parsed = dataSchema.safeParse(input);
  if (!parsed.success) throw new Error("ساختار داده یا یکی از مقادیر تاریخ، زمان یا تنظیمات معتبر نیست.");
  const data = parsed.data;
  const categoryIds = new Set(data.categories.map((entry) => entry.id));
  const lessonIds = new Set(data.lessons.map((entry) => entry.id));
  const eventsById = new Map(data.events.map((entry) => [entry.id, entry]));
  if (categoryIds.size !== data.categories.length || eventsById.size !== data.events.length ||
    lessonIds.size !== data.lessons.length || !unique(data.preferences.map((entry) => entry.id)) ||
    !unique(data.tasks.map((entry) => entry.id)) || !unique(data.notes.map((entry) => entry.id))) throw new Error("فایل دارای شناسهٔ تکراری است.");
  const lessonExists = (value: string | null) => value === null || lessonIds.has(value);
  if (data.preferences.some((entry) => !categoryIds.has(entry.categoryId)) ||
    data.tasks.some((entry) => !lessonExists(entry.lessonId) || (entry.categoryId !== null && !categoryIds.has(entry.categoryId)))) {
    throw new Error("ارجاع دسته یا درس در تنظیمات و کارها معتبر نیست.");
  }
  for (const entry of data.events) {
    const dates = Object.keys(entry.exceptions);
    if (entry.googleCalendar && (entry.recurrence || !/^google_[a-f0-9]{64}$/.test(entry.id))) {
      throw new Error("شناسه یا ساختار جلسهٔ واردشده از گوگل معتبر نیست.");
    }
    if (!categoryIds.has(entry.categoryId) || Object.values(entry.exceptions).some((value) => value && !categoryIds.has(value.categoryId))) {
      throw new Error("یکی از رویدادها به دسته‌ای ناموجود ارجاع دارد.");
    }
    if (!lessonExists(entry.lessonId) || Object.values(entry.exceptions).some((value) => value && !lessonExists(value.lessonId))) {
      throw new Error("یکی از رویدادها به درس ناموجود ارجاع دارد.");
    }
    if (!entry.recurrence && dates.length) throw new Error("استثنا بدون سری تکرار معتبر نیست.");
    if (entry.recurrence) {
      const anchor = seriesDate(entry.timing);
      if (entry.recurrence.frequency === "weekly" && !entry.recurrence.weekdays.includes(weekday(anchor))) {
        throw new Error("روز شروع در روزهای سری هفتگی وجود ندارد.");
      }
      if (entry.recurrence.end.type === "until" && entry.recurrence.end.date < anchor) {
        throw new Error("تاریخ پایان تکرار پیش از شروع سری است.");
      }
      if (dates.some((key) => !validOccurrenceDate(entry, key))) throw new Error("استثنا به نوبت معتبری از سری ارجاع ندارد.");
    }
  }
  const linked = data.tasks.flatMap((entry) => entry.eventId ? [entry.eventId] : []);
  if (!unique(linked) || linked.some((key) => {
    const entry = eventsById.get(key);
    return !entry || entry.googleCalendar || entry.recurrence || entry.status === "cancelled";
  })) throw new Error("زمان‌بندی یکی از کارها به رویداد معتبری ارجاع ندارد.");
  if (data.tasks.some((task) => task.eventId && task.done !== (eventsById.get(task.eventId)?.status === "done"))) {
    throw new Error("وضعیت کار با رویداد زمان‌بندی‌شدهٔ آن سازگار نیست.");
  }
  return data;
}

// Version 1 had inclusive all-day end dates and no buffer setting.
function migrateV1(input: unknown) {
  const object = z.object({
    categories: z.unknown(), settings: z.record(z.string(), z.unknown()),
    events: z.array(z.record(z.string(), z.unknown())), tasks: z.unknown(),
  }).parse(input);
  const migrateFields = (entry: Record<string, unknown>) => {
    const timing = z.record(z.string(), z.unknown()).parse(entry.timing);
    return { ...entry, timing: timing.allDay === true ? { ...timing, end: addDays(date.parse(timing.end), 1) } : timing };
  };
  return {
    ...object, settings: { ...object.settings, buffer: 0 },
    events: object.events.map((entry) => {
      const exceptions = z.record(z.string(), z.record(z.string(), z.unknown()).nullable()).parse(entry.exceptions ?? {});
      return { ...migrateFields(entry), exceptions: Object.fromEntries(Object.entries(exceptions)
        .map(([key, fields]) => [key, fields && migrateFields(fields)])) };
    }),
  };
}

// Version 2 stored no lessons, goals, travel, or preferred times.
function migrateV2(input: unknown) {
  const record = z.record(z.string(), z.unknown());
  const previous = z.object({ categories: z.array(record), events: z.array(record), tasks: z.array(record), settings: z.unknown() }).parse(input);
  const linkedEvents = new Set(previous.tasks.map((entry) => entry.eventId));
  const fields = (entry: Record<string, unknown>, linked = false) => ({
    ...entry, kind: linked && entry.categoryId === "university" ? "general" : kindForCategory(typeof entry.categoryId === "string" ? entry.categoryId : null),
    lessonId: null, travelBefore: 0, travelAfter: 0,
  });
  const events = previous.events.map((entry) => ({
    ...fields(entry, linkedEvents.has(entry.id)),
    exceptions: Object.fromEntries(Object.entries(z.record(z.string(), record.nullable()).parse(entry.exceptions))
      .map(([key, value]) => [key, value && fields(value)])),
  }));
  const eventsById = new Map(previous.events.map((entry) => [entry.id, entry]));
  return {
    ...previous, events, lessons: [], preferences: [],
    categories: previous.categories.map((entry) => ({ ...entry, weeklyMinutes: 0 })),
    tasks: previous.tasks.map((entry) => ({
      ...entry, lessonId: null, categoryId: null, done: eventsById.get(entry.eventId)?.status === "done",
    })),
  };
}

export function encodeBackup(data: PlannerData, exportedAt = new Date().toISOString()) {
  return JSON.stringify({ version, exportedAt, data }, null, 2);
}

export function decodeBackup(raw: string) {
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("فایل JSON خوانا نیست."); }
  const parsed = envelope.safeParse(input);
  if (!parsed.success) throw new Error("سربرگ یا تاریخ فایل پشتیبان معتبر نیست.");
  const file = parsed.data;
  if (file.version > version) throw new Error("نسخهٔ بکاپ جدیدتر از نسخهٔ برنامه است.");
  if (file.version < 1) throw new Error("این نسخهٔ بکاپ پشتیبانی نمی‌شود.");
  let data = file.data;
  if (file.version === 1) {
    try { data = migrateV1(data); } catch { throw new Error("تبدیل ساختار بکاپ نسخهٔ ۱ ممکن نبود."); }
  }
  if (file.version === 1 || file.version === 2) {
    try { data = migrateV2(data); } catch { throw new Error("تبدیل ساختار بکاپ قدیمی ممکن نبود."); }
  }
  if (file.version < 4) {
    const previous = z.record(z.string(), z.unknown()).safeParse(data);
    if (!previous.success) throw new Error("تبدیل ساختار بکاپ قدیمی ممکن نبود.");
    data = { ...previous.data, notes: [] };
  }
  return { exportedAt: file.exportedAt, data: validateData(data) };
}
