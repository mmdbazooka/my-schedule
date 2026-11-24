import { addDays, instantISO, minute, timingInterval, todayIn } from "@/features/calendar/dates";
import { expandEvents, occurrenceFields, seriesDate } from "@/features/events/recurrence";
import type { Interval, Occurrence, PlannerData, Task } from "@/types/planner";

export interface OverdueItem {
  event: Occurrence;
  task?: Task;
  end: number;
  minutes: number;
}

export function overdueItems(data: PlannerData, now: number, since: string) {
  const { zone } = data.settings;
  const tasksByEvent = new Map(data.tasks.filter((task) => task.eventId).map((task) => [task.eventId, task]));
  const results: OverdueItem[] = [];
  const collect = (event: Occurrence) => {
    const task = tasksByEvent.get(event.eventId);
    if (event.status !== "planned" || task?.done || event.kind === "class" || event.kind === "exam" ||
      event.categoryId === "meeting" || (!task && (event.kind !== "study" || event.timing.allDay))) return;
    const { start, end } = timingInterval(event.timing, zone);
    if (end <= now) results.push({ event, task, end, minutes: task?.minutes ?? Math.ceil((end - start) / minute) });
  };
  const recurring = data.events.filter((event) =>
    event.recurrence && (event.kind === "study" || Object.values(event.exceptions).some((entry) => entry?.kind === "study")));
  for (const event of data.events) {
    if (!event.recurrence && (event.kind === "study" || tasksByEvent.has(event.id))) {
      const date = seriesDate(event.timing);
      collect({ ...occurrenceFields(event, date), date, eventId: event.id });
    }
  }
  for (const event of expandEvents(recurring, since, addDays(todayIn(now, zone), 1), zone)) collect(event);
  return results.sort((a, b) => b.end - a.end);
}

export function moveOverdue(data: PlannerData, item: OverdueItem, slot: Interval) {
  const { eventId, date, ...fields } = item.event;
  const zone = fields.timing.allDay ? data.settings.zone : fields.timing.zone;
  const timing = { allDay: false as const, start: instantISO(slot.start), end: instantISO(slot.end), zone };
  const events = data.events.map((entry) => {
    if (entry.id !== eventId) return entry;
    if (!entry.recurrence) return { ...entry, timing };
    return { ...entry, exceptions: { ...entry.exceptions, [date]: { ...fields, timing } } };
  });
  return { ...data, events };
}
