import { addDays, atTime, datesBetween, epoch, inZone, minute, timingInterval } from "./dates";
import type { Interval, Occurrence } from "@/types/planner";

export function occurrencesOn(events: Occurrence[], date: string, zone: string) {
  const next = addDays(date, 1);
  const start = atTime(date, "00:00", zone);
  const end = atTime(next, "00:00", zone);
  return events.filter(({ timing }) => timing.allDay ? timing.start <= date && timing.end > date
    : epoch(timing.start) < end && epoch(timing.end) > start);
}

export function visibleDates(start: string, count: number) {
  return datesBetween(start, addDays(start, count));
}

export function wallMinute(time: number, date: string, zone: string) {
  if (time <= atTime(date, "00:00", zone)) return 0;
  if (time >= atTime(addDays(date, 1), "00:00", zone)) return 1440;
  const local = inZone(time, zone);
  return local.hour * 60 + local.minute + local.second / 60;
}

export function wallRange(range: Interval, date: string, zone: string) {
  const start = wallMinute(range.start, date, zone);
  const end = wallMinute(range.end, date, zone);
  return { start, end: Math.min(1440, end > start ? end : start + (range.end - range.start) / minute) };
}

export function timelineLayout(events: Occurrence[], date: string, zone: string) {
  const entries = events.filter((event) => !event.timing.allDay).map((event) => {
    const interval = wallRange(timingInterval(event.timing, zone), date, zone);
    return { event, start: interval.start, end: Math.min(1440, Math.max(interval.end, interval.start + 14)), lane: 0, lanes: 1 };
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  let group: typeof entries = [];
  let laneEnds: number[] = [];
  let lastEnd = -1;
  const finish = () => group.forEach((entry) => { entry.lanes = laneEnds.length; });
  for (const entry of entries) {
    if (entry.start >= lastEnd) { finish(); group = []; laneEnds = []; }
    const available = laneEnds.findIndex((end) => end <= entry.start);
    entry.lane = available < 0 ? laneEnds.length : available;
    laneEnds[entry.lane] = entry.end;
    group.push(entry);
    lastEnd = Math.max(lastEnd, entry.end);
  }
  finish();
  return entries;
}
