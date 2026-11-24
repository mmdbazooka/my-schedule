import { addDays, atTime, datesBetween, minute, timingInterval, todayIn, weekday } from "@/features/calendar/dates";
import { expandEvents, overlaps } from "@/features/events/recurrence";
import type { Interval, Occurrence, PlannerData, Settings, Task } from "@/types/planner";

export function mergeIntervals(intervals: Interval[]) {
  const merged: Interval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    if (interval.end <= interval.start) continue;
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

function subtract(active: Interval[], busy: Interval[]) {
  const gaps: Interval[] = [];
  for (const range of active) {
    let cursor = range.start;
    for (const block of busy) {
      if (block.end <= cursor) continue;
      if (block.start >= range.end) break;
      if (block.start > cursor) gaps.push({ start: cursor, end: block.start });
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < range.end) gaps.push({ start: cursor, end: range.end });
  }
  return gaps;
}

export function dailyAvailability(date: string, settings: Settings, occurrences: Occurrence[]) {
  const active = mergeIntervals(settings.active[weekday(date)].map((range) => ({
    start: atTime(date, range.start, settings.zone),
    end: range.end === "24:00" ? atTime(addDays(date, 1), "00:00", settings.zone) : atTime(date, range.end, settings.zone),
  })));
  const busy = mergeIntervals(occurrences.filter((event) => event.busy && event.status !== "cancelled")
    .map((event) => timingInterval(event.timing, settings.zone)));
  const free = subtract(active, busy);
  const buffered = subtract(active, mergeIntervals(busy.map((block) => ({
    start: block.start - settings.buffer * minute, end: block.end + settings.buffer * minute,
  }))));
  const total = (ranges: Interval[]) => ranges.reduce((sum, range) => sum + (range.end - range.start) / minute, 0);
  return { busyMinutes: total(active) - total(free), freeMinutes: total(free), buffered };
}

export function availableSlots(data: PlannerData, start: string, end: string, now: number, task?: Task) {
  const { zone, buffer, minimum } = data.settings;
  const last = task?.due && task.due < end ? addDays(task.due, 1) : end;
  if (start >= last) return [];
  const occurrences = expandEvents(data.events, addDays(start, buffer ? -1 : 0), addDays(last, buffer ? 1 : 0), zone);
  const threshold = Math.max(minimum, task?.minutes ?? 0) * minute;
  const earliest = Math.ceil(now / minute) * minute;

  return datesBetween(start, last).flatMap((date) => dailyAvailability(date, data.settings, occurrences).buffered)
    .map((range) => ({
      start: Math.max(Math.ceil(range.start / minute) * minute, earliest),
      end: Math.floor(range.end / minute) * minute,
    }))
    .filter((range) => range.end - range.start >= threshold);
}

export function suggestions(data: PlannerData, task: Task, now: number) {
  if (!data.settings.active.some((ranges) => ranges.length)) return [];
  const start = todayIn(now, data.settings.zone);
  const end = task.due ? addDays(task.due, 1) : addDays(start, 30);
  const slots: Interval[] = [];
  // Work in windows so even a distant deadline does not require expanding years at once.
  for (let from = start; from < end && slots.length < 5; from = addDays(from, 14)) {
    const next = addDays(from, 14);
    slots.push(...availableSlots(data, from, next < end ? next : end, now, task));
  }
  return slots.slice(0, 5).map((slot) => ({ ...slot, end: slot.start + task.minutes * minute }));
}

export function conflicts(occurrence: Occurrence, events: Occurrence[], zone: string, exclude?: { eventId: string; date?: string }) {
  const interval = timingInterval(occurrence.timing, zone);
  if (!occurrence.busy || occurrence.status === "cancelled") return [];
  return events.flatMap((event) => {
    if (!event.busy || event.status === "cancelled" ||
      (event.eventId === exclude?.eventId && (!exclude.date || exclude.date === event.date))) return [];
    const other = timingInterval(event.timing, zone);
    return overlaps(interval, other)
      ? [{ event, shared: { start: Math.max(interval.start, other.start), end: Math.min(interval.end, other.end) } }]
      : [];
  });
}
