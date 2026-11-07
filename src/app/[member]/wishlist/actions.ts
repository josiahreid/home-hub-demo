"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run } from "@/lib/db";
import { int, str, toCents } from "@/lib/format";
import { WISH_STATUSES } from "./shared";

const STATUS_VALUES: string[] = WISH_STATUSES.map((s) => s.value);

function done() {
  revalidatePath("/[member]", "layout");
}

function priority(v: FormDataEntryValue | null): number {
  const p = int(v);
  return p === 1 || p === 3 ? p : 2;
}

function fields(fd: FormData) {
  return [
    str(fd.get("occasion")) ?? "Any time",
    str(fd.get("url")),
    toCents(fd.get("price")),
    priority(fd.get("priority")),
    str(fd.get("notes")),
    str(fd.get("buy_by")),
  ] as const;
}

export async function addWish(fd: FormData) {
  const item = str(fd.get("item"));
  if (!item) return;
  run(
    "INSERT INTO wishlist (item, occasion, url, price_cents, priority, notes, buy_by, list_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    item, ...fields(fd), int(fd.get("list_id")) ?? 1,
  );
  done();
}

export async function updateWish(fd: FormData) {
  const id = int(fd.get("id"));
  const item = str(fd.get("item"));
  if (!id || !item) return;
  run("UPDATE wishlist SET item = ?, occasion = ?, url = ?, price_cents = ?, priority = ?, notes = ?, buy_by = ? WHERE id = ?", item, ...fields(fd), id);
  done();
}

export async function setWishStatus(fd: FormData) {
  const id = int(fd.get("id"));
  const status = str(fd.get("status"));
  if (!id || !status || !STATUS_VALUES.includes(status)) return;
  run("UPDATE wishlist SET status = ? WHERE id = ?", status, id);
  done();
}

export async function deleteWish(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM wishlist WHERE id = ?", id);
  done();
}

// ── wish lists (one per person) ──

/** The page address of the member who owns a wish list. */
function slugOfList(listId: number): string {
  const row = db.prepare("SELECT m.slug FROM wish_lists l JOIN members m ON m.id = l.member_id WHERE l.id = ?").get(listId) as { slug: string } | undefined;
  return row?.slug ?? "default-name-2";
}

export async function createList(fd: FormData) {
  const name = str(fd.get("name"));
  const memberId = int(fd.get("member_id"));
  if (!name || !memberId) return;
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM wish_lists").get() as { n: number };
  const id = Number(run("INSERT INTO wish_lists (member_id, name, notes, sort) VALUES (?, ?, ?, ?)", memberId, name, str(fd.get("notes")), n).lastInsertRowid);
  revalidatePath("/", "layout");
  redirect(`/${slugOfList(id)}/wishlist/${id}`);
}

export async function updateList(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) return;
  run("UPDATE wish_lists SET name = ?, notes = ? WHERE id = ?", name, str(fd.get("notes")), int(fd.get("id")));
  done();
}

export async function deleteList(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  // the member's own list (their first) stays
  const first = db.prepare("SELECT min(id) AS id FROM wish_lists WHERE member_id = (SELECT member_id FROM wish_lists WHERE id = ?)").get(id) as { id: number };
  if (id === first.id) return;
  const slug = slugOfList(id);
  run("DELETE FROM wish_lists WHERE id = ?", id);
  revalidatePath("/", "layout");
  redirect(`/${slug}/wishlist`);
}
