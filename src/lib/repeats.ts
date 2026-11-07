import "server-only";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { all, getSetting } from "./db";
import { advance, today, type Frequency } from "./format";

/**
 * The part of a statement line that stays the same each time ("NETFLIX.COM 4412*" → "netflix.com"),
 * used to group repeats and to match them against payments already tracked or hidden.
 */
export function repeatKey(description: string): string {
  return description.toLowerCase().split(" · ")[0].replace(/[\d*#]+/g, "").replace(/\s+/g, " ").trim();
}

/** Suggestions hidden with "Not a repeat". */
export function hiddenRepeats(): string[] {
  try {
    const v = JSON.parse(getSetting("repeat_hidden") ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type RepeatSuggestion = {
  key: string; name: string; amount: number; frequency: Frequency; count: number; last: string; next: string; category: string | null;
};

/** Outgoing payments that repeat at a steady interval in the last 6 months of statements, minus ones already tracked or hidden. */
export async function detectRepeats(): Promise<RepeatSuggestion[]> {
  const tracked = (await all<{ name: string }>("SELECT name FROM recurring_payments")).map((r) => repeatKey(r.name)).filter((k) => k.length >= 3);
  const hidden = new Set(hiddenRepeats());
  const tx = await all<{ date: string; description: string; amount_cents: number; category: string | null }>(
    "SELECT date, description, amount_cents, category FROM transactions WHERE amount_cents < 0 AND date >= date('now', '-6 months') ORDER BY date");
  const groups = new Map<string, typeof tx>();
  for (const t of tx) {
    const key = repeatKey(t.description);
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const out: RepeatSuggestion[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3 || hidden.has(key) || tracked.some((k) => k.includes(key) || key.includes(k))) continue;
    const gaps = list.slice(1).map((t, i) => differenceInCalendarDays(parseISO(t.date), parseISO(list[i].date))).sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    const frequency: Frequency | null =
      median >= 6 && median <= 8 ? "weekly" : median >= 13 && median <= 15 ? "fortnightly" :
      median >= 27 && median <= 33 ? "monthly" : median >= 85 && median <= 95 ? "quarterly" : null;
    if (!frequency) continue;
    const last = list.at(-1)!;
    let next = advance(last.date, frequency);
    while (next < today()) next = advance(next, frequency);
    out.push({
      key, frequency, count: list.length, last: last.date, next, category: last.category,
      name: last.description.split(" · ")[0].slice(0, 40), amount: -last.amount_cents,
    });
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 15);
}
