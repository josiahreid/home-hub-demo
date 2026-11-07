import "server-only";
import { addDays, parseISO } from "date-fns";
import { all, getSetting } from "./db";
import { daysUntil, iso, today } from "./format";

export type PlanRow = {
  id: number; name: string; target_cents: number; saved_cents: number;
  start_date: string; target_date: string; event_id: number | null; notes: string | null; status: string;
  event_title: string | null;
};

/** A savings requirement: a plan, or an upcoming event with a budget that has no plan yet. */
export type Need = {
  key: string; name: string; href: string;
  remaining: number; from: string; to: string; perWeek: number; weeks: number;
};

export type Clash = { from: string; to: string; required: number; capacity: number; names: string[] };

export function weeklyCapacity(): number | null {
  const v = getSetting("savings_per_week_cents");
  return v ? Number(v) : null;
}

function need(key: string, name: string, href: string, remaining: number, start: string, target: string): Need {
  const from = start > today() ? start : today();
  const weeks = Math.max(1, Math.ceil((daysUntil(target) - Math.max(0, daysUntil(from))) / 7));
  return { key, name, href, remaining, from, to: target, weeks, perWeek: Math.ceil(Math.max(0, remaining) / weeks) };
}

export async function savingsNeeds(): Promise<{ plans: PlanRow[]; needs: Need[] }> {
  const plans = await all<PlanRow>(
    `SELECT p.*, e.title AS event_title FROM plans p LEFT JOIN events e ON e.id = p.event_id
      ORDER BY p.status = 'active' DESC, p.target_date`);
  const events = await all<{ id: number; title: string; start_date: string; budget_cents: number }>(
    `SELECT id, title, start_date, budget_cents FROM events
      WHERE budget_cents > 0 AND start_date >= ? AND id NOT IN (SELECT event_id FROM plans WHERE event_id IS NOT NULL)`,
    today());

  const needs: Need[] = [];
  for (const p of plans) {
    if (p.status !== "active" || p.target_date < today()) continue;
    needs.push(need(`plan-${p.id}`, p.name, "/budget/plans", p.target_cents - p.saved_cents, p.start_date, p.target_date));
  }
  for (const e of events) {
    needs.push(need(`event-${e.id}`, `${e.title} (event)`, `/calendar?event=${e.id}`, e.budget_cents, today(), e.start_date));
  }
  return { plans, needs };
}

/** Week-by-week total required saving; runs of weeks over capacity become clashes. */
export function findClashes(needs: Need[], capacity: number | null) {
  const last = needs.reduce((m, n) => (n.to > m ? n.to : m), today());
  const weeks: { start: string; required: number; names: string[] }[] = [];
  for (let d = parseISO(today()); iso(d) <= last && weeks.length < 156; d = addDays(d, 7)) {
    const start = iso(d);
    const end = iso(addDays(d, 6));
    const active = needs.filter((n) => n.from <= end && n.to >= start && n.remaining > 0);
    weeks.push({ start, required: active.reduce((s, n) => s + n.perWeek, 0), names: active.map((n) => n.name) });
  }

  const clashes: Clash[] = [];
  if (capacity != null) {
    for (const w of weeks) {
      const prev = clashes.at(-1);
      if (w.required <= capacity) continue;
      const sameGroup = prev && iso(addDays(parseISO(prev.to), 1)) === w.start && prev.names.join() === w.names.join();
      if (sameGroup) {
        prev.to = iso(addDays(parseISO(w.start), 6));
        prev.required = Math.max(prev.required, w.required);
      } else {
        clashes.push({ from: w.start, to: iso(addDays(parseISO(w.start), 6)), required: w.required, capacity, names: w.names });
      }
    }
  }
  return { weeks, clashes };
}
