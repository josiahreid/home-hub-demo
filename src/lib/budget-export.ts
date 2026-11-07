import "server-only";
import { all, getSetting } from "./db";
import { loadPlan } from "./budget-plan";
import { savingsNeeds, weeklyCapacity } from "./plans";
import { perMonth, type Frequency } from "./format";

/** Everything in the Budget tab, in one object, for the Excel and PDF exports. */
export async function budgetExport() {
  const plan = await loadPlan();
  const [recurring, transactions, limits, goals, receipts, accounts] = await Promise.all([
    all<{ name: string; amount_cents: number; frequency: Frequency; next_due: string; category: string | null; linked_type: string | null; active: number; notes: string | null }>(
      "SELECT name, amount_cents, frequency, next_due, category, linked_type, active, notes FROM recurring_payments ORDER BY active DESC, next_due"),
    all<{ date: string; description: string; amount_cents: number; category: string | null; account: string | null; source: string; notes: string | null }>(
      `SELECT t.date, t.description, t.amount_cents, t.category, a.name AS account, t.source, t.notes
         FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id ORDER BY t.date DESC, t.id DESC`),
    all<{ category: string; monthly_limit_cents: number }>("SELECT category, monthly_limit_cents FROM budgets ORDER BY category"),
    all<{ name: string; target_cents: number; saved_cents: number; start_date: string; target_date: string; status: string; notes: string | null }>(
      "SELECT name, target_cents, saved_cents, start_date, target_date, status, notes FROM plans ORDER BY status = 'active' DESC, target_date"),
    all<{ date: string | null; store: string | null; total_cents: number | null; is_meal_prep: number; notes: string | null }>(
      "SELECT date, store, total_cents, is_meal_prep, notes FROM receipts ORDER BY date DESC"),
    all<{ name: string; institution: string | null; kind: string }>("SELECT name, institution, kind FROM accounts ORDER BY name"),
  ]);
  const { needs } = await savingsNeeds();
  return {
    generated: new Date(),
    nextPayday: getSetting("next_payday") ?? null,
    plan,
    recurring: recurring.map((r) => ({ ...r, monthly_cents: perMonth(r.amount_cents, r.frequency) })),
    transactions, limits, goals, needs, receipts, accounts,
    weeklyCapacity: weeklyCapacity(),
  };
}

export type BudgetExport = Awaited<ReturnType<typeof budgetExport>>;
