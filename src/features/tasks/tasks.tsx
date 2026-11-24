"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, DateField, Dialog, Empty, Field, IconButton } from "@/components/ui";
import { suggestions } from "@/features/availability/availability";
import { clockLabel, duration, fullDay, latin, parseDateInput, todayIn } from "@/features/calendar/dates";
import type { EventDraft } from "@/features/events/event-form";
import { priorityLabels } from "@/lib/defaults";
import type { PlannerData, Priority, Task } from "@/types/planner";

export function Tasks({ data, now, create, save, unschedule, revision, saveError }: {
  data: PlannerData; now: number; create: (draft: EventDraft) => void;
  saveError?: string;
  unschedule: (task: Task) => boolean;
  save: (tasks: Task[], message: string) => boolean; revision: number;
}) {
  const [edit, setEdit] = useState<{ task: Task | null; revision: number } | null>(null);
  const [suggest, setSuggest] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { zone, calendar, weekStart } = data.settings;
  const chosen = data.tasks.find((task) => task.id === suggest && !task.eventId);
  const slots = chosen ? suggestions(data, chosen, now) : [];

  return <>
    <div className="page-heading"><div><h1>کارهای بدون زمان</h1><p>کارهایت را ثبت کن و برایشان یک وقت مناسب پیدا کن.</p></div>
      <Button variant="primary" onClick={() => { setError(""); setEdit({ task: null, revision }); }}><Plus size={18} /> کار جدید</Button></div>
    <section className="panel padded task-panel">
      <div className="panel-heading"><span className="tile violet"><ClipboardList size={21} /></span><div><h2>فهرست کارها</h2><p>مدت و مهلت در پیشنهاد زمان در نظر گرفته می‌شود.</p></div></div>
      {!data.tasks.length && <Empty icon={<ClipboardList size={27} />} title="هنوز کاری ثبت نشده است"><p>اولین کار را با مدت تخمینی اضافه کن.</p></Empty>}
      {data.tasks.map((task) => <article className="task-row" key={task.id}>
        <div className="task-summary"><strong>{task.title}</strong><span className="muted">{duration(task.minutes)} · اولویت {priorityLabels[task.priority]}{task.due && ` · مهلت ${fullDay(task.due, calendar)}`}</span></div>
        <div className="task-actions">
          {task.eventId ? <><span className="state-tag"><CheckCircle2 size={16} /> زمان‌بندی شده</span><Button onClick={() => unschedule(task)}>لغو زمان‌بندی</Button></>
            : <Button onClick={() => setSuggest(task.id)}><Sparkles size={17} /> پیشنهاد زمان</Button>}
          <IconButton label="ویرایش کار" onClick={() => { setError(""); setEdit({ task, revision }); }}><Pencil size={17} /></IconButton>
          <IconButton label="حذف کار" onClick={() => setDeleteId(task.id)}><Trash2 size={17} /></IconButton>
        </div>
      </article>)}
    </section>
    {edit && <Dialog title={edit.task ? "ویرایش کار" : "کار جدید"} close={() => setEdit(null)}>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        if (edit.revision !== revision) return;
        try {
          const form = new FormData(event.currentTarget);
          const title = String(form.get("title")).trim();
          const minutes = Number(latin(String(form.get("minutes"))));
          const due = String(form.get("due")).trim();
          if (!title || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error("عنوان و مدت تخمینی بین ۱ تا ۱۴۴۰ دقیقه وارد کنید.");
          const task: Task = { id: edit.task?.id ?? crypto.randomUUID(), title, minutes, due: due ? parseDateInput(due, calendar) : null,
            priority: String(form.get("priority")) as Priority, eventId: edit.task?.eventId ?? null };
          const linked = task.eventId ? data.events.find((entry) => entry.id === task.eventId) : undefined;
          if (linked) {
            // A scheduled task keeps its link. Edit the linked event or return the task to waiting first.
            if (task.minutes !== edit.task?.minutes || task.due !== edit.task?.due) throw new Error("برای تغییر مهلت یا مدت، ابتدا کار را به فهرست انتظار برگردانید.");
          }
          if (save(edit.task ? data.tasks.map((value) => value.id === task.id ? task : value) : [...data.tasks, task], "کار ذخیره شد.")) setEdit(null);
        } catch (issue) { setError((issue as Error).message); }
      }}>
        <Field label="عنوان کار"><input name="title" required maxLength={160} autoFocus defaultValue={edit.task?.title} /></Field>
        <div className="form-grid"><Field label="مدت تخمینی به دقیقه"><input name="minutes" required inputMode="numeric" defaultValue={edit.task?.minutes ?? 60} /></Field>
          <Field label="اولویت"><select name="priority" defaultValue={edit.task?.priority ?? "medium"}>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field></div>
        <DateField label="تاریخ مهلت (اختیاری)" name="due" date={edit.task?.due} calendar={calendar} weekStart={weekStart} />
        {(error || saveError) && <p className="error" role="alert">{error || saveError}</p>}
        {edit.revision !== revision && <p className="error" role="alert">داده‌ها در تب دیگری تغییر کرده‌اند. فرم را دوباره باز کنید.</p>}
        <footer className="dialog-actions"><Button onClick={() => setEdit(null)}>انصراف</Button><Button type="submit" variant="primary" disabled={edit.revision !== revision}>ذخیرهٔ کار</Button></footer>
      </form>
    </Dialog>}
    {chosen && <Dialog title={`زمان پیشنهادی برای «${chosen.title}»`} close={() => setSuggest(null)}>
      <div className="form"><p className="muted">{duration(chosen.minutes)}{data.settings.buffer > 0 && ` · با ${duration(data.settings.buffer)} حاشیهٔ استراحت`}{!chosen.due && " · جست‌وجو در ۳۰ روز آینده"}</p>
        {slots.length ? slots.map((slot) => <Button key={slot.start} onClick={() => {
          setSuggest(null); create({ date: todayIn(slot.start, zone), slot, taskId: chosen.id });
        }}><CalendarDays size={16} /> {fullDay(todayIn(slot.start, zone), calendar)} · {clockLabel(slot.start, zone)} تا {clockLabel(slot.end, zone)}</Button>)
          : <Empty icon={<Clock3 />} title="بازهٔ مناسبی پیدا نشد"><p>ساعات فعال، مدت کار یا مهلت را بررسی کن.</p></Empty>}
      </div>
    </Dialog>}
    {deleteId && <Dialog title="حذف کار" close={() => setDeleteId(null)}>
      {saveError && <p className="error" role="alert">{saveError}</p>}
      <p>این کار حذف می‌شود. رویداد زمان‌بندی‌شدهٔ آن، در صورت وجود، در تقویم باقی می‌ماند.</p>
      <footer className="dialog-actions"><Button onClick={() => setDeleteId(null)}>انصراف</Button><Button variant="danger" onClick={() => {
        if (save(data.tasks.filter((entry) => entry.id !== deleteId), "کار حذف شد.")) setDeleteId(null);
      }}>حذف کار</Button></footer>
    </Dialog>}
  </>;
}
