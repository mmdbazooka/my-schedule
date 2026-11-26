import { decodeBackup, encodeBackup } from "@/features/backup/schema";
import { googleClientKey } from "@/features/google-calendar/google-calendar";
import { defaults } from "@/lib/defaults";
import type { PlannerData } from "@/types/planner";

export const storageKey = "planner:data";
export const linkKey = "planner:device";

const legacyKeys = {
  [storageKey]: "mohammad-planner:data",
  [linkKey]: "mohammad-planner:device",
};
type StorageKey = keyof typeof legacyKeys;

export function readStoredValue(key: StorageKey) {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyKeys[key]);
  if (legacy !== null) {
    try { localStorage.setItem(key, legacy); }
    catch { return legacy; }
    localStorage.removeItem(legacyKeys[key]);
  }
  return legacy;
}

export function removeStoredValue(key: StorageKey) {
  localStorage.removeItem(legacyKeys[key]);
  localStorage.removeItem(key);
}

export function readRaw() {
  try { return readStoredValue(storageKey); }
  catch { throw new Error("دسترسی به حافظهٔ مرورگر ممکن نیست."); }
}

export function readData(raw: string | null): PlannerData {
  return raw === null ? defaults() : decodeBackup(raw).data;
}

export function writeData(data: PlannerData) {
  const raw = encodeBackup(data);
  try { window.localStorage.setItem(storageKey, raw); }
  catch { throw new Error("ذخیره انجام نشد. فضای مرورگر یا مجوز ذخیره‌سازی را بررسی کنید."); }
  return raw;
}

export function clearData() {
  try { removeStoredValue(linkKey); localStorage.removeItem(googleClientKey); removeStoredValue(storageKey); }
  catch { throw new Error("حذف داده‌ها از حافظهٔ مرورگر ممکن نبود."); }
}
