"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, RefreshCw } from "lucide-react";
import { Button, Dialog, Field } from "@/components/ui";
import { fa } from "@/features/calendar/dates";
import { downloadBackup } from "@/features/settings/settings";
import type { PlannerData } from "@/types/planner";
import { linkKey, readStoredValue, removeStoredValue } from "@/lib/storage";
import { MergeOptions } from "./merge-options";
import { digest, newPair, pairCode, parsePair, pull, push, remoteSha, verifyPrivate, type Binding } from "./vault";

type Snapshot = { data: PlannerData; revision: number };
type Decision = { remote: PlannerData; base: PlannerData | null; binding: Binding; revision: number; joining: boolean; old: string | null };

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
    if (!active.current || readStoredValue(linkKey) !== old) throw new Error("تنظیم اتصال تغییر کرده است. دوباره بررسی کن.");
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
        const raw = readStoredValue(linkKey);
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
    const old = readStoredValue(linkKey);
    if (!old || decision) return;
    const b: Binding = JSON.parse(old);
    const snap = current.current;
    const hash = await digest(snap.data);
    await verifyPrivate(b,b.token);
    const sha = await remoteSha(b,b.token);
    const stillCurrent = () => active.current && readStoredValue(linkKey) === old && current.current.revision === snap.revision;
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
        const base = await pull(b, b.token, b.sha).catch(() => null);
        const baseHash = base && await digest(base);
        if (!stillCurrent()) return;
        if (hash !== baseHash) {
          setDeferred(false);
          setDecision({ remote, base, binding:next, revision:snap.revision, joining:false, old });
          setMessage("دو دستگاه تغییر دارند. می‌توانی تغییرات هر دو را ادغام کنی.");
          return;
        }
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
  if (!visible) return decision ? <p className="warning">دو نسخهٔ متفاوت پیدا شد. <a href="#settings">ادغام در تنظیمات</a></p> : null;
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
          const old = readStoredValue(linkKey);
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
            setDecision({ remote, base: null, binding:{ ...pair, token, sha, hash:await digest(remote) }, revision:snap.revision, joining:true, old });
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
      <div className="form">
        <p>مخزن {fa(decision.remote.events.length)} رویداد، {fa(decision.remote.tasks.length)} کار و {fa(decision.remote.notes.length)} یادداشت دارد.
          دستگاه فعلی {fa(data.events.length)} رویداد، {fa(data.tasks.length)} کار و {fa(data.notes.length)} یادداشت دارد.</p>
        <div className="action-row">
          <Button onClick={() => downloadBackup(data)}>دانلود بکاپ محلی</Button>
          <Button onClick={() => downloadBackup(decision.remote)}>دانلود بکاپ مخزن</Button>
        </div>
        {message && <p role="status">{message}</p>}
        {revision !== decision.revision && <p className="warning">داده‌های محلی تغییر کردند. نسخه‌ها را دوباره بررسی کن.</p>}
        {!decision.joining && <>
          <MergeOptions key={`${decision.binding.sha}:${decision.revision}`} local={data} remote={decision.remote}
            base={decision.base} disabled={working || revision !== decision.revision} submit={(merged) => void run(async () => {
              const b = decision.binding;
              const stillCurrent = () => active.current && readStoredValue(linkKey) === decision.old &&
                current.current.revision === decision.revision;
              if (!stillCurrent()) throw new Error("داده‌ها یا اتصال تغییر کردند. نسخه‌ها را دوباره بررسی کن.");
              const hash = await digest(merged);
              await verifyPrivate(b, b.token);
              if (!stillCurrent()) throw new Error("داده‌ها یا اتصال تغییر کردند. نسخه‌ها را دوباره بررسی کن.");
              const sha = await push(b, b.token, merged, b.sha);
              if (!stillCurrent() || !current.current.apply(merged, decision.revision)) {
                throw new Error("ادغام در مخزن ثبت شد، اما نسخهٔ این دستگاه ذخیره نشد. نسخه‌ها را دوباره بررسی کن.");
              }
              persist({ ...b, sha, hash }, decision.old);
              setDecision(null);
              setMessage("داده‌های دو دستگاه ادغام و با مخزن همگام شدند.");
            })} />
          <Button variant="ghost" disabled={working} onClick={() => setDecision(null)}>بررسی دوبارهٔ نسخه‌ها</Button>
          <details className="sync-replace">
            <summary>گزینه‌های جایگزینی کامل</summary>
            <p className="warning">جایگزینی کامل، تغییرات نسخهٔ دیگر را کنار می‌گذارد.</p>
            <div className="action-row">
              <Button disabled={working || revision !== decision.revision} onClick={() => void run(async () => {
                const b = decision.binding;
                if (readStoredValue(linkKey) !== decision.old) throw new Error("اتصال تغییر کرده است.");
                await verifyPrivate(b, b.token);
                if (await remoteSha(b, b.token) !== b.sha) throw new Error("نسخهٔ مخزن تغییر کرده است. نسخه‌ها را دوباره بررسی کن.");
                if (!current.current.apply(decision.remote, decision.revision)) throw new Error("ذخیرهٔ نسخهٔ دریافتی انجام نشد.");
                persist(b, decision.old);
                setDecision(null);
                setMessage("نسخهٔ مخزن روی دستگاه ذخیره شد.");
              })}>جایگزینی داده‌های این دستگاه</Button>
              <Button disabled={working || revision !== decision.revision} onClick={() => void run(async () => {
                const b = decision.binding;
                const hash = await digest(data);
                await verifyPrivate(b, b.token);
                if (readStoredValue(linkKey) !== decision.old || current.current.revision !== decision.revision) {
                  throw new Error("داده‌ها یا اتصال تغییر کردند. نسخه‌ها را دوباره بررسی کن.");
                }
                const sha = await push(b, b.token, data, b.sha);
                persist({ ...b, sha, hash }, decision.old);
                setDecision(null);
                setMessage("نسخهٔ محلی در مخزن ثبت شد.");
              })}>جایگزینی نسخهٔ مخزن با داده‌های محلی</Button>
            </div>
          </details>
        </>}
        {decision.joining && revision !== decision.revision && <Button disabled={working} onClick={() => {
          setDecision(null); setMode("join");
        }}>بررسی دوبارهٔ نسخه‌ها</Button>}
        {decision.joining ? <Button variant="primary" disabled={working || revision !== decision.revision} onClick={() => void run(async () => {
          if (readStoredValue(linkKey) !== decision.old) throw new Error("اتصال تغییر کرده است.");
          if (!current.current.apply(decision.remote, decision.revision)) throw new Error("ذخیرهٔ نسخهٔ دریافتی انجام نشد.");
          persist(decision.binding, decision.old); setDecision(null); setMessage("نسخهٔ مخزن روی دستگاه ذخیره شد.");
        })}>جایگزینی داده‌های این دستگاه</Button> : null}
      </div></Dialog>}
    {unlink && <Dialog title="قطع اتصال این دستگاه" close={() => setUnlink(false)}><p>کلید و توکن ذخیره‌شدهٔ این اتصال از مرورگر حذف می‌شوند. داده‌های محلی و نسخهٔ مخزن در دسترس می‌مانند.</p>
      <footer className="dialog-actions"><Button onClick={() => setUnlink(false)}>انصراف</Button><Button variant="danger" disabled={working} onClick={() => {
        removeStoredValue(linkKey); setBinding(null); setDecision(null); setUnlink(false); setMessage("اتصال قطع شد.");
      }}>تأیید قطع اتصال</Button></footer></Dialog>}
  </section>;
}
