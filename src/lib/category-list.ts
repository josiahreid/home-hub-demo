import "server-only";
import { db, run } from "./db";
import { CATEGORY_INFO, NOT_SPENDING, SPENDING } from "./categories";

/**
 * Every budget category: the built-in ones plus your own (made with the + on Budget → Sort). Your spending ones
 * come out of pots and show in "Where it went" just like the built-in ones; not-spending ones are like Transfers.
 */

export type Custom = { id: number; name: string; icon: string; spending: number };

export const customCategories = () =>
  (db.prepare("SELECT id, name, icon, spending FROM custom_categories ORDER BY name").all() as Custom[]).map((c) => ({ ...c }));

export function categoryList() {
  const custom = customCategories();
  const spending = [...SPENDING, ...custom.filter((c) => c.spending).map((c) => c.name)];
  const notSpending = [...NOT_SPENDING, ...custom.filter((c) => !c.spending).map((c) => c.name)];
  const info: Record<string, { icon: string; hint: string }> = { ...CATEGORY_INFO };
  for (const c of custom) info[c.name] = { icon: c.icon, hint: c.spending ? "Your own category" : "Your own category – not spending" };
  return { spending, notSpending, all: [...spending, ...notSpending], info, custom };
}

/** Counts against the pots (built-in spending categories and your own spending ones). */
export function isSpendingCategory(c: string | null | undefined) {
  return !!c && categoryList().spending.includes(c);
}

/** Makes a category (or finds one with that name already) and returns its exact name. */
export function addCategory(name: string, icon: string | null, spending: boolean): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean || clean.toLowerCase() === "uncategorised") return null;
  const builtIn = [...SPENDING, ...NOT_SPENDING].find((c) => c.toLowerCase() === clean.toLowerCase());
  if (builtIn) return builtIn;
  const existing = db.prepare("SELECT name FROM custom_categories WHERE name = ?").get(clean) as { name: string } | undefined;
  if (existing) return existing.name;
  // just the first emoji (or character) of what was typed – a whole emoji, even a combined one like 👨‍👩‍👧
  const first = new Intl.Segmenter().segment((icon ?? "").trim())[Symbol.iterator]().next().value?.segment;
  const emoji = first || "🏷️";
  run("INSERT INTO custom_categories (name, icon, spending) VALUES (?, ?, ?)", clean, emoji, spending ? 1 : 0);
  return clean;
}
