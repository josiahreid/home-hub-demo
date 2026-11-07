import "server-only";
import { db, getSetting } from "./db";
import { allBills, paymentsFor } from "./bill-links";
import type { Fortnight } from "./budget";

/**
 * Buckets: each pot made of lines (Bills = Mortgage $850 + Rates $150 + …), each line's actual spending this
 * fortnight, the pots' real bank balances (from the Akahu feed), and the gap between pay and pots with the ways to
 * close it and how long savings last.
 */

export type BucketLine = { id: number; name: string; pot: string; budget_cents: number; category: string | null; recurring_id: number | null; notes: string | null; sort: number };
export type Account = { id: number; name: string; kind: string; balance_cents: number | null; balance_at: string | null };
export type Option = { id: number; name: string; saves_cents: number | null; used: number; notes: string | null };

export const bucketLines = () =>
  (db.prepare("SELECT id, name, pot, budget_cents, category, recurring_id, notes, sort FROM budget_lines ORDER BY sort, id").all() as BucketLine[]).map((l) => ({ ...l }));

/** A pot that has lines is the total of its lines. */
export function syncPotTotals() {
  db.exec(`UPDATE pots SET fortnightly_cents = (SELECT coalesce(sum(budget_cents), 0) FROM budget_lines l WHERE l.pot = pots.key)
            WHERE EXISTS (SELECT 1 FROM budget_lines l WHERE l.pot = pots.key)`);
}

/**
 * What each line actually cost this fortnight: a line linked to a bill = that bill's bank payments; otherwise its
 * category's spending – but only when no other line uses that category (two lines on "Transport" can't be told apart).
 * Null = can't tell (the pot's own total still shows).
 */
export function lineActuals(lines: BucketLine[], f: Fortnight, spent: Map<string, number>) {
  const bills = allBills();
  const shared = new Map<string, number>();
  for (const l of lines) if (l.category) shared.set(l.category, (shared.get(l.category) ?? 0) + 1);
  const out = new Map<number, number | null>();
  for (const l of lines) {
    if (l.recurring_id) {
      const paid = paymentsFor([l.recurring_id], bills, f.start).filter((p) => p.date <= f.end);
      out.set(l.id, Math.abs(paid.reduce((s, p) => s + p.amount_cents, 0)));
    } else if (l.category && shared.get(l.category) === 1) {
      out.set(l.id, spent.get(l.category) ?? 0);
    } else out.set(l.id, null);
  }
  return out;
}

export const accountsWithBalances = () =>
  (db.prepare("SELECT id, name, kind, balance_cents, balance_at FROM accounts ORDER BY name").all() as Account[]).map((a) => ({ ...a }));

/**
 * The gap and the savings runway. Savings come from the real balances when the bank feed has them (everyday and
 * savings accounts; a card's balance is what's owing), otherwise from the balances typed in or imported.
 */
export function gapAndRunway(incomeFn: number, potsFn: number) {
  const options = (db.prepare("SELECT id, name, saves_cents, used, notes FROM budget_options ORDER BY sort, id").all() as Option[]).map((o) => ({ ...o }));
  const gap = incomeFn - potsFn;
  const chosen = options.filter((o) => o.used).reduce((s, o) => s + (o.saves_cents ?? 0), 0);
  const after = gap + chosen;

  const accounts = accountsWithBalances();
  const live = accounts.filter((a) => a.balance_cents != null);
  let cash: number, debt: number, source: "bank" | "typed", asOf: string | null;
  if (live.length) {
    cash = live.filter((a) => a.kind === "everyday" || a.kind === "savings").reduce((s, a) => s + Math.max(0, a.balance_cents!), 0);
    debt = live.filter((a) => a.kind === "credit").reduce((s, a) => s + Math.max(0, -a.balance_cents!), 0);
    source = "bank";
    asOf = live.map((a) => a.balance_at!).sort().at(-1) ?? null;
  } else {
    const typed = db.prepare("SELECT kind, amount_cents, as_of FROM balances").all() as { kind: string; amount_cents: number; as_of: string | null }[];
    cash = typed.filter((b) => b.kind === "cash").reduce((s, b) => s + b.amount_cents, 0);
    debt = typed.filter((b) => b.kind === "debt").reduce((s, b) => s + b.amount_cents, 0);
    source = "typed";
    asOf = typed.find((b) => b.as_of)?.as_of ?? null;
  }
  const payOffDebts = getSetting("pay_off_debts_from_savings") !== "0";
  const starting = payOffDebts ? cash - debt : cash;
  const fortnights = after < 0 ? Math.max(0, starting) / -after : null;
  return { options, gap, chosen, after, cash, debt, payOffDebts, starting, fortnights, source, asOf, live: live.length };
}

/** Words that pick out a bill for a spreadsheet line ("Mortgage" → the bank's "Loan repayment"). */
const LINE_BILL_WORDS: [RegExp, string[]][] = [
  [/mortgage/i, ["loan repayment", "mortgage"]],
  [/rates/i, ["district council", "rates"]],
  [/car loan|udc/i, ["udc"]],
  [/tower/i, ["tower"]],
  [/2degrees|power|internet/i, ["2degrees"]],
  [/spark|phone/i, ["spark"]],
  [/rubbish|waste/i, ["northland", "waste"]],
];

/** The bill a spreadsheet line is paid by, if one is tracked on Bills. */
export function billForLine(name: string): number | null {
  const words = LINE_BILL_WORDS.find(([re]) => re.test(name))?.[1];
  if (!words) return null;
  // the bank's name for a payment counts too (a "Tower Insurance" bill marked same money as the policies)
  const bills = allBills().filter((b) => b.active);
  const hit = bills.find((b) => words.some((w) => `${b.name} ${b.match ?? ""}`.toLowerCase().includes(w)));
  return hit?.id ?? null;
}
