"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run, setSetting, UPLOAD_DIR } from "@/lib/db";
import { FREQUENCIES, int, str, toCents, today, type Frequency } from "@/lib/format";
import { saveUpload } from "@/lib/uploads";
import { CLAIM_STATUSES, DOC_KINDS, KINDS, paymentName } from "./lib";

function refresh() {
  revalidatePath("/insurance", "layout");
  revalidatePath("/budget", "layout");
  revalidatePath("/calendar", "layout");
  revalidatePath("/car", "layout");
  revalidatePath("/house", "layout");
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

const money = (fd: FormData, name: string) => {
  const c = toCents(fd.get(name));
  return c == null ? null : Math.abs(c);
};
const frequency = (fd: FormData) => {
  const f = str(fd.get("frequency")) as Frequency | null;
  return (f && FREQUENCIES.includes(f) ? f : "monthly") as Frequency;
};

function readPolicy(fd: FormData) {
  const kindRaw = str(fd.get("kind")) ?? "Other";
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "Other";
  // ticked people; none ticked = the whole household
  const slugs = db.prepare("SELECT slug FROM members").all() as { slug: string }[];
  const people = fd.getAll("people").map(String).filter((s) => slugs.some((m) => m.slug === s));
  const vehicleId = kind === "Car" ? int(fd.get("vehicle_id")) : null;
  return {
    kind,
    insurer: str(fd.get("insurer")),
    covers: str(fd.get("covers")),
    policyNumber: str(fd.get("policy_number")),
    renewal: str(fd.get("renewal_date")),
    excess: money(fd, "excess"),
    sumInsured: money(fd, "sum_insured"),
    phone: str(fd.get("claims_phone")),
    website: str(fd.get("website")),
    notes: str(fd.get("notes")),
    people: people.length ? people.join(",") : null,
    vehicleId: vehicleId && db.prepare("SELECT 1 FROM vehicles WHERE id = ?").get(vehicleId) ? vehicleId : null,
    amount: money(fd, "amount"),
    frequency: frequency(fd),
    nextDue: str(fd.get("next_due")) ?? today(),
  };
}

type Policy = ReturnType<typeof readPolicy>;

function policyValues(p: Policy) {
  return [p.kind, p.insurer!, p.covers, p.policyNumber, p.renewal, p.excess, p.sumInsured, p.phone, p.website, p.notes, p.people, p.vehicleId] as const;
}

function insertPayment(p: Policy, policyId: number | null) {
  const r = run(
    `INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, linked_type, linked_id)
     VALUES (?, ?, ?, ?, 'Bills', 'insurance', ?)`,
    paymentName({ ...p, insurer: p.insurer! }), p.amount!, p.frequency, p.nextDue, policyId,
  );
  return Number(r.lastInsertRowid);
}

/**
 * A car's "Insurance renewal" on the Car tab follows its policy's renewal date here (the earliest, if the car has
 * more than one policy). A car with no dated policy keeps whatever was typed on the Car tab.
 */
function syncCarRenewal(vehicleId: number | null | undefined) {
  if (!vehicleId) return;
  const r = db.prepare("SELECT min(renewal_date) AS d FROM insurance_policies WHERE vehicle_id = ? AND renewal_date IS NOT NULL").get(vehicleId) as { d: string | null };
  if (r.d) run("UPDATE vehicles SET insurance_due = ? WHERE id = ?", r.d, vehicleId);
}

/** Price history: a new row whenever the price (or how often it's paid) changes. */
function recordPrice(policyId: number, amount: number, freq: Frequency, date = today()) {
  const last = db.prepare("SELECT amount_cents, frequency FROM insurance_prices WHERE policy_id = ? ORDER BY date DESC, id DESC LIMIT 1")
    .get(policyId) as { amount_cents: number; frequency: string } | undefined;
  if (last && last.amount_cents === amount && last.frequency === freq) return;
  // a second change on the same day replaces that day's entry
  run("DELETE FROM insurance_prices WHERE policy_id = ? AND date = ?", policyId, date);
  run("INSERT INTO insurance_prices (policy_id, date, amount_cents, frequency) VALUES (?, ?, ?, ?)", policyId, date, amount, freq);
}

export async function addPolicy(fd: FormData) {
  const p = readPolicy(fd);
  if (!p.insurer || p.amount == null) return;
  const id = tx(() => {
    const recurringId = insertPayment(p, null);
    const res = run(
      `INSERT INTO insurance_policies (kind, insurer, covers, policy_number, renewal_date, excess_cents, sum_insured_cents,
         claims_phone, website, notes, people, vehicle_id, recurring_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...policyValues(p), recurringId,
    );
    const policyId = Number(res.lastInsertRowid);
    run("UPDATE recurring_payments SET linked_id = ? WHERE id = ?", policyId, recurringId);
    recordPrice(policyId, p.amount!, p.frequency);
    syncCarRenewal(p.vehicleId);
    return policyId;
  });
  refresh();
  redirect(`/insurance/${id}`);
}

export async function updatePolicy(fd: FormData) {
  const id = int(fd.get("id"));
  const p = readPolicy(fd);
  if (!id || !p.insurer || p.amount == null) return;
  tx(() => {
    const row = db.prepare("SELECT recurring_id, vehicle_id FROM insurance_policies WHERE id = ?").get(id) as { recurring_id: number | null; vehicle_id: number | null } | undefined;
    if (!row) return;
    let recurringId = row.recurring_id;
    const exists = recurringId != null && db.prepare("SELECT 1 FROM recurring_payments WHERE id = ?").get(recurringId) != null;
    if (exists) {
      run(
        "UPDATE recurring_payments SET name = ?, amount_cents = ?, frequency = ?, next_due = ? WHERE id = ?",
        paymentName({ ...p, insurer: p.insurer! }), p.amount!, p.frequency, p.nextDue, recurringId!,
      );
    } else {
      // the payment was removed elsewhere (e.g. from the budget) – recreate it
      recurringId = insertPayment(p, id);
    }
    run(
      `UPDATE insurance_policies SET kind = ?, insurer = ?, covers = ?, policy_number = ?, renewal_date = ?, excess_cents = ?,
         sum_insured_cents = ?, claims_phone = ?, website = ?, notes = ?, people = ?, vehicle_id = ?, recurring_id = ? WHERE id = ?`,
      ...policyValues(p), recurringId, id,
    );
    recordPrice(id, p.amount!, p.frequency);
    // the car it's for now (and, if it moved, the one it was for – it may have another policy)
    syncCarRenewal(p.vehicleId);
    if (row.vehicle_id !== p.vehicleId) syncCarRenewal(row.vehicle_id);
  });
  refresh();
}

/** Renewed: moves the renewal date on and (optionally) sets the new price. */
export async function markRenewed(fd: FormData) {
  const id = int(fd.get("id"));
  const renewal = str(fd.get("renewal_date"));
  if (!id || !renewal) return;
  const amount = money(fd, "amount");
  tx(() => {
    run("UPDATE insurance_policies SET renewal_date = ? WHERE id = ?", renewal, id);
    syncCarRenewal((db.prepare("SELECT vehicle_id FROM insurance_policies WHERE id = ?").get(id) as { vehicle_id: number | null } | undefined)?.vehicle_id);
    if (amount != null) {
      const r = db.prepare("SELECT r.id, r.frequency FROM recurring_payments r JOIN insurance_policies p ON p.recurring_id = r.id WHERE p.id = ?")
        .get(id) as { id: number; frequency: Frequency } | undefined;
      if (r) {
        run("UPDATE recurring_payments SET amount_cents = ? WHERE id = ?", amount, r.id);
        recordPrice(id, amount, r.frequency);
      }
    }
  });
  refresh();
}

export async function deletePolicy(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const files = tx(() => {
    const row = db.prepare("SELECT recurring_id FROM insurance_policies WHERE id = ?").get(id) as { recurring_id: number | null } | undefined;
    const docs = db.prepare("SELECT file_name FROM insurance_docs WHERE policy_id = ?").all(id) as { file_name: string }[];
    run("DELETE FROM insurance_policies WHERE id = ?", id);
    if (row?.recurring_id != null) run("DELETE FROM recurring_payments WHERE id = ?", row.recurring_id);
    return docs.map((d) => d.file_name);
  });
  for (const f of files) await removeUpload(f);
  refresh();
  redirect("/insurance");
}

// ── documents ──

async function removeUpload(name: string) {
  try {
    await unlink(path.join(UPLOAD_DIR, path.basename(name)));
  } catch {
    // already gone
  }
}

export async function addDocument(fd: FormData) {
  const policyId = int(fd.get("policy_id"));
  if (!policyId) return;
  const file = fd.get("file");
  const fileName = await saveUpload(file, "insurance");
  if (!fileName) return;
  const claimId = int(fd.get("claim_id"));
  const kindRaw = str(fd.get("kind")) ?? (claimId ? "Claim" : "Other");
  const kind = (DOC_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "Other";
  const title = str(fd.get("title")) ?? (kind !== "Other" ? kind : file instanceof File ? file.name : "Document");
  run(
    "INSERT INTO insurance_docs (policy_id, kind, title, file_name, added_on, claim_id) VALUES (?, ?, ?, ?, ?, ?)",
    policyId, kind, title, fileName, str(fd.get("added_on")) ?? today(), claimId,
  );
  refresh();
}

export async function deleteDocument(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const row = db.prepare("SELECT file_name FROM insurance_docs WHERE id = ?").get(id) as { file_name: string } | undefined;
  run("DELETE FROM insurance_docs WHERE id = ?", id);
  if (row) await removeUpload(row.file_name);
  refresh();
}

// ── claims ──

const claimStatus = (fd: FormData) => {
  const s = str(fd.get("status")) ?? "open";
  return (CLAIM_STATUSES as readonly string[]).includes(s) ? s : "open";
};

export async function addClaim(fd: FormData) {
  const policyId = int(fd.get("policy_id"));
  const what = str(fd.get("what"));
  if (!policyId || !what) return;
  run(
    `INSERT INTO insurance_claims (policy_id, date, what, claim_number, status, excess_cents, payout_cents, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    policyId, str(fd.get("date")) ?? today(), what, str(fd.get("claim_number")), claimStatus(fd),
    money(fd, "excess"), money(fd, "payout"), str(fd.get("notes")),
  );
  refresh();
}

export async function updateClaim(fd: FormData) {
  const id = int(fd.get("id"));
  const what = str(fd.get("what"));
  if (!id || !what) return;
  run(
    "UPDATE insurance_claims SET date = ?, what = ?, claim_number = ?, status = ?, excess_cents = ?, payout_cents = ?, notes = ? WHERE id = ?",
    str(fd.get("date")) ?? today(), what, str(fd.get("claim_number")), claimStatus(fd),
    money(fd, "excess"), money(fd, "payout"), str(fd.get("notes")), id,
  );
  refresh();
}

export async function deleteClaim(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  // its documents stay with the policy
  run("DELETE FROM insurance_claims WHERE id = ?", id);
  refresh();
}

// ── quotes ──

export async function addQuote(fd: FormData) {
  const policyId = int(fd.get("policy_id"));
  const insurer = str(fd.get("insurer"));
  const amount = money(fd, "amount");
  if (!policyId || !insurer || amount == null) return;
  run(
    "INSERT INTO insurance_quotes (policy_id, insurer, amount_cents, frequency, excess_cents, url, notes, checked_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    policyId, insurer, amount, frequency(fd), money(fd, "excess"), str(fd.get("url")), str(fd.get("notes")), str(fd.get("checked_on")) ?? today(),
  );
  refresh();
}

export async function deleteQuote(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM insurance_quotes WHERE id = ?", id);
  refresh();
}

// ── renewal reminders ──

export async function setRemindDays(fd: FormData) {
  const days = int(fd.get("days"));
  setSetting("insurance_remind_days", String(days != null && days >= 0 && days <= 120 ? days : 0));
  refresh();
}
