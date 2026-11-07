"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run, setSetting } from "@/lib/db";
import { advance, int, str, toCents, today, type Frequency } from "@/lib/format";
import { DEFAULT_RULES, parseStatement, txHash } from "@/lib/statements";
import { saveUpload } from "@/lib/uploads";
import { importStatementBytes, type FileResult } from "@/lib/statement-import";
import { applyRules } from "@/lib/category-rules";
import { addCategory, categoryList, customCategories } from "@/lib/category-list";
import { hiddenRepeats } from "@/lib/repeats";

function done() {
  revalidatePath("/", "layout");
}

// ── transactions ──

export async function addTransaction(fd: FormData) {
  const amount = toCents(fd.get("amount"));
  if (amount == null) return;
  const out = fd.get("direction") !== "in";
  run(
    "INSERT INTO transactions (account_id, date, description, amount_cents, category, source, notes) VALUES (?, ?, ?, ?, ?, 'manual', ?)",
    int(fd.get("account_id")), str(fd.get("date")) ?? today(), str(fd.get("description")) ?? "Manual entry",
    out ? -Math.abs(amount) : Math.abs(amount), str(fd.get("category")), str(fd.get("notes")),
  );
  done();
}

export async function setCategory(fd: FormData) {
  const id = int(fd.get("id"));
  const category = str(fd.get("category"));
  run("UPDATE transactions SET category = ? WHERE id = ?", category, id);
  // Optionally remember it for future imports.
  const pattern = str(fd.get("rule"));
  if (pattern && category) {
    run("INSERT INTO category_rules (pattern, category) VALUES (?, ?)", pattern.toLowerCase(), category);
    applyRules(true);
  }
  done();
}

export async function deleteTransaction(fd: FormData) {
  run("DELETE FROM transactions WHERE id = ?", int(fd.get("id")));
  done();
}

// ── import ──

export type ImportState = { message?: string; error?: string };

export async function importStatement(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };
  let accountId = int(fd.get("account_id"));
  const newAccount = str(fd.get("new_account"));
  if (newAccount) {
    accountId = Number(run("INSERT INTO accounts (name, institution) VALUES (?, ?)", newAccount, str(fd.get("institution"))).lastInsertRowid);
  }

  let parsed;
  try {
    parsed = parseStatement(await file.text());
  } catch (e) {
    return { error: (e as Error).message };
  }

  const insert = db.prepare(
    "INSERT OR IGNORE INTO transactions (account_id, date, description, amount_cents, source, import_hash) VALUES (?, ?, ?, ?, 'import', ?)",
  );
  const seen = new Map<string, number>();
  let added = 0;
  db.exec("BEGIN");
  try {
    for (const t of parsed.rows) {
      const k = `${t.date}|${t.amountCents}|${t.description}`;
      const nth = seen.get(k) ?? 0;
      seen.set(k, nth + 1);
      added += Number(insert.run(accountId, t.date, t.description, t.amountCents, txHash(accountId, t, nth)).changes);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return { error: (e as Error).message };
  }
  const categorised = applyRules(false);
  done();

  const dup = parsed.rows.length - added;
  return {
    message:
      `Imported ${added} new transaction${added === 1 ? "" : "s"}` +
      (dup ? `, skipped ${dup} already imported` : "") +
      (parsed.skipped ? `, ignored ${parsed.skipped} unreadable row${parsed.skipped === 1 ? "" : "s"}` : "") +
      `. Auto-categorised ${categorised}. Columns used: date “${parsed.columns.date}”, amount “${parsed.columns.amount}”, description ${parsed.columns.description.map((c) => `“${c}”`).join(" + ")}.`,
  };
}

// ── rules, budgets, settings ──

export async function addRule(fd: FormData) {
  const pattern = str(fd.get("pattern"));
  const category = str(fd.get("category"));
  if (!pattern || !category) return;
  run("INSERT INTO category_rules (pattern, category) VALUES (?, ?)", pattern.toLowerCase(), category);
  applyRules(false);
  done();
}

export async function deleteRule(fd: FormData) {
  run("DELETE FROM category_rules WHERE id = ?", int(fd.get("id")));
  done();
}

export async function loadStarterRules() {
  const insert = db.prepare("INSERT INTO category_rules (pattern, category) VALUES (?, ?)");
  for (const [p, c] of DEFAULT_RULES) insert.run(p, c);
  applyRules(false);
  done();
}

