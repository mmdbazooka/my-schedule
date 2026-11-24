import { addDays, atTime, minute, timingInterval, todayIn, weekBeginning } from "@/features/calendar/dates";
import { expandEvents } from "@/features/events/recurrence";
import type { PlannerData } from "@/types/planner";

export function weeklyGoals(data: PlannerData, now: number) {
  const { zone, weekStart } = data.settings;
  const from = weekBeginning(todayIn(now, zone), weekStart);
  const to = addDays(from, 7);
  const records = [
    ...data.lessons.map((entry) => ({ ...entry, type: "lesson" as const })),
    ...data.categories.map((entry) => ({ ...entry, type: "category" as const })),
  ].filter((entry) => entry.weeklyMinutes > 0);
  const byLesson = new Map<string, { planned: number; done: number }>();
  const byCategory = new Map<string, { planned: number; done: number }>();
  for (const entry of records) {
    (entry.type === "lesson" ? byLesson : byCategory).set(entry.id, { planned: 0, done: 0 });
  }
  if (!records.length) return { from, to, rows: [] };
  const start = atTime(from, "00:00", zone);
  const end = atTime(to, "00:00", zone);
  for (const event of expandEvents(data.events, from, to, zone)) {
    if (event.status === "cancelled" || event.timing.allDay) continue;
    const interval = timingInterval(event.timing, zone);
    const minutes = (Math.min(interval.end, end) - Math.max(interval.start, start)) / minute;
    const category = byCategory.get(event.categoryId);
    if (category) category[event.status] += minutes;
    const lesson = event.kind === "study" && event.lessonId ? byLesson.get(event.lessonId) : undefined;
    if (lesson) lesson[event.status] += minutes;
  }
  return { from, to, rows: records.map((record) => {
    const { planned, done } = (record.type === "lesson" ? byLesson : byCategory).get(record.id)!;
    return { ...record, planned, done, remaining: Math.max(0, record.weeklyMinutes - planned - done) };
  }) };
}
