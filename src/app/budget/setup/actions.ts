"use server";

import { revalidatePath } from "next/cache";
import { db, run, setSetting } from "@/lib/db";
import { int, str, toCents } from "@/lib/format";
import { categoryList } from "@/lib/category-list";

function done() {
  revalidatePath("/", "layout");
}

/** Any payday (past or future) – the fortnights are counted from it. */
export async function savePayday(fd: FormData) {
  const date = str(fd.get("payday"));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  setSetting("next_payday", date);
  done();
}

// amounts can be typed per week, month or year – pots are kept per fortnight
const PER: Record<string, (c: number) => number> = {
  week: (c) => c * 2,
  fortnight: (c) => c,
  month: (c) => Math.round((c * 12) / 26),
  year: (c) => Math.round(c / 26),
};

/** One pot: its name, how much goes in each payday, which spending comes out of it, and its bank account. */
export async function savePot(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (!id || !name) return;
  const amount = toCents(fd.get("amount")) ?? 0;
  const per = PER[String(fd.get("per"))] ?? PER.fortnight;
  const cats = fd.getAll("cats").map(String).filter((c) => [...categoryList().spending, "Savings"].includes(c));
  // a category comes out of one pot only
  for (const c of cats) {
    const others = db.prepare("SELECT id, categories FROM pots WHERE id != ?").all(id) as { id: number; categories: string }[];
    for (const o of others) {
      const list = o.categories.split(",").filter((x) => x && x !== c);
      run("UPDATE pots SET categories = ? WHERE id = ?", list.join(","), o.id);
    }
  }
  run("UPDATE pots SET name = ?, fortnightly_cents = ?, categories = ?, account_id = ? WHERE id = ?", name, per(amount), cats.join(","), int(fd.get("account_id")), id);
  done();
}

export async function addPot(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) return;
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM pots").get() as { n: number };
  run("INSERT INTO pots (key, name, sort) VALUES (?, ?, ?)", `pot-${Date.now()}`, name, n);
  done();
}

export async function deletePot(fd: FormData) {
  run("DELETE FROM pots WHERE id = ?", int(fd.get("id")));
  done();
}

/** On payday morning: last fortnight's summary as a push notification (and Telegram, if it's connected). */
export async function savePaydaySummary(fd: FormData) {
  setSetting("payday_summary", fd.has("on") ? "1" : "0");
  done();
}

// ── buckets: lines, the spreadsheet, ways to close the gap ──

export type ImportState = { message?: string; error?: string };

/**
 * Loads the budget spreadsheet (.xlsx – its "claude" tab – or CSV): each NEW-budget line into its bucket, the ways to
 * close the gap and the account balances. Your pay is kept if it's already set; lines you added in the app are kept.
 */
export async function importBuckets(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const { parseBudgetRows, parseBudgetSheet, potFor, bucketCategory, xlsxRows } = await import("@/lib/budget-sheet");
  const { billForLine, syncPotTotals } = await import("@/lib/buckets");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the budget spreadsheet (.xlsx or .csv)." };
  let sheet;
  try {
    sheet = /\.xlsx$/i.test(file.name) ? parseBudgetRows(xlsxRows(new Uint8Array(await file.arrayBuffer()))) : parseBudgetSheet(await file.text());
  } catch (e) {
    return { error: (e as Error).message };
  }
  const custom = categoryList().custom.map((c) => c.name);
  const potKeys = new Set((db.prepare("SELECT key FROM pots").all() as { key: string }[]).map((p) => p.key));
  const keptPay = (db.prepare("SELECT count(*) AS n FROM income_sources").get() as { n: number }).n > 0;
  db.exec("BEGIN");
  try {
    run("DELETE FROM budget_lines WHERE source = 'sheet'");
    sheet.lines.forEach((l, i) => {
      const pot = potFor(l.grp);
      run(
        "INSERT INTO budget_lines (grp, name, category, pot, old_cents, actual_cents, budget_cents, recurring_id, notes, sort, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sheet')",
        l.grp, l.name, bucketCategory(l.name, custom), potKeys.has(pot) ? pot : "bills", l.old, l.actual, l.budget, billForLine(l.name), l.notes, i,
      );
    });
    // the pay is only filled in when there's none yet – otherwise it'd be counted twice ("Default Name Income" and "Default Name Pay")
    if (!keptPay) for (const inc of sheet.income.filter((x) => x.amount > 0)) run("INSERT INTO income_sources (name, fortnightly_cents, included) VALUES (?, ?, 1)", inc.name, inc.amount);
    run("DELETE FROM budget_options");
    sheet.options.forEach((o, i) => run("INSERT INTO budget_options (name, saves_cents, used, notes, sort) VALUES (?, ?, ?, ?, ?)", o.name, o.saves, o.used ? 1 : 0, o.notes, i));
    if (sheet.balances.length) {
      run("DELETE FROM balances");
      sheet.balances.forEach((b, i) => run("INSERT INTO balances (name, kind, amount_cents, as_of, sort) VALUES (?, ?, ?, ?, ?)", b.name, b.kind, b.amount, sheet.balancesAsOf, i));
    }
    if (sheet.payOffDebts != null) setSetting("pay_off_debts_from_savings", sheet.payOffDebts ? "1" : "0");
    syncPotTotals();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return { error: (e as Error).message };
  }
  done();
  return {
    message: `Loaded ${sheet.lines.length} lines into the buckets, ${sheet.options.length} ways to close the gap and ${sheet.balances.length} balances.${keptPay ? " Your pay was kept as it is." : ""}`,
  };
}

