import "server-only";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { all, db, getSetting } from "./db";
import { iso, occurrences, today, type Frequency } from "./format";
import { isSpendingCategory } from "./category-list";

/**
 * The simple budget: each payday's money goes into a few pots (Bills, Food & fuel, Spending…), spending is
 * sorted into a few big categories, and each category comes out of one pot. Everything is per pay fortnight.
 */

export type Pot = { id: number; key: string; name: string; fortnightly_cents: number; categories: string; account_id: number | null; sort: number };
export type Fortnight = { start: string; end: string; payday: string };

export const potCategories = (p: Pick<Pot, "categories">) => p.categories.split(",").map((c) => c.trim()).filter(Boolean);

export const pots = () => all<Pot>("SELECT * FROM pots ORDER BY sort, id");

/** The pay fortnight containing `date` (from the saved payday), or null until a payday has been set. */
export function fortnightOf(date = today()): Fortnight | null {
  const saved = getSetting("next_payday");
  if (!saved) return null;
  const anchor = parseISO(saved);
  const offset = Math.floor(differenceInCalendarDays(parseISO(date), anchor) / 14);
  const start = addDays(anchor, offset * 14);
  return { start: iso(start), end: iso(addDays(start, 13)), payday: iso(addDays(start, 14)) };
}

export const shiftFortnight = (f: Fortnight, by: number) => fortnightOf(iso(addDays(parseISO(f.start), by * 14)))!;

/** Money out (and refunds back in) per category between two dates – spending categories only. */
export async function spendingByCategory(from: string, to: string) {
  const rows = await all<{ category: string; spent: number }>(
    `SELECT category, -SUM(amount_cents) AS spent FROM transactions
      WHERE date BETWEEN ? AND ? AND category IS NOT NULL AND same_as IS NULL GROUP BY category`, from, to);
  return new Map(rows.filter((r) => isSpendingCategory(r.category)).map((r) => [r.category, r.spent]));
}

export type PotStatus = Pot & { spent: number; left: number; cats: string[] };

/** Each pot for a fortnight: what went in, what came out of it, what's left. */
export async function potStatus(f: Fortnight): Promise<PotStatus[]> {
  const [list, spent, saved] = await Promise.all([
    pots(),
    spendingByCategory(f.start, f.end),
    all<{ moved: number }>("SELECT coalesce(-SUM(amount_cents), 0) AS moved FROM transactions WHERE category = 'Savings' AND same_as IS NULL AND date BETWEEN ? AND ?", f.start, f.end),
  ]);
  return list.map((p) => {
    const cats = potCategories(p);
    const out = cats.reduce((s, c) => s + (c === "Savings" ? saved[0].moved : spent.get(c) ?? 0), 0);
    return { ...p, cats, spent: out, left: p.fortnightly_cents - out };
  });
}

/** Pay that came in during a fortnight, and what's expected each fortnight. */
export async function incomeFor(f: Fortnight) {
  const [[got], expected] = await Promise.all([
    all<{ n: number }>("SELECT coalesce(SUM(amount_cents), 0) AS n FROM transactions WHERE category = 'Income' AND amount_cents > 0 AND same_as IS NULL AND date BETWEEN ? AND ?", f.start, f.end),
    all<{ n: number }>("SELECT coalesce(SUM(fortnightly_cents), 0) AS n FROM income_sources WHERE included = 1 AND (ends_on IS NULL OR ends_on >= ?)", today()),
  ]);
  return { received: got.n, expected: expected[0].n };
}

/** Repeat payments that fall in a fortnight, in date order – the bills timeline. A payment with no category
 *  gets one from the shop rules (so "Pak N Save Fuel" counts as Transport, not as a bill). */
export async function billsIn(f: Fortnight) {
  const [rows, rules] = await Promise.all([
    all<{ id: number; name: string; amount_cents: number; frequency: Frequency; next_due: string; category: string | null }>(
      "SELECT id, name, amount_cents, frequency, next_due, category FROM recurring_payments WHERE active = 1 AND same_as IS NULL"),
    all<{ pattern: string; category: string }>("SELECT pattern, category FROM category_rules ORDER BY length(pattern) DESC"),
  ]);
  const categoryOf = (r: { name: string; category: string | null }) =>
    r.category ?? rules.find((x) => r.name.toLowerCase().includes(x.pattern))?.category ?? null;
  return rows
    .map((r) => ({ ...r, category: categoryOf(r) }))
    .flatMap((r) => occurrences(r.next_due, r.frequency, f.start, f.end).map((date) => ({ ...r, date })))
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount_cents - a.amount_cents);
}

/** How many transactions still need a category (recent ones are what matter for this fortnight). */
export function unsortedCount() {
  const recent = db.prepare("SELECT count(*) AS n FROM transactions WHERE category IS NULL AND amount_cents != 0 AND date >= date('now', '-90 days')").get() as { n: number };
  const older = db.prepare("SELECT count(*) AS n FROM transactions WHERE category IS NULL AND amount_cents != 0 AND date < date('now', '-90 days')").get() as { n: number };
  return { recent: recent.n, older: older.n };
}

/**
 * The part of a statement line that names the shop – "PAK N SAVE HOMETOWN · Q Card" → "pak n save hometown",
 * "2DEGREES 63001825 63001825" → "2degrees". Used to sort every transaction "like this" at once and remember it.
 */
export function merchantKey(description: string): string {
  const words = description.split(" · ")[0].toLowerCase().replace(/\s+/g, " ").trim().split(" ");
  const kept: string[] = [];
  for (const w of words) {
    // stop at the first reference number after the name (card numbers, account numbers, dates)
    if (kept.length && /\d/.test(w)) break;
    kept.push(w);
  }
  return kept.join(" ").replace(/[*#]+$/, "").trim();
}

/** How a fortnight went, in a few lines – for the payday notification. */
export async function paydaySummary(f: Fortnight) {
  const status = await potStatus(f);
  const spendPots = status.filter((p) => p.cats.length && !(p.cats.length === 1 && p.cats[0] === "Savings"));
  const spent = spendPots.reduce((s, p) => s + p.spent, 0);
  const planned = spendPots.reduce((s, p) => s + p.fortnightly_cents, 0);
  const fmt = (c: number) => `$${(Math.abs(c) / 100).toLocaleString("en-NZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const lines = spendPots.map((p) => `${p.name}: ${p.left >= 0 ? `${fmt(p.left)} left` : `${fmt(-p.left)} over`}`);
  const { recent } = unsortedCount();
  const headline = spent <= planned ? `${fmt(planned - spent)} left over` : `${fmt(spent - planned)} over`;
  return {
    title: `💰 Payday – last fortnight ${headline}`,
    body: [`Spent ${fmt(spent)} of ${fmt(planned)}.`, ...lines, recent ? `${recent} transactions still to sort.` : ""].filter(Boolean).join("\n"),
  };
}
