"use client";

import Script from "next/script";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Button, Dialog, Field } from "@/components/ui";
import { fa } from "@/features/calendar/dates";
import type { PlannerData, PlannerEvent } from "@/types/planner";
import { fetchGoogleMeetings, googleClientIdPattern, googleClientKey, googleScopes, GoogleSessionExpired,
  reconcileGoogleMeetings, type GoogleSnapshot } from "./google-calendar";

type TokenResponse = { access_token?: string; expires_in?: number | string; scope?: string; error?: string };
type OAuth = {
  initTokenClient: (config: {
    client_id: string; scope: string; include_granted_scopes: boolean;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type: string }) => void;
  }) => { requestAccessToken: (options: { prompt: string }) => void };
};
function oauth() {
  return (window as Window & { google?: { accounts?: { oauth2?: OAuth } } }).google?.accounts?.oauth2;
}
type Session = { token: string; expiresAt: number };

export function GoogleCalendarPanel({ data, revision, visible, save }: {
  data: PlannerData;
  revision: number;
  visible: boolean;
  save: (events: PlannerEvent[], message: string, revision: number) => boolean;
}) {
  const [clientId, setClientId] = useState(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "");
  const [ready, setReady] = useState(false);
  const [edit, setEdit] = useState(false);
  const [confirmClear, setConfirmClear] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [request, setRequest] = useState(0);
  const [message, setMessage] = useState("");
  const [configError, setConfigError] = useState("");
  const attempt = useRef({ id: 0 });
  const activeRequest = useRef<AbortController | null>(null);
  const imported = data.events.filter((event) => event.googleCalendar).length;

  useEffect(() => {
    const authorization = attempt.current;
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(googleClientKey);
        if (saved && googleClientIdPattern.test(saved)) setClientId(saved);
      } catch { setMessage("تنظیم محلی اتصال در دسترس نیست."); }
    }, 0);
    return () => { clearTimeout(timer); authorization.id++; };
  }, []);

  const apply = useEffectEvent((snapshot: GoogleSnapshot) => {
    const category = data.categories.find((entry) => entry.id === "meeting") ?? data.categories[0];
    const events = reconcileGoogleMeetings(data.events, snapshot, category.id);
    if (events.length === data.events.length && events.every((event, index) => event === data.events[index])) return true;
    return save(events, "جلسه‌های Google Calendar به‌روز شدند.", revision);
  });

  useEffect(() => {
    if (!session) return;
    const currentSession = session;
    const controller = new AbortController();
    activeRequest.current = controller;
    let running = false;
    function expire() {
      controller.abort();
      setChecking(false);
      setSession(null);
      setMessage("مجوز جلسه پایان یافته است. برای ادامه دوباره به گوگل متصل شو.");
    }
    async function refresh() {
      if (running || controller.signal.aborted || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (Date.now() >= currentSession.expiresAt) { expire(); return; }
      running = true;
      setChecking(true);
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]);
        const snapshot = await fetchGoogleMeetings(currentSession.token, Date.now(), signal);
        if (signal.aborted) return;
        setMessage(apply(snapshot) ? `${fa(snapshot.events.length)} جلسهٔ Google Meet در بازهٔ همگام‌سازی بررسی شد.`
          : "جلسه‌ها ذخیره نشدند. دوباره همگام‌سازی کن.");
      } catch (issue) {
        if (controller.signal.aborted) return;
        if (issue instanceof GoogleSessionExpired) expire();
        else setMessage(issue instanceof Error && /[آ-ی]/.test(issue.message)
          ? issue.message : "دریافت جلسه‌ها کامل نشد. اتصال اینترنت یا تنظیمات Google Calendar را بررسی کن.");
      } finally {
        running = false;
        if (!controller.signal.aborted) setChecking(false);
      }
    }
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 5 * 60_000);
    const expiration = window.setTimeout(expire, Math.max(0, currentSession.expiresAt - Date.now()));
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      activeRequest.current = null;
      clearTimeout(initial); clearTimeout(expiration); clearInterval(interval);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session, request]);

  function connect() {
    const google = oauth();
    if (!google || !googleClientIdPattern.test(clientId)) return;
    const id = ++attempt.current.id;
    const fail = (message: string) => {
      if (attempt.current.id !== id) return;
      setAuthorizing(false);
      setMessage(message);
    };
    try {
      setAuthorizing(true);
      setMessage("");
      google.initTokenClient({
        client_id: clientId,
        scope: googleScopes,
        include_granted_scopes: false,
        error_callback: ({ type }) => fail(type === "popup_failed_to_open"
          ? "مرورگر پنجرهٔ ورود گوگل را باز نکرد. اجازهٔ باز شدن پنجره را بده و دوباره امتحان کن."
          : "ورود به گوگل کامل نشد."),
        callback: (token) => {
          if (attempt.current.id !== id) return;
          const expiresIn = Number(token.expires_in);
          if (token.error || !token.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0 ||
            !googleScopes.split(" ").every((scope) => token.scope?.split(" ").includes(scope))) {
            fail("مجوز خواندن Google Calendar کامل نیست. ورود و تنظیمات OAuth را بررسی کن.");
            return;
          }
          setAuthorizing(false);
          setSession({ token: token.access_token, expiresAt: Date.now() + expiresIn * 1000 });
        },
      }).requestAccessToken({ prompt: "select_account" });
    } catch { fail("راه‌اندازی ورود گوگل ممکن نشد. شناسهٔ OAuth و آدرس مجاز سایت را بررسی کن."); }
  }

  if (!visible) return null;
  const configured = googleClientIdPattern.test(clientId);
  return <section className="panel padded settings-card">
    {configured && <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(!!oauth())}
      onError={() => setMessage("ورود گوگل بارگیری نشد. اتصال را بررسی و صفحه را دوباره باز کن.")} />}
    <div className="panel-heading"><span className="tile blue"><CalendarDays size={20} /></span><div><h2>Google Calendar</h2>
      <p>جلسه‌های دارای Google Meet از تقویم اصلی، از ۳۰ روز قبل تا ۹۰ روز بعد، خوانده می‌شوند.</p></div></div>
    <p>عنوان، زمان و لینک جلسه در مرورگر ذخیره و همراه بکاپ و همگام‌سازی دستگاه‌ها منتقل می‌شود. مجوز ورود تا زمان باز بودن این صفحهٔ مرورگر در حافظه می‌ماند.</p>
    <div className="action-row">
      {session ? <>
        <Button disabled={checking} onClick={() => setRequest((value) => value + 1)}><RefreshCw size={16} /> {checking ? "در حال دریافت…" : "همگام‌سازی اکنون"}</Button>
        <Button onClick={() => { activeRequest.current?.abort(); setSession(null); setChecking(false); setMessage("اتصال قطع شد. جلسه‌های واردشده در تقویم باقی می‌مانند."); }}>قطع اتصال گوگل</Button>
      </> : configured && <Button variant="primary" disabled={!ready || authorizing} onClick={connect}>
        {authorizing ? "در انتظار ورود گوگل…" : "اتصال به Google Calendar"}
      </Button>}
      {!session && <Button disabled={authorizing} onClick={() => { setConfigError(""); setEdit(true); }}>{configured ? "تنظیم شناسهٔ گوگل" : "راه‌اندازی اتصال گوگل"}</Button>}
      {imported > 0 && !session && !authorizing && <Button variant="danger" onClick={() => setConfirmClear(revision)}>حذف جلسه‌های واردشده</Button>}
    </div>
    {message && <p role="status">{message}</p>}
    {edit && <Dialog title="راه‌اندازی Google Calendar" close={() => setEdit(false)}>
      <form className="form" onSubmit={(event) => {
        event.preventDefault();
        const id = String(new FormData(event.currentTarget).get("clientId")).trim();
        if (!googleClientIdPattern.test(id)) { setConfigError("شناسهٔ OAuth باید به apps.googleusercontent.com ختم شود."); return; }
        try { localStorage.setItem(googleClientKey, id); }
        catch { setConfigError("شناسه در مرورگر ذخیره نشد."); return; }
        setClientId(id); setMessage(""); setEdit(false);
      }}>
        <p>در Google Cloud یک OAuth Client از نوع Web application بساز و آدرس همین سایت را در Authorized JavaScript origins اضافه کن.</p>
        <Field label="شناسهٔ OAuth Client"><input name="clientId" dir="ltr" defaultValue={clientId} maxLength={250} autoComplete="off" required /></Field>
        <p><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">باز کردن تنظیمات Google Cloud</a></p>
        {configError && <p role="alert" className="error">{configError}</p>}
        <Button variant="primary" type="submit">ذخیرهٔ شناسه</Button>
      </form>
    </Dialog>}
    {confirmClear !== null && <Dialog title="حذف جلسه‌های واردشده" close={() => setConfirmClear(null)}>
      <p>{fa(imported)} جلسهٔ واردشده از این برنامه حذف می‌شود. رویدادها در Google Calendar باقی می‌مانند.</p>
      <footer className="dialog-actions"><Button onClick={() => setConfirmClear(null)}>انصراف</Button>
        <Button variant="danger" onClick={() => {
          if (save(data.events.filter((event) => !event.googleCalendar), "جلسه‌های واردشده حذف شدند.", confirmClear)) setConfirmClear(null);
        }}>تأیید حذف</Button></footer>
    </Dialog>}
  </section>;
}