/** One line in a bucket: name, amount (per week/fortnight/month/year), what it's tracked as, and the bill that pays it. */
function lineValues(fd: FormData) {
  const per = PER[String(fd.get("per"))] ?? PER.fortnight;
  const cat = str(fd.get("category"));
  const bill = int(fd.get("recurring_id"));
  return [
    (str(fd.get("name")) ?? "Line").slice(0, 80),
    per(toCents(fd.get("amount")) ?? 0),
    cat && categoryList().all.includes(cat) ? cat : null,
    bill && db.prepare("SELECT 1 FROM recurring_payments WHERE id = ?").get(bill) ? bill : null,
    str(fd.get("notes")),
  ] as const;
}

export async function addBucketLine(fd: FormData) {
  const pot = str(fd.get("pot"));
  if (!pot || !str(fd.get("name"))) return;
  const { syncPotTotals } = await import("@/lib/buckets");
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM budget_lines").get() as { n: number };
  const [name, cents, cat, bill, notes] = lineValues(fd);
  const grp = (db.prepare("SELECT name FROM pots WHERE key = ?").get(pot) as { name: string } | undefined)?.name ?? pot;
  run("INSERT INTO budget_lines (grp, name, budget_cents, category, recurring_id, notes, pot, sort, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')",
    grp, name, cents, cat, bill, notes, pot, n);
  syncPotTotals();
  done();
}

export async function saveBucketLine(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const { syncPotTotals } = await import("@/lib/buckets");
  const [name, cents, cat, bill, notes] = lineValues(fd);
  const pot = str(fd.get("pot"));
  run("UPDATE budget_lines SET name = ?, budget_cents = ?, category = ?, recurring_id = ?, notes = ?, pot = coalesce(?, pot) WHERE id = ?", name, cents, cat, bill, notes, pot, id);
  syncPotTotals();
  done();
}

export async function deleteBucketLine(fd: FormData) {
  const { syncPotTotals } = await import("@/lib/buckets");
  run("DELETE FROM budget_lines WHERE id = ?", int(fd.get("id")));
  syncPotTotals();
  // (when a pot's last line goes, the pot keeps its last total until it's typed again)
  done();
}

/** A way to close the gap (or something that costs, like keeping life cover – a negative amount). */
export async function addGapOption(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) return;
  const per = PER[String(fd.get("per"))] ?? PER.fortnight;
  const cents = per(toCents(fd.get("amount")) ?? 0) * (fd.get("kind") === "costs" ? -1 : 1);
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM budget_options").get() as { n: number };
  run("INSERT INTO budget_options (name, saves_cents, used, notes, sort) VALUES (?, ?, 0, ?, ?)", name.slice(0, 100), cents, str(fd.get("notes")), n);
  done();
}

export async function toggleGapOption(fd: FormData) {
  run("UPDATE budget_options SET used = 1 - used WHERE id = ?", int(fd.get("id")));
  done();
}

export async function deleteGapOption(fd: FormData) {
  run("DELETE FROM budget_options WHERE id = ?", int(fd.get("id")));
  done();
}

export async function setPayOffDebts(fd: FormData) {
  setSetting("pay_off_debts_from_savings", fd.has("on") ? "1" : "0");
  done();
}
