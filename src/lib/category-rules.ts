import "server-only";
import { db } from "./db";

/** Applies the shop rules to uncategorised transactions (or all of them when `overwrite`). Returns rows changed. */
export function applyRules(overwrite: boolean): number {
  const rules = db.prepare("SELECT pattern, category FROM category_rules ORDER BY length(pattern) DESC").all() as { pattern: string; category: string }[];
  let changed = 0;
  const update = db.prepare(
    `UPDATE transactions SET category = ? WHERE instr(lower(description), ?) > 0 ${overwrite ? "" : "AND category IS NULL"}`,
  );
  // The longest (most specific) matching pattern should win: when only filling blanks the first
  // match sticks, so go longest-first; when overwriting the last match sticks, so go shortest-first.
  for (const r of overwrite ? [...rules].reverse() : rules) changed += Number(update.run(r.category, r.pattern).changes);
  return changed;
}
