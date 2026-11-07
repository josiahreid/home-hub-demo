import "server-only";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { UPLOAD_DIR } from "./db";

const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".pdf", ".gif", ".eml", ".msg", ".txt"]);

/** Saves an uploaded File into data/uploads and returns its stored name, or null if none was sent. */
export async function saveUpload(file: FormDataEntryValue | null, prefix: string): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  if (!ALLOWED.has(ext)) throw new Error(`File type ${ext} is not allowed`);
  const name = `${prefix}-${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

// The Files tab takes everyday documents too (never web pages or scripts, which a browser could run)
const DOCUMENTS = new Set([...ALLOWED, ".doc", ".docx", ".xls", ".xlsx", ".csv", ".odt", ".ods", ".rtf", ".zip", ".mp4", ".mov", ".m4a", ".mp3", ".wav"]);
export const isDocumentType = (fileName: string) => DOCUMENTS.has(path.extname(fileName).toLowerCase());

/** Saves a file for the Files tab; returns its stored name and size. */
export async function saveDocument(file: File): Promise<{ stored: string; size: number }> {
  const ext = path.extname(file.name).toLowerCase();
  if (!DOCUMENTS.has(ext)) throw new Error(`${ext || "That kind of file"} can't be uploaded`);
  const stored = `doc-${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
  return { stored, size: file.size };
}

export function fileUrl(name: string | null | undefined) {
  return name ? `/files/${encodeURIComponent(name)}` : null;
}
