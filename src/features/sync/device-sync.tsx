"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, RefreshCw } from "lucide-react";
import { Button, Dialog, Field } from "@/components/ui";
import { fa } from "@/features/calendar/dates";
import { downloadBackup } from "@/features/settings/settings";
import type { PlannerData } from "@/types/planner";
import { digest, linkKey, newPair, pairCode, parsePair, pull, push, remoteSha, verifyPrivate, type Binding } from "./vault";

type Snapshot = { data: PlannerData; revision: number };
type Decision = { remote: PlannerData; binding: Binding; revision: number; joining: boolean; old: string | null };

export function DeviceSync({ data, revision, apply, visible }: Snapshot & {
  apply: (data: PlannerData, revision: number) => boolean; visible: boolean;
}) {
  const current = useRef({ data, revision, apply });
  useEffect(() => { current.current = { data, revision, apply }; }, [data, revision, apply]);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const busy = useRef(false);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [deferred, setDeferred] = useState(false);
  const [unlink, setUnlink] = useState(false);
  const persist = useCallback((next: Binding, old: string | null) => {
    if (!active.current || localStorage.getItem(linkKey) !== old) throw new Error("تنظیم اتصال تغییر کرده است. دوباره بررسی کن.");
    localStorage.setItem(linkKey, JSON.stringify(next));
    setBinding(next);
  }, []);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try { await action(); }
    catch (error) {
      setMessage(error instanceof Error && /[آ-ی]/.test(error.message) ? error.message : "همگام‌سازی کامل نشد. شبکه، مجوز حافظه و دسترسی GitHub را بررسی کن.");
    } finally { busy.current = false; setWorking(false); }
  }, []);
  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem(linkKey);
        const next = raw ? JSON.parse(raw) as Binding : null;
        if (next) parsePair(pairCode(next));
        setBinding(next);
        setDecision(null);
      } catch { setMessage("تنظیم اتصال قابل خواندن نیست."); }
      setReady(true);
    }
    load();
    const listener = (e: StorageEvent) => { if (!e.key || e.key === linkKey) load(); };
    window.addEventListener("storage",listener);
    return () => window.removeEventListener("storage",listener);
  }, []);
  const sync = useCallback(() => run(async () => {
    const old = localStorage.getItem(linkKey);
    if (!old || decision) return;
    const b: Binding = JSON.parse(old);
    const snap = current.current;
    const hash = await digest(snap.data);
    await verifyPrivate(b,b.token);
    const sha = await remoteSha(b,b.token);
    const stillCurrent = () => active.current && localStorage.getItem(linkKey) === old && current.current.revision === snap.revision;
    if (!stillCurrent()) return;
    if (sha === b.sha) {
      if (hash !== b.hash) {
        const uploaded = await push(b,b.token,snap.data,sha);
        persist({ ...b, sha: uploaded, hash }, old);
      }
    } else {
      const remote = await pull(b,b.token,sha);
      const remoteHash = await digest(remote);
      if (!stillCurrent()) return;
      const next = { ...b, sha, hash: remoteHash };
      if (hash !== remoteHash && hash !== b.hash) {
        setDeferred(false);
        setDecision({ remote, binding:next, revision:snap.revision, joining:false, old });
        setMessage("دو دستگاه تغییر دارند. در تنظیمات نسخهٔ موردنظر را انتخاب کن.");
        return;
      }
      if (hash !== remoteHash && !current.current.apply(remote,snap.revision)) throw new Error("ذخیرهٔ نسخهٔ دریافتی انجام نشد.");
      persist(next,old);
    }
    setMessage("داده‌های این دستگاه با مخزن همگام است.");
  }), [decision, persist, run]);
  useEffect(() => {
    if (!binding || decision) return;
    const check = () => { if (document.visibilityState === "visible" && navigator.onLine) void sync(); };
    const timeout = window.setTimeout(check, 1500);
    const interval = window.setInterval(check, 60000);
    document.addEventListener("visibilitychange",check);
    window.addEventListener("online",check);
    return () => {
      clearTimeout(timeout); clearInterval(interval);
      document.removeEventListener("visibilitychange",check); window.removeEventListener("online",check);
    };
  }, [binding, revision, decision, sync]);

  if (!ready) return null;
  if (!visible) return decision ? <p className="warning">دو نسخهٔ متفاوت پیدا شد. <a href="#settings">انتخاب نسخه در تنظیمات</a></p> : null;
  return <section id="device-sync" tabIndex={-1} className="panel padded settings-card">
    <div className="panel-heading"><span className="tile blue"><Laptop /></span><div><h2>اتصال دستگاه‌ها</h2><p>همگام‌سازی اختیاری با یک فایل رمزگذاری‌شده در مخزن خصوصی GitHub خودت.</p></div></div>
    {binding ? <>
      <p><bdi>{binding.repo}</bdi> · هنگام باز شدن برنامه و بعد از تغییرات همگام می‌شود.</p>
      <div className="action-row"><Button disabled={working || !!decision} onClick={sync}><RefreshCw size={16} /> بررسی اکنون</Button>
        <Button onClick={() => setShowCode(true)}>کد اتصال دستگاه دیگر</Button><Button disabled={working} onClick={() => setUnlink(true)}>قطع اتصال</Button></div>
    </> : <div className="action-row"><Button onClick={() => setMode("create")}>راه‌اندازی همگام‌سازی</Button><Button onClick={() => setMode("join")}>ورود با کد اتصال</Button></div>}
    {message && <p role="status">{message}</p>}
    {decision && deferred && <Button onClick={() => setDeferred(false)}>انتخاب نسخهٔ همگام‌سازی</Button>}
    {mode && <Dialog title={mode === "create" ? "راه‌اندازی همگام‌سازی" : "ورود با کد اتصال"} close={() => { if (!working) setMode(null); }}>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void run(async () => {
          const old = localStorage.getItem(linkKey);
          if (old) throw new Error("این مرورگر از قبل متصل است.");
          const snap = current.current;
          const token = String(form.get("token")).trim();
          const pair = mode === "create" ? newPair(String(form.get("repo")).trim()) : parsePair(String(form.get("code")).trim());
          await verifyPrivate(pair,token);
          if (mode === "create") {
            const sha = await push(pair,token,snap.data);
            persist({ ...pair,token,sha,hash:await digest(snap.data) }, old);
            setMessage("نسخهٔ رمزگذاری‌شده ثبت شد.");
            setShowCode(true);
          } else {
            const sha = await remoteSha(pair,token);
            const remote = await pull(pair,token,sha);
            setDeferred(false);
            setDecision({ remote, binding:{ ...pair, token, sha, hash:await digest(remote) }, revision:snap.revision, joining:true, old });
          }
          setMode(null);
        });
      }}>
        <p>یک مخزن خصوصی مخصوص برنامه با یک فایل README بساز. برای هر دستگاه، یک توکن Fine-grained با دسترسی Contents خواندن و نوشتن فقط برای همان مخزن وارد کن. توکن و کلید رمز روی همین پروفایل مرورگر ذخیره می‌شوند.</p>
        {mode === "create" ? <Field label="مخزن خصوصی"><input required name="repo" dir="ltr" placeholder="owner/private-planner" /></Field>
          : <Field label="کد دستگاه اول"><textarea required name="code" dir="ltr" /></Field>}
        <Field label="توکن دستگاه"><input required type="password" name="token" dir="ltr" autoComplete="off" /></Field>
        <p className="muted">رویدادها، تنظیمات و پیوست‌ها قبل از ارسال با AES-GCM رمز می‌شوند. GitHub تاریخچهٔ نسخه‌های رمزگذاری‌شده را نگه می‌دارد.</p>
        {message && <p role="status">{message}</p>}<Button variant="primary" type="submit" disabled={working}>{working ? "در حال اتصال…" : mode === "create" ? "رمزگذاری و اتصال" : "مشاهدهٔ نسخهٔ دستگاه"}</Button>
      </form>
    </Dialog>}
    {showCode && binding && <Dialog title="کد اتصال خصوصی" close={() => setShowCode(false)}>
      <div className="form"><p>این کد حاوی کلید رمز است. فقط به دستگاه خودت منتقل کن و آنجا «ورود با کد اتصال» را بزن.</p>
        <Field label="کد اتصال"><textarea readOnly dir="ltr" value={pairCode(binding)} onFocus={(e) => e.target.select()} /></Field>
        <Button onClick={() => void run(async () => { await navigator.clipboard.writeText(pairCode(binding)); setMessage("کد کپی شد."); setShowCode(false); })}>کپی کد</Button></div>
    </Dialog>}
    {decision && !deferred && <Dialog title={decision.joining ? "دریافت اطلاعات دستگاه" : "انتخاب نسخهٔ همگام‌سازی"} close={() => decision.joining ? setDecision(null) : setDeferred(true)}>
      <div className="form"><p>نسخهٔ مخزن شامل {fa(decision.remote.events.length)} رویداد و {fa(decision.remote.tasks.length)} کار است. دستگاه فعلی {fa(data.events.length)} رویداد و {fa(data.tasks.length)} کار دارد.</p>
        <Button onClick={() => downloadBackup(data)}>دانلود بکاپ محلی</Button>
        {message && <p role="status">{message}</p>}
        {revision !== decision.revision && <p className="warning">داده‌های محلی تغییر کردند. <Button onClick={() => { setDecision(null); if (decision.joining) setMode("join"); }}>بررسی دوبارهٔ نسخه‌ها</Button></p>}
        <Button variant="primary" disabled={working || revision !== decision.revision} onClick={() => void run(async () => {
          if (localStorage.getItem(linkKey) !== decision.old) throw new Error("اتصال تغییر کرده است.");
          if (!current.current.apply(decision.remote,decision.revision)) throw new Error("ذخیرهٔ نسخهٔ دریافتی انجام نشد.");
          persist(decision.binding,decision.old); setDecision(null); setMessage("نسخهٔ مخزن روی دستگاه ذخیره شد.");
        })}>جایگزینی داده‌های این دستگاه</Button>
        {!decision.joining && <Button disabled={working || revision !== decision.revision} onClick={() => void run(async () => {
          const b = decision.binding;
          if (localStorage.getItem(linkKey) !== decision.old) throw new Error("اتصال تغییر کرده است.");
          await verifyPrivate(b,b.token);
          const sha = await push(b,b.token,data,b.sha);
          persist({ ...b, sha, hash:await digest(data) },decision.old);
          setDecision(null); setMessage("نسخهٔ محلی در مخزن ثبت شد.");
        })}>جایگزینی نسخهٔ مخزن با داده‌های محلی</Button>}
      </div></Dialog>}
    {unlink && <Dialog title="قطع اتصال این دستگاه" close={() => setUnlink(false)}><p>کلید و توکن ذخیره‌شدهٔ این اتصال از مرورگر حذف می‌شوند. داده‌های محلی و نسخهٔ مخزن در دسترس می‌مانند.</p>
      <footer className="dialog-actions"><Button onClick={() => setUnlink(false)}>انصراف</Button><Button variant="danger" disabled={working} onClick={() => {
        localStorage.removeItem(linkKey); setBinding(null); setDecision(null); setUnlink(false); setMessage("اتصال قطع شد.");
      }}>تأیید قطع اتصال</Button></footer></Dialog>}
  </section>;
}
