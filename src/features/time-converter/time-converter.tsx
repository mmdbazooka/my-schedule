"use client";

import { useState } from "react";
import { CalendarPlus, Clock3, RotateCcw } from "lucide-react";
import { Select } from "@/components/select";
import { Button, DateField, Field } from "@/components/ui";
import { atTime, clockLabel, fullDay, inZone, isoDay, localTime, minute, pad, parseDateInput, todayIn } from "@/features/calendar/dates";
import type { EventDraft } from "@/features/events/event-form";
import type { Settings } from "@/types/planner";
import { destinations, iranZone } from "./zones";

const presets = ["09:00", "12:00", "17:00", "21:00"];

function clockParts(time: string) {
  const [hour, minutes] = time.split(":").map(Number);
  return { hour: hour % 12 || 12, minutes, period: hour >= 12 ? "PM" : "AM" };
}

function foreignClock(time: string) {
  const { hour, minutes, period } = clockParts(time);
  return `${hour}:${pad(minutes)} ${period}`;
}

export function TimeConverter({ now, settings, create }: {
  now: number;
  settings: Settings;
  create: (draft: EventDraft) => void;
}) {
  const [source, setSource] = useState(iranZone);
  const [selected, setSelected] = useState<number | null>(null);
  const [dateReset, setDateReset] = useState(0);
  const [inputTime, setInputTime] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const instant = selected ?? Math.floor(now / minute) * minute;
  const iranDate = todayIn(instant, iranZone);
  const { calendar, weekStart } = settings;
  const sourceCalendar = source === iranZone ? calendar : "gregory";
  const parts = clockParts(inputTime ?? localTime(now, source));

  function setPart(patch: Partial<ReturnType<typeof clockParts>>) {
    const { hour, minutes, period } = { ...parts, ...patch };
    setInputTime(`${pad(hour % 12 + (period === "PM" ? 12 : 0))}:${pad(minutes)}`);
    updateDraft();
  }

  function updateDraft() {
    setDirty(true);
    setError("");
  }

  function convert(form: HTMLFormElement | null, preset?: string) {
    if (!form) return;
    try {
      const fields = new FormData(form);
      const date = parseDateInput(String(fields.get("sourceDate")), sourceCalendar);
      const time = preset ?? inputTime ?? localTime(now, source);
      let result: number;
      try { result = atTime(date, time, source, "reject"); }
      catch { throw new Error("این ساعت در تاریخ و منطقهٔ مبدأ معتبر یا یکتا نیست. ساعت دیگری را انتخاب کن."); }
      setSelected(result);
      setInputTime(time);
      setDirty(false);
      setError("");
    } catch (issue) {
      setError((issue as Error).message);
      setDirty(true);
    }
  }

  return <>
    <div className="page-heading"><div><h1>تبدیل ساعت</h1>
      <p>منطقه، تاریخ و ساعت مبدأ را انتخاب کن و همان لحظه را به وقت تهران و شهرهای دیگر ببین.</p></div></div>
    <div className="converter-top">
      <form className="panel padded converter-form" onChange={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.name === "sourceDate") updateDraft();
      }} onSubmit={(event) => {
        event.preventDefault();
        convert(event.currentTarget);
      }}>
        <div className="panel-heading"><span className="tile violet"><Clock3 size={20} /></span><h2>زمان مبدأ</h2></div>
        <div className="form-grid">
          <Field label="منطقهٔ مبدأ"><Select value={source} onValueChange={(zone) => {
            setSource(zone);
            updateDraft();
          }}>
            <option value={iranZone}>ایران · تهران</option>
            {destinations.map(({ zone, label }) => <option key={zone} value={zone}>{label}</option>)}
          </Select></Field>
          <DateField key={`${source}-${dateReset}`} name="sourceDate" label="تاریخ مبدأ" date={todayIn(now, source)}
            calendar={sourceCalendar} weekStart={weekStart} onPick={updateDraft} required />
        </div>
        <div className="converter-time-parts" role="group" aria-label="ساعت مبدأ">
          <Field label="ساعت"><Select value={parts.hour} onValueChange={(value) => setPart({ hour: Number(value) })}>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          </Select></Field>
          <Field label="دقیقه"><Select value={parts.minutes} onValueChange={(value) => setPart({ minutes: Number(value) })}>
            {Array.from({ length: 60 }, (_, index) => <option key={index} value={index}>{pad(index)}</option>)}
          </Select></Field>
          <Field label="AM / PM"><Select value={parts.period} onValueChange={(value) => setPart({ period: value })}>
            <option value="AM">AM</option><option value="PM">PM</option>
          </Select></Field>
        </div>
        <div className="converter-presets" role="group" aria-label="ساعت‌های پرکاربرد">
          {presets.map((time) => <Button key={time} onClick={(event) => convert(event.currentTarget.form, time)}>
            <bdi dir="ltr">{foreignClock(time)}</bdi>
          </Button>)}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="action-row">
          <Button variant="primary" type="submit">تبدیل ساعت</Button>
          <Button onClick={() => {
            setSelected(null);
            setInputTime(null);
            setDirty(false);
            setError("");
            setDateReset((value) => value + 1);
          }}><RotateCcw size={15} /> زمان فعلی</Button>
        </div>
      </form>
      <section className="panel padded converter-result" aria-label="زمان تبدیل‌شدهٔ تهران">
        <div><p>{selected === null ? "اکنون در تهران" : "زمان انتخاب‌شده در تهران"}</p>
          <strong className="converter-clock"><bdi>{clockLabel(instant, iranZone)}</bdi></strong>
          <p>{fullDay(iranDate, calendar)}</p>
        </div>
        <div>
          <Button disabled={dirty} onClick={() => create({
            date: iranDate, zone: iranZone, categoryId: "meeting",
            slot: { start: instant, end: instant + 60 * minute },
          })}><CalendarPlus size={17} /> ثبت جلسه در تقویم</Button>
          {dirty && <p className="converter-pending">برای ثبت زمان جدید، ابتدا «تبدیل ساعت» را بزن.</p>}
        </div>
      </section>
    </div>
    <section className="converter-destinations" aria-label="ساعت مقصدها">
      {destinations.map(({ label, zone, ...metadata }) => {
        const local = inZone(instant, zone);
        const date = isoDay(local.toPlainDate());
        const shift = date === iranDate ? "همان روز" : date < iranDate ? "روز قبل" : "روز بعد";
        return <article key={zone} className="panel padded converter-zone" aria-label={label}>
          <div><h2>{label}</h2>{"detail" in metadata && <p>{metadata.detail}</p>}</div>
          <div className="converter-zone-time">
            <strong><bdi dir="ltr">{foreignClock(local.toPlainTime().toString({ smallestUnit: "minute" }))}</bdi></strong>
            <small><bdi>UTC{local.offset}</bdi></small>
          </div>
          <footer><span>{fullDay(date, calendar)}</span><span className="converter-shift" data-shift={date !== iranDate}>{shift}</span></footer>
        </article>;
      })}
    </section>
  </>;
}
