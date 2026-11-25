"use client";

import { TimePicker } from "@/components/time-picker";
import { Select } from "@/components/select";
import { useMemo, useState } from "react";
import { AlertTriangle, Copy } from "lucide-react";
import { Button, Check, Dialog, Field } from "@/components/ui";
import { conflicts } from "@/features/availability/availability";
import { expandEvents } from "@/features/events/recurrence";
import { statusLabels } from "@/lib/defaults";
import type { Occurrence, PlannerData, PlannerEvent } from "@/types/planner";
import { addDays, clockLabel, datesBetween, duration, eventTime, fa, fullDay, localTime, localizedTime, minute, normalizeTime, timingInterval, todayIn } from "./dates";
import { copyOccurrence, weekCopySources } from "./week-copy";

type Row = { id: string; include: boolean; date: string; time: string };

export function CopyDialog({ data, from, revision, stale, close, save, saveError }: {
  data: PlannerData; from: string; revision: number; stale: boolean; close: () => void;
  save: (events: PlannerEvent[], revision: number) => boolean; saveError?: string;
}) {
  const { zone, calendar } = data.settings;
  const [sources] = useState(() => weekCopySources(data.events, from, zone));
  const [rows, setRows] = useState<Row[]>(() => sources.map(({ entry, displayDate }) => ({
    id: entry.id, include: entry.status !== "cancelled", date: addDays(displayDate, 7),
    time: entry.timing.allDay ? "" : localizedTime(localTime(timingInterval(entry.timing, zone).start, zone)),
  })));
  const destination = addDays(from, 7);
  const choices = datesBetween(destination, addDays(destination, 7));
  const adjust = (id: string, change: Partial<Row>) => setRows(rows.map((entry) => entry.id === id ? { ...entry, ...change } : entry));

  const { valid, issues, warnings } = useMemo(() => {
    const issues = new Map<string, string>();
    const valid: Occurrence[] = [];
    for (const [index, row] of rows.entries()) {
      if (!row.include) continue;
      const { entry } = sources[index];
      const time = normalizeTime(row.time);
      if (!entry.timing.allDay && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        issues.set(row.id, "ساعت شروع را با قالب ۲۴ساعته وارد کن.");
        continue;
      }
      try { valid.push(copyOccurrence(entry, row.date, time, zone)); }
      catch { issues.set(row.id, "این ساعت در هفتهٔ مقصد معتبر یا یکتا نیست. ساعت دیگری انتخاب کن."); }
    }
    const first = addDays(from, 7);
    const end = valid.reduce((latest, entry) => {
      const date = todayIn(timingInterval(entry.timing, zone).end - 1, zone);
      return date > latest ? date : latest;
    }, addDays(first, 6));
    const existing = valid.length ? expandEvents(data.events, addDays(first, -1), addDays(end, 2), zone) : [];
    const warnings = new Map(valid.map((entry) => {
      const otherCopies = valid.filter((candidate) => candidate !== entry);
      return [entry.eventId, conflicts(entry, [...existing, ...otherCopies], zone, undefined, true)];
    }));
    return { valid, issues, warnings };
  }, [rows, sources, zone, from, data.events]);
  const byId = new Map(valid.map((entry) => [entry.eventId, entry]));
  const hasConflict = [...warnings.values()].some((entries) => entries.length > 0);

  return <Dialog title="پیش‌نمایش کپی هفته" close={close}>
    <div className="form">
      <p>هفتهٔ مقصد <strong>{fullDay(destination, calendar)} تا {fullDay(addDays(destination, 6), calendar)}</strong></p>
      <p className="muted">موارد دلخواه را انتخاب کن. کلاس‌ها و سایر سری‌های تکرارشونده خودشان در تقویم مقصد ظاهر می‌شوند.</p>
      {!rows.length && <p className="info">در هفتهٔ مبدأ رویداد مستقلی برای کپی وجود ندارد.</p>}
      {rows.map((row, index) => {
        const source = sources[index].entry;
        const draft = byId.get(row.id);
        const length = draft && timingInterval(draft.timing, zone);
        const overlaps = warnings.get(row.id) ?? [];
        return <fieldset className="form copy-item" key={row.id}>
          <Check checked={row.include} onChange={(event) => adjust(row.id, { include: event.target.checked })}>{source.title}</Check>
          <small className="muted">مبدأ {fullDay(sources[index].displayDate, calendar)} · {eventTime(source.timing, zone)} · {statusLabels[source.status]}</small>
          {row.include && <>
            <div className="form-grid">
              <Field label={`روز مقصد ${source.title}`}><Select value={row.date} onValueChange={(choice) => adjust(row.id, { date: choice })}>
                {choices.map((date) => <option key={date} value={date}>{fullDay(date, calendar)}</option>)}
              </Select></Field>
              {!source.timing.allDay && <TimePicker label={`ساعت مقصد ${source.title}`} time={row.time}
                onChange={(time) => adjust(row.id, { time })} />}
            </div>
            {draft && <p><strong>مقصد</strong> {fullDay(row.date, calendar)} · {eventTime(draft.timing, zone)}
              {length && !draft.timing.allDay && ` · ${duration((length.end - length.start) / minute)}`}</p>}
            {issues.has(row.id) && <p className="error" role="alert">{issues.get(row.id)}</p>}
            {overlaps.length > 0 && <div className="warning"><strong><AlertTriangle size={16} /> تداخل در مقصد</strong>
              <ul>{overlaps.slice(0, 8).map(({ event, shared }, position) => <li key={position}>
                «{event.title}» · {fullDay(todayIn(shared.start, zone), calendar)} · {clockLabel(shared.start, zone)} تا {clockLabel(shared.end, zone)}
              </li>)}</ul>{overlaps.length > 8 && <p>{fa(overlaps.length - 8)} تداخل دیگر</p>}
            </div>}
          </>}
        </fieldset>;
      })}
      {stale && <p className="error" role="alert">داده‌ها تغییر کرده‌اند. پیش‌نمایش را دوباره باز کن.</p>}
      {saveError && <p className="error" role="alert">{saveError}</p>}
      <footer className="dialog-actions"><Button onClick={close}>انصراف</Button>
        <Button variant="primary" disabled={stale || !valid.length || issues.size > 0} onClick={() => {
          const events = valid.map((occurrence) => {
            const { eventId, date, ...fields } = occurrence;
            void eventId;
            void date;
            return { ...fields, id: crypto.randomUUID(), recurrence: null, exceptions: {} };
          });
          if (save(events, revision)) close();
        }}><Copy size={16} /> {hasConflict ? "تأیید و کپی با تداخل" : "تأیید و کپی"}</Button></footer>
    </div>
  </Dialog>;
}
