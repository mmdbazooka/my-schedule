import { Select } from "@/components/select";
import { Field } from "@/components/ui";
import type { Lesson } from "@/types/planner";

export function LessonSelect({ lessons, value }: { lessons: Lesson[]; value?: string | null }) {
  return <Field label="درس"><Select name="lesson" defaultValue={value ?? ""}>
    <option value="">بدون درس</option>
    {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.name}</option>)}
  </Select></Field>;
}