export async function reapplyRules() {
  applyRules(true);
  done();
}

export async function setBudget(fd: FormData) {
  const category = str(fd.get("category"));
  const limit = toCents(fd.get("limit"));
  if (!category) return;
  if (limit == null || limit === 0) run("DELETE FROM budgets WHERE category = ?", category);
  else run(
    "INSERT INTO budgets (category, monthly_limit_cents) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET monthly_limit_cents = excluded.monthly_limit_cents",
    category, limit,
  );
  done();
}

export async function saveCapacity(fd: FormData) {
  const v = toCents(fd.get("capacity"));
  setSetting("savings_per_week_cents", String(v ?? 0));
  done();
}

// ── recurring payments ──

export async function addRecurring(fd: FormData) {
  const amount = toCents(fd.get("amount"));
  const name = str(fd.get("name"));
  if (!name || amount == null) return;
  run(
    "INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, notes) VALUES (?, ?, ?, ?, ?, ?)",
    name, Math.abs(amount), str(fd.get("frequency")) ?? "monthly", str(fd.get("next_due")) ?? today(),
    str(fd.get("category")), str(fd.get("notes")),
  );
  done();
}

/** "Not a repeat": hides a suggestion on Repeat payments for good. */
export async function hideRepeat(fd: FormData) {
  const key = str(fd.get("key"));
  if (!key) return;
  setSetting("repeat_hidden", JSON.stringify([...new Set([...hiddenRepeats(), key])]));
  done();
}

export async function showHiddenRepeats() {
  run("DELETE FROM settings WHERE key = 'repeat_hidden'");
  done();
}

export async function markRecurringPaid(fd: FormData) {
  const id = int(fd.get("id"));
  const row = db.prepare("SELECT next_due, frequency FROM recurring_payments WHERE id = ?").get(id) as { next_due: string; frequency: Frequency } | undefined;
  if (row) run("UPDATE recurring_payments SET next_due = ? WHERE id = ?", advance(row.next_due, row.frequency), id);
  done();
}

export async function toggleRecurring(fd: FormData) {
  run("UPDATE recurring_payments SET active = 1 - active WHERE id = ?", int(fd.get("id")));
  done();
}

export async function deleteRecurring(fd: FormData) {
  run("DELETE FROM recurring_payments WHERE id = ?", int(fd.get("id")));
  done();
}

// ── plans ──

export async function addPlan(fd: FormData) {
  const name = str(fd.get("name"));
  const target = toCents(fd.get("target"));
  const date = str(fd.get("target_date"));
  if (!name || target == null || !date) return;
  run(
    "INSERT INTO plans (name, target_cents, saved_cents, start_date, target_date, event_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    name, target, toCents(fd.get("saved")) ?? 0, str(fd.get("start_date")) ?? today(), date, int(fd.get("event_id")), str(fd.get("notes")),
  );
  done();
}

export async function contributeToPlan(fd: FormData) {
  const amount = toCents(fd.get("amount"));
  if (amount == null) return;
  run("UPDATE plans SET saved_cents = saved_cents + ? WHERE id = ?", amount, int(fd.get("id")));
  done();
}

export async function setPlanStatus(fd: FormData) {
  run("UPDATE plans SET status = ? WHERE id = ?", str(fd.get("status")), int(fd.get("id")));
  done();
}

export async function deletePlan(fd: FormData) {
  run("DELETE FROM plans WHERE id = ?", int(fd.get("id")));
  done();
}

// ── receipts ──

export async function uploadReceipt(fd: FormData) {
  const fileName = await saveUpload(fd.get("photo"), "receipt");
  if (!fileName) return;
  run(
    "INSERT INTO receipts (file_name, store, date, total_cents, is_meal_prep, meal_week_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    fileName, str(fd.get("store")), str(fd.get("date")) ?? today(), toCents(fd.get("total")),
    fd.get("is_meal_prep") ? 1 : 0, int(fd.get("meal_week_id")), str(fd.get("notes")),
  );
  done();
  // uploads from other pages (e.g. Meal prep) go back where they came from
  const back = str(fd.get("return_to"));
  redirect(back && back.startsWith("/") && !back.startsWith("//") ? back : "/budget/receipts?saved=1");
}

