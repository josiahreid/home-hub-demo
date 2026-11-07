import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db, getSetting, run, setSetting } from "./db";

export type Grocery = { id: number; name: string; urgent: number; done_at: string | null; created_at: string; cleared: number };

/** Items still to buy, urgent first, oldest first within each. */
export function groceryList() {
  const items = db.prepare("SELECT * FROM groceries WHERE done_at IS NULL ORDER BY urgent DESC, created_at, id").all() as Grocery[];
  return { urgent: items.filter((i) => i.urgent), notUrgent: items.filter((i) => !i.urgent) };
}

/** Adds an item; if it's already on the list it isn't added twice (but can become urgent). */
export function addGrocery(name: string, urgent: boolean): { id: number; added: boolean } | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) return null;
  const existing = db.prepare("SELECT id, urgent FROM groceries WHERE done_at IS NULL AND lower(name) = lower(?)").get(clean) as
    | { id: number; urgent: number }
    | undefined;
  if (existing) {
    if (urgent && !existing.urgent) run("UPDATE groceries SET urgent = 1 WHERE id = ?", existing.id);
    return { id: existing.id, added: false };
  }
  return { id: Number(run("INSERT INTO groceries (name, urgent) VALUES (?, ?)", clean, urgent ? 1 : 0).lastInsertRowid), added: true };
}

/** Ticks an item off by name (for Shortcuts). Returns whether anything matched. */
export function clearGroceryByName(name: string) {
  return run("UPDATE groceries SET done_at = datetime('now') WHERE done_at IS NULL AND lower(name) = lower(?)", name.trim()).changes > 0;
}

/** The list as plain text, for Shortcuts ("Show result" / "Speak text") and the Telegram reminder. */
export function groceryText() {
  const { urgent, notUrgent } = groceryList();
  if (!urgent.length && !notUrgent.length) return "The grocery list is empty.";
  const part = (title: string, list: Grocery[]) => (list.length ? `${title}\n${list.map((i) => `• ${i.name}`).join("\n")}` : "");
  return [part("Urgent", urgent), part("Not urgent", notUrgent)].filter(Boolean).join("\n\n");
}

// ── the secret key in the Shortcuts links ──

export function groceryToken(): string {
  let token = getSetting("grocery_token");
  if (!token) {
    token = randomBytes(18).toString("base64url");
    setSetting("grocery_token", token);
  }
  return token;
}

export function resetGroceryToken() {
  setSetting("grocery_token", randomBytes(18).toString("base64url"));
}

export function groceryTokenMatches(candidate: string | null) {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(groceryToken());
  return a.length === b.length && timingSafeEqual(a, b);
}
