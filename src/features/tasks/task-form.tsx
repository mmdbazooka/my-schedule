"use client";

import { Select } from "@/components/select";
import { useState } from "react";
import { Button, Check, DateField, Dialog, Field } from "@/components/ui";
import { latin, parseDateInput } from "@/features/calendar/dates";
import { LessonSelect } from "@/features/lessons/lesson-select";
import { priorityLabels } from "@/lib/defaults";
import type { PlannerData, Priority, Task } from "@/types/planner";

export function TaskForm({ data, task, lessonId, stale, close, save, saveError }: {
  data: PlannerData; task?: Task; lessonId?: string; stale: boolean;
  close: () => void; save: (task: Task) => boolean; saveError?: string;
}) {
  const [error, setError] = useState("");
  const { calendar, weekStart } = data.settings;
  return <Dialog title={task ? "ویرایش کار" : lessonId ? "تکلیف جدید" : "کار جدید"} close={close}>
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      if (stale) return;
      try {
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title")).trim();
        const minutes = Number(latin(String(form.get("minutes"))));
        const rawDue = String(form.get("due")).trim();
        if (!title || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error("عنوان و مدت تخمینی بین ۱ تا ۱۴۴۰ دقیقه وارد کنید.");
        const due = rawDue ? parseDateInput(rawDue, calendar) : null;
        if (task?.eventId && (task.minutes !== minutes || task.due !== due)) throw new Error("برای تغییر مهلت یا مدت، ابتدا زمان‌بندی کار را لغو کنید.");
        const next: Task = {
          ...task, id: task?.id ?? crypto.randomUUID(), eventId: task?.eventId ?? null,
          title, minutes, due, priority: String(form.get("priority")) as Priority,
          categoryId: String(form.get("category") ?? "") || null, lessonId: String(form.get("lesson") ?? "") || null,
          done: form.has("done"),
        };
        setError("");
        if (save(next)) close();
      } catch (issue) { setError((issue as Error).message); }
    }}>
      <Field label="عنوان کار"><input name="title" required maxLength={160} autoFocus defaultValue={task?.title} /></Field>
      <div className="form-grid">
        <Field label="مدت تخمینی به دقیقه"><input name="minutes" required inputMode="numeric" defaultValue={task?.minutes ?? 60} /></Field>
        <Field label="اولویت"><Select name="priority" defaultValue={task?.priority ?? "medium"}>
          {Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select></Field>
        <Field label="دسته‌بندی کار"><Select name="category" defaultValue={task?.categoryId ?? ""}>
          <option value="">بدون دستهٔ مشخص</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select></Field>
        {data.lessons.length > 0 && <LessonSelect lessons={data.lessons} value={task?.lessonId ?? lessonId} />}
      </div>
      <DateField label="تاریخ مهلت (اختیاری)" name="due" date={task?.due} calendar={calendar} weekStart={weekStart} />
      <Check name="done" defaultChecked={task?.done}>انجام‌شده</Check>
      {(error || saveError) && <p className="error" role="alert">{error || saveError}</p>}
      {stale && <p className="error" role="alert">داده‌ها در تب دیگری تغییر کرده‌اند. فرم را دوباره باز کنید.</p>}
      <footer className="dialog-actions"><Button onClick={close}>انصراف</Button><Button variant="primary" type="submit" disabled={stale}>ذخیرهٔ کار</Button></footer>
    </form>
  </Dialog>;
}
