import {
  addDays, addMonths, atTime, day, epoch, instantISO, inZone, isoDay,
  monthStart, timingInterval, todayIn, weekday,
} from "@/features/calendar/dates";
import type { EventFields, Interval, Occurrence, PlannerEvent, Timing } from "@/types/planner";

const distance = (start: string, end: string) => day(start).until(day(end)).days;

export function seriesDate(timing: Timing) {
  return timing.allDay ? timing.start : todayIn(epoch(timing.start), timing.zone);
}

function* recurrenceDates(event: PlannerEvent, from: string, to: string) {
  const anchor = seriesDate(event.timing);
  const rule = event.recurrence;
  if (!rule) {
    if (anchor >= from && anchor <= to) yield anchor;
    return;
  }
  const limit = rule.end.type === "until" && rule.end.date < to ? rule.end.date : to;
  const count = rule.end.type === "count" ? rule.end.count : Infinity;
  if (limit < from || limit < anchor) return;

  if (rule.frequency === "daily") {
    for (let index = Math.max(0, distance(anchor, from)); index < count; index++) {
      const date = addDays(anchor, index);
      if (date > limit) break;
      yield date;
    }
    return;
  }

  if (rule.frequency === "weekly") {
    const start = addDays(anchor, -weekday(anchor));
    const days = [...rule.weekdays].sort((a, b) => a - b);
    const firstWeek = days.filter((offset) => offset >= weekday(anchor));
    let week = Math.max(0, Math.floor(distance(start, from) / 7));
    let ordinal = week === 0 ? 0 : firstWeek.length + (week - 1) * days.length;
    for (let base = addDays(start, week * 7); base <= limit; base = addDays(base, 7), week++) {
      for (const offset of week === 0 ? firstWeek : days) {
        if (ordinal++ >= count) return;
        const date = addDays(base, offset);
        if (date > limit) return;
        if (date >= from) yield date;
      }
    }
    return;
  }

  const anchorMonth = monthStart(anchor, rule.calendar);
  const dayOfMonth = day(anchor).withCalendar(rule.calendar).day;
  let ordinal = 0;
  for (let index = 0; ; index++) {
    const start = addMonths(anchorMonth, index, rule.calendar);
    if (start > limit) return;
    if (day(start).withCalendar(rule.calendar).daysInMonth < dayOfMonth) continue;
    const date = addDays(start, dayOfMonth - 1);
    if (ordinal++ >= count || date > limit) return;
    if (date >= from) yield date;
  }
}

export function validOccurrenceDate(event: PlannerEvent, date: string) {
  return [...recurrenceDates(event, date, date)].length > 0;
}

export function occurrenceFields(event: PlannerEvent, date: string): EventFields {
  const { title, categoryId, location, link, description, links, attachments, status, busy, timing } = event;
  let shifted = timing;
  if (date !== seriesDate(timing)) {
    if (timing.allDay) {
      shifted = { ...timing, start: date, end: addDays(date, distance(timing.start, timing.end)) };
    } else {
      const { zone } = timing;
      const originalStart = epoch(timing.start);
      const originalEnd = epoch(timing.end);
      const startWall = inZone(originalStart, zone);
      const endWall = inZone(originalEnd, zone);
      const endDate = addDays(date, distance(isoDay(startWall.toPlainDate()), isoDay(endWall.toPlainDate())));
      const start = atTime(date, startWall.toPlainTime().toString(), zone);
      const end = atTime(endDate, endWall.toPlainTime().toString(), zone);
      shifted = {
        allDay: false, zone, start: instantISO(start),
        end: instantISO(end > start ? end : start + originalEnd - originalStart),
      };
    }
  }
  return { title, categoryId, location, link, description, links, attachments, status, busy, timing: shifted };
}

export function overlaps(a: Interval, b: Interval) {
  return a.start < a.end && b.start < b.end && a.start < b.end && b.start < a.end;
}

export function expandEvents(events: PlannerEvent[], start: string, end: string, zone: string) {
  const results: Occurrence[] = [];
  const window = { start: atTime(start, "00:00", zone), end: atTime(end, "00:00", zone) };

  for (const event of events) {
    const include = (date: string, fields: EventFields) => {
      const timing = fields.timing;
      if (timing.allDay ? timing.start < end && start < timing.end : overlaps(window, timingInterval(timing, zone))) {
        results.push({ ...fields, eventId: event.id, date });
      }
    };
    const timing = event.timing;
    if (!event.recurrence) {
      include(seriesDate(timing), occurrenceFields(event, seriesDate(timing)));
      continue;
    }
    const eventZone = timing.allDay ? zone : timing.zone;
    const span = timing.allDay ? distance(timing.start, timing.end)
      : distance(todayIn(epoch(timing.start), eventZone), todayIn(epoch(timing.end), eventZone));
    const from = addDays(timing.allDay ? start : todayIn(window.start, eventZone), -span);
    const to = timing.allDay ? end : todayIn(window.end, eventZone);
    for (const date of recurrenceDates(event, from, to)) {
      if (!Object.hasOwn(event.exceptions, date)) include(date, occurrenceFields(event, date));
    }
    for (const [date, fields] of Object.entries(event.exceptions)) {
      if (fields) include(date, fields);
    }
  }

  return results.sort((a, b) => timingInterval(a.timing, zone).start - timingInterval(b.timing, zone).start);
}

export function nextOccurrence(events: PlannerEvent[], now: number, viewZone: string) {
  let next: Occurrence | undefined;
  let soonest = Infinity;
  for (const event of events) {
    function consider(date: string, fields: EventFields) {
      if (fields.status !== "planned") return false;
      const start = timingInterval(fields.timing, viewZone).start;
      if (start <= now) return false;
      if (start < soonest) {
        soonest = start;
        next = { ...fields, eventId: event.id, date };
      }
      return true;
    }

    for (const [date, fields] of Object.entries(event.exceptions)) {
      if (fields) consider(date, fields);
    }
    if (event.status !== "planned") continue;
    const zone = event.timing.allDay ? viewZone : event.timing.zone;
    const from = todayIn(now, zone);
    // A future override may have moved earlier than the next generated date.
    const to = Number.isFinite(soonest) ? todayIn(soonest, zone) : "2200-01-01";
    for (const date of recurrenceDates(event, from, to)) {
      if (!Object.hasOwn(event.exceptions, date) && consider(date, occurrenceFields(event, date))) break;
    }
  }
  return next;
}
