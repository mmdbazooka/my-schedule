"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BarChart3, Moon, Sun, Plus, BookOpen, CalendarDays, CalendarRange, CheckCircle2, ClipboardList, Clock3, Globe2, LayoutDashboard, LoaderCircle, Settings2, StickyNote, UserRound, X } from "lucide-react";
import { Capture } from "./capture";
import { TimeConverter } from "@/features/time-converter/time-converter";
import { Notes } from "@/features/notes/notes";
import { Review } from "@/features/review/review";
import { DeviceSync } from "@/features/sync/device-sync";
import { Button, Dialog, IconButton } from "@/components/ui";
import { CalendarView } from "@/features/calendar/calendar-view";
import { clockLabel, todayIn } from "@/features/calendar/dates";
import { Dashboard } from "@/features/dashboard/dashboard";
import { sampleData } from "@/features/dashboard/sample";
import { EventDetail } from "@/features/events/event-detail";
import { EventForm, type EventDraft } from "@/features/events/event-form";
import { occurrenceFields, seriesDate } from "@/features/events/recurrence";
import { Preferences } from "@/features/settings/preferences";
import { BackupPanel, Categories, SettingsForm } from "@/features/settings/settings";
import { Lessons } from "@/features/lessons/lessons";
import { Tasks } from "@/features/tasks/tasks";
import { validateData } from "@/features/backup/schema";
import { defaults } from "@/lib/defaults";
import { clearData, readData, readRaw, storageKey, writeData } from "@/lib/storage";
import type { Occurrence, PlannerData, PlannerEvent, Status, Task } from "@/types/planner";

const navigation = [
  { key: "dashboard", label: "داشبورد", icon: LayoutDashboard },
  { key: "calendar", label: "تقویم", icon: CalendarDays },
  { key: "lessons", label: "درس‌ها", icon: BookOpen },
  { key: "tasks", label: "کارهای بدون زمان", icon: ClipboardList },
  { key: "notes", label: "یادداشت‌ها", icon: StickyNote },
  { key: "review", label: "مرور هفتگی", icon: BarChart3 },
  { key: "time-converter", label: "تبدیل ساعت", icon: Globe2 },
  { key: "settings", label: "تنظیمات", icon: Settings2 },
] as const;
type Page = typeof navigation[number]["key"];
type Store = { data: PlannerData | null; raw: string | null; error: string; revision: number };

function getRoute(): Page {
  const current = window.location.hash.slice(1);
  return navigation.find(({ key }) => key === current)?.key ?? "dashboard";
}

