import type { PlannerData, Status, Priority } from "@/types/planner";

export const statusLabels: Record<Status, string> = { planned: "برنامه‌ریزی‌شده", done: "انجام‌شده", cancelled: "لغوشده" };
export const priorityLabels: Record<Priority, string> = { low: "کم", medium: "متوسط", high: "زیاد" };

export function defaults(): PlannerData {
  return {
    categories: [
      { id: "university", name: "دانشگاه", color: "#7654dc" },
      { id: "meeting", name: "جلسه", color: "#287cda" },
      { id: "study", name: "مطالعه", color: "#c87920" },
      { id: "work", name: "کار", color: "#188673" },
      { id: "sport", name: "ورزش", color: "#cc4c79" },
      { id: "personal", name: "شخصی", color: "#5864bf" },
    ],
    events: [],
    tasks: [],
    settings: {
      calendar: "persian", zone: "Asia/Tehran", weekStart: 6, theme: "system",
      active: Array.from({ length: 7 }, () => [{ start: "08:00", end: "22:00" }]),
      minimum: 30, buffer: 0,
    },
  };
}
