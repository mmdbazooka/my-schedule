import assert from "node:assert/strict";
import { test } from "node:test";
import { availableSlots, conflicts, dailyAvailability, suggestions } from "../src/features/availability/availability";
import { decodeBackup, encodeBackup, validateData } from "../src/features/backup/schema";
import { addDays, atTime, calendarDate, dateInput, instantISO, localTime, minute, parseDateInput, weekday } from "../src/features/calendar/dates";
import { occurrencesOn, timelineLayout } from "../src/features/calendar/layout";
import { expandEvents, nextOccurrence, occurrenceFields, seriesDate } from "../src/features/events/recurrence";
import { defaults } from "../src/lib/defaults";
import type { PlannerEvent, Timing } from "../src/types/planner";

const zone = "Asia/Tehran";
const date = "2026-11-25";
function timed(id: string, start: string, end: string, dateStart = date, dateEnd = date, timeZone = zone): PlannerEvent {
  return {
    id, title: id, categoryId: "university", location: "", link: "", links: [], attachments: [], description: "",
    status: "planned", busy: true, timing: {
      allDay: false, zone: timeZone, start: instantISO(atTime(dateStart, start, timeZone)), end: instantISO(atTime(dateEnd, end, timeZone)),
    }, recurrence: null, exceptions: {},
  };
}

test("touching events are not conflicts and overlap reports the exact common interval", () => {
  const [first, touching, overlap] = expandEvents([
    timed("first", "09:00", "10:00"), timed("touching", "10:00", "11:00"), timed("overlap", "10:15", "10:45"),
  ], date, addDays(date, 1), zone);
  assert.deepEqual(conflicts(first, [touching], zone), []);
  assert.deepEqual(conflicts(touching, [overlap], zone).map(({ shared }) => shared), [
    { start: atTime(date, "10:15", zone), end: atTime(date, "10:45", zone) },
  ]);
});

test("only the union of busy events inside active hours counts, with buffer applied only to suggestions", () => {
  const data = defaults();
  data.settings.active[weekday(date)] = [{ start: "09:00", end: "13:00" }, { start: "15:00", end: "17:00" }];
  data.settings.buffer = 15;
  const events = [
    timed("a", "08:00", "10:00"), timed("b", "09:30", "11:30"), { ...timed("c", "12:00", "13:00"), status: "cancelled" },
    { ...timed("d", "15:00", "16:00"), busy: false },
  ] satisfies PlannerEvent[];
  const hours = dailyAvailability(date, data.settings, expandEvents(events, date, addDays(date, 1), zone));
  assert.equal(hours.busyMinutes, 150);
  assert.equal(hours.freeMinutes, 210);
  assert.equal(hours.buffered[0].start, atTime(date, "11:45", zone));
  layoutTest(events.slice(0, 2));
});

function layoutTest(events: PlannerEvent[]) {
  const entries = timelineLayout(expandEvents(events, date, addDays(date, 1), zone), date, zone);
  assert.equal(entries[0].lanes, 2);
  assert.equal(entries[1].lanes, 2);
  assert.notEqual(entries[0].lane, entries[1].lane);
}

test("an event spanning midnight appears on both days and occupies the correct slice", () => {
  const tomorrow = addDays(date, 1);
  const event = timed("late", "23:30", "01:15", date, tomorrow);
  const data = defaults();
  data.settings.active[weekday(tomorrow)] = [{ start: "00:00", end: "03:00" }];
  const result = expandEvents([event], date, addDays(tomorrow, 1), zone);
  assert.equal(occurrencesOn(result, date, zone).length, 1);
  assert.equal(occurrencesOn(result, tomorrow, zone).length, 1);
  assert.equal(dailyAvailability(tomorrow, data.settings, result).busyMinutes, 75);
});

test("weekly series observes count and supports cancelled, removed and moved occurrences", () => {
  const event = timed("weekly", "09:00", "10:00");
  event.recurrence = { frequency: "weekly", weekdays: [weekday(date)], calendar: "persian", end: { type: "count", count: 4 } };
  const dates = [0, 7, 14, 21].map((offset) => addDays(date, offset));
  event.exceptions = {
    [dates[1]]: { ...occurrenceFields(event, dates[1]), status: "cancelled" },
    [dates[2]]: null,
    [dates[3]]: { ...occurrenceFields(event, dates[3]), timing: timed("moved", "16:00", "17:00", addDays(date, 40), addDays(date, 40)).timing },
  };
  const data = defaults();
  data.events = [event];
  const saved = decodeBackup(encodeBackup(data)).data;
  assert.deepEqual(expandEvents(saved.events, date, addDays(date, 29), zone).map((event) => [event.date, event.status]), [
    [dates[0], "planned"], [dates[1], "cancelled"],
  ]);
  assert.equal(expandEvents(saved.events, addDays(date, 40), addDays(date, 41), zone)[0].date, dates[3]);
});

test("Persian monthly recurrence skips invalid dates and crosses year boundaries", () => {
  const lastOfSix = calendarDate(1403, 6, 31, "persian");
  const event = timed("monthly", "11:00", "12:00", lastOfSix, lastOfSix);
  event.recurrence = { frequency: "monthly", weekdays: [], calendar: "persian", end: { type: "count", count: 2 } };
  const followingYear = calendarDate(1404, 1, 31, "persian");
  const result = expandEvents([event], lastOfSix, addDays(followingYear, 40), zone);
  assert.deepEqual(result.map((entry) => entry.date), [lastOfSix, followingYear]);
  assert.equal(parseDateInput(dateInput(followingYear, "persian"), "persian"), followingYear);
  assert.throws(() => parseDateInput("۱۴۰۴/۰۷/۳۱", "persian"));
});

