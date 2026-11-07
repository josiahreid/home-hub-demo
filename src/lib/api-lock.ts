import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { io } from "next/cache";
import { cookies, headers } from "next/headers";
import { getSetting, run, setSetting } from "./db";

/**
 * The password lock on Settings → API.
 *
 * - The password itself is never stored – only a salted scrypt hash to check it against.
 * - A second scrypt of the password (different salt) is the key that encrypts saved API tokens (Akahu).
 *   That key only exists in memory, after someone unlocks the page, and is gone when Home Hub restarts.
 * - Wrong passwords: after 5 in a row the page stays locked for 15 minutes (kept in the database, so a
 *   restart doesn't reset it).
 * - Unlocking gives this browser a session cookie for 30 minutes. Sessions are kept in memory only.
 */

const SCRYPT: ScryptOptions = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60_000;
const SESSION_MS = 30 * 60_000;
export const API_COOKIE = "hh_api";
const COOKIE_PATH = "/settings/api";

type LockRecord = { v: 1; salt: string; hash: string; keySalt: string };
type Fails = { count: number; until?: number };

const g = globalThis as unknown as {
  __hhApiSessions?: Map<string, number>; // sha256(session token) → expiry
  __hhApiKey?: Buffer | null; // the token-encryption key, after an unlock since the last restart
};
const sessions = (g.__hhApiSessions ??= new Map());

function scrypt(password: string, salt: Buffer, len: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password.normalize("NFKC"), salt, len, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));
}

function lockRecord(): LockRecord | null {
  try {
    const r = JSON.parse(getSetting("api_lock") ?? "null");
    return r?.v === 1 ? r : null;
  } catch {
    return null;
  }
}

export function hasApiPassword() {
  return lockRecord() != null;
}

function fails(): Fails {
  try {
    return JSON.parse(getSetting("api_lock_fails") ?? "null") ?? { count: 0 };
  } catch {
    return { count: 0 };
  }
}

/** Minutes left on a lockout, or 0. */
export function lockedOutFor(): number {
  const f = fails();
  return f.until && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60_000) : 0;
}

export const PASSWORD_RULE = "At least 12 characters. A few random words works well – don't reuse a password from anywhere else.";

export function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return "The password needs at least 12 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (new Set(pw).size < 5) return "Use a less repetitive password.";
  return null;
}

/** First-time setup: saves the hash, loads the encryption key and starts a session straight away. */
export async function createApiPassword(pw: string): Promise<void> {
  const salt = randomBytes(16);
  const keySalt = randomBytes(16);
  const hash = await scrypt(pw, salt, 32);
  setSetting("api_lock", JSON.stringify({ v: 1, salt: salt.toString("base64"), hash: hash.toString("base64"), keySalt: keySalt.toString("base64") } satisfies LockRecord));
  g.__hhApiKey = await scrypt(pw, keySalt, 32);
  await startSession();
  logApi("password", true, "password set");
}

