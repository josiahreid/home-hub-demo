"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run } from "@/lib/db";
import { int, str, toCents } from "@/lib/format";
import { HUNT_STATUSES, splitTags } from "./shared";

const STATUS_VALUES: string[] = HUNT_STATUSES.map((s) => s.value);

function done() {
  revalidatePath("/[member]", "layout");
}

function cleanTags(v: FormDataEntryValue | null): string | null {
  const tags = [...new Set(splitTags(str(v)).map((t) => t.toLowerCase()))];
  return tags.length ? tags.join(", ") : null;
}

function status(v: FormDataEntryValue | null): string {
  const s = str(v);
  return s && STATUS_VALUES.includes(s) ? s : "idea";
}

function date(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** The page address of the member who owns a price card. */
function slugOfHunt(huntId: number): string {
  const row = db.prepare("SELECT m.slug FROM price_hunts h JOIN members m ON m.id = h.member_id WHERE h.id = ?").get(huntId) as { slug: string } | undefined;
  return row?.slug ?? "default-name";
}

// ── Cards ──

export async function createHunt(fd: FormData) {
  const title = str(fd.get("title"));
  const memberId = int(fd.get("member_id"));
  if (!title || !memberId) return;
  const id = Number(
    run(
      "INSERT INTO price_hunts (member_id, title, description, tags, status) VALUES (?, ?, ?, ?, ?)",
      memberId, title, str(fd.get("description")), cleanTags(fd.get("tags")), status(fd.get("status")),
    ).lastInsertRowid,
  );
  done();
  redirect(`/${slugOfHunt(id)}/prices/${id}`);
}

export async function updateHunt(fd: FormData) {
  const id = int(fd.get("id"));
  const title = str(fd.get("title"));
  if (!id || !title) return;
  run("UPDATE price_hunts SET title = ?, description = ?, tags = ? WHERE id = ?", title, str(fd.get("description")), cleanTags(fd.get("tags")), id);
  done();
}

export async function setHuntStatus(fd: FormData) {
  const id = int(fd.get("id"));
  const s = str(fd.get("status"));
  if (!id || !s || !STATUS_VALUES.includes(s)) return;
  run("UPDATE price_hunts SET status = ? WHERE id = ?", s, id);
  done();
}

export async function deleteHunt(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const slug = slugOfHunt(id);
  run("DELETE FROM price_hunts WHERE id = ?", id);
  done();
  redirect(`/${slug}/prices`);
}

// ── Links (one per shop) ──

function linkFields(fd: FormData) {
  const sale = toCents(fd.get("sale_price"));
  return [
    str(fd.get("shop")),
    str(fd.get("url")),
    toCents(fd.get("price")),
    sale,
    sale == null ? null : date(fd.get("sale_ends")), // an end date without a sale price means nothing
    str(fd.get("notes")),
  ] as const;
}

export async function addLink(fd: FormData) {
  const huntId = int(fd.get("hunt_id"));
  const fields = linkFields(fd);
  if (!huntId || (!fields[0] && !fields[1])) return; // needs a shop name or a link
  run(
    "INSERT INTO price_links (hunt_id, shop, url, price_cents, sale_cents, sale_ends, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    huntId, ...fields,
  );
  done();
}

export async function updateLink(fd: FormData) {
  const id = int(fd.get("id"));
  const fields = linkFields(fd);
  if (!id || (!fields[0] && !fields[1])) return;
  run(
    "UPDATE price_links SET shop = ?, url = ?, price_cents = ?, sale_cents = ?, sale_ends = ?, notes = ?, checked_on = date('now', 'localtime') WHERE id = ?",
    ...fields, id,
  );
  done();
}

export async function deleteLink(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM price_links WHERE id = ?", id);
  done();
}
