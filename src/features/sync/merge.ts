import type { Note, PlannerData, Settings } from "@/types/planner";

export type MergeChoice = { side: "local" | "remote" } | { side: "both"; copyId: string };

export interface MergeConflict {
  key: string;
  label: string;
  local: unknown;
  remote: unknown;
  keepBoth: boolean;
}

export function mergePlanner(local: PlannerData, remote: PlannerData, base: PlannerData | null,
  choices: Readonly<Record<string, MergeChoice>> = {}) {
  const conflicts: MergeConflict[] = [];
  const copies: Note[] = [];

  function resolve<T>(left: T | undefined, right: T | undefined, original: T | undefined,
    key: string, label: string, keepBoth = false): T | undefined {
    if (equal(left, right)) return left;
    if (base) {
      if (equal(left, original)) return right;
      if (equal(right, original)) return left;
    } else if (left === undefined || right === undefined) {
      // Without a base, an absent record might be a deletion or a new record on the other device.
      return left ?? right;
    }
    conflicts.push({ key, label, local: left, remote: right, keepBoth });
    return choices[key]?.side === "remote" ? right : left;
  }

  function collection<T extends { id: string }>(key: keyof PlannerData, label: string, left: T[], right: T[],
    original: T[] | undefined, mergeRecord?: (left: T | undefined, right: T | undefined, base: T | undefined) => T | undefined): T[] {
    const byId = (items?: T[]) => new Map(items?.map((item) => [item.id, item]));
    const localItems = byId(left);
    const remoteItems = byId(right);
    const baseItems = byId(original);
    const ids = new Set([...remoteItems.keys(), ...localItems.keys()]);
    const merged: T[] = [];
    for (const id of ids) {
      const l = localItems.get(id), r = remoteItems.get(id), b = baseItems.get(id);
      const item = l ?? r;
      const title = item && ("title" in item ? item.title : "name" in item ? item.name : "");
      const result = mergeRecord ? mergeRecord(l, r, b)
        : resolve(l, r, b, `${key}:${id}`, title ? `${label} «${title}»` : label);
      if (result) merged.push(result);
    }
    return merged;
  }

  const notes = collection("notes", "یادداشت", local.notes, remote.notes, base?.notes, (left, right, original) => {
    const note = (left ?? right)!;
    const key = `notes:${note.id}`;
    const label = `یادداشت «${note.title || "بدون عنوان"}»`;
    if (left && right) {
      const latest = Date.parse(left.updatedAt) > Date.parse(right.updatedAt) ? left : right;
      if (left.title === right.title && left.body === right.body) return latest;
      if (original) {
        // Editing a title on one device and the text on another can be combined safely.
        const title = mergeText(left.title, right.title, original.title);
        const body = mergeText(left.body, right.body, original.body);
        if (title !== undefined && body !== undefined) return { ...latest, title, body };
        if (left.title === original.title && left.body === original.body) return right;
        if (right.title === original.title && right.body === original.body) return left;
      }
      const choice = choices[key];
      if (choice?.side === "both") copies.push({ ...right, id: choice.copyId });
      conflicts.push({ key, label, local: left, remote: right, keepBoth: true });
      return choice?.side === "remote" ? right : left;
    }
    return resolve(left, right, original, key, label);
  });

  const settingLabels: Record<keyof Settings, string> = {
    displayName: "نام نمایشی", calendar: "نوع تقویم", zone: "منطقهٔ زمانی", weekStart: "شروع هفته",
    theme: "تم", active: "ساعات فعال", minimum: "حداقل بازهٔ آزاد", buffer: "حاشیهٔ استراحت",
  };
  function setting<K extends keyof Settings>(key: K): Settings[K] {
    return resolve(local.settings[key], remote.settings[key], base?.settings[key], `settings:${key}`, settingLabels[key]) as Settings[K];
  }

  const displayName = setting("displayName");
  const data: PlannerData = {
    categories: collection("categories", "دسته", local.categories, remote.categories, base?.categories),
    lessons: collection("lessons", "درس", local.lessons, remote.lessons, base?.lessons),
    preferences: collection("preferences", "زمان ترجیحی", local.preferences, remote.preferences, base?.preferences),
    events: collection("events", "رویداد", local.events, remote.events, base?.events),
    tasks: collection("tasks", "کار", local.tasks, remote.tasks, base?.tasks),
    notes: [...notes, ...copies],
    settings: {
      calendar: setting("calendar"), zone: setting("zone"), weekStart: setting("weekStart"),
      theme: setting("theme"), active: setting("active"), minimum: setting("minimum"), buffer: setting("buffer"),
      ...(displayName === undefined ? {} : { displayName }),
    },
  };
  return { data, conflicts };
}

function mergeText(left: string, right: string, base: string) {
  if (left === right || right === base) return left;
  if (left === base) return right;
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => equal(value, right[index]));
  }
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equal(Reflect.get(left, key), Reflect.get(right, key)));
}
