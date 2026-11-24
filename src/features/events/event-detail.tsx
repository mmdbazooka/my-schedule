"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock3, Copy, Download, ExternalLink, FileText, Link2, MapPin, Pencil, Repeat2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { addDays, epoch, eventTime, fullDay, todayIn } from "@/features/calendar/dates";
import { statusLabels } from "@/lib/defaults";
import type { Occurrence, PlannerData, PlannerEvent, Status } from "@/types/planner";
import { downloadAttachment } from "@/features/settings/settings";

type Action = "edit" | "delete" | Status;
export function EventDetail({ event, series, data, stale, copy, act }: {
  event: Occurrence; series: PlannerEvent | undefined; data: PlannerData; stale: boolean;
  copy: () => void; act: (action: Action, whole: boolean) => void;
}) {
  const [choice, setChoice] = useState<Action | null>(null);
  const { calendar, zone } = data.settings;
  const category = data.categories.find((value) => value.id === event.categoryId);
  const start = event.timing.allDay ? event.timing.start : todayIn(epoch(event.timing.start), zone);
  const end = event.timing.allDay ? addDays(event.timing.end, -1) : todayIn(epoch(event.timing.end), zone);
  const verbs = { edit: "ویرایش", delete: "حذف", cancelled: "لغو", done: "انجام‌شده", planned: "فعال‌سازی دوباره" };
  const choose = (action: Action) => series?.recurrence || action === "delete" ? setChoice(action) : act(action, true);

  return <div className="form">
    <div className="detail-tags">
      <span className="state-tag"><span className="color-dot" style={{ backgroundColor: category?.color }} />{category?.name}</span>
      <span className="state-tag">{statusLabels[event.status]}</span>
      {series?.recurrence && <span className="state-tag"><Repeat2 size={16} /> تکرارشونده</span>}
    </div>
    <ul className="details">
      <li><CalendarDays size={17} /> {fullDay(start, calendar)}{end !== start && ` تا ${fullDay(end, calendar)}`}</li>
      <li><Clock3 size={17} /> {eventTime(event.timing, zone)} · {event.busy && event.status !== "cancelled" ? "زمان را اشغال می‌کند" : "زمان را اشغال نمی‌کند"}</li>
      {event.location && <li><MapPin size={17} />{event.location}</li>}
      {event.link && <li><Link2 size={17} /><a href={event.link} target="_blank" rel="noreferrer">باز کردن لینک جلسه <ExternalLink size={14} /></a></li>}
      {event.links.map((link, index) => <li key={index}><Link2 size={17} /><a href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={14} /></a></li>)}
      {event.attachments.map((file, index) => <li key={index}><FileText size={17} /><Button variant="ghost" onClick={() => downloadAttachment(file.name, file.base64)}>
        <Download size={16} /><bdi>{file.name}</bdi></Button></li>)}
    </ul>
    {event.description && <p className="description">{event.description}</p>}
    {stale && <p role="alert" className="error">این رویداد یا داده‌ها در تب دیگری تغییر کرده‌اند. جزئیات را دوباره باز کنید.</p>}
    {choice ? <section className={choice === "delete" ? "warning" : "info"}>
      <strong>{choice === "delete" ? "حذف رویداد را تأیید کنید." : `دامنهٔ ${verbs[choice]} را انتخاب کنید.`}</strong>
      <div className="action-row">
        <Button onClick={() => setChoice(null)}>بازگشت</Button>
        {series?.recurrence && <Button disabled={stale} onClick={() => act(choice, false)}>فقط این نوبت</Button>}
        <Button disabled={stale} variant={choice === "delete" ? "danger" : "primary"} onClick={() => act(choice, true)}>
          {series?.recurrence ? "کل سری" : "تأیید حذف"}
        </Button>
      </div>
    </section> : <footer className="action-row">
      <Button disabled={stale} variant="primary" onClick={() => choose("edit")}><Pencil size={16} /> ویرایش</Button>
      <Button disabled={stale} onClick={copy}><Copy size={16} /> کپی</Button>
      {event.status !== "done" && <Button disabled={stale} onClick={() => choose("done")}><Check size={17} /> انجام شد</Button>}
      {event.status !== "cancelled" && <Button disabled={stale} onClick={() => choose("cancelled")}><X size={17} /> لغو رویداد</Button>}
      {event.status !== "planned" && <Button disabled={stale} onClick={() => choose("planned")}>فعال‌سازی دوباره</Button>}
      <Button disabled={stale} variant="danger" onClick={() => choose("delete")}><Trash2 size={16} /> حذف</Button>
    </footer>}
  </div>;
}
