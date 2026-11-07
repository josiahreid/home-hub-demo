"use server";

import { revalidatePath } from "next/cache";
import { db, run } from "@/lib/db";
import { int, str } from "@/lib/format";
import { FEATURES, RESERVED_SLUGS, slugify } from "@/lib/family";

export type MemberState = { error?: string; message?: string };

function features(fd: FormData): string {
  return FEATURES.map((f) => f.value).filter((f) => fd.has(f)).join(",");
}

/** A member with wish lists switched on always has their own list to land on. */
function ensureOwnList(memberId: number, name: string, feats: string) {
  if (!feats.split(",").includes("wishlists")) return;
  const has = db.prepare("SELECT 1 FROM wish_lists WHERE member_id = ? LIMIT 1").get(memberId);
  if (!has) {
    const { n } = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM wish_lists").get() as { n: number };
    run("INSERT INTO wish_lists (member_id, name, sort) VALUES (?, ?, ?)", memberId, name, n);
  }
}

function done() {
  revalidatePath("/", "layout"); // the menu lists everyone
}

export async function addMember(_prev: MemberState, fd: FormData): Promise<MemberState> {
  const name = str(fd.get("name"));
  if (!name) return { error: "Give them a name." };
  const base = slugify(name);
  let slug = base;
  for (let i = 2; RESERVED_SLUGS.includes(slug) || db.prepare("SELECT 1 FROM members WHERE slug = ?").get(slug); i++) slug = `${base}-${i}`;
  const feats = features(fd);
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM members").get() as { n: number };
  const id = Number(run("INSERT INTO members (slug, name, features, sort) VALUES (?, ?, ?, ?)", slug, name, feats, n).lastInsertRowid);
  ensureOwnList(id, name, feats);
  done();
  return { message: `Added ${name}. They're in the menu under Family members.` };
}

export async function updateMember(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (!id || !name) return;
  const feats = features(fd);
  run("UPDATE members SET name = ?, features = ? WHERE id = ?", name, feats, id);
  ensureOwnList(id, name, feats);
  done();
}

export async function moveMember(fd: FormData) {
  const id = int(fd.get("id"));
  const dir = str(fd.get("dir")) === "up" ? -1 : 1;
  const ids = (db.prepare("SELECT id FROM members ORDER BY sort, id").all() as { id: number }[]).map((r) => r.id);
  const i = ids.indexOf(id ?? -1);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  ids.forEach((mid, n) => run("UPDATE members SET sort = ? WHERE id = ?", n, mid));
  done();
}

/** Removes a member and everything on their page (job cards, parts, wish lists, price cards). */
export async function deleteMember(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM members WHERE id = ?", id);
  done();
}
