"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, Dialog, Empty, IconButton } from "@/components/ui";
import { suggestions } from "@/features/availability/availability";
import { addDays, clockLabel, day, duration, fullDay, todayIn } from "@/features/calendar/dates";
import { TaskForm } from "./task-form";
import type { EventDraft } from "@/features/events/event-form";
import { priorityLabels } from "@/lib/defaults";
import type { PlannerData, Task } from "@/types/planner";

const suggestionBatch = 10;
const daysPerPage = 7;

export function Tasks({ data, now, create, save, saveTask, unschedule, revision, saveError }: {
  data: PlannerData; now: number; create: (draft: EventDraft) => void;
  saveError?: string;
  saveTask: (task: Task, revision: number) => boolean;
  unschedule: (task: Task) => boolean;
  save: (tasks: Task[], message: string) => boolean; revision: number;
}) {
  const [edit, setEdit] = useState<{ task: Task | null; revision: number } | null>(null);
  const [suggest, setSuggest] = useState<{ id: string; page: number; limit: number } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { zone, calendar } = data.settings;
  const chosen = data.tasks.find((task) => task.id === suggest?.id && !task.eventId && !task.done);
  const today = todayIn(now, zone);
  const horizon = chosen?.due ? addDays(chosen.due, 1) : addDays(today, 30);
  const totalDays = day(today).until(day(horizon)).days;
  const lastPage = Math.max(0, Math.ceil(totalDays / daysPerPage) - 1);
  const page = Math.min(suggest?.page ?? 0, lastPage);
  const limit = suggest?.limit ?? suggestionBatch;
  const from = addDays(today, page * daysPerPage);
  const pageEnd = addDays(from, daysPerPage);
  const to = pageEnd < horizon ? pageEnd : horizon;
  const slots = chosen && from < to ? suggestions(data, chosen, now, { from, to, limit: limit + 1 }) : [];

  function changePage(offset: number) {
    setSuggest((current) => current && { ...current, page: page + offset, limit: suggestionBatch });
  }

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
            : !task.done && <Button onClick={() => setSuggest({ id: task.id, page: 0, limit: suggestionBatch })}><Sparkles size={17} /> پیشنهاد زمان</Button>}
          <IconButton label="ویرایش کار" onClick={() => { setEdit({ task, revision }); }}><Pencil size={17} /></IconButton>
          <IconButton label="حذف کار" onClick={() => setDeleteId(task.id)}><Trash2 size={17} /></IconButton>
        </div>
      </article>)}
    </section>
    {edit && <TaskForm data={data} task={edit.task ?? undefined} stale={edit.revision !== revision} close={() => setEdit(null)}
      save={(task) => saveTask(task, edit.revision)} saveError={saveError} />}
    {chosen && <Dialog title={`زمان پیشنهادی برای «${chosen.title}»`} close={() => setSuggest(null)}>
      <div className="form"><p className="muted">{duration(chosen.minutes)}{data.settings.buffer > 0 && ` · با ${duration(data.settings.buffer)} حاشیهٔ استراحت`}{!chosen.due && " · جست‌وجو در ۳۰ روز آینده"}</p>
        {from < to && <div className="suggestion-pagination">
          <Button variant="ghost" disabled={page === 0} onClick={() => changePage(-1)}><ChevronRight size={15} /> هفت روز قبل</Button>
          <p aria-live="polite">{fullDay(from, calendar)}{addDays(to, -1) !== from && ` تا ${fullDay(addDays(to, -1), calendar)}`}</p>
          <Button variant="ghost" disabled={to >= horizon} onClick={() => changePage(1)}>هفت روز بعد <ChevronLeft size={15} /></Button>
        </div>}
        {slots.length ? slots.slice(0, limit).map((slot) => <Button key={slot.start} onClick={() => {
          setSuggest(null); create({ date: todayIn(slot.start, zone), slot, taskId: chosen.id, categoryId: chosen.categoryId ?? undefined });
        }}><CalendarDays size={16} /> {fullDay(todayIn(slot.start, zone), calendar)} · {clockLabel(slot.start, zone)} تا {clockLabel(slot.end, zone)}{hasPreferences && ` · ${slot.preferred ? "مطابق ترجیح" : "آزاد خارج از ترجیح"}`}</Button>)
          : <Empty icon={<Clock3 />} title="بازهٔ مناسبی پیدا نشد">
            <p>{to < horizon ? "برای دیدن روزهای بعد از دکمهٔ «هفت روز بعد» استفاده کن."
              : chosen.due ? "در این بازه تا پایان مهلت وقت کافی پیدا نشد." : "در این بازه وقت کافی پیدا نشد."}</p>
          </Empty>}
        {slots.length > limit && <Button variant="ghost" onClick={() => {
          setSuggest((current) => current && { ...current, limit: current.limit + suggestionBatch });
        }}>نمایش زمان‌های بیشتر در همین بازه</Button>}
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
