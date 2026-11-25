"use client";

import { useState } from "react";
import { CalendarPlus, Clock3, RotateCcw } from "lucide-react";
import { TimePicker } from "@/components/time-picker";
import { Button, DateField } from "@/components/ui";
import { atTime, clockLabel, fullDay, inZone, isoDay, localizedTime, minute, normalizeTime, parseDateInput, todayIn } from "@/features/calendar/dates";
import type { EventDraft } from "@/features/events/event-form";
import type { Settings } from "@/types/planner";
import { destinations, iranZone } from "./zones";

const presets = ["09:00", "12:00", "17:00", "21:00"];

export function TimeConverter({ now, settings, create }: {
  now: number;
  settings: Settings;
  create: (draft: EventDraft) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [dateReset, setDateReset] = useState(0);
  const [inputTime, setInputTime] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const instant = selected ?? Math.floor(now / minute) * minute;
  const iranDate = todayIn(instant, iranZone);
  const { calendar, weekStart } = settings;

  function updateDraft() {
    setDirty(true);
    setError("");
  }

  function convert(form: HTMLFormElement | null, preset?: string) {
    if (!form) return;
    try {
      const fields = new FormData(form);
      const date = parseDateInput(String(fields.get("iranDate")), calendar);
      const time = normalizeTime(preset ?? String(fields.get("iranTime")));
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("ساعت را به شکل ۲۴ ساعته، مثلاً ۰۹:۳۰، وارد کن.");
      let result: number;
      try { result = atTime(date, time, iranZone, "reject"); }
      catch { throw new Error("این ساعت در تاریخ انتخابی تهران معتبر یا یکتا نیست. ساعت دیگری را انتخاب کن."); }
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
      <p>تاریخ و ساعت ایران را انتخاب کن تا زمان همان لحظه را در شهرها و مناطق دیگر ببینی.</p></div></div>
    <div className="converter-top">
      <form className="panel padded converter-form" onChange={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.name === "iranDate") updateDraft();
      }} onSubmit={(event) => {
        event.preventDefault();
        convert(event.currentTarget);
      }}>
        <div className="panel-heading"><span className="tile violet"><Clock3 size={20} /></span><div><h2>زمان ایران</h2><p>تهران</p></div></div>
        <div className="form-grid">
          <DateField key={dateReset} name="iranDate" label="تاریخ ایران" date={todayIn(now, iranZone)}
            calendar={calendar} weekStart={weekStart} onPick={updateDraft} required />
          <TimePicker name="iranTime" label="ساعت ایران" time={inputTime ?? clockLabel(now, iranZone)}
            onChange={(value) => { setInputTime(value); updateDraft(); }} />
        </div>
        <div className="converter-presets" role="group" aria-label="ساعت‌های پرکاربرد">
          {presets.map((time) => <Button key={time} onClick={(event) => convert(event.currentTarget.form, time)}>
            <bdi>{localizedTime(time)}</bdi>
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
            <strong><bdi>{localizedTime(local.toPlainTime().toString({ smallestUnit: "minute" }))}</bdi></strong>
            <small><bdi>UTC{local.offset}</bdi></small>
          </div>
          <footer><span>{fullDay(date, calendar)}</span><span className="converter-shift" data-shift={date !== iranDate}>{shift}</span></footer>
        </article>;
      })}
    </section>
  </>;
}
