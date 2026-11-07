"use server";

import { revalidatePath } from "next/cache";
import { addDays, parseISO } from "date-fns";
import { db, run, setSetting } from "@/lib/db";
import { asFrequency, int, iso, str, toCents, toFortnightly, today } from "@/lib/format";
import { POTS, categoryForLine, parseBudgetSheet, potFor } from "@/lib/budget-sheet";
import { paymentName } from "../../utilities/lib";

function done() {
  revalidatePath("/", "layout");
}

function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Category monthly limits on the budget overview follow the fortnightly plan (× 26 ÷ 12). */
function syncCategoryLimits() {
  const rows = db.prepare("SELECT category, SUM(budget_cents) AS fn FROM budget_lines WHERE category IS NOT NULL GROUP BY category").all() as { category: string; fn: number }[];
  run("DELETE FROM budgets");
  const insert = db.prepare("INSERT INTO budgets (category, monthly_limit_cents) VALUES (?, ?)");
  for (const r of rows) if (r.fn > 0) insert.run(r.category, Math.round((r.fn * 26) / 12));
}

// ── import ──

export type SheetState = { message?: string; error?: string };

export async function importBudgetSheet(_prev: SheetState, fd: FormData): Promise<SheetState> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the budget CSV." };
  let sheet;
  try {
    sheet = parseBudgetSheet(await file.text());
  } catch (e) {
    return { error: (e as Error).message };
  }

  tx(() => {
    // keep links to scheduled payments for lines that still exist
    const links = new Map(
      (db.prepare("SELECT name, recurring_id FROM budget_lines WHERE recurring_id IS NOT NULL").all() as { name: string; recurring_id: number }[])
        .map((r) => [r.name, r.recurring_id]),
    );
    // lines added by hand in the app are kept
    run("DELETE FROM budget_lines WHERE source = 'sheet'");
    const insertLine = db.prepare(
      "INSERT INTO budget_lines (grp, name, category, pot, old_cents, actual_cents, budget_cents, recurring_id, notes, sort, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sheet')",
    );
    sheet.lines.forEach((l, i) =>
      insertLine.run(l.grp, l.name, categoryForLine(l.name), potFor(l.grp), l.old, l.actual, l.budget, links.get(l.name) ?? null, l.notes, i),
    );

    // income from the sheet is upserted by name; incomes added in the app (e.g. Paid Parental Leave) are kept
    for (const inc of sheet.income) {
      const existing = db.prepare("SELECT id FROM income_sources WHERE name = ?").get(inc.name) as { id: number } | undefined;
      if (existing) run("UPDATE income_sources SET fortnightly_cents = ? WHERE id = ?", inc.amount, existing.id);
      else run("INSERT INTO income_sources (name, fortnightly_cents, included, notes) VALUES (?, ?, 1, 'From the budget spreadsheet')", inc.name, inc.amount);
    }

    run("DELETE FROM budget_options");
    const insertOpt = db.prepare("INSERT INTO budget_options (name, saves_cents, used, notes, sort) VALUES (?, ?, ?, ?, ?)");
    sheet.options.forEach((o, i) => insertOpt.run(o.name, o.saves, o.used ? 1 : 0, o.notes, i));

    if (sheet.balances.length) {
      run("DELETE FROM balances");
      const insertBal = db.prepare("INSERT INTO balances (name, kind, amount_cents, as_of, sort) VALUES (?, ?, ?, ?, ?)");
      sheet.balances.forEach((b, i) => insertBal.run(b.name, b.kind, b.amount, sheet.balancesAsOf, i));
    }
    if (sheet.payOffDebts != null) setSetting("pay_off_debts_from_savings", sheet.payOffDebts ? "1" : "0");
    syncCategoryLimits();
  });
  done();

  return {
    message: `Loaded ${sheet.lines.length} budget lines, ${sheet.income.length} incomes, ${sheet.options.length} options and ${sheet.balances.length} balances.`,
  };
}

// ── editing ──

/** Keeps a line's scheduled payment in step with its plan amount. */
function syncScheduled(id: number | null, budget: number) {
  run(
    "UPDATE recurring_payments SET amount_cents = ? WHERE id = (SELECT recurring_id FROM budget_lines WHERE id = ?) AND frequency = 'fortnightly'",
    budget, id,
  );
}

