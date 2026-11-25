export type Calendar = "persian" | "gregory";
export type Theme = "light" | "dark" | "system";
export type Status = "planned" | "done" | "cancelled";
export type Priority = "low" | "medium" | "high";

export type EventKind = "general" | "class" | "exam" | "study";

export interface Lesson {
  id: string;
  name: string;
  weeklyMinutes: number;
}

export interface TimePreference extends ActiveHours {
  id: string;
  categoryId: string;
  weekday: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  weeklyMinutes: number;
}

export type Timing =
  | { allDay: true; start: string; end: string }
  | { allDay: false; start: string; end: string; zone: string };

export interface Attachment {
  name: string;
  base64: string;
}

export interface EventFields {
  title: string;
  categoryId: string;
  timing: Timing;
  kind: EventKind;
  lessonId: string | null;
  travelBefore: number;
  travelAfter: number;
  location: string;
  link: string;
  description: string;
  links: { label: string; url: string }[];
  attachments: Attachment[];
  status: Status;
  busy: boolean;
}

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly";
  weekdays: number[];
  calendar: Calendar;
  end: { type: "never" } | { type: "until"; date: string } | { type: "count"; count: number };
}

export interface PlannerEvent extends EventFields {
  id: string;
  recurrence: Recurrence | null;
  exceptions: Record<string, EventFields | null>;
}

export interface Task {
  id: string;
  title: string;
  minutes: number;
  priority: Priority;
  due: string | null;
  eventId: string | null;
  lessonId: string | null;
  categoryId: string | null;
  done: boolean;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface ActiveHours {
  start: string;
  end: string;
}

export interface Settings {
  displayName?: string;
  calendar: Calendar;
  zone: string;
  weekStart: number;
  theme: Theme;
  active: ActiveHours[][];
  minimum: number;
  buffer: number;
}

export interface PlannerData {
  categories: Category[];
  lessons: Lesson[];
  preferences: TimePreference[];
  events: PlannerEvent[];
  tasks: Task[];
  notes: Note[];
  settings: Settings;
}

export interface Occurrence extends EventFields {
  eventId: string;
  date: string;
}

export interface Interval {
  start: number;
  end: number;
}
