import assert from "node:assert/strict";
import test from "node:test";
import { addDays, atTime, instantISO } from "../src/features/calendar/dates";
import { calendarAlarm } from "../src/features/reminders/calendar-alarm";
import { reminderDefaults, remindersDue } from "../src/features/reminders/schedule";
import type { Occurrence } from "../src/types/planner";

const date = "2026-11-27";
const zone = "Asia/Tehran";
const time = (value: string, day = date) => atTime(day, value, zone);

function event(id: string, start: string, end: string, day = date): Occurrence {
  return {
    eventId: id, date: day, title: id, categoryId: "meeting", kind: "general", lessonId: null,
    timing: { allDay: false, zone, start: instantISO(time(start, day)), end: instantISO(time(end, day)) },
    status: "planned", busy: true, travelBefore: 0, travelAfter: 0, location: "", link: "", description: "", links: [], attachments: [],
  };
}

test("only upcoming non-academic timed events qualify at the selected lead time", () => {
  const meeting = event("meeting", "10:00", "10:30");
  const occurrences: Occurrence[] = [
    meeting, { ...meeting, eventId: "class", kind: "class" }, { ...meeting, eventId: "exam", kind: "exam" },
    { ...meeting, eventId: "study", kind: "study" }, { ...meeting, eventId: "lesson-task", lessonId: "course" },
    { ...meeting, eventId: "university", categoryId: "university" },
    { ...meeting, eventId: "cancelled", status: "cancelled" }, { ...meeting, eventId: "done", status: "done" },
    { ...meeting, timing: { allDay: true, start: date, end: addDays(date, 1) } },
  ];
  const settings = { ...reminderDefaults, enabled: true, lead: 10 as const };
  assert.equal(remindersDue(occurrences, time("09:49"), zone, settings).length, 0);
  assert.deepEqual(remindersDue(occurrences, time("09:50"), zone, settings).map((item) => item.title), ["meeting"]);
  assert.equal(remindersDue(occurrences, time("10:00"), zone, settings).length, 0);
  assert.equal(remindersDue(occurrences, time("09:45"), zone, { ...settings, lead: 15 }).length, 1);
});

test("a late-night reminder can precede tomorrow's event and summaries use the local date", () => {
  const settings = { ...reminderDefaults, enabled: true, summaries: 2 as const };
  const tomorrow = event("tomorrow", "00:05", "00:20", addDays(date, 1));
  assert.equal(remindersDue([tomorrow], time("23:50"), zone, settings)[0].title, "tomorrow");
  const today = event("evening", "19:00", "19:30");
  for (const hour of ["09:00", "18:00"]) {
    const alerts = remindersDue([today, tomorrow], time(hour), zone, settings);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].tag, `planner:summary:${date}:${hour}`);
    assert.match(alerts[0].body, /۱ برنامه/);
  }
  assert.equal(remindersDue([today], time("10:00"), zone, settings).length, 0);
});

test("calendar alarms use a stable UID, exact UTC instants and an escaped, folded UTF-8 title", () => {
  const meeting = { ...event("meeting", "10:00", "10:30"), title: "جلسهٔ مهم، ".repeat(13) + "الف;ب\nج" };
  const file = calendarAlarm(meeting, 15, time("09:00"));
  assert.match(file, /DTSTART:20261127T063000Z\r\nDTEND:20261127T070000Z/);
  assert.match(file, /TRIGGER:-PT15M/);
  assert.equal(file.match(/UID:[^\r]*/)?.[0], calendarAlarm(meeting, 10, time("08:00")).match(/UID:[^\r]*/)?.[0]);
  assert.ok(file.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  assert.ok(file.replace(/\r\n /g, "").includes("الف\\;ب\\nج"));
});
