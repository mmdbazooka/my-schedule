"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Select } from "@/components/select";
import { Button, Field } from "@/components/ui";
import { addDays, todayIn } from "@/features/calendar/dates";
import { expandEvents } from "@/features/events/recurrence";
import type { PlannerEvent } from "@/types/planner";
import { deliverReminders, readReminderSettings, registerReminderWorker, remindersKey } from "./device";
import { reminderDefaults, remindersDue, type LeadTime, type ReminderSettings, type SummaryFrequency } from "./schedule";

function devicePermission() {
  return window.isSecureContext && "Notification" in window && "serviceWorker" in navigator
    ? Notification.permission : "unavailable";
}

export function RemindersPanel({ events, zone, now, visible }: {
  events: PlannerEvent[];
  zone: string;
  now: number;
  visible: boolean;
}) {
  const [settings, setSettings] = useState(reminderDefaults);
  const [permission, setPermission] = useState<NotificationPermission | "unavailable" | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const date = todayIn(now, zone);
  const occurrences = useMemo(() => settings.enabled ? expandEvents(events, date, addDays(date, 2), zone) : [],
    [date, events, settings.enabled, zone]);

  useEffect(() => {
    const loadSettings = () => setSettings(readReminderSettings());
    const updatePermission = () => setPermission(devicePermission());
    const timer = window.setTimeout(() => { loadSettings(); updatePermission(); }, 0);
    const storage = (event: StorageEvent) => { if (event.key === remindersKey || event.key === null) loadSettings(); };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", updatePermission);
    document.addEventListener("visibilitychange", updatePermission);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", updatePermission);
      document.removeEventListener("visibilitychange", updatePermission);
    };
  }, []);

  const check = useEffectEvent(async (worker: ServiceWorkerRegistration, active: () => boolean) => {
    const current = Date.now();
    const liveSettings = readReminderSettings();
    if (!liveSettings.enabled || devicePermission() !== "granted") return;
    await deliverReminders(worker, remindersDue(occurrences, current, zone, liveSettings), current,
      () => active() && readReminderSettings().enabled && devicePermission() === "granted");
  });

  useEffect(() => {
    if (!settings.enabled || permission !== "granted") return;
    let active = true;
    let working = false;
    let worker: ServiceWorkerRegistration | undefined;

    const poll = async () => {
      if (working || !active) return;
      working = true;
      try {
        worker ??= await registerReminderWorker();
        if (active) await check(worker, () => active);
      } catch {
        if (active) setMessage("ارسال اعلان انجام نشد. مجوز اعلان این سایت و تنظیمات مرورگر را بررسی کن.");
      } finally { working = false; }
    };
    const first = window.setTimeout(poll, 0);
    const interval = window.setInterval(poll, 15_000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("pageshow", poll);
    window.addEventListener("focus", poll);
    return () => {
      active = false;
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("pageshow", poll);
      window.removeEventListener("focus", poll);
    };
  }, [settings.enabled, permission]);

  function save(next: ReminderSettings) {
    try {
      localStorage.setItem(remindersKey, JSON.stringify(next));
      setSettings(next);
      return true;
    } catch {
      setMessage("تنظیم یادآوری در مرورگر ذخیره نشد.");
      return false;
    }
  }

  async function enable() {
    setWorking(true);
    setMessage("");
    try {
      const current = await Notification.requestPermission();
      setPermission(current);
      if (current !== "granted") {
        setMessage("مجوز اعلان داده نشد. از تنظیمات مرورگر می‌توانی آن را تغییر بدهی.");
        return;
      }
      await registerReminderWorker();
      if (save({ ...readReminderSettings(), enabled: true })) setMessage("یادآوری این دستگاه فعال شد.");
    } catch { setMessage("فعال‌سازی اعلان ممکن نشد. مجوز مرورگر و اتصال را بررسی کن."); }
    finally { setWorking(false); }
  }

  if (!visible) return null;
  return <section className="panel padded settings-card">
    <div className="panel-heading"><span className="tile violet"><Bell size={20} /></span><div><h2>یادآوری‌ها</h2>
      <p>برای برنامه‌های زمان‌دار، به‌جز درس، کلاس، مطالعه و امتحان.</p></div></div>
    <div className="form-grid">
      <Field label="زمان یادآوری"><Select value={settings.lead} onValueChange={(lead) => save({ ...settings, lead: Number(lead) as LeadTime })}>
        <option value={10}>۱۰ دقیقه پیش از شروع</option><option value={15}>۱۵ دقیقه پیش از شروع</option>
      </Select></Field>
      <Field label="خلاصهٔ روزانه"><Select value={settings.summaries} onValueChange={(count) => save({ ...settings, summaries: Number(count) as SummaryFrequency })}>
        <option value={0}>خاموش</option><option value={1}>یک بار · ۰۹:۰۰</option><option value={2}>دو بار · ۰۹:۰۰ و ۱۸:۰۰</option>
      </Select></Field>
    </div>
    {settings.summaries > 0 && <p>خلاصه فقط وقتی ارسال می‌شود که هنوز برنامه‌ای برای همان روز باقی مانده باشد. ساعت‌ها بر اساس منطقهٔ زمانی تقویم‌اند.</p>}
    <p>اعلان وب برای همین دستگاه است و وقتی صفحه باز و مرورگر فعال باشد کار می‌کند. اگر صفحه بسته یا معلق شود، برای هشدار از فایل یادآوری در جزئیات رویداد و تقویم دستگاه استفاده کن.</p>
    {permission === "unavailable" && <p className="info">اعلان وب در این مرورگر در دسترس نیست. در آیفون، سایت را به صفحهٔ اصلی اضافه کن و از همان آیکن بازش کن.</p>}
    {permission === "denied" && <p className="warning">اعلان این سایت مسدود است. مجوز را از تنظیمات مرورگر تغییر بده.</p>}
    <div className="action-row">
      {settings.enabled && <Button onClick={() => {
        if (save({ ...readReminderSettings(), enabled: false })) setMessage("یادآوری این دستگاه خاموش شد.");
      }}>خاموش‌کردن یادآوری</Button>}
      {(!settings.enabled || permission !== "granted") && <Button variant="primary"
        disabled={working || permission === null || permission === "unavailable" || permission === "denied"} onClick={() => void enable()}>
        <Bell size={16} /> فعال‌کردن یادآوری این دستگاه
      </Button>}
      {settings.enabled && permission === "granted" && <Button disabled={working} onClick={async () => {
        setWorking(true);
        try {
          const worker = await registerReminderWorker();
          await worker.showNotification("آزمایش یادآوری برنامه ریز", {
            body: "اعلان‌های این دستگاه آماده‌اند.", tag: "planner:test", icon: "/planner-192.png", lang: "fa", dir: "rtl",
          });
          setMessage("اعلان آزمایشی ارسال شد.");
        } catch { setMessage("اعلان آزمایشی ارسال نشد."); }
        finally { setWorking(false); }
      }}><BellRing size={16} /> ارسال اعلان آزمایشی</Button>}
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
