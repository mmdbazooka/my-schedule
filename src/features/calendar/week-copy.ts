import { addDays, atTime, day, inZone, instantISO, localTime, timingInterval, todayIn } from "./dates";
import { occurrenceFields, seriesDate } from "@/features/events/recurrence";
import type { Occurrence, PlannerEvent } from "@/types/planner";

export function weekCopySources(events: PlannerEvent[], from: string, zone: string) {
  const to = addDays(from, 7);
  return events.filter((event) => !event.recurrence && !event.googleCalendar).flatMap((entry) => {
    const displayDate = entry.timing.allDay ? entry.timing.start : todayIn(timingInterval(entry.timing, zone).start, zone);
    return displayDate >= from && displayDate < to ? [{ entry, displayDate }] : [];
  }).sort((a, b) => timingInterval(a.entry.timing, zone).start - timingInterval(b.entry.timing, zone).start);
}

export function copyOccurrence(event: PlannerEvent, date: string, time: string, zone: string): Occurrence {
  const values = occurrenceFields(event, seriesDate(event.timing));
  const { timing } = values;
  if (timing.allDay) {
    const days = day(timing.start).until(day(timing.end)).days;
    return { ...values, timing: { allDay: true, start: date, end: addDays(date, days) }, status: "planned", eventId: event.id, date };
  }
  const previous = timingInterval(timing, zone);
  const wallTime = time === localTime(previous.start, zone) ? inZone(previous.start, zone).toPlainTime().toString() : time;
  const start = atTime(date, wallTime, zone, "reject");
  return {
    ...values, status: "planned", eventId: event.id, date,
    timing: { ...timing, start: instantISO(start), end: instantISO(start + previous.end - previous.start) },
  };
}