export async function updateReceipt(fd: FormData) {
  run(
    "UPDATE receipts SET store = ?, date = ?, total_cents = ?, is_meal_prep = ?, meal_week_id = ? WHERE id = ?",
    str(fd.get("store")), str(fd.get("date")), toCents(fd.get("total")), fd.get("is_meal_prep") ? 1 : 0,
    int(fd.get("meal_week_id")), int(fd.get("id")),
  );
  done();
}

export async function deleteReceipt(fd: FormData) {
  run("DELETE FROM receipts WHERE id = ?", int(fd.get("id")));
  done();
}

// ── statement files: picked files/folders, and a linked folder that can be refreshed ──

export type { FileResult } from "@/lib/statement-import";

/** One picked file per call, so big folders never hit the upload limit. */
export async function importStatementFile(fd: FormData): Promise<FileResult> {
  const file = fd.get("file");
  if (!(file instanceof File)) return { file: "?", status: "error", note: "No file received." };
  const result = await importStatementBytes((fd.get("path") as string | null) || file.name, new Uint8Array(await file.arrayBuffer()), {
    accountId: int(fd.get("account_id")),
    newAccount: str(fd.get("new_account")),
  });
  if (result.status === "imported") {
    applyRules(false);
    done();
  }
  return result;
}

export type FolderState = { error?: string; message?: string; results?: FileResult[] };

export async function linkStatementsFolder(_prev: FolderState, fd: FormData): Promise<FolderState> {
  const folder = str(fd.get("folder"))?.replace(/^"|"$/g, "");
  if (!folder) return { error: "Paste the folder's location, e.g. C:\\Users\\you\\iCloudDrive\\Statements" };
  const { checkFolder } = await import("@/lib/statement-folder");
  const problem = await checkFolder(folder);
  if (problem) return { error: problem };
  setSetting("statements_folder", folder);
  done();
  return { message: "Folder linked. Press Refresh statements to read it." };
}

export async function unlinkStatementsFolder() {
  run("DELETE FROM settings WHERE key = 'statements_folder'");
  done();
}

