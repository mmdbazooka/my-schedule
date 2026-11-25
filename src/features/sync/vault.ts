import { decodeBackup, encodeBackup, validateData } from "@/features/backup/schema";
import type { PlannerData } from "@/types/planner";

export const linkKey = "mohammad-planner:device";
export interface Pair { repo: string; id: string; key: string }
export interface Binding extends Pair { token: string; sha: string; hash: string }

function base64(bytes: Uint8Array) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 16384) result += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(result);
}
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const validRepo = (repo: string) => /^[\w.-]+\/[\w.-]+$/.test(repo) && !repo.split("/").some((part) => part === "." || part === "..");

export function newPair(repo: string): Pair {
  if (!validRepo(repo)) throw new Error("نام مخزن را به شکل owner/repository وارد کن.");
  return { repo, id: crypto.randomUUID(), key: base64(crypto.getRandomValues(new Uint8Array(32))) };
}

export const pairCode = ({ repo, id, key }: Pair) => "planner1." + btoa(JSON.stringify([repo, id, key]));
export function parsePair(code: string): Pair {
  try {
    if (!code.startsWith("planner1.") || code.length > 2000) throw Error();
    const [repo, id, key] = JSON.parse(atob(code.slice(9)));
    if (!validRepo(repo) || !/^[a-f0-9-]{36}$/.test(id) || bytes(key).length !== 32) throw Error();
    return { repo, id, key };
  } catch { throw new Error("کد اتصال معتبر نیست."); }
}

export const digest = async (data: PlannerData) => base64(new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(JSON.stringify(validateData(data))))));

async function request(pair: Pair, token: string, suffix = "", init?: RequestInit) {
  const response = await fetch(`https://api.github.com/repos/${pair.repo}${suffix}`, {
    ...init, cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${token}`, Accept: suffix.startsWith("/contents/") ? "application/vnd.github.object+json" : "application/vnd.github+json", ...(init?.body ? {"Content-Type":"application/json"} : {}) },
  });
  if (!response.ok) {
    if ([409,422].includes(response.status)) throw new Error("نسخهٔ مخزن تغییر کرده یا نوشتن روی شاخه مجاز نیست. دوباره بررسی کن.");
    if ([401,403,404].includes(response.status)) throw new Error("مخزن یا فایل در دسترس نیست. نام، کد اتصال و مجوز Contents توکن را بررسی کن.");
    throw new Error(`پاسخ GitHub ناموفق بود (HTTP ${response.status}).`);
  }
  return response.json();
}

export async function verifyPrivate(pair: Pair, token: string) {
  if (!validRepo(pair.repo)) throw new Error("نام مخزن معتبر نیست.");
  if ((await request(pair, token)).private !== true) throw new Error("برای اتصال، مخزن خصوصی جداگانه انتخاب کن.");
}
const path = (pair: Pair) => `/contents/planner-sync/${pair.id}.bin`;
export async function remoteSha(pair: Pair, token: string): Promise<string> {
  const result = await request(pair, token, path(pair));
  if (result.type !== "file" || !/^[0-9a-f]{40}$/.test(result.sha) || result.size > 16 * 1024 * 1024) throw new Error("فایل همگام‌سازی معتبر نیست.");
  return result.sha;
}
const aes = (pair: Pair) => crypto.subtle.importKey("raw", bytes(pair.key), "AES-GCM", false, ["encrypt","decrypt"]);

export async function pull(pair: Pair, token: string, sha: string) {
  const blob = await request(pair, token, `/git/blobs/${sha}`);
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || blob.content.length > 24_000_000) throw new Error("محتوای نسخهٔ راه‌دور معتبر نیست.");
  let plain: ArrayBuffer;
  try {
    const sealed = bytes(blob.content);
    plain = await crypto.subtle.decrypt({ name:"AES-GCM", iv: sealed.slice(0,12) }, await aes(pair), sealed.slice(12));
  } catch { throw new Error("رمزگشایی انجام نشد. کد اتصال یا فایل مخزن را بررسی کن."); }
  return decodeBackup(new TextDecoder().decode(plain)).data;
}

export async function push(pair: Pair, token: string, data: PlannerData, sha?: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, await aes(pair), new TextEncoder().encode(encodeBackup(data)));
  const sealed = new Uint8Array(12 + cipher.byteLength);
  sealed.set(iv);
  sealed.set(new Uint8Array(cipher),12);
  const result = await request(pair, token, path(pair), { method:"PUT", body:JSON.stringify({
    sha, message:"Update encrypted planner snapshot", content:base64(sealed),
  }) });
  if (!/^[a-f0-9]{40}$/.test(result.content?.sha)) throw new Error("ثبت نسخه تأیید نشد. همگام‌سازی را دوباره بررسی کن.");
  return result.content.sha;
}
