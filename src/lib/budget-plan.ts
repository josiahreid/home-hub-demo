import "server-only";
import { addDays, parseISO } from "date-fns";
import { all, getSetting } from "./db";
import { iso, today } from "./format";
import { POTS } from "./budget-sheet";

export type Line = {
  id: number; grp: string; name: string; category: string | null; pot: string;
  old_cents: number | null; actual_cents: number | null; budget_cents: number;
  recurring_id: number | null; notes: string | null; sort: number; source: "sheet" | "manual";
};
export type Income = { id: number; name: string; fortnightly_cents: number; included: number; ends_on: string | null; notes: string | null };
export type Option = { id: number; name: string; saves_cents: number | null; used: number; notes: string | null };
export type Balance = { id: number; name: string; kind: "cash" | "debt"; amount_cents: number; as_of: string | null };

/** Everything the fortnightly plan, home page and budget overview need, worked out in one place. */
export async function loadPlan() {
  const [lines, income, options, balances] = await Promise.all([
    all<Line>("SELECT * FROM budget_lines ORDER BY sort, id"),
    all<Income>("SELECT * FROM income_sources ORDER BY included DESC, fortnightly_cents DESC"),
    all<Option>("SELECT * FROM budget_options ORDER BY sort, id"),
    all<Balance>("SELECT * FROM balances ORDER BY sort, id"),
  ]);

  // Income that has ended no longer counts.
  const activeIncome = income.filter((i) => i.included && (!i.ends_on || i.ends_on >= today()));
  const incomeFn = activeIncome.reduce((s, i) => s + i.fortnightly_cents, 0);
  const outgoingFn = lines.reduce((s, l) => s + l.budget_cents, 0);
  const remaining = incomeFn - outgoingFn;
  const chosen = options.filter((o) => o.used).reduce((s, o) => s + (o.saves_cents ?? 0), 0);
  const afterOptions = remaining + chosen;

  const cash = balances.filter((b) => b.kind === "cash").reduce((s, b) => s + b.amount_cents, 0);
  const debt = balances.filter((b) => b.kind === "debt").reduce((s, b) => s + b.amount_cents, 0);
  const payOffDebts = getSetting("pay_off_debts_from_savings") !== "0";
  const startingSavings = payOffDebts ? cash - debt : cash;
  const runwayFortnights = afterOptions < 0 ? startingSavings / -afterOptions : null;
  const projection = Array.from({ length: 26 }, (_, i) => startingSavings + afterOptions * (i + 1));

  const groups = [...Map.groupBy(lines, (l) => l.grp)].map(([name, items]) => ({
    name, items,
    old: items.reduce((s, l) => s + (l.old_cents ?? 0), 0),
    actual: items.reduce((s, l) => s + (l.actual_cents ?? 0), 0),
    budget: items.reduce((s, l) => s + l.budget_cents, 0),
  }));
  const pots = Map.groupBy(lines, (l) => l.pot);
  // the real bank account each payday pot goes into, e.g. "Bills – Westpac 01-0123…"
  const potAccounts = new Map(Object.keys(POTS).map((k) => [k, getSetting(`pot_account:${k}`) ?? ""]));

  return {
    lines, groups, income, options, balances, pots, potAccounts,
    incomeFn, outgoingFn, remaining, chosen, afterOptions,
    cash, debt, payOffDebts, startingSavings, runwayFortnights, projection,
    asOf: balances.find((b) => b.as_of)?.as_of ?? null,
  };
}

/** Current pay fortnight [start, end] based on the saved next payday, or null if not set. */
export function currentFortnight(): { start: string; end: string; payday: string } | null {
  const saved = getSetting("next_payday");
  if (!saved) return null;
  let payday = parseISO(saved);
  // roll forward/back to the payday that ends the current fortnight
  while (iso(payday) <= today()) payday = addDays(payday, 14);
  while (iso(addDays(payday, -14)) > today()) payday = addDays(payday, -14);
  return { start: iso(addDays(payday, -14)), end: iso(addDays(payday, -1)), payday: iso(payday) };
}
