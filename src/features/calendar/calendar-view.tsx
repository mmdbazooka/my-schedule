"use client";

import { Select } from "@/components/select";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock3, Copy, List, Plus, Search, Sun, Timer } from "lucide-react";
import { Button, DateField, Dialog, Empty, Field, IconButton } from "@/components/ui";
import { availableSlots, suggestions } from "@/features/availability/availability";
import { expandEvents } from "@/features/events/recurrence";
import type { EventDraft } from "@/features/events/event-form";
import { statusLabels } from "@/lib/defaults";
import type { Interval, Occurrence, PlannerData, PlannerEvent, Status } from "@/types/planner";
import { addDays, addMonths, atTime, clockLabel, dateParts, duration, eventTime, fa, formatDay, fullDay, latin, localizedTime, minute, monthLabel, monthStart, pad, parseDateInput, todayIn, weekday, weekdays, weekBeginning } from "./dates";
import { CopyDialog } from "./copy-dialog";
import { occurrencesOn, timelineLayout, visibleDates, wallRange } from "./layout";

type View = "month" | "week" | "day" | "list";
const views = [
  { key: "month", label: "ماه", icon: CalendarDays },
  { key: "week", label: "هفته", icon: CalendarRange },
  { key: "day", label: "روز", icon: Sun },
  { key: "list", label: "فهرست", icon: List },
] as const;
export const occurrenceKey = (event: Occurrence) => `${event.eventId}:${event.date}`;

export function EventRow({ event, data, open }: { event: Occurrence; data: PlannerData; open: (event: Occurrence) => void }) {
  const category = data.categories.find((value) => value.id === event.categoryId);
  return <button className={`event-row ${event.status === "cancelled" ? "cancelled" : ""}`} style={{ "--event": category?.color } as CSSProperties} onClick={() => open(event)}>
    <span className="event-mark" /><span className="event-name"><strong>{event.title}</strong><small>{category?.name}{event.status !== "planned" && ` · ${statusLabels[event.status]}`}</small></span>
    <span className="event-time"><Clock3 size={15} />{eventTime(event.timing, data.settings.zone)}</span>
    <ChevronLeft size={16} className="muted" />
  </button>;
}

function Timeline({ dates, events, data, slots, open, create, today }: {
  dates: string[]; events: Occurrence[]; data: PlannerData; slots: Interval[]; open: (event: Occurrence) => void;
  create: (draft: EventDraft) => void; today: string;
}) {
  const { zone, calendar } = data.settings;
  const viewport = useRef<HTMLDivElement>(null);
  const height = 24 * 58;
  useEffect(() => { if (viewport.current) viewport.current.scrollTop = 7.75 * 58; }, []);

  return <div className="timeline-scroll" ref={viewport}>
    <div className="timeline-grid" data-week={dates.length === 7} style={{ "--day-count": dates.length, "--timeline-height": `${height}px` } as CSSProperties}>
      <div className="timeline-head timeline-label">ساعت</div>
      {dates.map((date) => <div key={date} className={`timeline-head ${date === today ? "current" : ""}`}><small>{weekdays[weekday(date)]}</small><strong>{fa(dateParts(date, calendar).day)}</strong></div>)}
      <div className="allday timeline-label">تمام‌روز</div>
      {dates.map((date) => <div className="allday" key={date}>
        {occurrencesOn(events, date, zone).filter((event) => event.timing.allDay).map((event) =>
          <button key={occurrenceKey(event)} className="month-event" style={{ "--event": data.categories.find((value) => value.id === event.categoryId)?.color } as CSSProperties}
            onClick={() => open(event)}>{event.title}{event.status !== "planned" && ` · ${statusLabels[event.status]}`}</button>)}
      </div>)}
      <div className="time-labels" dir="ltr">{Array.from({ length: 24 }, (_, hour) => <span key={hour}>{localizedTime(`${pad(hour)}:00`)}</span>)}</div>
      {dates.map((date) => <div key={date} className="timeline-column">
        {Array.from({ length: 24 }, (_, hour) => {
          const time = `${pad(hour)}:00`;
          const start = atTime(date, time, zone);
          return <button key={hour} className="hour-hit" onClick={() => create({ date, slot: { start, end: start + 60 * minute } })}
            aria-label={`رویداد جدید، ${fullDay(date, calendar)} ساعت ${localizedTime(time)}`} />;
        })}
        {slots.filter((slot) => todayIn(slot.start, zone) === date).map((slot) => {
          const range = wallRange(slot, date, zone);
          return <span key={slot.start} className="timeline-free" style={{ top: `${range.start / 14.4}%`, height: `${(range.end - range.start) / 14.4}%` }} />;
        })}
        {timelineLayout(occurrencesOn(events, date, zone), date, zone).map(({ event, start, end, lane, lanes }) =>
          <button key={occurrenceKey(event)} className="timeline-event" onClick={() => open(event)}
            style={{ top: `${start / 14.4}%`, height: `${(end - start) / 14.4}%`, insetInlineStart: `${lane * 100 / lanes}%`, width: `${100 / lanes}%`,
              "--event": data.categories.find((value) => value.id === event.categoryId)?.color } as CSSProperties}
            title={`${event.title} · ${eventTime(event.timing, zone)} · ${statusLabels[event.status]}`}>
            <strong>{event.title}{event.status !== "planned" && ` · ${statusLabels[event.status]}`}</strong><small>{eventTime(event.timing, zone)}</small>
          </button>)}
      </div>)}
    </div>
  </div>;
}

