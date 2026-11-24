import { decodeBackup, encodeBackup } from "@/features/backup/schema";
import { defaults } from "@/lib/defaults";
import type { PlannerData } from "@/types/planner";

export const storageKey = "mohammad-planner:data";

export function readRaw() {
  try { return window.localStorage.getItem(storageKey); }
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
  try { window.localStorage.removeItem(storageKey); }
  catch { throw new Error("حذف داده‌ها از حافظهٔ مرورگر ممکن نبود."); }
}
