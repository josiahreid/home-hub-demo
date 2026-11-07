"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run, UPLOAD_DIR } from "@/lib/db";
import { int, str, toCents, today } from "@/lib/format";
import { saveUpload } from "@/lib/uploads";
import { parseEml } from "@/lib/email";
import { STARTER_CLEANING, quoteCostDescription } from "./shared";

function refresh() {
  revalidatePath("/house", "layout");
}

const KINDS = new Set(["chore", "cleaning"]);
const PROJECT_STATUSES = new Set(["idea", "planning", "in_progress", "done"]);
const QUOTE_STATUSES = new Set(["received", "accepted", "declined"]);

// ───────────── Chores & cleaning ─────────────

export async function addChore(fd: FormData) {
  const name = str(fd.get("name"));
  const kind = str(fd.get("kind")) ?? "chore";
  if (!name || !KINDS.has(kind)) return;
  run(
    "INSERT INTO chores (name, kind, area, every_days, assignee, last_done) VALUES (?, ?, ?, ?, ?, ?)",
    name,
    kind,
    str(fd.get("area")),
    Math.max(1, int(fd.get("every_days")) ?? 7),
    str(fd.get("assignee")),
    str(fd.get("last_done")),
  );
  refresh();
}

export async function updateChore(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (id == null || !name) return;
  run(
    "UPDATE chores SET name = ?, area = ?, every_days = ?, assignee = ?, last_done = ? WHERE id = ?",
    name,
    str(fd.get("area")),
    Math.max(1, int(fd.get("every_days")) ?? 7),
    str(fd.get("assignee")),
    str(fd.get("last_done")),
    id,
  );
  refresh();
}

export async function markChoreDone(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  run("UPDATE chores SET last_done = ? WHERE id = ?", today(), id);
  refresh();
}

export async function deleteChore(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  run("DELETE FROM chores WHERE id = ?", id);
  refresh();
}

export async function addStarterCleaning() {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM chores WHERE kind = 'cleaning'").get() as { n: number };
  if (n > 0) return;
  for (const [name, area, every] of STARTER_CLEANING) {
    run("INSERT INTO chores (name, kind, area, every_days) VALUES (?, 'cleaning', ?, ?)", name, area, every);
  }
  refresh();
}

// ───────────── Projects ─────────────

export async function addProject(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) return;
  const status = str(fd.get("status")) ?? "idea";
  run(
    "INSERT INTO house_projects (name, status, budget_cents, notes) VALUES (?, ?, ?, ?)",
    name,
    PROJECT_STATUSES.has(status) ? status : "idea",
    toCents(fd.get("budget")),
    str(fd.get("notes")),
  );
  refresh();
}

export async function updateProject(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  const status = str(fd.get("status")) ?? "idea";
  if (id == null || !name) return;
  run(
    "UPDATE house_projects SET name = ?, status = ?, budget_cents = ?, notes = ? WHERE id = ?",
    name,
    PROJECT_STATUSES.has(status) ? status : "idea",
    toCents(fd.get("budget")),
    str(fd.get("notes")),
    id,
  );
  refresh();
}

export async function setProjectStatus(fd: FormData) {
  const id = int(fd.get("id"));
  const status = str(fd.get("status"));
  if (id == null || !status || !PROJECT_STATUSES.has(status)) return;
  run("UPDATE house_projects SET status = ? WHERE id = ?", status, id);
  refresh();
}

export async function deleteProject(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  // its invoices/receipts go with it, so remove their files too
  const files = db.prepare("SELECT file_name FROM project_documents WHERE project_id = ?").all(id) as { file_name: string }[];
  run("DELETE FROM house_projects WHERE id = ?", id);
  for (const f of files) await removeUpload(f.file_name);
  refresh();
  redirect("/house/projects");
}

export async function addCost(fd: FormData) {
  const projectId = int(fd.get("project_id"));
  const description = str(fd.get("description"));
  const amount = toCents(fd.get("amount"));
  if (projectId == null || !description || amount == null) return;
  run(
    "INSERT INTO project_costs (project_id, date, description, amount_cents) VALUES (?, ?, ?, ?)",
    projectId,
    str(fd.get("date")) ?? today(),
    description,
    amount,
  );
  refresh();
}

export async function deleteCost(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  run("DELETE FROM project_costs WHERE id = ?", id);
  refresh();
}

