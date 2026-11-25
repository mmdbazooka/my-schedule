"use client";

import { Select } from "@/components/select";
import { useState } from "react";
import { Clock3, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Dialog, Field, IconButton, TimeField } from "@/components/ui";
import { localizedTime, normalizeTime, weekdays } from "@/features/calendar/dates";
import type { PlannerData, TimePreference } from "@/types/planner";

export function Preferences({ data, revision, save, saveError }: {
  data: PlannerData; revision: number; saveError?: string;
  save: (preferences: TimePreference[], revision: number) => boolean;
}) {
  const [edit, setEdit] = useState<{ rule?: TimePreference; revision: number } | null>(null);
  const [error, setError] = useState("");
  const names = new Map(data.categories.map((entry) => [entry.id, entry.name]));
  const begin = (rule?: TimePreference) => { setError(""); setEdit({ rule, revision }); };
  const days = Array.from({ length: 7 }, (_, index) => (index + data.settings.weekStart) % 7);
  return <section className="panel padded settings-card">
    <div className="panel-heading"><span className="tile blue"><Clock3 size={20} /></span><div>
      <h2>زمان‌های ترجیحی</h2><p>برای مطالعهٔ عمیق یا هر دسته، چند روز و بازه تعریف کن. پیشنهادهای آزادِ منطبق اول نمایش داده می‌شوند.</p>
    </div></div>
    {data.preferences.map((rule) => <article key={rule.id} className="task-row">
      <div className="task-summary"><strong>{names.get(rule.categoryId)}</strong>
        <span className="muted">{weekdays[rule.weekday]} · {localizedTime(rule.start)} تا {localizedTime(rule.end)}</span></div>
      <div className="action-row"><IconButton label="ویرایش زمان ترجیحی" onClick={() => begin(rule)}><Pencil size={16} /></IconButton>
        <IconButton label="حذف زمان ترجیحی" onClick={() => save(data.preferences.filter((entry) => entry.id !== rule.id), revision)}><Trash2 size={16} /></IconButton></div>
    </article>)}
    <div><Button onClick={() => begin()}><Plus size={16} /> زمان ترجیحی جدید</Button></div>
    {edit && <Dialog title={edit.rule ? "ویرایش زمان ترجیحی" : "زمان ترجیحی جدید"} close={() => setEdit(null)}>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        if (edit.revision !== revision) return;
        const form = new FormData(event.currentTarget);
        const start = normalizeTime(String(form.get("start")));
        const end = normalizeTime(String(form.get("end")));
        const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
        if (!clock.test(start) || !(clock.test(end) || end === "24:00") || start >= end) {
          setError("بازه را با ساعت معتبر وارد کن. پایان باید بعد از شروع باشد.");
          return;
        }
        const rule = { id: edit.rule?.id ?? crypto.randomUUID(), weekday: Number(form.get("weekday")),
          categoryId: String(form.get("category")), start, end };
        const next = edit.rule ? data.preferences.map((entry) => entry.id === rule.id ? rule : entry) : [...data.preferences, rule];
        if (save(next, edit.revision)) setEdit(null);
      }}>
        <div className="form-grid">
          <Field label="دستهٔ ترجیح"><Select name="category" defaultValue={edit.rule?.categoryId ?? (names.has("study") ? "study" : data.categories[0].id)}>
            {data.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </Select></Field>
          <Field label="روز ترجیح"><Select name="weekday" defaultValue={edit.rule?.weekday ?? data.settings.weekStart}>
            {days.map((day) => <option key={day} value={day}>{weekdays[day]}</option>)}
          </Select></Field>
          <TimeField name="start" label="شروع ترجیح" time={edit.rule?.start ?? "09:00"} />
          <TimeField name="end" label="پایان ترجیح" time={edit.rule?.end ?? "11:00"} />
        </div>
        {(error || saveError) && <p className="error" role="alert">{error || saveError}</p>}
        {edit.revision !== revision && <p className="error" role="alert">داده‌ها تغییر کرده‌اند. فرم را دوباره باز کن.</p>}
        <footer className="dialog-actions"><Button onClick={() => setEdit(null)}>انصراف</Button>
          <Button type="submit" variant="primary" disabled={edit.revision !== revision}>ذخیرهٔ ترجیح</Button></footer>
      </form>
    </Dialog>}
  </section>;
}
