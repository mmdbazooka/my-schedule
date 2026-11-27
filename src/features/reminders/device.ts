import { reminderDefaults, type Reminder, type ReminderSettings } from "./schedule";

export const remindersKey = "planner:reminders";
export const deliveredRemindersKey = "planner:delivered-reminders";

export function readReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(remindersKey);
    if (!raw) return reminderDefaults;
    const saved = JSON.parse(raw);
    return {
      enabled: saved?.enabled === true,
      lead: saved?.lead === 10 ? 10 : 15,
      summaries: saved?.summaries === 2 ? 2 : saved?.summaries === 1 ? 1 : 0,
    };
  } catch { return reminderDefaults; }
}

export async function registerReminderWorker() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active && new URL(existing.active.scriptURL).pathname === "/reminders-worker.js") return existing;
  await navigator.serviceWorker.register("/reminders-worker.js");
  let timeout: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error("سرویس یادآوری آماده نشد.")), 6000);
      }),
    ]);
  } finally { window.clearTimeout(timeout); }
}

export async function deliverReminders(registration: ServiceWorkerRegistration, due: Reminder[], now: number,
  enabled: () => boolean) {
  if (!due.length) return;
  async function send() {
    const raw = localStorage.getItem(deliveredRemindersKey);
    let prior: [string, number][] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) prior = parsed.filter((value): value is [string, number] =>
        Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "number" &&
        value[1] > now - 3 * 24 * 60 * 60_000);
    } catch { /* A damaged log must not prevent delivery. */ }
    const sent = new Map(prior);
    for (const { title, body, tag } of due) {
      if (!enabled()) break;
      if (sent.has(tag)) continue;
      await registration.showNotification(title, { body, tag, icon: "/planner-192.png", lang: "fa", dir: "rtl" });
      sent.set(tag, now);
      if (enabled()) localStorage.setItem(deliveredRemindersKey, JSON.stringify([...sent]));
    }
  }
  if (navigator.locks) await navigator.locks.request(remindersKey, send);
  else await send();
}