/** Creates a savings plan in the Budget tab for this project and links it. */
export async function createProjectPlan(fd: FormData) {
  const id = int(fd.get("id"));
  const targetDate = str(fd.get("target_date"));
  if (id == null || !targetDate) return;
  const p = db.prepare("SELECT name, budget_cents, plan_id FROM house_projects WHERE id = ?").get(id) as
    | { name: string; budget_cents: number | null; plan_id: number | null }
    | undefined;
  if (!p || p.budget_cents == null || p.plan_id != null) return;
  const res = run(
    "INSERT INTO plans (name, target_cents, start_date, target_date, notes) VALUES (?, ?, ?, ?, ?)",
    p.name,
    p.budget_cents,
    today(),
    targetDate,
    "Savings goal for house project",
  );
  run("UPDATE house_projects SET plan_id = ? WHERE id = ?", Number(res.lastInsertRowid), id);
  refresh();
  revalidatePath("/budget", "layout");
}

export async function unlinkProjectPlan(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  run("UPDATE house_projects SET plan_id = NULL WHERE id = ?", id);
  refresh();
}

// ───────────── Quotes ─────────────

export async function addQuote(fd: FormData) {
  const supplier = str(fd.get("supplier"));
  if (!supplier) return;
  const file = await saveUpload(fd.get("file"), "quote");
  run(
    "INSERT INTO quotes (project_id, supplier, description, amount_cents, date, valid_until, status, file_name, business_id) VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?)",
    int(fd.get("project_id")),
    supplier,
    str(fd.get("description")),
    toCents(fd.get("amount")),
    str(fd.get("date")) ?? today(),
    str(fd.get("valid_until")),
    file,
    businessIdFor(supplier),
  );
  refresh();
}

export async function updateQuote(fd: FormData) {
  const id = int(fd.get("id"));
  const supplier = str(fd.get("supplier"));
  if (id == null || !supplier) return;
  const file = await saveUpload(fd.get("file"), "quote");
  const old = file ? (db.prepare("SELECT file_name FROM quotes WHERE id = ?").get(id) as { file_name: string | null } | undefined) : undefined;
  run(
    `UPDATE quotes SET project_id = ?, supplier = ?, business_id = ?, description = ?, amount_cents = ?, date = ?, valid_until = ?${file ? ", file_name = ?" : ""} WHERE id = ?`,
    int(fd.get("project_id")),
    supplier,
    businessIdFor(supplier),
    str(fd.get("description")),
    toCents(fd.get("amount")),
    str(fd.get("date")),
    str(fd.get("valid_until")),
    ...(file ? [file] : []),
    id,
  );
  if (old?.file_name) await removeUpload(old.file_name);
  refresh();
}

export async function setQuoteStatus(fd: FormData) {
  const id = int(fd.get("id"));
  const status = str(fd.get("status"));
  if (id == null || !status || !QUOTE_STATUSES.has(status)) return;
  run("UPDATE quotes SET status = ? WHERE id = ?", status, id);
  refresh();
}

export async function deleteQuote(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  const q = db.prepare("SELECT file_name FROM quotes WHERE id = ?").get(id) as { file_name: string | null } | undefined;
  run("DELETE FROM quotes WHERE id = ?", id);
  if (q?.file_name) await removeUpload(q.file_name);
  refresh();
}

/** Copies an accepted quote into its project's cost log. */
export async function addQuoteAsCost(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  const q = db.prepare("SELECT project_id, supplier, description, amount_cents FROM quotes WHERE id = ?").get(id) as
    | { project_id: number | null; supplier: string; description: string | null; amount_cents: number | null }
    | undefined;
  if (!q || q.project_id == null || q.amount_cents == null) return;
  const description = quoteCostDescription(q.supplier, q.description);
  const dup = db
    .prepare("SELECT 1 FROM project_costs WHERE project_id = ? AND description = ? AND amount_cents = ?")
    .get(q.project_id, description, q.amount_cents);
  if (dup) return;
  run(
    "INSERT INTO project_costs (project_id, date, description, amount_cents) VALUES (?, ?, ?, ?)",
    q.project_id,
    today(),
    description,
    q.amount_cents,
  );
  refresh();
}

async function removeUpload(name: string) {
  try {
    await unlink(path.join(UPLOAD_DIR, path.basename(name)));
  } catch {
    // already gone
  }
}

// ── invoices & receipts tagged to projects ──

const DOC_KINDS = new Set(["invoice", "receipt"]);

/** Uploads an invoice/receipt for a project and (by default) logs it as a project cost. */
export async function addProjectDocument(fd: FormData) {
  const projectId = int(fd.get("project_id"));
  if (projectId == null) return;
  const fileName = await saveUpload(fd.get("file"), "project");
  if (!fileName) return;
  const kindRaw = str(fd.get("kind")) ?? "receipt";
  const kind = DOC_KINDS.has(kindRaw) ? kindRaw : "receipt";
  const supplier = str(fd.get("supplier"));
  const date = str(fd.get("date")) ?? today();
  const amount = toCents(fd.get("amount"));

  let costId: number | null = null;
  if (fd.get("add_cost") && amount != null) {
    costId = Number(run(
      "INSERT INTO project_costs (project_id, date, description, amount_cents) VALUES (?, ?, ?, ?)",
      projectId, date, `${kind === "invoice" ? "Invoice" : "Receipt"}${supplier ? ` – ${supplier}` : ""}`, amount,
    ).lastInsertRowid);
  }
  run(
    "INSERT INTO project_documents (project_id, kind, supplier, date, amount_cents, file_name, notes, cost_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    projectId, kind, supplier, date, amount, fileName, str(fd.get("notes")), costId,
  );
  refresh();
}

