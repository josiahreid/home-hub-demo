import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { db, getSetting, run } from "./db";
import { importStatementBytes, type FileResult } from "./statement-import";

/**
 * The linked statements folder (e.g. iCloud Drive on this PC). "Refresh statements" walks it,
 * reads any .pdf/.csv that's new or has changed since last time, and remembers what it read.
 */

export const statementsFolder = () => getSetting("statements_folder") ?? null;

export async function checkFolder(folder: string): Promise<string | null> {
  try {
    const s = await stat(folder);
    return s.isDirectory() ? null : "That's a file, not a folder.";
  } catch {
    return "Home Hub can't find that folder on this computer. Copy the location from File Explorer's address bar.";
  }
}

async function walk(dir: string, root: string, out: string[]) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, out);
    else if (/\.(pdf|csv)$/i.test(entry.name)) out.push(path.relative(root, full));
  }
}

export async function folderSummary() {
  const folder = statementsFolder();
  const tracked = db.prepare("SELECT count(*) AS n, max(read_at) AS last, sum(status = 'imported') AS imported FROM statement_files").get() as
    { n: number; last: string | null; imported: number | null };
  return { folder, read: tracked.n, imported: tracked.imported ?? 0, lastRead: tracked.last };
}

export async function refreshFolder(): Promise<FileResult[]> {
  const folder = statementsFolder();
  if (!folder) throw new Error("Link a statements folder first.");
  const problem = await checkFolder(folder);
  if (problem) throw new Error(`The linked folder isn't available: ${problem}`);

  const files: string[] = [];
  await walk(folder, folder, files);
  // oldest first, so each account builds up in date order
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const known = new Map(
    (db.prepare("SELECT path, size, modified FROM statement_files").all() as { path: string; size: number; modified: string }[])
      .map((r) => [r.path, r]),
  );
  const remember = db.prepare(
    `INSERT INTO statement_files (path, size, modified, status, note) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET size = excluded.size, modified = excluded.modified, status = excluded.status,
       note = excluded.note, read_at = datetime('now')`,
  );

  const results: FileResult[] = [];
  for (const rel of files) {
    const full = path.join(folder, rel);
    const s = await stat(full);
    const modified = s.mtime.toISOString();
    const seen = known.get(rel);
    if (seen && seen.size === s.size && seen.modified === modified) continue; // already read, unchanged

    // iCloud downloads "online only" files on first read, which can take a moment
    const result = await importStatementBytes(rel, new Uint8Array(await readFile(full)));
    remember.run(rel, s.size, modified, result.status, result.note ?? result.check?.note ?? null);
    results.push(result);
  }
  return results;
}

export function forgetReadFiles() {
  run("DELETE FROM statement_files");
}
