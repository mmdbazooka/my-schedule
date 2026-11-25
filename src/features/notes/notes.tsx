"use client";

import { useState } from "react";
import { Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { Button, Dialog, Empty, Field } from "@/components/ui";
import { noteBodyLimit } from "@/features/backup/schema";
import type { Note, Settings } from "@/types/planner";

export function Notes({ notes, settings, revision, save, saveError }: {
  notes: Note[];
  settings: Settings;
  revision: number;
  save: (notes: Note[], message: string, revision: number) => boolean;
  saveError?: string;
}) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editor, setEditor] = useState<{ note: Note | null; revision: number; deleting: boolean } | null>(null);
  const search = (value: string) => value.toLocaleLowerCase("fa").replace(/ي/g, "ی").replace(/ك/g, "ک");
  const needle = search(query.trim());
  const visible = notes.filter(({ title, body }) => search(title).includes(needle) || search(body).includes(needle))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const dateFormat = new Intl.DateTimeFormat("fa-IR", { timeZone: settings.zone, calendar: settings.calendar, dateStyle: "medium" });
  const stale = editor !== null && editor.revision !== revision;

  function open(note: Note | null) {
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setEditor({ note, revision, deleting: false });
  }

  return <>
    <div className="page-heading">
      <h1>یادداشت‌ها</h1>
      <Button variant="primary" onClick={() => open(null)}><Plus size={18} /> یادداشت جدید</Button>
    </div>
    {notes.length > 0 && <label className="search notes-search">
      <Search size={17} aria-hidden="true" />
      <input type="search" aria-label="جست‌وجوی یادداشت‌ها" placeholder="جست‌وجو در عنوان و متن…" value={query}
        onChange={(event) => setQuery(event.target.value)} />
    </label>}
    {visible.length > 0 ? <div className="notes-grid">
      {visible.map((note) => <button className="panel padded note-card" key={note.id} type="button" onClick={() => open(note)}>
        <span className="note-card-title"><StickyNote size={17} aria-hidden="true" /><strong dir="auto">{note.title || "بدون عنوان"}</strong></span>
        <span className="note-preview" dir="auto">{note.body}</span>
        <time dateTime={note.updatedAt}>ویرایش {dateFormat.format(new Date(note.updatedAt))}</time>
      </button>)}
    </div> : <section className="panel padded">
      <Empty icon={<StickyNote size={24} />} title={notes.length ? "یادداشتی پیدا نشد" : "هنوز یادداشتی نداری"}>
        {notes.length > 0 && <Button variant="ghost" onClick={() => setQuery("")}>پاک‌کردن جست‌وجو</Button>}
      </Empty>
    </section>}
    {editor && <Dialog title={editor.deleting ? "حذف یادداشت" : editor.note ? "ویرایش یادداشت" : "یادداشت جدید"} close={() => setEditor(null)}>
      {editor.deleting ? <>
        <p>«{editor.note?.title || "بدون عنوان"}» را حذف می‌کنی؟</p>
        <div className="dialog-actions">
          <Button onClick={() => setEditor({ ...editor, deleting: false })}>بازگشت</Button>
          <Button variant="danger" disabled={stale} onClick={() => {
            if (save(notes.filter((note) => note.id !== editor.note?.id), "یادداشت حذف شد.", editor.revision)) setEditor(null);
          }}>تأیید حذف</Button>
        </div>
      </> : <form className="form note-editor" onSubmit={(event) => {
        event.preventDefault();
        if (stale || !body.trim()) return;
        const note = {
          id: editor.note?.id ?? crypto.randomUUID(),
          title: title.trim(),
          body: body.trim(),
          updatedAt: new Date().toISOString(),
        };
        const next = editor.note ? notes.map((item) => item.id === note.id ? note : item) : [note, ...notes];
        if (save(next, "یادداشت ذخیره شد.", editor.revision)) {
          setEditor(null);
          setQuery("");
        }
      }}>
        <Field label="عنوان (اختیاری)"><input dir="auto" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="متن یادداشت"><textarea dir="auto" autoFocus required maxLength={noteBodyLimit} value={body}
          onChange={(event) => setBody(event.target.value)} /></Field>
        <div className="dialog-actions">
          {editor.note && <Button variant="ghost" disabled={stale} onClick={() => setEditor({ ...editor, deleting: true })}><Trash2 size={16} /> حذف یادداشت</Button>}
          <Button onClick={() => setEditor(null)}>انصراف</Button>
          <Button variant="primary" type="submit" disabled={stale || !body.trim()}>ذخیرهٔ یادداشت</Button>
        </div>
      </form>}
      {stale && <p className="error" role="alert">داده‌ها به‌روز شده‌اند. یادداشت را دوباره باز کن.</p>}
      {saveError && !stale && <p className="error" role="alert">{saveError}</p>}
    </Dialog>}
  </>;
}