/** Moves a document (and the cost it created) to a different project. */
export async function retagDocument(fd: FormData) {
  const id = int(fd.get("id"));
  const projectId = int(fd.get("project_id"));
  if (id == null || projectId == null) return;
  run("UPDATE project_documents SET project_id = ? WHERE id = ?", projectId, id);
  run("UPDATE project_costs SET project_id = ? WHERE id = (SELECT cost_id FROM project_documents WHERE id = ?)", projectId, id);
  refresh();
}

/** Deletes the document, its file, and the cost line it created. */
export async function deleteDocument(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  const doc = db.prepare("SELECT file_name, cost_id FROM project_documents WHERE id = ?").get(id) as { file_name: string; cost_id: number | null } | undefined;
  if (!doc) return;
  run("DELETE FROM project_documents WHERE id = ?", id);
  if (doc.cost_id != null) run("DELETE FROM project_costs WHERE id = ?", doc.cost_id);
  await removeUpload(doc.file_name);
  refresh();
}

// ── businesses (tradies & suppliers) ──

/** The business with this name, created if it's new. Quotes use it so contact details are kept once. */
function businessIdFor(name: string): number {
  const existing = db.prepare("SELECT id FROM businesses WHERE name = ? COLLATE NOCASE").get(name.trim()) as { id: number } | undefined;
  return existing?.id ?? Number(run("INSERT INTO businesses (name) VALUES (?)", name.trim()).lastInsertRowid);
}

function businessFields(fd: FormData) {
  return [
    str(fd.get("trade")), str(fd.get("contact_name")), str(fd.get("email")), str(fd.get("phone")),
    str(fd.get("website")), str(fd.get("address")), str(fd.get("gst_number")), str(fd.get("notes")),
  ] as const;
}

export async function addBusiness(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) return;
  const id = businessIdFor(name);
  run(
    "UPDATE businesses SET trade = ?, contact_name = ?, email = ?, phone = ?, website = ?, address = ?, gst_number = ?, notes = ? WHERE id = ?",
    ...businessFields(fd), id,
  );
  refresh();
}

export async function updateBusiness(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (id == null || !name) return;
  run(
    "UPDATE businesses SET name = ?, trade = ?, contact_name = ?, email = ?, phone = ?, website = ?, address = ?, gst_number = ?, notes = ? WHERE id = ?",
    name, ...businessFields(fd), id,
  );
  // keep the supplier name on its quotes in step
  run("UPDATE quotes SET supplier = ? WHERE business_id = ?", name, id);
  refresh();
}

export async function deleteBusiness(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  run("DELETE FROM businesses WHERE id = ?", id);
  refresh();
}

// ── emails saved against a project ──

export async function addProjectEmail(fd: FormData) {
  const projectId = int(fd.get("project_id"));
  if (projectId == null) return;
  const upload = fd.get("file");
  const fileName = await saveUpload(upload, "email");
  let from = str(fd.get("from_addr"));
  let subject = str(fd.get("subject"));
  let date = str(fd.get("date"));
  let body = str(fd.get("body"));
  // a saved .eml fills in anything left blank
  if (fileName?.endsWith(".eml") && upload instanceof File) {
    const parsed = parseEml(await upload.text());
    from ??= parsed.from;
    subject ??= parsed.subject;
    date ??= parsed.date;
    body ??= parsed.body;
  }
  if (!subject && !body && !fileName) return;
  let businessId = int(fd.get("business_id"));
  const newBusiness = str(fd.get("new_business"));
  if (newBusiness) businessId = businessIdFor(newBusiness);
  run(
    "INSERT INTO project_emails (project_id, business_id, direction, from_addr, subject, date, body, file_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    projectId, businessId, fd.get("direction") === "sent" ? "sent" : "received", from, subject, date ?? today(), body, fileName,
  );
  refresh();
}

export async function deleteProjectEmail(fd: FormData) {
  const id = int(fd.get("id"));
  if (id == null) return;
  const e = db.prepare("SELECT file_name FROM project_emails WHERE id = ?").get(id) as { file_name: string | null } | undefined;
  run("DELETE FROM project_emails WHERE id = ?", id);
  if (e?.file_name) await removeUpload(e.file_name);
  refresh();
}
