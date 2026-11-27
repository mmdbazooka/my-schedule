"use client";

import { useMemo, useState } from "react";
import { Button, Field } from "@/components/ui";
import { Select } from "@/components/select";
import { validateData } from "@/features/backup/schema";
import { fa } from "@/features/calendar/dates";
import type { PlannerData } from "@/types/planner";
import { mergePlanner, type MergeChoice } from "./merge";

function preview(value: unknown) {
  if (value === undefined) return "در این نسخه وجود ندارد";
  if (typeof value === "string") return value || "خالی";
  if (value && typeof value === "object" && "body" in value && typeof value.body === "string") {
    const title = "title" in value && typeof value.title === "string" ? value.title : "";
    return `${title || "بدون عنوان"}\n\n${value.body}`;
  }
  const text = JSON.stringify(value, (key, content) => key === "base64" ? undefined : content, 2);
  return text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
}

export function MergeOptions({ local, remote, base, disabled, submit }: {
  local: PlannerData;
  remote: PlannerData;
  base: PlannerData | null;
  disabled: boolean;
  submit: (next: PlannerData) => void;
}) {
  const [choices, setChoices] = useState<Record<string, MergeChoice>>({});
  const { data, conflicts } = useMemo(() => mergePlanner(local, remote, base, choices), [local, remote, base, choices]);
  const resolved = conflicts.every(({ key }) => choices[key]);
  let validated: PlannerData | undefined;
  let issue = "";
  if (resolved) {
    try { validated = validateData(data); }
    catch (error) { issue = (error as Error).message; }
  }

  return <section className="form sync-merge">
    {!base && <p className="warning">نسخهٔ مشترک در دسترس نیست. مواردی که فقط در یکی از نسخه‌ها هستند حفظ می‌شوند، چون حذف‌های قبلی قابل تشخیص نیستند.</p>}
    {conflicts.length > 0 ? <>
      <p>{fa(conflicts.length)} مورد متفاوت است. برای هر مورد انتخاب کن کدام نسخه حفظ شود.</p>
      {conflicts.map((conflict) => <fieldset key={conflict.key} className="form">
        <legend>{conflict.label}</legend>
        <div className="sync-merge-versions">
          <div><strong>این دستگاه</strong><pre dir="auto">{preview(conflict.local)}</pre></div>
          <div><strong>مخزن</strong><pre dir="auto">{preview(conflict.remote)}</pre></div>
        </div>
        <Field label={`نسخهٔ ${conflict.label}`}>
          <Select value={choices[conflict.key]?.side ?? ""} onValueChange={(side) => {
            if (side === "both") setChoices({ ...choices, [conflict.key]: { side, copyId: crypto.randomUUID() } });
            if (side === "local" || side === "remote") setChoices({ ...choices, [conflict.key]: { side } });
          }}>
            <option value="">انتخاب نسخه</option>
            <option value="local">نسخهٔ این دستگاه</option>
            <option value="remote">نسخهٔ مخزن</option>
            {conflict.keepBoth && <option value="both">نگه‌داشتن هر دو به‌صورت دو یادداشت</option>}
          </Select>
        </Field>
      </fieldset>)}
    </> : <p>تغییرات مستقل دو نسخه می‌توانند با هم ذخیره شوند.</p>}
    {issue && <p className="error" role="alert">{issue} برای جلوگیری از حذف یا تغییر ناخواسته، ادغام ذخیره نمی‌شود.</p>}
    <Button variant="primary" disabled={disabled || !validated} onClick={() => { if (validated) submit(validated); }}>ادغام و همگام‌سازی</Button>
  </section>;
}
