import type { Occurrence } from "@/types/planner";
import { canRemind, type LeadTime } from "./schedule";

const stamp = (value: string | number) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/([,;])/g, "\\$1");

// Fold by UTF-8 bytes, including the continuation space, as required by iCalendar.
function fold(line: string) {
  const encoder = new TextEncoder();
  let bytes = 0;
  let result = "";
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { result += "\r\n "; bytes = 1; }
    result += char;
    bytes += size;
  }
  return result;
}

export function calendarAlarm(event: Occurrence, lead: LeadTime, now: number): string {
  if (!canRemind(event)) throw new Error("برای این رویداد یادآوری تنظیم نمی‌شود.");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//My Schedule//Reminder//FA", "BEGIN:VEVENT",
    `UID:planner-${event.eventId}-${event.date}@my-schedule.local`, `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.timing.start)}`, `DTEND:${stamp(event.timing.end)}`,
    `SUMMARY:${escapeText(event.title)}`, "BEGIN:VALARM", "ACTION:DISPLAY",
    `TRIGGER:-PT${lead}M`, `DESCRIPTION:${escapeText(event.title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}