/** Checks the password. On success starts a session and loads the encryption key into memory. */
export async function unlockApi(pw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = lockRecord();
  if (!rec) return { ok: false, error: "No password has been set yet." };
  const wait = lockedOutFor();
  if (wait) return { ok: false, error: `Too many wrong passwords. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };

  const hash = await scrypt(pw, Buffer.from(rec.salt, "base64"), 32);
  if (!timingSafeEqual(hash, Buffer.from(rec.hash, "base64"))) {
    const f = fails();
    const count = f.count + 1;
    setSetting("api_lock_fails", JSON.stringify(count >= MAX_FAILS ? { count: 0, until: Date.now() + LOCKOUT_MS } : { count }));
    logApi("unlock", false, count >= MAX_FAILS ? "wrong password – locked for 15 minutes" : "wrong password");
    return { ok: false, error: count >= MAX_FAILS ? "Wrong password. Locked for 15 minutes." : `Wrong password (${MAX_FAILS - count} more ${MAX_FAILS - count === 1 ? "try" : "tries"} before a 15-minute lock).` };
  }
  setSetting("api_lock_fails", JSON.stringify({ count: 0 }));
  g.__hhApiKey = await scrypt(pw, Buffer.from(rec.keySalt, "base64"), 32);
  await startSession();
  logApi("unlock", true);
  return { ok: true };
}

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

async function startSession() {
  const token = randomBytes(32).toString("base64url");
  sessions.set(digest(token), Date.now() + SESSION_MS);
  const h = await headers();
  const https = (h.get("x-forwarded-proto") ?? "").includes("https");
  (await cookies()).set(API_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: https, path: COOKIE_PATH, maxAge: SESSION_MS / 1000 });
}

/** True when this browser has unlocked Settings → API in the last 30 minutes. */
export async function apiUnlocked(): Promise<boolean> {
  await io(); // request-time only (it reads the clock)
  const token = (await cookies()).get(API_COOKIE)?.value;
  if (!token) return false;
  const key = digest(token);
  const expires = sessions.get(key);
  if (!expires || expires < Date.now()) {
    sessions.delete(key);
    return false;
  }
  return true;
}

/** Every server action on the API pages calls this first – actions can be called directly, not just from the page. */
export async function requireApiUnlocked() {
  if (!(await apiUnlocked())) throw new Error("Settings → API is locked. Unlock it with the password first.");
}

export async function lockApi() {
  const jar = await cookies();
  const token = jar.get(API_COOKIE)?.value;
  if (token) sessions.delete(digest(token));
  // expire it (same path as when it was set) – this is one of the documented ways to delete a cookie
  jar.set(API_COOKIE, "", { httpOnly: true, sameSite: "strict", path: COOKIE_PATH, maxAge: 0 });
}

/** Re-encrypts saved secrets under a new password. Must be unlocked. */
export async function changeApiPassword(current: string, next: string): Promise<string | null> {
  const rec = lockRecord();
  if (!rec) return "No password has been set yet.";
  const hash = await scrypt(current, Buffer.from(rec.salt, "base64"), 32);
  if (!timingSafeEqual(hash, Buffer.from(rec.hash, "base64"))) return "The current password is wrong.";
  const oldKey = await scrypt(current, Buffer.from(rec.keySalt, "base64"), 32);
  const secrets = SECRET_KEYS.map((k) => [k, getSetting(k)] as const).filter(([, v]) => v);
  const plain = secrets.map(([k, v]) => [k, decrypt(v!, oldKey)] as const);

  const salt = randomBytes(16);
  const keySalt = randomBytes(16);
  const newKey = await scrypt(next, keySalt, 32);
  setSetting("api_lock", JSON.stringify({ v: 1, salt: salt.toString("base64"), hash: (await scrypt(next, salt, 32)).toString("base64"), keySalt: keySalt.toString("base64") } satisfies LockRecord));
  for (const [k, v] of plain) setSetting(k, encrypt(v, newKey));
  g.__hhApiKey = newKey;
  sessions.clear(); // every other browser has to unlock again
  await startSession();
  logApi("password", true, "password changed");
  return null;
}

/** Forgotten password: removes the password and every encrypted secret (they can't be read without it). */
export function resetApiLock() {
  // the Akahu sync position goes too, so a new connection starts with a full first sync
  run(`DELETE FROM settings WHERE key IN ('api_lock', 'api_lock_fails', 'akahu_last_sync', 'akahu_status', ${SECRET_KEYS.map(() => "?").join(", ")})`, ...SECRET_KEYS);
  g.__hhApiKey = null;
  sessions.clear();
  logApi("password", true, "password reset – saved API tokens removed");
}

// ── encrypted secrets (AES-256-GCM with the password-derived key) ──

/** Settings rows holding encrypted secrets – wiped by a password reset, re-encrypted by a password change. */
export const SECRET_KEYS = ["akahu_tokens"];

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") });
}

function decrypt(stored: string, key: Buffer): string {
  const { iv, tag, ct } = JSON.parse(stored);
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

/** True when the encryption key is in memory (someone has unlocked since Home Hub last started). */
export function secretsAvailable() {
  return !!g.__hhApiKey;
}

/** Drops the key from memory: saved secrets can't be used until the next unlock. */
export function forgetKey() {
  g.__hhApiKey = null;
}

export function saveSecret(name: string, value: string) {
  if (!g.__hhApiKey) throw new Error("Unlock Settings → API first.");
  setSetting(name, encrypt(value, g.__hhApiKey));
}

/** The decrypted secret, or null if none is saved or the key isn't in memory. Never send this to the browser. */
export function readSecret(name: string): string | null {
  const stored = getSetting(name);
  if (!stored || !g.__hhApiKey) return null;
  try {
    return decrypt(stored, g.__hhApiKey);
  } catch {
    return null;
  }
}

export function hasSecret(name: string) {
  return !!getSetting(name);
}

// ── audit log: one line per unlock, password change and sync ──

export function logApi(event: string, ok: boolean, note?: string) {
  run("INSERT INTO api_log (event, ok, note) VALUES (?, ?, ?)", event, ok ? 1 : 0, note ?? null);
  run("DELETE FROM api_log WHERE id NOT IN (SELECT id FROM api_log ORDER BY id DESC LIMIT 200)");
}