/** Reads every new or changed statement in the linked folder. */
export async function refreshStatements(): Promise<FolderState> {
  const { refreshFolder } = await import("@/lib/statement-folder");
  try {
    const results = await refreshFolder();
    if (results.some((r) => r.status === "imported")) applyRules(false);
    done();
    const added = results.reduce((sum, r) => sum + (r.added ?? 0), 0);
    const files = results.filter((r) => r.status === "imported").length;
    return {
      results,
      message: results.length === 0 ? "No new statements since last time." : `Read ${files} new statement${files === 1 ? "" : "s"}: ${added} new transaction${added === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── sorting, one card at a time ──

/**
 * Sorts one transaction. With "all like this" it also sorts every other unsorted one from the same shop
 * and remembers the shop, so future statements sort themselves.
 */
export async function sortTransaction(fd: FormData) {
  const { merchantKey } = await import("@/lib/budget");
  const id = int(fd.get("id"));
  let category = str(fd.get("category"));
  // the + tile: make the new category first, then sort into it
  if (category === "__new__") category = newCategory(fd);
  if (!id || !category || !categoryList().all.includes(category)) return;
  run("UPDATE transactions SET category = ? WHERE id = ?", category, id);
  if (fd.get("all") === "1") {
    const row = db.prepare("SELECT description FROM transactions WHERE id = ?").get(id) as { description: string } | undefined;
    const key = row ? merchantKey(row.description) : "";
    if (key.length >= 3) {
      run("UPDATE transactions SET category = ? WHERE category IS NULL AND instr(lower(description), ?) > 0", category, key);
      run("DELETE FROM category_rules WHERE pattern = ?", key);
      run("INSERT INTO category_rules (pattern, category) VALUES (?, ?)", key, category);
    }
  }
  done();
}

/**
 * A new category from the + on Sort. A spending one starts in the same pot as "Other", so it counts straight away
 * (it can be moved on Pay & pots). Returns its name, or null if no name was given.
 */
function newCategory(fd: FormData): string | null {
  const spending = fd.get("new_spending") === "1";
  const name = addCategory(str(fd.get("new_name")) ?? "", str(fd.get("new_icon")), spending);
  if (name && spending && customCategories().some((c) => c.name === name)) {
    const pot = db.prepare("SELECT id, categories FROM pots WHERE (',' || categories || ',') LIKE '%,Other,%' LIMIT 1").get() as { id: number; categories: string } | undefined;
    const cats = pot?.categories.split(",").map((c) => c.trim()).filter(Boolean) ?? [];
    if (pot && !cats.includes(name)) run("UPDATE pots SET categories = ? WHERE id = ?", [...cats, name].join(","), pot.id);
  }
  return name;
}

/** Deletes one of your own categories: its transactions, shop rules and bills go to Other (or Transfers if it wasn't spending). */
export async function deleteCategory(fd: FormData) {
  const row = db.prepare("SELECT name, spending FROM custom_categories WHERE id = ?").get(int(fd.get("id"))) as { name: string; spending: number } | undefined;
  if (!row) return;
  const to = row.spending ? "Other" : "Transfers";
  run("UPDATE transactions SET category = ? WHERE category = ?", to, row.name);
  run("UPDATE category_rules SET category = ? WHERE category = ?", to, row.name);
  run("UPDATE recurring_payments SET category = ? WHERE category = ?", to, row.name);
  for (const p of db.prepare("SELECT id, categories FROM pots").all() as { id: number; categories: string }[]) {
    const cats = p.categories.split(",").map((c) => c.trim()).filter(Boolean);
    if (cats.includes(row.name)) run("UPDATE pots SET categories = ? WHERE id = ?", cats.filter((c) => c !== row.name).join(","), p.id);
  }
  run("DELETE FROM custom_categories WHERE name = ?", row.name);
  done();
}

/** Older unsorted transactions (over 3 months): money out goes into "Other", so the sorting pile is just recent ones. */
export async function sortOldAsOther() {
  run("UPDATE transactions SET category = 'Other' WHERE category IS NULL AND amount_cents < 0 AND date < date('now', '-90 days')");
  // old money-in can't be told apart (pay, refunds, moving money around), so it just stops counting
  run("UPDATE transactions SET category = 'Transfers' WHERE category IS NULL AND amount_cents > 0 AND date < date('now', '-90 days')");
  done();
}

// ── same money, counted once ──

/** A bill is the same money as these other bills (none ticked = it's its own bill again). It stays listed but stops counting. */
export async function setBillSameAs(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const ids = [...new Set(fd.getAll("same_as").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== id))];
  // can't be the same money as a bill that's itself only a copy of this one – that would leave neither counted
  const ok = ids.filter((x) => {
    const other = db.prepare("SELECT same_as FROM recurring_payments WHERE id = ?").get(x) as { same_as: string | null } | undefined;
    return other && !(other.same_as ?? "").split(",").map(Number).includes(id);
  });
  run("UPDATE recurring_payments SET same_as = ? WHERE id = ?", ok.length ? ok.join(",") : null, id);
  done();
}

/** What the bank calls a bill ("tower insurance") – its bank payments are the ones containing these words. */
export async function setBillMatch(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const words = (str(fd.get("match")) ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
  run("UPDATE recurring_payments SET match = ? WHERE id = ?", words.length >= 3 ? words : null, id);
  done();
}

/** A bank payment belongs to this bill (picked by hand – blank = back to matching by the bill's words). */
export async function setPaymentBill(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const bill = int(fd.get("bill_id"));
  run("UPDATE transactions SET bill_id = ? WHERE id = ?", bill && db.prepare("SELECT 1 FROM recurring_payments WHERE id = ?").get(bill) ? bill : null, id);
  done();
}

/** Two transactions are the same money: this one sits under the other and stops counting. Blank = separate again. */
export async function joinTransaction(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const other = int(fd.get("same_as"));
  // never onto itself, or onto one that's already joined to something (keeps it one level deep)
  const target = other && other !== id ? (db.prepare("SELECT id, same_as FROM transactions WHERE id = ?").get(other) as { id: number; same_as: number | null } | undefined) : undefined;
  if (other && (!target || target.same_as)) return;
  run("UPDATE transactions SET same_as = ? WHERE id = ?", target ? target.id : null, id);
  // anything that was joined onto this one moves with it
  if (target) run("UPDATE transactions SET same_as = ? WHERE same_as = ?", target.id, id);
  done();
}