export async function updateLine(fd: FormData) {
  const id = int(fd.get("id"));
  const budget = toCents(fd.get("budget")) ?? 0;
  run("UPDATE budget_lines SET budget_cents = ?, category = coalesce(?, category) WHERE id = ?", budget, str(fd.get("category")), id);
  syncScheduled(id, budget);
  syncCategoryLimits();
  done();
}

/** Name, group, category, account and amount from the add/edit line form. The amount can be per week, month, year… */
function lineFields(fd: FormData) {
  const name = str(fd.get("name"));
  const grp = str(fd.get("grp"));
  const pot = str(fd.get("pot"));
  if (!name || !grp) return null;
  return {
    name, grp,
    category: str(fd.get("category")),
    pot: pot && pot in POTS ? pot : "bills",
    budget: toFortnightly(toCents(fd.get("amount")) ?? 0, asFrequency(fd.get("frequency"))),
    notes: str(fd.get("notes")),
  };
}

export async function addLine(fd: FormData) {
  const f = lineFields(fd);
  if (!f) return;
  // goes at the end of its group, or at the end of the plan for a new group
  const { sort } = db.prepare(
    "SELECT coalesce((SELECT max(sort) FROM budget_lines WHERE grp = ?), (SELECT max(sort) FROM budget_lines), -1) + 1 AS sort",
  ).get(f.grp) as { sort: number };
  run("UPDATE budget_lines SET sort = sort + 1 WHERE sort >= ?", sort);
  run(
    "INSERT INTO budget_lines (grp, name, category, pot, budget_cents, notes, sort, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')",
    f.grp, f.name, f.category ?? categoryForLine(f.name), f.pot, f.budget, f.notes, sort,
  );
  syncCategoryLimits();
  done();
}

export async function editLine(fd: FormData) {
  const id = int(fd.get("id"));
  const f = lineFields(fd);
  if (!f) return;
  run(
    "UPDATE budget_lines SET grp = ?, name = ?, category = ?, pot = ?, budget_cents = ?, notes = ? WHERE id = ?",
    f.grp, f.name, f.category, f.pot, f.budget, f.notes, id,
  );
  syncScheduled(id, f.budget);
  syncCategoryLimits();
  done();
}

export async function deleteLine(fd: FormData) {
  const id = int(fd.get("id"));
  // its payday payment stops too, but stays on Repeat payments (paused) in case it's wanted back
  run("UPDATE recurring_payments SET active = 0 WHERE id = (SELECT recurring_id FROM budget_lines WHERE id = ?)", id);
  run("DELETE FROM budget_lines WHERE id = ?", id);
  syncCategoryLimits();
  done();
}

export async function setPotAccount(fd: FormData) {
  const pot = str(fd.get("pot"));
  if (!pot || !(pot in POTS)) return;
  setSetting(`pot_account:${pot}`, str(fd.get("account")) ?? "");
  done();
}

export async function toggleOption(fd: FormData) {
  run("UPDATE budget_options SET used = 1 - used WHERE id = ?", int(fd.get("id")));
  done();
}

export async function updateOption(fd: FormData) {
  run("UPDATE budget_options SET saves_cents = ? WHERE id = ?", toCents(fd.get("saves")), int(fd.get("id")));
  done();
}

export async function addIncome(fd: FormData) {
  const name = str(fd.get("name"));
  const amount = toCents(fd.get("amount"));
  if (!name || amount == null) return;
  run(
    "INSERT INTO income_sources (name, fortnightly_cents, included, ends_on, notes) VALUES (?, ?, ?, ?, ?)",
    name, amount, fd.get("included") ? 1 : 0, str(fd.get("ends_on")), str(fd.get("notes")),
  );
  done();
}

export async function updateIncome(fd: FormData) {
  run(
    "UPDATE income_sources SET fortnightly_cents = ?, ends_on = ?, included = ? WHERE id = ?",
    toCents(fd.get("amount")) ?? 0, str(fd.get("ends_on")), fd.get("included") ? 1 : 0, int(fd.get("id")),
  );
  done();
}

export async function toggleIncome(fd: FormData) {
  run("UPDATE income_sources SET included = 1 - included WHERE id = ?", int(fd.get("id")));
  done();
}

export async function deleteIncome(fd: FormData) {
  run("DELETE FROM income_sources WHERE id = ?", int(fd.get("id")));
  done();
}

