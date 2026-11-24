"use client";

import { Activity, ArrowLeft, BookOpen, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3, GraduationCap, Plus, Sparkles, UserRound, Video, Zap } from "lucide-react";
import { Button, Empty, IconButton } from "@/components/ui";
import { dailyAvailability, availableSlots } from "@/features/availability/availability";
import { addDays, clockLabel, dateParts, duration, eventTime, fa, formatDay, fullDay, minute, timingInterval, todayIn, weekday, weekdays, weekBeginning } from "@/features/calendar/dates";
import { EventRow, occurrenceKey } from "@/features/calendar/calendar-view";
import { visibleDates } from "@/features/calendar/layout";
import type { EventDraft } from "@/features/events/event-form";
import { WeeklyPanel } from "@/features/goals/weekly-panel";
import { OverduePanel } from "@/features/tasks/overdue-panel";
import { expandEvents, nextOccurrence } from "@/features/events/recurrence";
import type { Occurrence, PlannerData } from "@/types/planner";

export function Dashboard({ data, now, create, open, day, select, calendarPage, sample, revision, reschedule, saveError }: {
  data: PlannerData; now: number; create: (draft: EventDraft) => void; open: (event: Occurrence) => void;
  revision: number; reschedule: (data: PlannerData, revision: number) => boolean; saveError?: string;
  day: string; select: (date: string) => void; calendarPage: () => void; sample: () => void;
}) {
  const { calendar, zone, weekStart, buffer } = data.settings;
  const today = todayIn(now, zone);
  const week = weekBeginning(day, weekStart);
  const entries = expandEvents(data.events, today, addDays(today, 1), zone);
  const chosen = day === today ? entries : expandEvents(data.events, day, addDays(day, 1), zone);
  const { busyMinutes, freeMinutes } = dailyAvailability(today, data.settings, entries);
  const free = availableSlots(data, today, addDays(today, 1), now)[0];
  const eligible = entries.filter((event) => event.status === "planned" && !event.timing.allDay);
  const active = eligible.find((event) => {
    const range = timingInterval(event.timing, zone);
    return range.start <= now && range.end > now;
  }) ?? entries.find((event) => event.timing.allDay && event.busy && event.status === "planned");
  const upcoming = nextOccurrence(data.events, now, zone);
  const next = active ?? upcoming;
  const nextTime = next ? timingInterval(next.timing, zone).start : undefined;
  const nextDay = nextTime === undefined ? today : todayIn(nextTime, zone);
  const upcomingTime = upcoming ? timingInterval(upcoming.timing, zone).start : undefined;
  const remaining = upcomingTime ? Math.ceil((upcomingTime - now) / minute) : 0;
  const daysAway = Math.floor(remaining / 1440);
  const countdown = daysAway ? `${fa(daysAway)} روز${remaining % 1440 ? ` و ${duration(remaining % 1440)}` : ""}` : duration(remaining);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  const salutation = hour < 5 ? "شب‌بخیر" : hour < 12 ? "صبح بخیر" : hour < 17 ? "ظهر بخیر" : "عصر بخیر";
  const quick = [
    { id: "meeting", title: "جلسه", icon: Video, style: "blue" },
    { id: "university", title: "کلاس", icon: GraduationCap, style: "violet" },
    { id: "study", title: "مطالعه", icon: BookOpen, style: "amber" },
    { id: "personal", title: "شخصی", icon: UserRound, style: "mint" },
  ];
  return <>
    <div className="page-heading dash-heading">
      <div><span className="date-kicker"><CalendarDays size={16} /> {fullDay(today, calendar)}</span>
        <h1>{salutation}، محمد <span className="greeting-mark">✦</span></h1>
        <p>برنامه‌ها و وقت‌های آزاد امروزت رو یک‌جا ببین.</p>
      </div>
      <Button variant="primary" onClick={() => create({ date: today })}><Plus size={20} /> رویداد جدید</Button>
    </div>
    <section className="hero">
      <div className="hero-art" />
      <div className="hero-content">
        <span className="hero-tag"><span /> {active ? "در حال اجرا" : "برنامهٔ بعدی"}</span>
        <h2>{next?.title ?? "برنامهٔ بعدی پیدا نشد"}</h2>
        <p>{next ? `${nextDay !== today && !active ? `${formatDay(nextDay, calendar, { day: "numeric", month: "long" })} · ` : ""}${eventTime(next.timing, zone)}${upcomingTime ? ` · ${countdown} تا برنامهٔ بعدی` : ""}`
          : free ? "برای امروز هنوز زمان آزاد داری." : "برنامه‌های امروز را در خط زمانی ببین."}</p>
        <Button className="hero-button" onClick={() => next ? open(next) : create({ date: today })}>
          {next ? "جزئیات رویداد" : "افزودن برنامه"}<ArrowLeft size={17} />
        </Button>
      </div>
    </section>
    <section className="metrics" aria-label="خلاصهٔ امروز">
      <article className="panel metric"><span className="tile violet"><CalendarDays size={22} /></span><div><p>رویدادهای امروز</p><strong>{fa(entries.filter((event) => event.status !== "cancelled").length)} <small>رویداد</small></strong></div></article>
      <article className="panel metric"><span className="tile blue"><Clock3 size={22} /></span><div><p>زمان برنامه‌ریزی‌شده</p><strong>{duration(busyMinutes)}</strong></div></article>
      <article className="panel metric"><span className="tile mint"><Zap size={22} /></span><div><p>زمان آزاد امروز</p><strong>{duration(freeMinutes)}</strong></div></article>
    </section>
    <div className="dashboard-columns">
      <section className="panel padded schedule-panel">
        <div className="panel-top"><div className="panel-heading"><span className="tile violet"><CalendarDays size={21} /></span><div><h2>{day === today ? "برنامه‌های امروز" : "برنامه‌های روز"}</h2><p>{formatDay(day, calendar, { weekday: "long", day: "numeric", month: "long" })}</p></div></div>
          <Button variant="ghost" onClick={calendarPage}>تقویم <ArrowLeft size={16} /></Button></div>
        <div className="week-strip">
          <IconButton label="هفتهٔ قبلی" onClick={() => select(addDays(day, -7))}><ChevronRight size={17} /></IconButton>
          {visibleDates(week, 7).map((date) =>
            <button key={date} onClick={() => select(date)} aria-pressed={date === day} aria-label={fullDay(date, calendar)}>
              <span>{weekdays[weekday(date)]}</span><strong>{fa(dateParts(date, calendar).day)}</strong>
            </button>)}
          <IconButton label="هفتهٔ بعدی" onClick={() => select(addDays(day, 7))}><ChevronLeft size={17} /></IconButton>
        </div>
        <div className="schedule-entries">{chosen.length ? chosen.map((event) => <EventRow key={occurrenceKey(event)} event={event} data={data} open={open} />)
          : <Empty icon={<CalendarPlus size={28} />} title="این روز هنوز برنامه‌ای ندارد">
            <p>یک قرار، کلاس یا زمانی برای خودت ثبت کن.</p>
            <Button variant="ghost" onClick={() => create({ date: day })}><Plus size={16} /> افزودن رویداد</Button>
          </Empty>}</div>
      </section>
      <div className="dashboard-stack">
        <section className="panel padded">
          <div className="panel-heading"><span className="tile amber"><Zap size={20} /></span><div><h2>افزودن سریع</h2><p>با یک دسته‌بندی شروع کن.</p></div></div>
          <div className="quick-grid">{quick.map(({ id, title, icon: Icon, style }) =>
            <button key={id} onClick={() => create({ date: today, categoryId: id })}><span className={`tile ${style}`}><Icon size={18} /></span>{title}</button>)}</div>
        </section>
        <section className="panel padded free-card">
          <div className="panel-heading"><span className="tile mint"><Activity size={20} /></span><div><h2>اولین بازهٔ آزاد</h2><p>{buffer ? `با ${duration(buffer)} حاشیهٔ استراحت و زمان رفت‌وآمد` : "با در نظر گرفتن زمان رفت‌وآمد"}</p></div></div>
          {free ? <button className="free-link" onClick={() => create({ date: today, slot: free })}><span><strong>{clockLabel(free.start, zone)} تا {clockLabel(free.end, zone)}</strong><small>{duration((free.end - free.start) / minute)} زمان آزاد</small></span><Plus size={19} /></button>
            : <p className="muted">از این لحظه بازهٔ آزادی مطابق تنظیمات نمانده است.</p>}
        </section>
      </div>
    </div>
    <OverduePanel data={data} now={now} revision={revision} save={reschedule} saveError={saveError} />
    <WeeklyPanel data={data} now={now} />
    {data.events.length === 0 && data.tasks.length === 0 && <div className="sample-line"><Sparkles size={17} /><span>می‌خواهی اول با یک برنامهٔ ساختگی کار کنی؟</span><Button variant="ghost" onClick={sample}>بارگذاری دادهٔ نمونه</Button></div>}
  </>;
}
