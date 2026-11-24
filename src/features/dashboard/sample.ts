import { addDays, atTime, instantISO } from "@/features/calendar/dates";
import type { PlannerData, PlannerEvent } from "@/types/planner";

export function sampleData(data: PlannerData, today: string): PlannerData {
  const zone = data.settings.zone;
  const entries = [
    ["کلاس طراحی رابط", "university", "09:00", "10:30", today],
    ["مرور پروژهٔ نمونه", "meeting", "11:30", "12:00", today],
    ["مطالعهٔ تمرینی", "study", "15:00", "16:15", today],
    ["پیاده‌روی عصرانه", "sport", "18:30", "19:15", today],
    ["مرور درس‌ها", "study", "10:00", "11:30", addDays(today, 1)],
  ];
  const events: PlannerEvent[] = entries.map(([title, category, start, end, date]) => ({
    id: crypto.randomUUID(), title, categoryId: data.categories.some((item) => item.id === category) ? category : data.categories[0].id,
    status: "planned", busy: true, location: "", link: "", description: "رویداد ساختگی برای امتحان برنامه.",
    links: [], attachments: [], recurrence: null, exceptions: {},
    timing: { allDay: false, zone, start: instantISO(atTime(date, start, zone)), end: instantISO(atTime(date, end, zone)) },
  }));
  return { ...data, events, tasks: [{ id: crypto.randomUUID(), title: "آماده‌کردن نمونه‌کار", minutes: 90, priority: "medium", due: addDays(today, 4), eventId: null }] };
}