export async function updateBalance(fd: FormData) {
  run("UPDATE balances SET amount_cents = ?, as_of = ? WHERE id = ?", toCents(fd.get("amount")) ?? 0, today(), int(fd.get("id")));
  done();
}

export async function togglePayOffDebts(fd: FormData) {
  setSetting("pay_off_debts_from_savings", fd.get("value") === "1" ? "1" : "0");
  done();
}

// ── payday: put the bills pot on the calendar ──

const PROVIDERS = ["2degrees", "Spark", "One NZ", "Northland Waste", "Tower", "Westpac", "Hometown District Council", "Contact", "Mercury", "Genesis", "Meridian", "UDC"];
const UTILITY_KIND: Record<string, string> = {
  Utilities: "Power", Phone: "Phone", Rubbish: "Other", Rates: "Rates", Mortgage: "Mortgage", Insurance: "Insurance",
};

// The mortgage line doesn't name the bank; the statements are all Westpac.
const DEFAULT_PROVIDER: Record<string, string> = { Mortgage: "Westpac" };

function providerOf(name: string, notes: string | null, category: string) {
  const text = `${name} ${notes ?? ""}`;
  return PROVIDERS.find((p) => text.toLowerCase().includes(p.toLowerCase())) ?? DEFAULT_PROVIDER[category] ?? name;
}

/** Saves the next payday and creates (or updates) a fortnightly payment for every bill in the plan.
 *  Utility-type bills also appear on the Utilities tab, and the car loan on the Car tab. */
export async function setPayday(fd: FormData) {
  const date = str(fd.get("payday"));
  if (!date) return;
  let next = parseISO(date);
  while (iso(next) < today()) next = addDays(next, 14);
  const due = iso(next);
  setSetting("next_payday", due);

  const lines = db.prepare("SELECT * FROM budget_lines WHERE pot = 'bills' AND budget_cents > 0").all() as {
    id: number; name: string; category: string | null; budget_cents: number; recurring_id: number | null; notes: string | null;
  }[];

  tx(() => {
    for (const l of lines) {
      const existing = l.recurring_id != null && db.prepare("SELECT 1 FROM recurring_payments WHERE id = ?").get(l.recurring_id);
      if (existing) {
        run("UPDATE recurring_payments SET amount_cents = ?, next_due = ?, frequency = 'fortnightly' WHERE id = ?", l.budget_cents, due, l.recurring_id);
        continue;
      }

      const kind = l.category ? UTILITY_KIND[l.category] : undefined;
      let recurringId: number;
      if (kind) {
        const provider = providerOf(l.name, l.notes, l.category!);
        recurringId = Number(run(
          "INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, linked_type, notes) VALUES (?, ?, 'fortnightly', ?, ?, 'utility', ?)",
          paymentName(l.category!, provider), l.budget_cents, due, l.category, "From the fortnightly budget",
        ).lastInsertRowid);
        const utilityId = Number(run(
          "INSERT INTO utilities (kind, provider, plan, recurring_id, notes) VALUES (?, ?, ?, ?, ?)",
          kind, provider, l.name, recurringId, l.notes,
        ).lastInsertRowid);
        run("UPDATE recurring_payments SET linked_id = ? WHERE id = ?", utilityId, recurringId);
      } else if (l.category === "Car loan") {
        const carName = /outlander/i.test(l.name) ? "Outlander" : "Car";
        let car = db.prepare("SELECT id FROM vehicles WHERE name LIKE ?").get(`%${carName}%`) as { id: number } | undefined;
        if (!car) {
          car = { id: Number(run("INSERT INTO vehicles (name, make, model) VALUES (?, ?, ?)", carName, carName === "Outlander" ? "Mitsubishi" : null, carName === "Outlander" ? "Outlander" : null).lastInsertRowid) };
        }
        recurringId = Number(run(
          "INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, linked_type, linked_id, notes) VALUES (?, ?, 'fortnightly', ?, 'Car loan', 'vehicle', ?, ?)",
          l.name, l.budget_cents, due, car.id, l.notes,
        ).lastInsertRowid);
      } else {
        recurringId = Number(run(
          "INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, notes) VALUES (?, ?, 'fortnightly', ?, ?, ?)",
          l.name, l.budget_cents, due, l.category, l.notes,
        ).lastInsertRowid);
      }
      run("UPDATE budget_lines SET recurring_id = ? WHERE id = ?", recurringId, l.id);
    }
  });
  done();
}
