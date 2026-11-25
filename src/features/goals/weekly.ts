import { addDays, atTime, minute, timingInterval, todayIn, weekBeginning } from "@/features/calendar/dates";
import { expandEvents } from "@/features/events/recurrence";
import type { Occurrence, PlannerData } from "@/types/planner";

type Totals = { planned: number; done: number };

export function summarizeWeek(data: PlannerData, from: string) {
  const { zone } = data.settings;
  const to = addDays(from, 7);
  const start = atTime(from, "00:00", zone);
  const end = atTime(to, "00:00", zone);
  const byLesson = new Map<string, Totals>();
  const byCategory = new Map<string, Totals>();
  const plannedEvents: Occurrence[] = [];

  function count(totals: Map<string, Totals>, id: string, status: keyof Totals, minutes: number) {
    const row = totals.get(id) ?? { planned: 0, done: 0 };
    row[status] += minutes;
    totals.set(id, row);
  }

  for (const event of expandEvents(data.events, from, to, zone)) {
    if (event.status === "cancelled" || event.timing.allDay) continue;
    const interval = timingInterval(event.timing, zone);
    const minutes = (Math.min(interval.end, end) - Math.max(interval.start, start)) / minute;
    count(byCategory, event.categoryId, event.status, minutes);
    if (event.kind === "study" && event.lessonId) count(byLesson, event.lessonId, event.status, minutes);
    if (event.status === "planned") plannedEvents.push(event);
  }
  return { byCategory, byLesson, plannedEvents };
}

export function weeklyGoals(data: PlannerData, now: number) {
  const { zone, weekStart } = data.settings;
  const from = weekBeginning(todayIn(now, zone), weekStart);
  const to = addDays(from, 7);
  const records = [
    ...data.lessons.map((entry) => ({ ...entry, type: "lesson" as const })),
    ...data.categories.map((entry) => ({ ...entry, type: "category" as const })),
  ].filter((entry) => entry.weeklyMinutes > 0);
  if (!records.length) return { from, to, rows: [] };
  const { byLesson, byCategory } = summarizeWeek(data, from);
  const rows = records.map((record) => {
    const { planned, done } = (record.type === "lesson" ? byLesson : byCategory).get(record.id) ?? { planned: 0, done: 0 };
    return { ...record, planned, done, remaining: Math.max(0, record.weeklyMinutes - planned - done) };
  });
  return { from, to, rows };
}
