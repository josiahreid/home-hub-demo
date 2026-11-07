"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run } from "@/lib/db";
import { FREQUENCIES, int, str, toCents, today, type Frequency } from "@/lib/format";
import { saveUpload } from "@/lib/uploads";
import { categoryFor, KINDS, paymentName } from "./lib";

function refresh() {
  revalidatePath("/utilities", "layout");
  revalidatePath("/budget", "layout");
}

function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function readUtility(fd: FormData) {
  const kindRaw = str(fd.get("kind")) ?? "Other";
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "Other";
  const provider = str(fd.get("provider"));
  const amount = toCents(fd.get("amount"));
  const freqRaw = str(fd.get("frequency")) as Frequency | null;
  const frequency: Frequency = freqRaw && FREQUENCIES.includes(freqRaw) ? freqRaw : "monthly";
  return {
    kind,
    provider,
    plan: str(fd.get("plan")),
    account: str(fd.get("account_number")),
    contractEnd: str(fd.get("contract_end")),
    notes: str(fd.get("notes")),
    amount: amount == null ? null : Math.abs(amount),
    frequency,
    nextDue: str(fd.get("next_due")) ?? today(),
  };
}

export async function addUtility(fd: FormData) {
  const u = readUtility(fd);
  if (!u.provider || u.amount == null) return;
  const id = tx(() => {
    const r = run(
      `INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, linked_type)
       VALUES (?, ?, ?, ?, ?, 'utility')`,
      paymentName(u.kind, u.provider!),
      u.amount!,
      u.frequency,
      u.nextDue,
      categoryFor(u.kind),
    );
    const recurringId = Number(r.lastInsertRowid);
    const res = run(
      `INSERT INTO utilities (kind, provider, plan, account_number, contract_end, recurring_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      u.kind,
      u.provider!,
      u.plan,
      u.account,
      u.contractEnd,
      recurringId,
      u.notes,
    );
    const utilityId = Number(res.lastInsertRowid);
    run("UPDATE recurring_payments SET linked_id = ? WHERE id = ?", utilityId, recurringId);
    return utilityId;
  });
  refresh();
  redirect(`/utilities/${id}`);
}

export async function updateUtility(fd: FormData) {
  const id = int(fd.get("id"));
  const u = readUtility(fd);
  if (!id || !u.provider || u.amount == null) return;
  tx(() => {
    const row = db.prepare("SELECT recurring_id FROM utilities WHERE id = ?").get(id) as
      | { recurring_id: number | null }
      | undefined;
    if (!row) return;
    let recurringId = row.recurring_id;
    const exists =
      recurringId != null && db.prepare("SELECT 1 FROM recurring_payments WHERE id = ?").get(recurringId) != null;
    if (exists) {
      run(
        "UPDATE recurring_payments SET name = ?, amount_cents = ?, frequency = ?, next_due = ?, category = ? WHERE id = ?",
        paymentName(u.kind, u.provider!),
        u.amount!,
        u.frequency,
        u.nextDue,
        categoryFor(u.kind),
        recurringId!,
      );
    } else {
      // the payment was removed elsewhere (e.g. from the budget) — recreate it
      const r = run(
        `INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, linked_type, linked_id)
         VALUES (?, ?, ?, ?, ?, 'utility', ?)`,
        paymentName(u.kind, u.provider!),
        u.amount!,
        u.frequency,
        u.nextDue,
        categoryFor(u.kind),
        id,
      );
      recurringId = Number(r.lastInsertRowid);
    }
    run(
      `UPDATE utilities SET kind = ?, provider = ?, plan = ?, account_number = ?, contract_end = ?, recurring_id = ?, notes = ?
        WHERE id = ?`,
      u.kind,
      u.provider!,
      u.plan,
      u.account,
      u.contractEnd,
      recurringId,
      u.notes,
      id,
    );
  });
  refresh();
}

export async function deleteUtility(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  tx(() => {
    const row = db.prepare("SELECT recurring_id FROM utilities WHERE id = ?").get(id) as
      | { recurring_id: number | null }
      | undefined;
    run("DELETE FROM utilities WHERE id = ?", id);
    if (row?.recurring_id != null) run("DELETE FROM recurring_payments WHERE id = ?", row.recurring_id);
  });
  refresh();
  redirect("/utilities");
}

// ── bills ──

export async function addBill(fd: FormData) {
  const utilityId = int(fd.get("utility_id"));
  const periodEnd = str(fd.get("period_end"));
  const amount = toCents(fd.get("amount"));
  if (!utilityId || !periodEnd || amount == null) return;
  const usageRaw = str(fd.get("usage"));
  const usage = usageRaw == null ? null : Number(usageRaw.replace(/,/g, ""));
  const fileName = await saveUpload(fd.get("file"), "bill");
  run(
    "INSERT INTO utility_bills (utility_id, period_end, amount_cents, usage, usage_unit, file_name) VALUES (?, ?, ?, ?, ?, ?)",
    utilityId,
    periodEnd,
    Math.abs(amount),
    usage != null && Number.isFinite(usage) ? usage : null,
    str(fd.get("usage_unit")),
    fileName,
  );
  refresh();
}

export async function deleteBill(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM utility_bills WHERE id = ?", id);
  refresh();
}

// ── offers ──

export async function addOffer(fd: FormData) {
  const utilityId = int(fd.get("utility_id"));
  const provider = str(fd.get("provider"));
  const monthly = toCents(fd.get("monthly"));
  if (!utilityId || !provider || monthly == null) return;
  run(
    "INSERT INTO utility_offers (utility_id, provider, plan, monthly_cents, url, notes, checked_on) VALUES (?, ?, ?, ?, ?, ?, ?)",
    utilityId,
    provider,
    str(fd.get("plan")),
    Math.abs(monthly),
    str(fd.get("url")),
    str(fd.get("notes")),
    str(fd.get("checked_on")) ?? today(),
  );
  refresh();
}

export async function deleteOffer(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM utility_offers WHERE id = ?", id);
  refresh();
}
