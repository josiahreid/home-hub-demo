"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/lib/db";
import { int, str, today } from "@/lib/format";

function done() {
  revalidatePath("/[member]", "layout");
}

const date = (v: FormDataEntryValue | null) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : today();
};

export async function addHealthNote(fd: FormData) {
  const title = str(fd.get("title"));
  const memberId = int(fd.get("member_id"));
  if (!title || !memberId) return;
  run("INSERT INTO health_notes (member_id, title, date, notes) VALUES (?, ?, ?, ?)", memberId, title, date(fd.get("date")), str(fd.get("notes")));
  done();
}

export async function updateHealthNote(fd: FormData) {
  const id = int(fd.get("id"));
  const title = str(fd.get("title"));
  if (!id || !title) return;
  run("UPDATE health_notes SET title = ?, date = ?, notes = ? WHERE id = ?", title, date(fd.get("date")), str(fd.get("notes")), id);
  done();
}

export async function deleteHealthNote(fd: FormData) {
  run("DELETE FROM health_notes WHERE id = ?", int(fd.get("id")));
  done();
}
