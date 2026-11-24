"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Pencil, Plus } from "lucide-react";
import { Button, Dialog, Empty, Field, IconButton } from "@/components/ui";
import { EventRow, occurrenceKey } from "@/features/calendar/calendar-view";
import { duration, eventTime, fa, fullDay, timingInterval, todayIn } from "@/features/calendar/dates";
import type { EventDraft } from "@/features/events/event-form";
import { GoalFields, readGoal } from "@/features/goals/goal-fields";
import { TaskForm } from "@/features/tasks/task-form";
import type { EventKind, Lesson, Occurrence, PlannerData, Task } from "@/types/planner";
import { lessonOverview } from "./overview";

export function Lessons({ data, now, revision, create, open, saveLesson, saveTask, saveError }: {
  data: PlannerData; now: number; revision: number; saveError?: string;
  create: (draft: EventDraft) => void; open: (event: Occurrence) => void;
  saveLesson: (lesson: Lesson, revision: number) => boolean;
  saveTask: (task: Task, revision: number) => boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ lesson?: Lesson; revision: number } | null>(null);
  const [assignment, setAssignment] = useState<{ task?: Task; lessonId: string; revision: number } | null>(null);
  const [error, setError] = useState("");
  const { zone, calendar } = data.settings;
  const lesson = data.lessons.find((entry) => entry.id === selected);
  const overview = useMemo(() => lesson ? lessonOverview(data, lesson.id, now) : null, [data, lesson, now]);
  const exam = overview?.nextExam;
  const edit = (entry?: Lesson) => { setError(""); setEditing({ lesson: entry, revision }); };
  const createFor = (kind: EventKind, categoryId: string) => {
    if (lesson) create({ kind, categoryId, lessonId: lesson.id, date: todayIn(now, zone) });
  };
  const groups = [
    { kind: "class", title: "کلاس‌ها", empty: "کلاسی برای این درس ثبت نشده.", icon: GraduationCap },
    { kind: "exam", title: "امتحان‌ها", empty: "امتحانی برای این درس ثبت نشده.", icon: CalendarDays },
    { kind: "study", title: "جلسات مطالعه", empty: "جلسهٔ مطالعه‌ای برای این درس ثبت نشده.", icon: BookOpen },
    { kind: "general", title: "سایر رویدادهای درس", empty: "", icon: CalendarDays },
  ] as const;

  return <>
    <div className="page-heading">
      <div>{lesson && <Button variant="ghost" onClick={() => setSelected(null)}><ArrowRight size={16} /> همهٔ درس‌ها</Button>}
        <h1>{lesson?.name ?? "درس‌ها"}</h1>
        {!lesson && <p>کلاس‌ها، تکلیف‌ها و زمان مطالعهٔ هر درس را یک‌جا ببین.</p>}
      </div>
      {lesson ? <Button onClick={() => edit(lesson)}><Pencil size={16} /> ویرایش درس</Button>
        : <Button variant="primary" onClick={() => edit()}><Plus size={17} /> درس جدید</Button>}
    </div>
    {!lesson && <section className="lesson-grid">
      {data.lessons.length ? data.lessons.map((entry) => <article className="panel padded" key={entry.id}>
        <div className="panel-heading"><span className="tile violet"><BookOpen size={20} /></span>
          <div><h2>{entry.name}</h2>{entry.weeklyMinutes > 0 && <p>{duration(entry.weeklyMinutes)} هدف مطالعه در هفته</p>}</div>
        </div>
        <Button className="lesson-open" variant="ghost" onClick={() => setSelected(entry.id)}>جزئیات {entry.name}</Button>
      </article>) : <div className="panel padded"><Empty icon={<BookOpen />} title="هنوز درسی ثبت نشده است" /></div>}
    </section>}
    {lesson && overview && <>
      <section className="panel padded feature-panel">
        <div className="panel-heading"><span className="tile violet"><CalendarDays size={20} /></span><div><h2>امتحان بعدی</h2>
          <p>{exam ? `${exam.title} · ${fullDay(todayIn(timingInterval(exam.timing, zone).start, zone), calendar)} · ${exam.timing.allDay ? "بدون ساعت" : eventTime(exam.timing, zone)}` : "امتحان پیشِ رو ثبت نشده."}</p>
        </div></div>
        {exam && <div className="action-row"><span className="state-tag">{overview.daysUntil === 0 ? "امروز" : `${fa(overview.daysUntil!)} روز تا امتحان`}</span>
          <span className="state-tag">{duration(overview.studyMinutes)} مطالعهٔ برنامه‌ریزی‌شده تا امتحان</span>
          <Button variant="ghost" onClick={() => open(exam)}>جزئیات امتحان</Button></div>}
        <div className="action-row">
          <Button onClick={() => createFor("class", "university")}><Plus size={16} /> کلاس</Button>
          <Button onClick={() => setAssignment({ lessonId: lesson.id, revision })}><Plus size={16} /> تکلیف</Button>
          <Button onClick={() => createFor("exam", "university")}><Plus size={16} /> امتحان</Button>
          <Button onClick={() => createFor("study", "study")}><Plus size={16} /> جلسهٔ مطالعه</Button>
        </div>
      </section>
      <div className="lesson-grid">
        {groups.map(({ kind, title, empty, icon: Icon }) => {
          const events = overview.events.filter((event) => event.kind === kind);
          if (kind === "general" && !events.length) return null;
          return <section key={kind} className="panel padded feature-panel">
            <div className="panel-heading"><span className="tile violet"><Icon size={19} /></span><div><h2>{title}</h2></div></div>
            {events.length ? events.map((event) => <div className="lesson-event" key={occurrenceKey(event)}>
              <small className="muted">{fullDay(todayIn(timingInterval(event.timing, zone).start, zone), calendar)}</small>
              <EventRow event={event} data={data} open={open} />
            </div>) : <p className="muted">{empty}</p>}
          </section>;
        })}
        <section className="panel padded feature-panel">
          <div className="panel-heading"><span className="tile mint"><ClipboardCheck size={19} /></span><div><h2>تکلیف‌ها</h2></div></div>
          {overview.tasks.length ? overview.tasks.map((task) => <article key={task.id} className="task-row">
            <div className="task-summary"><strong>{task.title}</strong><span className="muted">
              {task.done ? "انجام‌شده" : "انجام‌نشده"}{task.due ? ` · مهلت ${fullDay(task.due, calendar)}` : " · بدون مهلت"}
            </span></div>
            <IconButton label={`ویرایش ${task.title}`} onClick={() => setAssignment({ task, lessonId: lesson.id, revision })}><Pencil size={17} /></IconButton>
          </article>) : <p className="muted">تکلیفی برای این درس ثبت نشده.</p>}
        </section>
      </div>
    </>}
    {assignment && <TaskForm data={data} task={assignment.task} lessonId={assignment.lessonId} stale={assignment.revision !== revision}
      save={(task) => saveTask(task, assignment.revision)} close={() => setAssignment(null)} saveError={saveError} />}
    {editing && <Dialog title={editing.lesson ? "ویرایش درس" : "درس جدید"} close={() => setEditing(null)}>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        if (editing.revision !== revision) return;
        try {
          const values = new FormData(event.currentTarget);
          const name = String(values.get("name")).trim();
          if (!name) throw new Error("نام درس را وارد کن.");
          const entry = { id: editing.lesson?.id ?? crypto.randomUUID(), name, weeklyMinutes: readGoal(values) };
          if (saveLesson(entry, editing.revision)) { setSelected(entry.id); setEditing(null); }
        } catch (issue) { setError((issue as Error).message); }
      }}>
        <Field label="نام درس"><input name="name" required autoFocus maxLength={80} defaultValue={editing.lesson?.name} /></Field>
        <GoalFields minutes={editing.lesson?.weeklyMinutes ?? 0} />
        <p className="muted">هدف هفتگی این درس فقط از جلسات مطالعه محاسبه می‌شود.</p>
        {(error || saveError) && <p className="error" role="alert">{error || saveError}</p>}
        {editing.revision !== revision && <p className="error" role="alert">داده‌ها تغییر کرده‌اند. فرم را دوباره باز کن.</p>}
        <footer className="dialog-actions"><Button onClick={() => setEditing(null)}>انصراف</Button>
          <Button type="submit" variant="primary" disabled={editing.revision !== revision}>ذخیرهٔ درس</Button></footer>
      </form>
    </Dialog>}
  </>;
}
