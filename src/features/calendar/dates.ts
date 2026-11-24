import { Temporal } from "@js-temporal/polyfill";
import type { Calendar, Timing } from "@/types/planner";

export const weekdays = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
export const weekdayShort = ["ی", "د", "س", "چ", "پ", "ج", "ش"];
export const minute = 60_000;
const numberFormatter = new Intl.NumberFormat("fa-IR", { useGrouping: false });
export const fa = (value: number) => numberFormatter.format(value);
export const latin = (value: string) => value.replace(/[۰-۹٠-٩]/g, (digit) =>
  String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 1776 ? 1776 : 1632)),
);
export const normalizeTime = (value: string) => latin(value).trim()
  .replace(/^(\d{1,2})(\d{2})$/, "$1:$2")
  .replace(/^(\d):/, "0$1:");
export const localizedTime = (value: string) => value.replace(/\d/g, (digit) => fa(Number(digit)));
export const pad = (value: number) => String(value).padStart(2, "0");
export const day = (date: string) => Temporal.PlainDate.from(date);
export const isoDay = (date: Temporal.PlainDate) => date.withCalendar("iso8601").toString();
export const addDays = (date: string, days: number) => isoDay(day(date).add({ days }));
export const weekday = (date: string) => day(date).dayOfWeek % 7;
export const weekBeginning = (date: string, start: number) => addDays(date, -((weekday(date) - start + 7) % 7));
export const datesBetween = (start: string, end: string) => {
  const dates: string[] = [];
  for (let date = start; date < end; date = addDays(date, 1)) dates.push(date);
  return dates;
};

export function dateParts(date: string, calendar: Calendar) {
  const value = day(date).withCalendar(calendar);
  return { year: value.year, month: value.month, day: value.day };
}

export function calendarDate(year: number, month: number, dayOfMonth: number, calendar: Calendar) {
  return isoDay(Temporal.PlainDate.from({ year, month, day: dayOfMonth, calendar }, { overflow: "reject" }));
}

export function dateInput(date: string, calendar: Calendar) {
  const parts = dateParts(date, calendar);
  return localizedTime(`${parts.year}/${pad(parts.month)}/${pad(parts.day)}`);
}

export function parseDateInput(value: string, calendar: Calendar) {
  const parts = latin(value).trim().match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (!parts) throw new Error("تاریخ را با قالب سال/ماه/روز وارد کنید.");
  try {
    const date = calendarDate(Number(parts[1]), Number(parts[2]), Number(parts[3]), calendar);
    if (date < "1900-01-01" || date > "2199-12-31") throw new RangeError();
    return date;
  } catch {
    throw new Error("تاریخ واردشده معتبر نیست یا خارج از بازهٔ پشتیبانی است.");
  }
}

export function monthStart(date: string, calendar: Calendar) {
  const parts = dateParts(date, calendar);
  return calendarDate(parts.year, parts.month, 1, calendar);
}

export function addMonths(date: string, months: number, calendar: Calendar) {
  return isoDay(day(date).withCalendar(calendar).add({ months }));
}

export const inZone = (instant: number, zone: string) =>
  Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(zone);
export const todayIn = (instant: number, zone: string) => isoDay(inZone(instant, zone).toPlainDate());
export const localTime = (instant: number, zone: string) => inZone(instant, zone).toPlainTime().toString({ smallestUnit: "minute" });
export const epoch = (instant: string) => Temporal.Instant.from(instant).epochMilliseconds;
export const instantISO = (instant: number) => Temporal.Instant.fromEpochMilliseconds(instant).toString();

export function atTime(date: string, time: string, zone: string, disambiguation: "compatible" | "reject" = "compatible") {
  return day(date).toPlainDateTime(Temporal.PlainTime.from(time)).toZonedDateTime(zone, { disambiguation }).epochMilliseconds;
}

export function timingInterval(timing: Timing, viewZone: string) {
  return timing.allDay
    ? { start: atTime(timing.start, "00:00", viewZone), end: atTime(timing.end, "00:00", viewZone) }
    : { start: epoch(timing.start), end: epoch(timing.end) };
}

export function formatDay(date: string, calendar: Calendar, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("fa-IR", { calendar, timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`));
}

export const monthLabel = (date: string, calendar: Calendar) =>
  `${formatDay(date, calendar, { month: "long" })} ${fa(dateParts(date, calendar).year)}`;
export const fullDay = (date: string, calendar: Calendar) => {
  const parts = dateParts(date, calendar);
  const month = formatDay(date, calendar, { month: "long" });
  return `${weekdays[weekday(date)]} ${fa(parts.day)} ${month} ${fa(parts.year)}`;
};
export const clockLabel = (time: number, zone: string) => localizedTime(localTime(time, zone));
export const duration = (minutes: number) => {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return [hours ? `${fa(hours)} ساعت` : "", rest || !hours ? `${fa(rest)} دقیقه` : ""].filter(Boolean).join(" و ");
};

export function eventTime(timing: Timing, zone: string) {
  if (timing.allDay) return "تمام‌روز";
  const start = epoch(timing.start);
  const end = epoch(timing.end);
  return `${clockLabel(start, zone)} تا ${clockLabel(end, zone)}${todayIn(start, zone) !== todayIn(end, zone) ? " · روز بعد" : ""}`;
}