export function CalendarView({ data, date, select, now, create, open, revision, saveCopy, saveError }: {
  revision: number; saveError?: string; saveCopy: (events: PlannerEvent[], revision: number) => boolean;
  data: PlannerData; date: string; select: (date: string) => void; now: number; create: (draft: EventDraft) => void; open: (event: Occurrence) => void;
}) {
  const { calendar, zone, weekStart, buffer } = data.settings;
  const today = todayIn(now, zone);
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 570px)").matches ? "day" : "month");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [suggestCategory, setSuggestCategory] = useState("");
  const [slotLength, setSlotLength] = useState("۶۰");
  const [picker, setPicker] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [copy, setCopy] = useState<{ from: string; revision: number } | null>(null);
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const month = monthStart(date, calendar);
  const week = weekBeginning(date, weekStart);
  const from = view === "month" ? weekBeginning(month, weekStart) : view === "week" ? week : date;
  const count = view === "month" ? 42 : view === "week" ? 7 : view === "list" ? 30 : 1;
  const to = addDays(from, count);
  const dates = visibleDates(from, count);
  const all = useMemo(() => expandEvents(data.events, from, to, zone), [data.events, from, to, zone]);
  const events = all.filter((event) => (!category || event.categoryId === category) &&
    (!status || event.status === status) && event.title.toLocaleLowerCase("fa").includes(search.trim().toLocaleLowerCase("fa")));
  const slots = useMemo(() => view === "day" || view === "week" ? availableSlots(data, from, to, now) : [], [data, from, to, now, view]);
  const wantedMinutes = Number(latin(slotLength));
  const validLength = Number.isInteger(wantedMinutes) && wantedMinutes >= 1 && wantedMinutes <= 1440;
  const useSuggestions = (view === "day" || view === "week") && Boolean(suggestCategory);
  const suggestedSlots = useMemo(() => useSuggestions && validLength
    ? suggestions(data, { categoryId: suggestCategory, due: null, minutes: wantedMinutes }, now, { from, to, limit: 12 })
    : [], [data, from, now, suggestCategory, to, useSuggestions, validLength, wantedMinutes]);
  const hasPreferred = data.preferences.some((entry) => entry.categoryId === suggestCategory);
  const title = view === "month" ? monthLabel(date, calendar) : view === "day" ? fullDay(date, calendar)
    : `${formatDay(from, calendar, { day: "numeric", month: "long" })} تا ${formatDay(addDays(to, -1), calendar, { day: "numeric", month: "long", year: "numeric" })}`;

  function move(delta: number) {
    select(view === "month" ? addMonths(date, delta, calendar) : addDays(date, delta * count));
  }

  return <>
    <div className="page-heading"><div><h1>تقویم برنامه‌ها</h1><p>رویدادها و وقت‌های آزاد را در یک جا ببینید.</p></div>
      <Button variant="primary" onClick={() => create({ date })}><Plus size={18} /> رویداد جدید</Button></div>
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <IconButton label="بازهٔ قبلی" onClick={() => move(-1)}><ChevronRight size={20} /></IconButton>
          <IconButton label="بازهٔ بعدی" onClick={() => move(1)}><ChevronLeft size={20} /></IconButton>
          <Button onClick={() => select(today)}>امروز</Button>
          <Button variant="ghost" onClick={() => { setPickerError(""); setPicker(true); }}><CalendarDays size={17} />{title}</Button>
        </div>
        <div className="segmented" aria-label="نمای تقویم">{views.map(({ key, label, icon: Icon }) =>
          <button key={key} aria-pressed={view === key} onClick={() => setView(key)}><Icon size={15} />{label}</button>)}</div>
      </div>
      <div className="calendar-filters">
        <label className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی عنوان رویداد…" aria-label="جست‌وجوی عنوان رویداد" /></label>
        <Select aria-label="فیلتر دسته" value={category} onValueChange={(choice) => setCategory(choice)}><option value="">همهٔ دسته‌ها</option>{data.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</Select>
        <Select aria-label="فیلتر وضعیت" value={status} onValueChange={(choice) => setStatus(choice as Status | "")}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
        {view === "week" && <Button onClick={() => setCopy({ from: week, revision })}><Copy size={16} /> کپی برنامه به هفتهٔ بعد</Button>}
      </div>
      {view === "month" && <div className="month-wrap"><div className="month-grid">
        {dates.slice(0, 7).map((value) => <div className="month-weekday" key={value}>{weekdays[weekday(value)]}</div>)}
        {dates.map((value) => {
          const inMonth = monthStart(value, calendar) === month;
          const entries = occurrencesOn(events, value, zone);
          return <div className={`month-cell ${inMonth ? "" : "outside"} ${value === date ? "selected" : ""}`} key={value}>
            <div className="month-cell-head"><button className={value === today ? "today-day" : ""} aria-label={fullDay(value, calendar)}
              onClick={() => { select(value); setDayDetail(value); }}>{fa(dateParts(value, calendar).day)}</button>
            <IconButton label={`افزودن رویداد، ${fullDay(value, calendar)}`} onClick={() => { select(value); create({ date: value }); }}><Plus size={14} /></IconButton></div>
            {entries.slice(0, 2).map((event) => <button key={occurrenceKey(event)} className="month-event"
              style={{ "--event": data.categories.find((entry) => entry.id === event.categoryId)?.color } as CSSProperties} onClick={() => open(event)}>
              {event.title}{event.status !== "planned" && ` · ${statusLabels[event.status]}`}</button>)}
            {entries.length > 2 && <button className="month-more" onClick={() => { select(value); setDayDetail(value); }}>{fa(entries.length - 2)} مورد دیگر</button>}
          </div>;
        })}
      </div></div>}
      {(view === "week" || view === "day") && <Timeline key={view} dates={dates} data={data} events={events} slots={slots} create={create} open={open} today={today} />}
      {view === "list" && <div className="agenda">
        {events.length ? dates.map((value) => {
          const entries = occurrencesOn(events, value, zone);
          return entries.length ? <section key={value}><h3>{fullDay(value, calendar)}</h3>{entries.map((event) => <EventRow key={occurrenceKey(event)} event={event} data={data} open={open} />)}</section> : null;
        }) : <Empty icon={<CalendarDays />} title="رویدادی در این بازه پیدا نشد" />}
      </div>}
    </section>
    {(view === "day" || view === "week") && <section className="panel padded free-section">
      <div className="panel-heading"><span className="tile mint"><Timer size={20} /></span><div><h2>بازه‌های آزاد</h2><p>{buffer ? `با ${duration(buffer)} حاشیه و زمان رفت‌وآمد` : "در ساعات فعال، با در نظر گرفتن رفت‌وآمد"}</p></div></div>
      <div className="suggest-controls">
        <Field label="پیشنهاد برای دسته"><Select value={suggestCategory} onValueChange={(choice) => setSuggestCategory(choice)}>
          <option value="">همهٔ بازه‌های آزاد</option>
          {data.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </Select></Field>
        {useSuggestions && <Field label="مدت برنامه (دقیقه)"><input inputMode="numeric" value={slotLength}
          onChange={(event) => setSlotLength(event.target.value)} /></Field>}
      </div>
      {useSuggestions && !validLength && <p className="error" role="alert">مدت را بین ۱ و ۱۴۴۰ دقیقه وارد کن.</p>}
      {useSuggestions && validLength && !suggestedSlots.length && <p className="muted">در این بازه زمان آزادی با مدت لازم پیدا نشد.</p>}
      {!useSuggestions && !slots.length && <p className="muted">بازه‌ای که با تنظیمات زمان آزاد سازگار باشد پیدا نشد.</p>}
      <div className="free-grid">{(useSuggestions ? suggestedSlots : slots).map((slot) => <Button key={slot.start} onClick={() => create({
        date: todayIn(slot.start, zone), slot, categoryId: useSuggestions ? suggestCategory : undefined,
      })}>
        <Plus size={16} /> <span>{formatDay(todayIn(slot.start, zone), calendar, { weekday: "short", day: "numeric" })} · {clockLabel(slot.start, zone)} تا {clockLabel(slot.end, zone)} · {duration((slot.end - slot.start) / minute)}
          {hasPreferred && "preferred" in slot && ` · ${slot.preferred ? "مطابق ترجیح" : "آزاد خارج از ترجیح"}`}</span>
      </Button>)}</div>
    </section>}
    {copy && <CopyDialog data={data} from={copy.from} revision={copy.revision} stale={copy.revision !== revision}
      save={saveCopy} close={() => setCopy(null)} saveError={saveError} />}
    {picker && <Dialog title="رفتن به تاریخ" close={() => setPicker(false)}>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        try { select(parseDateInput(String(new FormData(event.currentTarget).get("date")), calendar)); setPicker(false); }
        catch (issue) { setPickerError((issue as Error).message); }
      }}>
        <DateField label="تاریخ" name="date" date={date} calendar={calendar} weekStart={weekStart} required />
        {pickerError && <p className="error" role="alert">{pickerError}</p>}
        <footer className="dialog-actions"><Button type="submit" variant="primary">برو به تاریخ</Button></footer>
      </form>
    </Dialog>}
    {dayDetail && <Dialog title={fullDay(dayDetail, calendar)} close={() => setDayDetail(null)}>
      <div className="form">{occurrencesOn(events, dayDetail, zone).map((event) =>
        <EventRow key={occurrenceKey(event)} event={event} data={data} open={(item) => { setDayDetail(null); open(item); }} />)}
        {!occurrencesOn(events, dayDetail, zone).length && <Empty icon={<CalendarDays />} title="در این روز رویدادی دیده نمی‌شود." />}
        <footer className="dialog-actions"><Button onClick={() => { setDayDetail(null); setView("day"); }}>نمای روز</Button>
          <Button variant="primary" onClick={() => { const chosen = dayDetail; setDayDetail(null); create({ date: chosen }); }}><Plus size={17} /> افزودن رویداد</Button></footer>
      </div>
    </Dialog>}
  </>;
}
