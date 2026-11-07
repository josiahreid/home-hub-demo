import "server-only";
import { db } from "./db";
import { PER_YEAR, type Frequency } from "./format";

/**
 * Bills and the bank payments that pay them – so the same money is only counted once:
 *  - a bill can be the same money as other bills (`same_as`): Interest is inside the Loan repayment; the "Tower
 *    Insurance" payment pays the House, Auris and Outlander policies. It's still listed, but never counted;
 *  - bank payments belong to a bill by hand (`transactions.bill_id`) or by what the bank calls it (`match`, or the
 *    bill's own name if it came from a statement). A policy or utility gets the payments of any bill that's the
 *    same money as it, so the Insurance and Utilities pages can check the price you entered against what was paid.
 */

export type Bill = {
  id: number; name: string; amount_cents: number; frequency: Frequency; next_due: string; category: string | null;
  linked_type: string | null; linked_id: number | null; active: number; same_as: string | null; match: string | null;
};
export type Payment = { id: number; date: string; description: string; amount_cents: number; account: string | null; bill_id: number | null };

export const sameAsIds = (b: Pick<Bill, "same_as">) => (b.same_as ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);

export const allBills = () => (db.prepare("SELECT * FROM recurring_payments ORDER BY active DESC, next_due").all() as Bill[]).map((b) => ({ ...b }));

/**
 * The words that pick out a bill's payments at the bank. Set by hand, or – for a bill that was spotted in your
 * statements – its own name. Insurance, utility and car bills only match by hand (their names are yours, not the bank's).
 */
export function matchWords(b: Pick<Bill, "match" | "name" | "linked_type">): string | null {
  if (b.match?.trim()) return b.match.trim().toLowerCase();
  if (b.linked_type) return null;
  const k = nameWords(b.name);
  return k.length >= 4 ? k : null;
}

/** "Loan repayment 0687 0000000-91" → "loan repayment", "Tower Insurance -" → "tower insurance": the name up to the first number. */
export function nameWords(name: string) {
  const kept: string[] = [];
  for (const w of name.split(" · ")[0].toLowerCase().split(/\s+/)) {
    if (/\d/.test(w)) break;
    kept.push(w);
  }
  return kept.join(" ").replace(/[^a-z0-9)]+$/i, "").trim();
}

/** The bills a bill's payments count towards: itself, plus every bill it's the same money as. */
export function billGroup(bill: Bill, bills: Bill[]) {
  const ids = new Set([bill.id, ...sameAsIds(bill)]);
  // …and if another bill is the same money as this one (Tower → this policy), its payments are this one's too
  const covering = bills.filter((b) => sameAsIds(b).includes(bill.id));
  for (const c of covering) {
    ids.add(c.id);
    for (const x of sameAsIds(c)) ids.add(x);
  }
  return { ids: [...ids], covering };
}

/** Bank payments (money out) for any of these bills, newest first: linked by hand, or matching their words. */
export function paymentsFor(billIds: number[], bills: Bill[], since: string): Payment[] {
  if (!billIds.length) return [];
  const words = [...new Set(bills.filter((b) => billIds.includes(b.id)).map(matchWords).filter((w): w is string => !!w))];
  const marks = billIds.map(() => "?").join(",");
  const like = words.map(() => "instr(lower(t.description), ?) > 0").join(" OR ");
  const rows = db.prepare(
    `SELECT t.id, t.date, t.description, t.amount_cents, a.name AS account, t.bill_id
       FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.amount_cents < 0 AND t.same_as IS NULL AND t.date >= ?
        AND (t.bill_id IN (${marks}) ${like ? `OR (t.bill_id IS NULL AND (${like}))` : ""})
      ORDER BY t.date DESC, t.id DESC LIMIT 200`,
  ).all(since, ...billIds, ...words) as Payment[];
  return rows.map((r) => ({ ...r }));
}

/**
 * A bill's bank payments, counting the same money once: the payments of the bills that are actually charged (the
 * Loan repayment, not its Interest); if those have none matched (insurance policies), the payments of the bill that's
 * the bank's name for them (Tower Insurance).
 */
export function groupPayments(bill: Bill, bills: Bill[], since: string) {
  const { ids, covering } = billGroup(bill, bills);
  const counted = ids.filter((id) => !bills.find((b) => b.id === id)?.same_as);
  let payments = paymentsFor(counted, bills, since);
  if (!payments.length) payments = paymentsFor(ids, bills, since);
  return { ids, covering, payments };
}

/**
 * Price check over the last ~3 months: what the bank paid for these bills, against what your prices add up to.
 * `ok` when they're within 5% (or $2).
 */
export function priceCheck(groupIds: number[], bills: Bill[], payments: Payment[], since: string, today: string) {
  // up to the newest transaction there is (statements can lag behind today), so missing weeks don't look like underpaying
  const latest = (db.prepare("SELECT max(date) AS d FROM transactions").get() as { d: string | null }).d;
  const end = latest && latest < today ? latest : today;
  const days = Math.max(1, (Date.parse(end) - Date.parse(since)) / 86_400_000);
  // the bills that are actually charged (not the ones that are just the bank's name for them)
  const priced = bills.filter((b) => groupIds.includes(b.id) && !b.same_as && b.active);
  const expected = Math.round(priced.reduce((s, b) => s + (b.amount_cents * PER_YEAR[b.frequency] * days) / 365, 0));
  const paid = -payments.reduce((s, p) => s + p.amount_cents, 0);
  const diff = paid - expected;
  return { paid, expected, diff, ok: Math.abs(diff) <= Math.max(200, expected * 0.05), count: payments.length, priced };
}
