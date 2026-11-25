"use client";

import { useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { addDays, duration, fullDay, timingInterval, todayIn, weekBeginning } from "@/features/calendar/dates";
import { summarizeWeek } from "@/features/goals/weekly";
import { EventRow, occurrenceKey } from "@/features/calendar/calendar-view";
import type { PlannerData, Occurrence } from "@/types/planner";

export function Review({ data, now, open }: { data: PlannerData; now: number; open: (event: Occurrence) => void }) {
  const [offset, setOffset] = useState(0);
  const { zone, calendar, weekStart } = data.settings;
  const from = addDays(weekBeginning(todayIn(now, zone), weekStart), offset * 7);
  const to = addDays(from, 7);
  const { byCategory, plannedEvents } = summarizeWeek(data, from);
  const groups = data.categories.flatMap((category) => {
    const totals = byCategory.get(category.id);
    return totals ? [{ ...category, ...totals }] : [];
  }).sort((a, b) => b.done + b.planned - a.done - a.planned);
  const pending = plannedEvents.filter((entry) => timingInterval(entry.timing, zone).end <= now);
  return <>
    <div className="page-heading"><div><h1>مرور هفتگی</h1><p>{fullDay(from, calendar)} تا {fullDay(addDays(to, -1), calendar)}</p></div>
      <div className="action-row"><IconButton label="هفتهٔ قبلی" onClick={() => setOffset(offset - 1)}><ChevronRight /></IconButton>
        <Button onClick={() => setOffset(0)}>این هفته</Button><IconButton label="هفتهٔ بعدی" onClick={() => setOffset(offset + 1)}><ChevronLeft /></IconButton></div></div>
    <section className="panel padded feature-panel"><div className="panel-heading"><span className="tile violet"><BarChart3 /></span><h2>زمان هر دسته</h2></div>
      {groups.map((group) => <div className="review-row" key={group.id}><strong>{group.name}</strong>
        <span>{duration(group.done)} انجام‌شده · {duration(group.planned)} در وضعیت برنامه‌ریزی‌شده</span>
        <progress aria-label={`سهم انجام‌شدهٔ ${group.name}`} max={group.done + group.planned} value={group.done} style={{ accentColor: group.color }} /></div>)}
      {!groups.length && <p className="muted">این هفته رویداد زمان‌دار ثبت نشده است.</p>}
    </section>
    <section className="panel padded feature-panel"><h2>نیاز به تعیین وضعیت</h2>
      {pending.length ? pending.map((event) => <EventRow key={occurrenceKey(event)} event={event} data={data} open={open} />)
        : <p className="muted">رویداد پایان‌یافته‌ای در انتظار بررسی نیست.</p>}</section>
  </>;
}
