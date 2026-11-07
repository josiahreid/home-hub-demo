"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run } from "@/lib/db";
import { int, str, toCents } from "@/lib/format";
import { JOB_STATUSES, PART_STATUSES, splitTags } from "./shared";

const JOB_STATUS_VALUES: string[] = JOB_STATUSES.map((s) => s.value);
const PART_STATUS_VALUES: string[] = PART_STATUSES.map((s) => s.value);

function done() {
  revalidatePath("/[member]", "layout");
}

/** The page address of the member who owns a job card. */
function slugOfJob(jobId: number): string {
  const row = db.prepare("SELECT m.slug FROM job_cards j JOIN members m ON m.id = j.member_id WHERE j.id = ?").get(jobId) as { slug: string } | undefined;
  return row?.slug ?? "default-name";
}

function cleanTags(v: FormDataEntryValue | null): string | null {
  const tags = [...new Set(splitTags(str(v)).map((t) => t.toLowerCase()))];
  return tags.length ? tags.join(", ") : null;
}

function priority(v: FormDataEntryValue | null): number {
  const p = int(v);
  return p === 1 || p === 3 ? p : 2;
}

function jobStatus(v: FormDataEntryValue | null): string {
  const s = str(v);
  return s && JOB_STATUS_VALUES.includes(s) ? s : "idea";
}

function partStatus(v: FormDataEntryValue | null): string {
  const s = str(v);
  return s && PART_STATUS_VALUES.includes(s) ? s : "wishlist";
}

function qty(v: FormDataEntryValue | null): number {
  return Math.max(1, int(v) ?? 1);
}

// ── Job cards ──

export async function createJob(fd: FormData) {
  const title = str(fd.get("title"));
  if (!title) return;
  const res = run(
    "INSERT INTO job_cards (member_id, title, description, job_type, tags, status, priority, due) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    int(fd.get("member_id")),
    title,
    str(fd.get("description")),
    str(fd.get("job_type")),
    cleanTags(fd.get("tags")),
    jobStatus(fd.get("status")),
    priority(fd.get("priority")),
    str(fd.get("due")),
  );
  done();
  const id = Number(res.lastInsertRowid);
  redirect(`/${slugOfJob(id)}/projects/${id}`);
}

export async function updateJob(fd: FormData) {
  const id = int(fd.get("id"));
  const title = str(fd.get("title"));
  if (!id || !title) return;
  run(
    "UPDATE job_cards SET title = ?, description = ?, job_type = ?, tags = ?, priority = ?, due = ? WHERE id = ?",
    title,
    str(fd.get("description")),
    str(fd.get("job_type")),
    cleanTags(fd.get("tags")),
    priority(fd.get("priority")),
    str(fd.get("due")),
    id,
  );
  done();
}

export async function setJobStatus(fd: FormData) {
  const id = int(fd.get("id"));
  const status = str(fd.get("status"));
  if (!id || !status || !JOB_STATUS_VALUES.includes(status)) return;
  run("UPDATE job_cards SET status = ? WHERE id = ?", status, id);
  done();
}

export async function deleteJob(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const slug = slugOfJob(id);
  run("DELETE FROM job_cards WHERE id = ?", id);
  done();
  redirect(`/${slug}/projects`);
}

// ── Steps ──

export async function addStep(fd: FormData) {
  const jobId = int(fd.get("job_id"));
  const text = str(fd.get("text"));
  if (!jobId || !text) return;
  const { max } = db.prepare("SELECT COALESCE(MAX(sort), 0) AS max FROM job_steps WHERE job_id = ?").get(jobId) as { max: number };
  // Several steps can be pasted at once, one per line.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => run("INSERT INTO job_steps (job_id, text, sort) VALUES (?, ?, ?)", jobId, line, max + 1 + i));
  done();
}

export async function toggleStep(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("UPDATE job_steps SET done = 1 - done WHERE id = ?", id);
  done();
}

export async function updateStep(fd: FormData) {
  const id = int(fd.get("id"));
  const text = str(fd.get("text"));
  if (!id || !text) return;
  run("UPDATE job_steps SET text = ? WHERE id = ?", text, id);
  done();
}

export async function deleteStep(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM job_steps WHERE id = ?", id);
  done();
}

export async function moveStep(fd: FormData) {
  const id = int(fd.get("id"));
  const dir = str(fd.get("dir")) === "up" ? -1 : 1;
  if (!id) return;
  const step = db.prepare("SELECT job_id FROM job_steps WHERE id = ?").get(id) as { job_id: number } | undefined;
  if (!step) return;
  const ids = (db.prepare("SELECT id FROM job_steps WHERE job_id = ? ORDER BY sort, id").all(step.job_id) as { id: number }[]).map(
    (r) => r.id,
  );
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  // Renumber so duplicate sort values can never stall a move.
  ids.forEach((sid, n) => run("UPDATE job_steps SET sort = ? WHERE id = ?", n + 1, sid));
  done();
}

// ── Parts ──

function partName(name: string | null, url: string | null): string | null {
  if (name) return name;
  if (!url) return null;
  try {
    return `${new URL(url).hostname.replace(/^www\./, "")} item`;
  } catch {
    return url.slice(0, 60);
  }
}

/** Shipping for the line; blank or 0 = none. */
function shipping(fd: FormData) {
  const c = toCents(fd.get("shipping"));
  return c ? Math.abs(c) : null;
}

export async function addPart(fd: FormData) {
  const url = str(fd.get("url"));
  const name = partName(str(fd.get("name")), url);
  if (!name) return;
  run(
    "INSERT INTO parts (member_id, job_id, name, url, price_cents, quantity, shipping_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    int(fd.get("member_id")),
    int(fd.get("job_id")),
    name,
    url,
    toCents(fd.get("price")),
    qty(fd.get("quantity")),
    shipping(fd),
    partStatus(fd.get("status")),
  );
  done();
}

export async function updatePart(fd: FormData) {
  const id = int(fd.get("id"));
  const url = str(fd.get("url"));
  const name = partName(str(fd.get("name")), url);
  if (!id || !name) return;
  run(
    "UPDATE parts SET job_id = ?, name = ?, url = ?, price_cents = ?, quantity = ?, shipping_cents = ?, arrives = ?, status = ? WHERE id = ?",
    int(fd.get("job_id")),
    name,
    url,
    toCents(fd.get("price")),
    qty(fd.get("quantity")),
    shipping(fd),
    str(fd.get("arrives")),
    partStatus(fd.get("status")),
    id,
  );
  done();
}

export async function setPartStatus(fd: FormData) {
  const id = int(fd.get("id"));
  const status = str(fd.get("status"));
  if (!id || !status || !PART_STATUS_VALUES.includes(status)) return;
  if (status === "ordered") {
    // from "Mark ordered": when it should arrive (blank = not known yet)
    const arrives = str(fd.get("arrives"));
    run("UPDATE parts SET status = ?, arrives = ? WHERE id = ?", status, arrives && /^\d{4}-\d{2}-\d{2}$/.test(arrives) ? arrives : null, id);
  } else {
    run("UPDATE parts SET status = ? WHERE id = ?", status, id);
  }
  done();
}

/** Assign a part to a job; an empty job_id unassigns it. */
export async function assignPart(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("UPDATE parts SET job_id = ? WHERE id = ?", int(fd.get("job_id")), id);
  done();
}

export async function deletePart(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM parts WHERE id = ?", id);
  done();
}
