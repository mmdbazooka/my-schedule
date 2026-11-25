"use client";

import { useId, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { latin, localizedTime, normalizeTime, pad } from "@/features/calendar/dates";

const quickMinutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function ClockPanel({ label, value, endOfDay, close, apply }: {
  label: string;
  value: string;
  endOfDay: boolean;
  close: () => void;
  apply: (time: string) => void;
}) {
  const normalized = normalizeTime(value);
  const initial = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized) || (endOfDay && normalized === "24:00")
    ? normalized : "09:00";
  const [hour, setHour] = useState(Number(initial.slice(0, 2)));
  const [minutes, setMinutes] = useState(initial.slice(3));
  const group = useId();
  const minuteId = useId();
  const minuteValid = /^\d{1,2}$/.test(minutes) && Number(minutes) < 60;
  const selection = hour === 24 ? "24:00" : minuteValid ? `${pad(hour)}:${pad(Number(minutes))}` : "";

  return <Dialog title={label} close={close} className="clock-dialog">
    <div className="clock-panel" onKeyDown={(event) => {
      if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      if (selection) apply(selection);
    }}>
      <div className="clock-preview">
        <Clock3 size={21} aria-hidden="true" />
        <output dir="ltr" aria-label="زمان انتخاب‌شده">{localizedTime(selection || `${pad(hour)}:--`)}</output>
        <span>۲۴ ساعته</span>
      </div>
      <fieldset className="clock-hours">
        <legend>ساعت</legend>
        <div className="clock-grid" dir="ltr">
          {Array.from({ length: 24 }, (_, option) => (
            <label className="clock-hour" key={option}>
              <input type="radio" name={group} checked={hour === option} onChange={() => setHour(option)} />
              <span>{localizedTime(pad(option))}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="clock-minutes">
        <div className="clock-minute-field">
          <label htmlFor={minuteId}>دقیقهٔ دقیق</label>
          <input id={minuteId} dir="ltr" inputMode="numeric" maxLength={2} autoComplete="off"
            value={hour === 24 ? "۰۰" : localizedTime(minutes)} disabled={hour === 24}
            aria-invalid={hour < 24 && !minuteValid}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setMinutes(latin(event.currentTarget.value).replace(/\D/g, ""))} />
        </div>
        <div className="clock-grid" role="group" aria-label="دقیقه‌های پیشنهادی" dir="ltr">
          {quickMinutes.map((option) => (
            <button className="clock-minute" key={option} type="button" disabled={hour === 24}
              aria-pressed={minuteValid && hour < 24 && Number(minutes) === option}
              onClick={() => setMinutes(pad(option))}>{localizedTime(pad(option))}</button>
          ))}
        </div>
      </div>
      {endOfDay && <button className="clock-end" type="button" aria-pressed={hour === 24} onClick={() => setHour(24)}>پایان روز · ۲۴:۰۰</button>}
      <footer className="dialog-actions">
        <Button onClick={close}>انصراف</Button>
        <Button variant="primary" disabled={!selection} onClick={() => apply(selection)}><Check size={16} /> انتخاب زمان</Button>
      </footer>
    </div>
  </Dialog>;
}

export function TimePicker({ label, time, name, onChange, endOfDay = false, compact = false }: {
  label: string;
  time: string;
  name?: string;
  onChange?: (value: string) => void;
  endOfDay?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const [local, setLocal] = useState(time);
  const [open, setOpen] = useState(false);
  const value = onChange ? time : local;

  function change(value: string) {
    if (onChange) onChange(value);
    else setLocal(value);
  }

  return <div className="field time-field">
    <label className={compact ? "sr-only" : undefined} htmlFor={id}>{label}</label>
    <div className="time-control">
      <input id={id} name={name} dir="ltr" inputMode="numeric" autoComplete="off" required
        placeholder="۰۹:۰۰" value={localizedTime(value)} onChange={(event) => change(event.currentTarget.value)} />
      <button type="button" aria-label={`انتخاب ${label}`} title={`انتخاب ${label}`} aria-haspopup="dialog"
        aria-expanded={open} onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}><Clock3 size={17} aria-hidden="true" /></button>
    </div>
    {open && <ClockPanel label={`انتخاب ${label}`} value={value} endOfDay={endOfDay} close={() => setOpen(false)}
      apply={(next) => { change(next); setOpen(false); }} />}
  </div>;
}
