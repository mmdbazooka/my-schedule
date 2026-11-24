import { Target } from "lucide-react";
import { addDays, duration, formatDay } from "@/features/calendar/dates";
import type { PlannerData } from "@/types/planner";
import { weeklyGoals } from "./weekly";

export function WeeklyPanel({ data, now }: { data: PlannerData; now: number }) {
  const { from, to, rows } = weeklyGoals(data, now);
  if (!rows.length) return null;
  const label = (date: string) => formatDay(date, data.settings.calendar, { month: "long", day: "numeric" });
  return <section className="panel padded feature-panel">
    <div className="panel-heading"><span className="tile violet"><Target size={20} /></span><div>
      <h2>هدف‌های این هفته</h2><p>{label(from)} تا {label(addDays(to, -1))}</p>
    </div></div>
    <div className="lesson-grid">{rows.map((goal) => <article className="goal-card" key={`${goal.type}:${goal.id}`}>
      <div><h3>{goal.name}</h3><small className="muted">{goal.type === "lesson" ? "مطالعهٔ درس" : "دسته"} · هدف {duration(goal.weeklyMinutes)}</small></div>
      <meter min={0} max={goal.weeklyMinutes} value={Math.min(goal.weeklyMinutes, goal.planned + goal.done)}
        aria-label={`پوشش هدف ${goal.name}`} />
      <div className="action-row"><span className="state-tag">{duration(goal.planned)} برنامه‌ریزی‌شده</span>
        <span className="state-tag">{duration(goal.done)} انجام‌شده</span></div>
      <strong>{goal.remaining > 0 ? `${duration(goal.remaining)} دیگر برای برنامه‌ریزی` : "زمان هدف پوشش داده شده است"}</strong>
    </article>)}</div>
  </section>;
}
