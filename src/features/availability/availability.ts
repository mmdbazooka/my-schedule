import { addDays, atTime, datesBetween, minute, timingInterval, todayIn, weekday } from "@/features/calendar/dates";
import { expandEvents, overlaps } from "@/features/events/recurrence";
import type { ActiveHours, Interval, Occurrence, PlannerData, Settings, Task } from "@/types/planner";

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

function localRange(date: string, range: ActiveHours, zone: string): Interval {
  return {
    start: atTime(date, range.start, zone),
    end: range.end === "24:00" ? atTime(addDays(date, 1), "00:00", zone) : atTime(date, range.end, zone),
  };
}

function occupied(event: Occurrence, zone: string, includeTravel: boolean) {
  if (event.status === "cancelled") return [];
  const { start, end } = timingInterval(event.timing, zone);
  const ranges = event.busy ? [{ start, end }] : [];
  if (includeTravel && event.travelBefore) ranges.push({ start: start - event.travelBefore * minute, end: start });
  if (includeTravel && event.travelAfter) ranges.push({ start: end, end: end + event.travelAfter * minute });
  return mergeIntervals(ranges);
}

export function dailyAvailability(date: string, settings: Settings, occurrences: Occurrence[]) {
  const active = mergeIntervals(settings.active[weekday(date)].map((range) => localRange(date, range, settings.zone)));
  const busy = mergeIntervals(occurrences.flatMap((event) => occupied(event, settings.zone, false)));
  const free = subtract(active, busy);
  const buffered = subtract(active, mergeIntervals(occurrences.flatMap((event) => occupied(event, settings.zone, true))
    .map((block) => ({ start: block.start - settings.buffer * minute, end: block.end + settings.buffer * minute }))));
  const total = (ranges: Interval[]) => ranges.reduce((sum, range) => sum + (range.end - range.start) / minute, 0);
  return { busyMinutes: total(active) - total(free), freeMinutes: total(free), buffered };
}

type Exclusion = { eventId: string; date?: string };
type SlotRequest = Pick<Task, "minutes" | "due" | "categoryId">;

function excluded(event: Occurrence, exclusion?: Exclusion) {
  return exclusion && event.eventId === exclusion.eventId && (!exclusion.date || event.date === exclusion.date);
}

export function availableSlots(data: PlannerData, start: string, end: string, now: number, task?: SlotRequest, exclude?: Exclusion) {
  const { zone, minimum } = data.settings;
  const last = task?.due && task.due < end ? addDays(task.due, 1) : end;
  if (start >= last) return [];
  const occurrences = expandEvents(data.events, addDays(start, -1), addDays(last, 1), zone).filter((event) => !excluded(event, exclude));
  const threshold = Math.max(minimum, task?.minutes ?? 0) * minute;
  const earliest = Math.ceil(now / minute) * minute;

  return datesBetween(start, last).flatMap((date) => dailyAvailability(date, data.settings, occurrences).buffered)
    .map((range) => ({
      start: Math.max(Math.ceil(range.start / minute) * minute, earliest),
      end: Math.floor(range.end / minute) * minute,
    }))
    .filter((range) => range.end - range.start >= threshold);
}

export interface SuggestedSlot extends Interval {
  preferred: boolean;
}

export function suggestions(data: PlannerData, task: SlotRequest, now: number, options: {
  limit?: number; from?: string; to?: string; exclude?: Exclusion; travelBefore?: number; travelAfter?: number;
} = {}): SuggestedSlot[] {
  if (!data.settings.active.some((ranges) => ranges.length)) return [];
  const { zone } = data.settings;
  const today = todayIn(now, zone);
  const start = options.from && options.from > today ? options.from : today;
  const defaultEnd = task.due ? addDays(task.due, 1) : (options.to ?? addDays(start, 30));
  const end = options.to && options.to < defaultEnd ? options.to : defaultEnd;
  const limit = options.limit ?? 5;
  const minutes = task.minutes * minute;
  const before = (options.travelBefore ?? 0) * minute;
  const after = (options.travelAfter ?? 0) * minute;
  const preferences = data.preferences.filter((entry) => entry.categoryId === task.categoryId && data.settings.active[entry.weekday].length);
  const preferred: SuggestedSlot[] = [];
  const free: SuggestedSlot[] = [];
  for (let from = start; from < end && preferred.length < limit; from = addDays(from, 14)) {
    const next = addDays(from, 14);
    for (const gap of availableSlots(data, from, next < end ? next : end, now, task, options.exclude)) {
      const earliest = gap.start + before;
      const latestEnd = gap.end - after;
      if (earliest + minutes > latestEnd) continue;
      const date = todayIn(earliest, zone);
      const windows = mergeIntervals(preferences.filter((entry) => entry.weekday === weekday(date)).map((entry) => localRange(date, entry, zone)));
      const matching = windows.map((window) => ({ start: Math.max(window.start, earliest), end: Math.min(window.end, latestEnd) }))
        .filter((window) => window.end - window.start >= minutes);
      for (const window of matching) preferred.push({ start: window.start, end: window.start + minutes, preferred: true });
      if (!matching.length && free.length < limit) free.push({ start: earliest, end: earliest + minutes, preferred: false });
      if (!preferences.length && free.length >= limit) return free;
    }
  }
  return [...preferred, ...free].slice(0, limit);
}

export function conflicts(occurrence: Occurrence, events: Occurrence[], zone: string, exclude?: Exclusion, includeTravel = false) {
  const intervals = occupied(occurrence, zone, includeTravel);
  if (!intervals.length) return [];
  return events.flatMap((event) => {
    if (excluded(event, exclude)) return [];
    return occupied(event, zone, includeTravel).flatMap((other) =>
      intervals.filter((interval) => overlaps(interval, other)).map((interval) => ({
        event, shared: { start: Math.max(interval.start, other.start), end: Math.min(interval.end, other.end) },
      })));
  });
}
