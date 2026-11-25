"use client";

import { cloneElement, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { addDays, addMonths, dateInput, dateParts, fa, fullDay, monthLabel, monthStart, parseDateInput, todayIn, weekdays, weekBeginning } from "@/features/calendar/dates";
import type { Calendar } from "@/types/planner";

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props} />;
}

export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <Button variant="ghost" aria-label={label} title={label} {...props} className={`icon-button ${props.className ?? ""}`}>{children}</Button>;
}

export function Dialog({ title, close, children, className }: { title: string; close: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        const openDialogs = document.querySelectorAll("dialog[open]");
        const top = openDialogs[openDialogs.length - 1];
        if (previous instanceof HTMLElement && previous.isConnected && (!top || top.contains(previous))) previous.focus();
      });
    };
  }, []);

  return <dialog ref={ref} className={className} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="dialog-content">
      <header className="dialog-header"><h2 id={id}>{title}</h2><IconButton label="بستن" onClick={close}><X size={20} /></IconButton></header>
      {children}
    </section>
  </dialog>;
}

export function Field({ label, children, hint }: { label: string; children: ReactElement<HTMLAttributes<HTMLElement>>; hint?: string }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>
    {cloneElement(children, { id, "aria-describedby": hint ? `${id}-hint` : undefined })}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

export function DateField({ label, date, calendar, name, required = false, weekStart = 6, onPick }: {
  label: string; date?: string | null; calendar: Calendar; name: string; required?: boolean; weekStart?: number; onPick?: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState(date ? dateInput(date, calendar) : "");
  const [picker, setPicker] = useState<string | null>(null);
  const first = picker ? weekBeginning(picker, weekStart) : "";
  function toggle() {
    if (picker) return setPicker(null);
    let chosen = date ?? todayIn(Date.now(), "Asia/Tehran");
    try { if (value) chosen = parseDateInput(value, calendar); } catch { /* Use the field's initial month. */ }
    setPicker(monthStart(chosen, calendar));
  }
  return <div className="field date-field" onKeyDown={(event) => {
    if (event.key === "Escape" && picker) {
      event.preventDefault();
      event.stopPropagation();
      setPicker(null);
      trigger.current?.focus();
    }
  }}>
    <label htmlFor={id}>{label}</label>
    <div className="date-control">
      <input id={id} name={name} dir="ltr" inputMode="numeric" autoComplete="off" required={required}
        placeholder={calendar === "persian" ? "۱۴۰۵/۰۹/۰۱" : "۲۰۲۶/۱۱/۲۲"} value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" className="button button-ghost icon-button" ref={trigger} aria-label={`انتخاب ${label}`} aria-expanded={!!picker}
        onClick={toggle}><CalendarDays size={16} /></button>
    </div>
    {picker && <div className="date-picker" role="group" aria-label={`تقویم ${label}`}>
      <header><IconButton label="ماه قبلی" onClick={() => setPicker(addMonths(picker, -1, calendar))}><ChevronRight size={16} /></IconButton>
        <strong>{monthLabel(picker, calendar)}</strong><IconButton label="ماه بعدی" onClick={() => setPicker(addMonths(picker, 1, calendar))}><ChevronLeft size={16} /></IconButton></header>
      <div className="date-picker-grid">
        {Array.from({ length: 7 }, (_, index) => {
          const name = weekdays[(index + weekStart) % 7];
          return <small key={name} title={name}>{name[0]}</small>;
        })}
        {Array.from({ length: 42 }, (_, index) => {
          const candidate = addDays(first, index);
          const formatted = dateInput(candidate, calendar);
          return <button key={candidate} type="button" aria-label={fullDay(candidate, calendar)} aria-pressed={formatted === value}
            data-outside={monthStart(candidate, calendar) !== picker}
            disabled={candidate < "1900-01-01" || candidate > "2199-12-31"} onClick={() => {
              setValue(formatted);
              onPick?.();
              setPicker(null);
              trigger.current?.focus();
            }}>{fa(dateParts(candidate, calendar).day)}</button>;
        })}
      </div>
    </div>}
  </div>;
}

export function Check({ children, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) {
  return <label className="check"><input type="checkbox" {...props} /><span>{children}</span></label>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon}</span><strong>{title}</strong>{children}</div>;
}
