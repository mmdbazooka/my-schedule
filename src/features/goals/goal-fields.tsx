import { Field } from "@/components/ui";
import { fa, latin } from "@/features/calendar/dates";

export function GoalFields({ minutes }: { minutes: number }) {
  return <div className="form-grid">
    <Field label="ساعت هدف هفتگی"><input name="goalHours" inputMode="numeric" defaultValue={fa(Math.floor(minutes / 60))} /></Field>
    <Field label="دقیقهٔ هدف هفتگی"><input name="goalMinutes" inputMode="numeric" defaultValue={fa(minutes % 60)} /></Field>
  </div>;
}

export function readGoal(form: FormData) {
  const hours = Number(latin(String(form.get("goalHours") ?? "0")));
  const minutes = Number(latin(String(form.get("goalMinutes") ?? "0")));
  const total = hours * 60 + minutes;
  if (!Number.isInteger(hours) || hours < 0 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 || total > 10080) {
    throw new Error("هدف باید بین صفر و ۱۶۸ ساعت باشد. بخش دقیقه را بین صفر و ۵۹ وارد کن.");
  }
  return total;
}
