import { z } from "zod";
import { addDays, atTime, epoch, instantISO, timingInterval, todayIn } from "@/features/calendar/dates";
import { overlaps } from "@/features/events/recurrence";
import type { Interval, PlannerEvent, Timing } from "@/types/planner";

export const googleScopes = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendars.readonly",
].join(" ");

export const googleClientKey = "planner:google-client";
export const googleClientIdPattern = /^[\w-]+\.apps\.googleusercontent\.com$/;

const eventDate = z.object({ date: z.string().optional(), dateTime: z.string().optional() });
const googleEvent = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  summary: z.string().optional(),
  transparency: z.string().optional(),
  hangoutLink: z.string().optional(),
  start: eventDate.optional(),
  end: eventDate.optional(),
  attendees: z.array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() })).optional(),
  conferenceData: z.object({
    entryPoints: z.array(z.object({ entryPointType: z.string(), uri: z.string() })).optional(),
  }).optional(),
});
const eventPage = z.object({
  kind: z.literal("calendar#events"),
  items: z.array(googleEvent).default([]),
  nextPageToken: z.string().optional(),
});
const calendar = z.object({ id: z.string().min(1), timeZone: z.string() });

export class GoogleSessionExpired extends Error {}

async function get(path: string, token: string, signal: AbortSignal) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal, credentials: "omit", redirect: "error", cache: "no-store",
  });
  if (response.status === 401) throw new GoogleSessionExpired();
  if (response.status === 403) throw new Error("گوگل دسترسی به تقویم را نداد. مجوز خواندن تقویم و فعال بودن Google Calendar API را بررسی کن.");
  if (!response.ok) throw new Error(`دریافت از Google Calendar ناموفق بود (${response.status}). دوباره امتحان کن.`);
  return response.json();
}

async function identifier(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function meetLink(item: z.infer<typeof googleEvent>) {
  const candidates = [item.hangoutLink, ...(
    item.conferenceData?.entryPoints?.filter((entry) => entry.entryPointType === "video").map((entry) => entry.uri) ?? []
  )];
  for (const candidate of candidates) {
    if (!candidate || candidate.length > 1500) continue;
    try {
      const url = new URL(candidate);
      if (url.origin === "https://meet.google.com" && !url.username && !url.password) return url.toString();
    } catch { continue; }
  }
  return "";
}

function meetingTiming(item: z.infer<typeof googleEvent>, zone: string): Timing {
  const { start, end } = item;
  if (start?.date && end?.date) return { allDay: true, start: start.date, end: end.date };
  if (start?.dateTime && end?.dateTime) return {
    allDay: false, zone, start: instantISO(epoch(start.dateTime)), end: instantISO(epoch(end.dateTime)),
  };
  throw new Error("تاریخ یکی از جلسه‌ها از گوگل کامل دریافت نشد. داده‌های فعلی حفظ شدند.");
}

export interface GoogleSnapshot {
  calendarId: string;
  window: Interval;
  zone: string;
  events: Omit<PlannerEvent, "categoryId">[];
}

export async function fetchGoogleMeetings(token: string, now: number, signal: AbortSignal): Promise<GoogleSnapshot> {
  const { id, timeZone } = calendar.parse(await get("?fields=id,timeZone", token, signal));
  const calendarId = await identifier(id);
  const today = todayIn(now, timeZone);
  const window = {
    start: atTime(addDays(today, -30), "00:00", timeZone),
    end: atTime(addDays(today, 91), "00:00", timeZone),
  };
  const query = new URLSearchParams({
    timeMin: instantISO(window.start), timeMax: instantISO(window.end),
    singleEvents: "true", showDeleted: "false", maxResults: "2500",
    fields: "kind,nextPageToken,items(id,status,summary,transparency,hangoutLink,start,end,attendees(self,responseStatus),conferenceData(entryPoints(entryPointType,uri)))",
  });
  const events: GoogleSnapshot["events"] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const list = eventPage.parse(await get(`/events?${query}`, token, signal));
    for (const item of list.items) {
      const link = meetLink(item);
      if (!link || item.status === "cancelled" || item.attendees?.some((entry) => entry.self && entry.responseStatus === "declined")) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      events.push({
        id: `google_${await identifier(`${id}\n${item.id}`)}`, googleCalendar: calendarId,
        title: item.summary?.trim().slice(0, 160) || "جلسهٔ Google Meet",
        timing: meetingTiming(item, timeZone),
        status: "planned", busy: item.transparency !== "transparent", kind: "general", lessonId: null,
        travelBefore: 0, travelAfter: 0, link, location: "", description: "", links: [], attachments: [],
        recurrence: null, exceptions: {},
      });
    }
    if (!list.nextPageToken) return { calendarId, window, events, zone: timeZone };
    query.set("pageToken", list.nextPageToken);
  }
  throw new Error("تعداد جلسه‌ها برای یک بار همگام‌سازی زیاد است. داده‌های فعلی حفظ شدند.");
}

export function reconcileGoogleMeetings(events: PlannerEvent[], snapshot: GoogleSnapshot, categoryId: string) {
  const { calendarId, window } = snapshot;
  const incoming = new Map(snapshot.events.map((event) => [event.id, event]));
  const next: PlannerEvent[] = [];
  for (const event of events) {
    if (event.googleCalendar !== calendarId) {
      next.push(event);
      continue;
    }
    const replacement = incoming.get(event.id);
    if (replacement) {
      incoming.delete(event.id);
      const before = event.timing;
      const after = replacement.timing;
      const sameTiming = before.start === after.start && before.end === after.end &&
        (before.allDay ? after.allDay : !after.allDay && before.zone === after.zone);
      const unchanged = sameTiming && event.title === replacement.title && event.link === replacement.link &&
        event.busy === replacement.busy && event.status === replacement.status && event.categoryId === categoryId;
      next.push(unchanged ? event : { ...replacement, categoryId });
    } else if (!overlaps(timingInterval(event.timing, snapshot.zone), window)) {
      next.push(event);
    }
  }
  for (const event of incoming.values()) next.push({ ...event, categoryId });
  return next;
}