test("wall time is held across DST and all-day dates float across view zones", () => {
  const newYork = "America/New_York";
  const anchor = "2026-03-07";
  const dst = "2026-03-08";
  const event = timed("dst", "09:00", "10:00", anchor, anchor, newYork);
  event.recurrence = { frequency: "daily", weekdays: [], calendar: "gregory", end: { type: "never" } };
  const next = expandEvents([event], dst, addDays(dst, 1), newYork)[0];
  assert.equal(seriesDate(next.timing), dst);
  assert.equal(localTime(atTime(dst, "09:00", newYork), newYork), "09:00");
  assert.equal(next.timing.start, instantISO(atTime(dst, "09:00", newYork)));
  const timing = { allDay: true, start: date, end: addDays(date, 1) } satisfies Timing;
  for (const view of [newYork, "Pacific/Kiritimati"]) {
    assert.equal(expandEvents([{ ...event, timing, recurrence: null }], date, addDays(date, 1), view).length, 1);
    assert.equal(expandEvents([{ ...event, timing, recurrence: null }], addDays(date, -1), date, view).length, 0);
  }
});

test("task slots fit duration and deadline and cancelled or non-blocking all-day events do not block", () => {
  const data = defaults();
  data.settings.active[weekday(date)] = [{ start: "09:00", end: "10:00" }, { start: "11:00", end: "13:00" }];
  data.settings.buffer = 15;
  const allDay = { ...timed("occasion", "09:00", "10:00"), busy: false,
    timing: { allDay: true, start: date, end: addDays(date, 1) } } satisfies PlannerEvent;
  data.events = [allDay, { ...timed("cancelled", "11:00", "13:00"), status: "cancelled" }];
  const task = { id: "task", title: "تمرین", minutes: 90, priority: "high", due: date, eventId: null } as const;
  const now = atTime(date, "08:00", zone);
  assert.deepEqual(suggestions(data, task, now), [{ start: atTime(date, "11:00", zone), end: atTime(date, "11:00", zone) + 90 * minute }]);
  data.events[0].busy = true;
  assert.deepEqual(availableSlots(data, date, addDays(date, 1), now, task), []);
});

test("backup validates versions, duplicate IDs, references, timing, safe links and attachments", () => {
  const data = defaults();
  const entry = timed("class", "09:00", "10:00");
  entry.links = [{ label: "شرح موقعیت", url: "https://example.org/job" }];
  entry.attachments = [{ name: "guide.pdf", base64: Buffer.from("%PDF-1.4\n").toString("base64") }];
  data.events = [entry];
  assert.deepEqual(decodeBackup(encodeBackup(data)).data, data);
  assert.throws(() => decodeBackup("{broken"), /JSON/);
  const output = JSON.parse(encodeBackup(data));
  assert.throws(() => decodeBackup(JSON.stringify({ ...output, version: 20 })), /جدیدتر/);
  assert.throws(() => validateData({ ...data, events: [entry, entry] }), /شناسه/);
  assert.throws(() => validateData({ ...data, events: [{ ...entry, categoryId: "missing" }] }), /دسته/);
  assert.throws(() => validateData({ ...data, tasks: [{ id: "task", title: "کار", minutes: 40, priority: "low", due: null, eventId: "missing" }] }), /ارجاع/);
  assert.throws(() => validateData({ ...data, events: [{ ...entry, timing: { allDay: true, start: date, end: date } }] }));
  assert.throws(() => validateData({ ...data, events: [{ ...entry, links: [{ label: "بد", url: "javascript:alert(1)" }] }] }));
  assert.throws(() => validateData({ ...data, events: [{ ...entry, attachments: [{ name: "guide.pdf", base64: "aGVsbG8=" }] }] }));
});

test("v1 backup migrates inclusive all-day end dates, including exception fields", () => {
  const data = defaults();
  const event = timed("single", "09:00", "10:00");
  const timing = { allDay: true, start: date, end: date } satisfies Timing;
  event.timing = timing;
  event.recurrence = { frequency: "daily", weekdays: [], calendar: "persian", end: { type: "never" } };
  event.exceptions = { [addDays(date, 1)]: { ...occurrenceFields(event, date), timing } };
  data.events = [event];
  const output = decodeBackup(JSON.stringify({ version: 1, exportedAt: "2026-11-25T00:00:00Z", data }));
  assert.equal(output.data.events[0].timing.end, addDays(date, 1));
  assert.equal(output.data.events[0].exceptions[addDays(date, 1)]?.timing.end, addDays(date, 1));
});

test("dashboard finds a distant occurrence and prioritizes moved exceptions by their actual start", () => {
  const future = addDays(date, 90);
  const event = timed("future", "09:00", "10:00", future, future);
  assert.equal(nextOccurrence([event], atTime(date, "08:00", zone), zone)?.date, future);

  event.recurrence = { frequency: "weekly", weekdays: [weekday(future)], calendar: "persian", end: { type: "never" } };
  const original = addDays(future, 14);
  const moved = addDays(date, 4);
  event.exceptions = { [original]: { ...occurrenceFields(event, original), timing: timed("moved", "11:00", "12:00", moved, moved).timing } };
  assert.equal(nextOccurrence([event], atTime(date, "08:00", zone), zone)?.date, original);
});

test("suggestions after an imported event do not round into the occupied minute", () => {
  const data = defaults();
  const event = timed("imported", "08:00", "09:00");
  if (event.timing.allDay) throw new Error("Expected a timed event");
  event.timing.end = instantISO(atTime(date, "09:00", zone) + 30_000);
  data.events = [event];
  const now = atTime(date, "08:00", zone);
  assert.equal(availableSlots(data, date, addDays(date, 1), now)[0].start, atTime(date, "09:01", zone));
});
