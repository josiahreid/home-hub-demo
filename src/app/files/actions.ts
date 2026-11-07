"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { db, run, UPLOAD_DIR } from "@/lib/db";
import { int, str } from "@/lib/format";
import { saveDocument } from "@/lib/uploads";
import { DEMO } from "@/lib/demo";

function done() {
  revalidatePath("/files");
  revalidatePath("/settings/storage");
}

export type UploadResult = { ok: boolean; error?: string };

/** One file from the uploader (it sends them one at a time, so a whole folder can't time out or hit a size limit). */
export async function uploadDocument(fd: FormData): Promise<UploadResult> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Empty file" };
  if (DEMO && file.size > 2_000_000) return { ok: false, error: "The demo takes files up to 2 MB" };
  const folder = int(fd.get("folder_id"));
  try {
    const { stored, size } = await saveDocument(file);
    // a whole-folder upload keeps the folder each file was in ("Tax 2025/Receipts/rates.pdf" → "Tax 2025/Receipts")
    const rel = str(fd.get("relative_path"));
    const sub = rel && rel.includes("/") ? rel.split("/").slice(0, -1).join("/").slice(0, 200) : null;
    run("INSERT INTO documents (folder_id, name, subfolder, file_name, size) VALUES (?, ?, ?, ?, ?)",
      folder && db.prepare("SELECT 1 FROM doc_folders WHERE id = ?").get(folder) ? folder : null, file.name.slice(0, 200), sub, stored, size);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** After an upload batch: refresh the page once. */
export async function uploadsDone() {
  done();
}

export async function updateDocument(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (!id || !name) return;
  const folder = int(fd.get("folder_id"));
  run("UPDATE documents SET name = ?, folder_id = ?, notes = ? WHERE id = ?", name.slice(0, 200), folder, str(fd.get("notes")), id);
  done();
}

export async function deleteDocument(fd: FormData) {
  const row = db.prepare("SELECT file_name FROM documents WHERE id = ?").get(int(fd.get("id"))) as { file_name: string } | undefined;
  if (!row) return;
  run("DELETE FROM documents WHERE id = ?", int(fd.get("id")));
  try {
    await unlink(path.join(UPLOAD_DIR, path.basename(row.file_name)));
  } catch {}
  done();
}

export async function addFolder(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) return;
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM doc_folders").get() as { n: number };
  const icon = new Intl.Segmenter().segment((str(fd.get("icon")) ?? "").trim())[Symbol.iterator]().next().value?.segment || "📁";
  run("INSERT OR IGNORE INTO doc_folders (name, icon, sort) VALUES (?, ?, ?)", name.slice(0, 50), icon, n);
  done();
}

export async function renameFolder(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (!id || !name) return;
  const icon = new Intl.Segmenter().segment((str(fd.get("icon")) ?? "").trim())[Symbol.iterator]().next().value?.segment;
  run("UPDATE OR IGNORE doc_folders SET name = ?, icon = coalesce(?, icon) WHERE id = ?", name.slice(0, 50), icon ?? null, id);
  done();
}

/** Deletes a folder – its files aren't deleted, they move to "Not in a folder". */
export async function deleteFolder(fd: FormData) {
  const id = int(fd.get("id"));
  run("UPDATE documents SET folder_id = NULL WHERE folder_id = ?", id);
  run("DELETE FROM doc_folders WHERE id = ?", id);
  done();
}
