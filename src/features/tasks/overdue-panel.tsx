"use client";

import { useMemo, useState } from "react";
import { Clock3, RotateCcw } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { suggestions } from "@/features/availability/availability";
import { addDays, clockLabel, duration, fullDay, timingInterval, todayIn } from "@/features/calendar/dates";
import type { Interval, PlannerData } from "@/types/planner";
import { moveOverdue, overdueItems, type OverdueItem } from "./overdue";

export function OverduePanel({ data, now, revision, save, saveError }: {
  data: PlannerData; now: number; revision: number; saveError?: string;
  save: (updated: PlannerData, revision: number) => boolean;
}) {
  const [days, setDays] = useState(30);
  const [propose, setPropose] = useState<{ item: OverdueItem; revision: number } | null>(null);
  const [selected, setSelected] = useState<Interval | null>(null);
  const { zone, calendar } = data.settings;
  const today = todayIn(now, zone);
  const items = useMemo(() => overdueItems(data, now, addDays(today, -days)), [data, now, today, days]);
  const item = propose?.item;
  const beginning = addDays(today, -days);
  const hasOlderStudy = data.events.some((event) => event.recurrence &&
    [event, ...Object.values(event.exceptions)].some((fields) => fields?.kind === "study" && fields.status === "planned" &&
      todayIn(timingInterval(fields.timing, zone).start, zone) < beginning));
  const categoryId = item?.task?.categoryId ?? item?.event.categoryId ?? null;
  const preferred = data.preferences.some((entry) => entry.categoryId === categoryId);
  const slots = useMemo(() => item && propose.revision === revision ? suggestions(data, {
    minutes: item.minutes, due: item.task?.due ?? null, categoryId,
  }, now, { limit: 3, exclude: { eventId: item.event.eventId, date: item.event.date },
    travelBefore: item.event.travelBefore, travelAfter: item.event.travelAfter }) : [], [item, propose, data, now, revision, categoryId]);
  const display = (slot: Interval) => {
    const start = todayIn(slot.start, zone);
    const end = todayIn(slot.end, zone);
    return `${fullDay(start, calendar)} · ${clockLabel(slot.start, zone)} تا ${start !== end ? `${fullDay(end, calendar)}، ` : ""}${clockLabel(slot.end, zone)}`;
  };
  const close = () => { setPropose(null); setSelected(null); };
  const valid = selected && slots.some((slot) => slot.start === selected.start && slot.end === selected.end);

  return <section className="panel padded feature-panel">
    <div className="panel-heading"><span className="tile amber"><RotateCcw size={20} /></span><div>
      <h2>عقب‌افتاده‌ها</h2><p>کارهای زمان‌بندی‌شده و بلوک‌های مطالعه که هنوز انجام نشده‌اند.</p>
    </div></div>
    {items.length ? items.map((entry) => <article className="task-row" key={`${entry.event.eventId}:${entry.event.date}`}>
      <div className="task-summary"><strong>{entry.task?.title ?? entry.event.title}</strong>
        <span className="muted">{fullDay(todayIn(entry.end - 1, zone), calendar)} · {duration(entry.minutes)}</span></div>
      <Button onClick={() => { setSelected(null); setPropose({ item: entry, revision }); }}><Clock3 size={16} /> پیشنهاد زمان جدید</Button>
    </article>) : <p className="muted">مورد عقب‌افتاده‌ای در این بازه نیست.</p>}
    {hasOlderStudy && <div><Button variant="ghost" onClick={() => setDays(days + 30)}>نمایش ۳۰ روز قدیمی‌تر از سری‌ها</Button></div>}
    {propose && item && <Dialog title={`زمان جدید برای «${item.event.title}»`} close={close}>
      <div className="form">
        <p>زمان قبلی <strong>{display(timingInterval(item.event.timing, zone))}</strong></p>
        {item.task?.due && <p className="muted">مهلت {fullDay(item.task.due, calendar)}</p>}
        {selected ? <>
          <p className="info">زمان جدید <strong>{display(selected)}</strong></p>
          {!valid && propose.revision === revision && <p className="warning">این پیشنهاد دیگر در دسترس نیست. یک زمان تازه انتخاب کن.</p>}
          <footer className="dialog-actions"><Button onClick={() => setSelected(null)}>بازگشت به پیشنهادها</Button>
            <Button variant="primary" disabled={!valid || propose.revision !== revision} onClick={() => {
              if (valid && save(moveOverdue(data, item, selected), propose.revision)) close();
            }}>تأیید جابه‌جایی</Button></footer>
        </> : slots.length ? slots.map((slot) => <Button key={slot.start} onClick={() => setSelected(slot)}>
          <Clock3 size={16} /> {display(slot)}{preferred && ` · ${slot.preferred ? "مطابق ترجیح" : "آزاد خارج از ترجیح"}`}
        </Button>) : propose.revision === revision && <p className="warning">
          {item.task?.due ? "تا پایان مهلت، بازهٔ آزادی با مدت لازم پیدا نشد." : "در ۳۰ روز آینده بازهٔ آزادی با مدت لازم پیدا نشد."}
        </p>}
        {propose.revision !== revision && <p className="error" role="alert">داده‌ها تغییر کرده‌اند. پیشنهاد را دوباره باز کن.</p>}
        {saveError && <p className="error" role="alert">{saveError}</p>}
      </div>
    </Dialog>}
  </section>;
}
