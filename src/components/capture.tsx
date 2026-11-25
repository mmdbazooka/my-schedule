"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Dialog, Field } from "./ui";
import { addDays, fa, minute } from "@/features/calendar/dates";
import type { EventDraft } from "@/features/events/event-form";
import type { Task } from "@/types/planner";

export function Capture({ close, today, save, create, stale, error }: {
  close: () => void; today: string; save: (task: Task) => boolean; create: (draft: EventDraft) => void; stale: boolean; error?: string;
}) {
  const [minutes, setMinutes] = useState(30);
  const [due, setDue] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  return <Dialog title="ثبت سریع" close={close}><form className="form" onSubmit={(event) => {
    event.preventDefault();
    if (title.trim() && !stale && save({ id: crypto.randomUUID(), title: title.trim(), minutes, due,
      categoryId: null, lessonId: null, eventId: null, priority: "medium", done: false })) close();
  }}>
    <Field label="چه کاری داری؟"><input autoFocus required maxLength={160} placeholder="مثلاً مرور فصل دوم" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <fieldset><legend>مدت تخمینی</legend><div className="segmented">{[15,30,60,90].map((n) =>
      <button type="button" key={n} aria-pressed={minutes === n} onClick={() => setMinutes(n)}>{fa(n)} دقیقه</button>)}</div></fieldset>
    <fieldset><legend>مهلت کار</legend><div className="segmented">{[[null,"بدون مهلت"],[today,"امروز"],[addDays(today,1),"فردا"]].map(([value,label]) =>
      <button type="button" key={label} aria-pressed={due === value} onClick={() => setDue(value)}>{label}</button>)}</div></fieldset>
    {stale && <p className="warning">داده‌ها تغییر کرده‌اند. فرم را دوباره باز کن.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-actions"><Button disabled={!title.trim() || stale} onClick={() => {
      const start = Math.ceil(Date.now() / (15 * minute)) * 15 * minute;
      close(); create({ title: title.trim(), date: today, slot: { start, end: start + minutes * minute } });
    }}>ثبت به‌صورت رویداد…</Button><Button type="submit" variant="primary" disabled={!title.trim() || stale}><Plus size={16} /> ثبت کار</Button></div>
  </form></Dialog>;
}
