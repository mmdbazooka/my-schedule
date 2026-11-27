import { atTime, clockLabel, epoch, fa, minute, todayIn } from "@/features/calendar/dates";
import type { Occurrence } from "@/types/planner";

export type LeadTime = 10 | 15;
export type SummaryFrequency = 0 | 1 | 2;
export type ReminderSettings = { enabled: boolean; lead: LeadTime; summaries: SummaryFrequency };
export const reminderDefaults: ReminderSettings = { enabled: false, lead: 15, summaries: 0 };

export function canRemind(event: Occurrence): event is Occurrence & { timing: Extract<Occurrence["timing"], { allDay: false }> } {
  return !event.timing.allDay && event.status === "planned" && event.kind === "general" &&
    !event.lessonId && event.categoryId !== "university" && event.categoryId !== "study";
}

export type Reminder = { tag: string; title: string; body: string };

export function remindersDue(occurrences: Occurrence[], now: number, zone: string, settings: ReminderSettings): Reminder[] {
  const upcoming = occurrences.filter(canRemind).map((event) => ({ event, start: epoch(event.timing.start) }))
    .filter(({ start }) => start > now);
  const reminders = upcoming.filter(({ start }) => start - now <= settings.lead * minute).map(({ event, start }) => ({
    tag: `planner:event:${event.eventId}:${event.date}:${start}`,
    title: event.title,
    body: `شروع ساعت ${clockLabel(start, zone)} · ${fa(Math.ceil((start - now) / minute))} دقیقه دیگر`,
  }));
  const date = todayIn(now, zone);
  const today = upcoming.filter(({ start }) => todayIn(start, zone) === date);
  if (today.length) {
    for (const time of ["09:00", "18:00"].slice(0, settings.summaries)) {
      const scheduled = atTime(date, time, zone);
      if (now >= scheduled && now < scheduled + 60 * minute) reminders.push({
        tag: `planner:summary:${date}:${time}`,
        title: "برنامه‌های باقی‌ماندهٔ امروز",
        body: `${fa(today.length)} برنامه · بعدی ${today[0].event.title} ساعت ${clockLabel(today[0].start, zone)}`,
      });
    }
  }
  return reminders;
}