export function Planner() {
  const [route, setRoute] = useState<Page>("dashboard");
  const [store, setStore] = useState<Store | null>(null);
  const latest = useRef<Store | null>(null);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<{ draft: EventDraft; revision: number } | null>(null);
  const [detail, setDetail] = useState<{ event: Occurrence; revision: number } | null>(null);
  const [capture, setCapture] = useState<number | null>(null);
  const [syncEpoch, setSyncEpoch] = useState(0);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const sync = useCallback((external = false) => {
    let raw: string | null = null;
    let next: Store;
    const revision = (latest.current?.revision ?? 0) + 1;
    try {
      raw = readRaw();
      if (external && latest.current?.raw === raw && latest.current.data) return;
      next = { data: readData(raw), raw, error: "", revision };
    } catch (issue) {
      next = { data: null, raw, error: (issue as Error).message, revision };
    }
    latest.current = next;
    setStore(next);
    if (external) setNotice({ text: "داده‌ها از تب دیگری به‌روز شدند." });
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => { setNow(Date.now()); sync(); setRoute(getRoute()); }, 0);
    const tick = window.setInterval(() => setNow(Date.now()), 1000 * 15);
    const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) sync(true); };
    const hash = () => { setRoute(getRoute()); setModal(null); setDetail(null); };
    window.addEventListener("storage", storage);
    window.addEventListener("hashchange", hash);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(tick);
      window.removeEventListener("storage", storage);
      window.removeEventListener("hashchange", hash);
    };
  }, [sync]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const data = store?.data;
  const usable = data && !!now;
  const displayName = data?.settings.displayName;
  const zone = data?.settings.zone ?? "Asia/Tehran";
  const today = now ? todayIn(now, zone) : "";
  const date = selected ?? today;

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.code !== "KeyN" ||
        !latest.current?.data || document.querySelector("dialog[open]") ||
        (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],[role="combobox"],[role="option"]'))) return;
      event.preventDefault();
      setNotice(null); setCapture(latest.current.revision);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  function navigate(next: Page) {
    if (next !== route) {
      setRoute(next);
      window.location.hash = next;
      window.scrollTo(0, 0);
    }
  }

  function commit(next: PlannerData | null, message: string, revision = store?.revision) {
    const current = latest.current;
    if (!current || current.revision !== revision) {
      setNotice({ text: "داده‌ها تغییر کرده‌اند. عملیات را دوباره انجام دهید.", error: true });
      return false;
    }
    try {
      if (readRaw() !== current.raw) {
        sync(true);
        throw new Error("داده‌ها در تب دیگری تغییر کرده‌اند. فرم را دوباره باز کنید.");
      }
      const checked = next ? validateData(next) : defaults();
      let raw: string | null = null;
      if (next) raw = writeData(checked);
      else { clearData(); setSyncEpoch((epoch) => epoch + 1); }
      const updated = { data: checked, raw, error: "", revision: current.revision + 1 };
      latest.current = updated;
      setStore(updated);
      setNotice({ text: message });
      return true;
    } catch (issue) {
      setNotice({ text: (issue as Error).message, error: true });
      return false;
    }
  }

  function create(draft: EventDraft) {
    if (!store || !data) return;
    setDetail(null);
    setNotice(null);
    setModal({ draft: { ...draft, categoryId: data.categories.find((entry) => entry.id === draft.categoryId)?.id }, revision: store.revision });
  }

  function open(event: Occurrence) {
    if (!store) return;
    setNotice(null);
    setDetail({ event, revision: store.revision });
  }

  function saveEvent(event: PlannerEvent, taskId?: string) {
    if (!data || !modal) return false;
    const exists = data.events.some((value) => value.id === event.id);
    const events = exists ? data.events.map((value) => value.id === event.id ? event : value) : [...data.events, event];
    const tasks = data.tasks.map((task) => {
      if (task.id !== taskId && task.eventId !== event.id) return task;
      if (event.status === "cancelled") return { ...task, eventId: null };
      return { ...task, eventId: event.id, done: event.status === "done", lessonId: event.lessonId,
        categoryId: task.categoryId === null && event.categoryId === data.categories[0].id ? null : event.categoryId };
    });
    if (!commit({ ...data, events, tasks }, "رویداد ذخیره شد.", modal.revision)) return false;
    setModal(null);
    return true;
  }

  function saveTask(task: Task, revision: number) {
    if (!data) return false;
    const tasks = data.tasks.some((item) => item.id === task.id)
      ? data.tasks.map((item) => item.id === task.id ? task : item)
      : [...data.tasks, task];
    const events = data.events.map((event) => event.id === task.eventId
      ? { ...event, lessonId: task.lessonId, categoryId: task.categoryId ?? event.categoryId,
        status: task.done ? "done" as const : "planned" as const }
      : event);
    return commit({ ...data, tasks, events }, "کار ذخیره شد.", revision);
  }

  const series = detail && data?.events.find((entry) => entry.id === detail.event.eventId);

  function act(action: "edit" | "delete" | Status, whole: boolean) {
    if (!data || !detail || !series || store?.revision !== detail.revision) return;
    const event = detail.event;
    if (action === "edit") {
      create({ date: event.date, series, occurrence: whole ? undefined : event.date,
        fields: whole ? occurrenceFields(series, seriesDate(series.timing)) : event });
      return;
    }
    let replacement: PlannerEvent = series;
    if (!whole) {
      replacement = { ...series, exceptions: { ...series.exceptions, [event.date]: action === "delete" ? null : { ...event, status: action } } };
    } else if (action !== "delete") {
      replacement = { ...series, status: action, exceptions: Object.fromEntries(Object.entries(series.exceptions)
        .map(([key, fields]) => [key, fields ? { ...fields, status: action } : null])) };
    }
    const events = whole && action === "delete" ? data.events.filter((entry) => entry.id !== series.id)
      : data.events.map((entry) => entry.id === series.id ? replacement : entry);
    const tasks = data.tasks.map((task) => {
      if (task.eventId !== series.id) return task;
      if (action === "delete" || action === "cancelled") return { ...task, eventId: null };
      return { ...task, done: action === "done" };
    });
    const message = action === "delete" ? "رویداد حذف شد." : action === "cancelled" ? "رویداد لغو شد." : "وضعیت رویداد ذخیره شد.";
    if (commit({ ...data, events, tasks }, message, detail.revision)) setDetail(null);
  }

  return <div className="app-shell" data-theme={data?.settings.theme ?? "system"}>
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>رفتن به محتوا</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("dashboard")}><span className="brand-icon"><CalendarRange size={24} strokeWidth={2.2} /></span><strong>برنامه ریز</strong></button>
      <nav aria-label="ناوبری اصلی">
        <p>فضای کار</p>
        {navigation.map(({ key, label, icon: Icon }) =>
          <button key={key} aria-current={route === key ? "page" : undefined} onClick={() => navigate(key)}>
            <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
          </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="zone-box"><span className="tile violet"><Clock3 size={17} /></span><div><strong>منطقهٔ زمانی</strong><small dir="ltr">{zone}</small></div></div>
        <div className="profile"><span className="avatar" aria-hidden="true">{displayName ? Array.from(displayName)[0] : <UserRound size={18} />}</span><div><strong>{displayName || "فضای شخصی"}</strong></div></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="crumb"><span className="mobile-brand brand-icon"><CalendarRange size={19} /></span><span>برنامه ریز</span><span className="crumb-divider">/</span><strong>{navigation.find((item) => item.key === route)?.label}</strong></div>
        {usable && <div className="header-tools"><Button variant="primary" title="ثبت سریع (N)" onClick={() => { setNotice(null); setCapture(store.revision); }}><Plus size={16} />ثبت سریع</Button>
          <IconButton label="تغییر تم روشن و تاریک" onClick={() => {
            const dark = data.settings.theme === "dark" || (data.settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
            commit({ ...data, settings: { ...data.settings, theme: dark ? "light" : "dark" } }, dark ? "تم روشن شد." : "تم تاریک شد.");
          }}><Sun className="light-switch" size={18} /><Moon className="dark-switch" size={18} /></IconButton>
          <div className="top-clock" aria-label="ساعت محلی"><Clock3 size={16} /><span>{clockLabel(now, zone)}</span></div></div>}
      </header>
      <main className="content" id="main-content" tabIndex={-1}>
        {!store && <div className="panel loading" role="status"><LoaderCircle size={24} /> در حال خواندن داده‌های مرورگر…</div>}
        {store && !usable && <>
          <div className="page-heading"><div><h1>داده‌های مرورگر خوانده نشد</h1><p>از همین‌جا می‌توانی دوباره تلاش کنی یا یک فایل پشتیبان بازیابی کنی.</p></div></div>
          <p className="error" role="alert">{store.error}</p>
          <Button className="retry" onClick={() => sync()}>تلاش دوباره</Button>
          <BackupPanel saveError={notice?.error ? notice.text : undefined} data={null} corruptRaw={store.raw} revision={store.revision}
            restore={(next, revision) => commit(next, "داده‌ها بازیابی شدند.", revision)} clear={(revision) => commit(null, "داده‌های برنامه حذف شدند.", revision)} />
        </>}
        {usable && <>
          {route === "dashboard" && <Dashboard data={data} now={now} day={date} select={setSelected} create={create} open={open} revision={store.revision}
            saveError={notice?.error ? notice.text : undefined} reschedule={(pending, revision) => commit(pending, "زمان‌بندی به‌روز شد.", revision)}
            calendarPage={() => navigate("calendar")} sample={() => commit(sampleData(data, today), "برنامهٔ ساختگی بارگذاری شد.")} />}
          {route === "notes" && <Notes notes={data.notes} settings={data.settings} revision={store.revision}
            saveError={notice?.error ? notice.text : undefined}
            save={(notes, message, revision) => commit({ ...data, notes }, message, revision)} />}
          {route === "time-converter" && <TimeConverter now={now} settings={data.settings} create={create} />}
          {route === "review" && <Review data={data} now={now} open={open} />}
          {route === "calendar" && <CalendarView data={data} date={date} select={setSelected} now={now} create={create} open={open}
            revision={store.revision} saveError={notice?.error ? notice.text : undefined}
            saveCopy={(events, revision) => commit({ ...data, events: [...data.events, ...events] }, "رویدادها در هفتهٔ بعد کپی شدند.", revision)} />}
          {route === "lessons" && <Lessons data={data} now={now} revision={store.revision} create={create} open={open}
            saveError={notice?.error ? notice.text : undefined} saveTask={saveTask} saveLesson={(lesson, revision) => commit({
              ...data, lessons: data.lessons.some((item) => item.id === lesson.id)
                ? data.lessons.map((item) => item.id === lesson.id ? lesson : item) : [...data.lessons, lesson],
            }, "درس ذخیره شد.", revision)} />}
          {route === "tasks" && <Tasks saveError={notice?.error ? notice.text : undefined} data={data} now={now} create={create} revision={store.revision} saveTask={saveTask}
            save={(tasks, message) => commit({ ...data, tasks }, message)}
            unschedule={(task) => commit({
              ...data,
              events: data.events.map((event) => event.id === task.eventId ? { ...event, status: "cancelled" } : event),
              tasks: data.tasks.map((item) => item.id === task.id ? { ...item, eventId: null } : item),
            }, "زمان‌بندی لغو شد و کار به فهرست انتظار برگشت.")} />}
          {route === "settings" && <div className="settings-page">
            <div className="page-heading"><div><h1>تنظیمات</h1><p>تقویم، ساعت‌های فعال و داده‌های برنامه را مدیریت کن.</p></div><Button onClick={() => document.getElementById("device-sync")?.focus()}>اتصال دستگاه‌ها</Button></div>
            <div className="settings-flow">
              <SettingsForm current={data.settings} revision={store.revision}
                save={(settings) => commit({ ...data, settings }, "تنظیمات ذخیره شدند.")} />
              <Preferences data={data} revision={store.revision} saveError={notice?.error ? notice.text : undefined}
                save={(preferences, revision) => commit({ ...data, preferences }, "ترجیحات زمانی ذخیره شدند.", revision)} />
              <Categories categories={data.categories} revision={store.revision} saveError={notice?.error ? notice.text : undefined} save={(categories) => commit({ ...data, categories }, "دسته‌بندی ذخیره شد.")} />
              <BackupPanel saveError={notice?.error ? notice.text : undefined} data={data} revision={store.revision}
                restore={(next, revision) => commit(next, "داده‌ها بازیابی شدند.", revision)} clear={(revision) => commit(null, "داده‌های برنامه حذف شدند.", revision)} />
            </div>
          </div>}
        </>}
        {usable && <DeviceSync key={syncEpoch} data={data} revision={store.revision} visible={route === "settings"}
          apply={(next, revision) => commit(next, "داده‌های دستگاه دریافت شدند.", revision)} />}
      </main>
    </div>
    {usable && capture !== null && <Capture today={today} close={() => setCapture(null)} create={create}
      stale={capture !== store.revision} save={(task) => saveTask(task, capture)} error={notice?.error ? notice.text : undefined} />}
    {usable && modal && <Dialog title={modal.draft.series ? "ویرایش رویداد" : "رویداد جدید"} close={() => setModal(null)}>
      <EventForm data={data} draft={modal.draft} stale={modal.revision !== store.revision} save={saveEvent} cancel={() => setModal(null)} />
      {notice?.error && <p className="error" role="alert">{notice.text}</p>}
    </Dialog>}
    {usable && detail && <Dialog title={detail.event.title} close={() => setDetail(null)}>
      <EventDetail event={detail.event} series={series || undefined} data={data} stale={detail.revision !== store.revision} act={act}
        copy={() => create({ date: detail.event.date, fields: { ...detail.event, title: `${detail.event.title.slice(0, 150)} (کپی)`, status: "planned" } })} />
      {notice?.error && <p className="error" role="alert">{notice.text}</p>}
    </Dialog>}
    {notice && <div className={`toast ${notice.error ? "toast-error" : ""}`} role={notice.error ? "alert" : "status"}>
      {notice.error ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}<span>{notice.text}</span>
      <IconButton label="بستن پیام" onClick={() => setNotice(null)}><X size={17} /></IconButton>
    </div>}
  </div>;
}
