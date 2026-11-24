import { addDays, day, minute, timingInterval, todayIn } from "@/features/calendar/dates";
import { expandEvents, nextOccurrence, occurrenceFields, seriesDate } from "@/features/events/recurrence";
import type { EventFields, Occurrence, PlannerData } from "@/types/planner";

export function lessonOverview(data: PlannerData, lessonId: string, now: number) {
  const { zone } = data.settings;
  const today = todayIn(now, zone);
  const matches = (fields: EventFields) => fields.lessonId === lessonId;
  const series = data.events.filter((event) => matches(event) ||
    Object.values(event.exceptions).some((fields) => fields && matches(fields)));
  const recurring = series.filter((event) => event.recurrence);
  const events: Occurrence[] = [
    ...series.filter((event) => !event.recurrence).map((event) => {
      const date = seriesDate(event.timing);
      return { ...occurrenceFields(event, date), date, eventId: event.id };
    }),
    ...expandEvents(recurring, addDays(today, -30), addDays(today, 31), zone).filter(matches),
  ];
  for (const event of recurring) {
    const upcoming = nextOccurrence([event], now, zone, matches);
    if (upcoming && !events.some((entry) => entry.eventId === upcoming.eventId && entry.date === upcoming.date)) events.push(upcoming);
  }
  events.sort((a, b) => timingInterval(a.timing, zone).start - timingInterval(b.timing, zone).start);
  const isExam = (fields: EventFields) => matches(fields) && fields.kind === "exam";
  const nextExam = events.find((event) => isExam(event) && event.timing.allDay &&
    event.timing.start === today && event.status === "planned")
    ?? nextOccurrence(series, now, zone, isExam);
  const tasks = data.tasks.filter((task) => task.lessonId === lessonId);
  if (!nextExam) return { events, tasks, nextExam, daysUntil: null, studyMinutes: 0 };
  const examTime = timingInterval(nextExam.timing, zone).start;
  const examDate = todayIn(examTime, zone);
  const daysUntil = day(today).until(day(examDate)).days;
  const studyMinutes = examTime <= now ? 0 :
    expandEvents(series, today, addDays(examDate, 1), zone).reduce((total, event) => {
      if (!matches(event) || event.kind !== "study" || event.status !== "planned" || event.timing.allDay) return total;
      const { start, end } = timingInterval(event.timing, zone);
      return total + Math.max(0, Math.min(examTime, end) - Math.max(now, start)) / minute;
    }, 0);
  return { events, tasks, nextExam, daysUntil, studyMinutes };
}
