"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, Dialog, Empty, IconButton } from "@/components/ui";
import { suggestions } from "@/features/availability/availability";
import { clockLabel, duration, fullDay, todayIn } from "@/features/calendar/dates";
import { TaskForm } from "./task-form";
import type { EventDraft } from "@/features/events/event-form";
import { priorityLabels } from "@/lib/defaults";
import type { PlannerData, Task } from "@/types/planner";

export function Tasks({ data, now, create, save, saveTask, unschedule, revision, saveError }: {
  data: PlannerData; now: number; create: (draft: EventDraft) => void;
  saveError?: string;
  saveTask: (task: Task, revision: number) => boolean;
  unschedule: (task: Task) => boolean;
  save: (tasks: Task[], message: string) => boolean; revision: number;
}) {
  const [edit, setEdit] = useState<{ task: Task | null; revision: number } | null>(null);
  const [suggest, setSuggest] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { zone, calendar } = data.settings;
  const chosen = data.tasks.find((task) => task.id === suggest && !task.eventId && !task.done);
  const slots = chosen ? suggestions(data, chosen, now) : [];

  const hasPreferences = data.preferences.some((entry) => entry.categoryId === chosen?.categoryId);
  return <>
    <div className="page-heading"><div><h1>کارهای بدون زمان</h1><p>کارهایت را ثبت کن و برایشان یک وقت مناسب پیدا کن.</p></div>
      <Button variant="primary" onClick={() => { setEdit({ task: null, revision }); }}><Plus size={18} /> کار جدید</Button></div>
    <section className="panel padded task-panel">
      <div className="panel-heading"><span className="tile violet"><ClipboardList size={21} /></span><div><h2>فهرست کارها</h2><p>مدت و مهلت در پیشنهاد زمان در نظر گرفته می‌شود.</p></div></div>
      {!data.tasks.length && <Empty icon={<ClipboardList size={27} />} title="هنوز کاری ثبت نشده است"><p>اولین کار را با مدت تخمینی اضافه کن.</p></Empty>}
      {data.tasks.map((task) => <article className="task-row" key={task.id}>
        <div className="task-summary"><strong>{task.title}</strong><span className="muted">{duration(task.minutes)} · اولویت {priorityLabels[task.priority]}{task.due && ` · مهلت ${fullDay(task.due, calendar)}`}</span></div>
        <div className="task-actions">
          {task.done && <span className="state-tag"><CheckCircle2 size={16} /> انجام‌شده</span>}
          {task.eventId ? <><span className="state-tag"><CheckCircle2 size={16} /> زمان‌بندی شده</span><Button onClick={() => unschedule(task)}>لغو زمان‌بندی</Button></>
            : !task.done && <Button onClick={() => setSuggest(task.id)}><Sparkles size={17} /> پیشنهاد زمان</Button>}
          <IconButton label="ویرایش کار" onClick={() => { setEdit({ task, revision }); }}><Pencil size={17} /></IconButton>
          <IconButton label="حذف کار" onClick={() => setDeleteId(task.id)}><Trash2 size={17} /></IconButton>
        </div>
      </article>)}
    </section>
    {edit && <TaskForm data={data} task={edit.task ?? undefined} stale={edit.revision !== revision} close={() => setEdit(null)}
      save={(task) => saveTask(task, edit.revision)} saveError={saveError} />}
    {chosen && <Dialog title={`زمان پیشنهادی برای «${chosen.title}»`} close={() => setSuggest(null)}>
      <div className="form"><p className="muted">{duration(chosen.minutes)}{data.settings.buffer > 0 && ` · با ${duration(data.settings.buffer)} حاشیهٔ استراحت`}{!chosen.due && " · جست‌وجو در ۳۰ روز آینده"}</p>
        {slots.length ? slots.map((slot) => <Button key={slot.start} onClick={() => {
          setSuggest(null); create({ date: todayIn(slot.start, zone), slot, taskId: chosen.id, categoryId: chosen.categoryId ?? undefined });
        }}><CalendarDays size={16} /> {fullDay(todayIn(slot.start, zone), calendar)} · {clockLabel(slot.start, zone)} تا {clockLabel(slot.end, zone)}{hasPreferences && ` · ${slot.preferred ? "مطابق ترجیح" : "آزاد خارج از ترجیح"}`}</Button>)
          : <Empty icon={<Clock3 />} title="بازهٔ مناسبی پیدا نشد"><p>{chosen.due ? "تا پایان مهلت بازهٔ کافی پیدا نشد." : "ساعات فعال یا مدت کار را بررسی کن."}</p></Empty>}
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
