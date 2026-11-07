import "server-only";
import { readdirSync, statSync, statfsSync } from "node:fs";
import path from "node:path";
import { BACKUP_DIR, DATA_DIR, UPLOAD_DIR, getSetting, setSetting } from "./db";
import { today } from "./format";

/**
 * How much room Home Hub takes up: the database, uploaded files (photos, PDFs, songs…), its own backups – and
 * how much is left on the disk. A snapshot is kept once a day, so Settings → Storage can show how it's growing.
 */

export type Usage = { database: number; uploads: number; backups: number; other: number; total: number; files: number };
export type Snapshot = Usage & { date: string };

/** Total size of a folder (and everything in it), and how many files. */
function folderSize(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return { bytes, files };
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = folderSize(p);
      bytes += sub.bytes;
      files += sub.files;
    } else if (e.isFile()) {
      try {
        bytes += statSync(p).size;
        files++;
      } catch {}
    }
  }
  return { bytes, files };
}

export function storageUsage(): Usage {
  const all = folderSize(DATA_DIR);
  const uploads = folderSize(UPLOAD_DIR);
  const backups = folderSize(BACKUP_DIR);
  let database = 0;
  for (const f of ["home-hub.db", "home-hub.db-wal", "home-hub.db-shm"]) {
    try {
      database += statSync(path.join(DATA_DIR, f)).size;
    } catch {}
  }
  return {
    database,
    uploads: uploads.bytes,
    backups: backups.bytes,
    other: Math.max(0, all.bytes - database - uploads.bytes - backups.bytes),
    total: all.bytes,
    files: uploads.files,
  };
}

/** The disk Home Hub's data is on (on the server: the host's disk), or null if it can't be read. */
export function diskSpace(): { size: number; free: number } | null {
  try {
    const s = statfsSync(DATA_DIR);
    return { size: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

/** Uploaded files by type (photos, PDFs, audio…), biggest first. */
export function uploadsByType(): { label: string; bytes: number; files: number }[] {
  const groups = new Map<string, { bytes: number; files: number }>();
  const kind = (name: string) => {
    const ext = path.extname(name).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"].includes(ext)) return "Photos";
    if (ext === ".pdf") return "PDFs";
    if ([".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg"].includes(ext)) return "Songs & audio";
    if ([".mp4", ".mov", ".m4v", ".webm"].includes(ext)) return "Videos";
    return "Other files";
  };
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const g = groups.get(kind(e.name)) ?? { bytes: 0, files: 0 };
        try {
          g.bytes += statSync(p).size;
          g.files++;
        } catch {}
        groups.set(kind(e.name), g);
      }
    }
  };
  walk(UPLOAD_DIR);
  return [...groups].map(([label, g]) => ({ label, ...g })).sort((a, b) => b.bytes - a.bytes);
}

export function storageHistory(): Snapshot[] {
  try {
    const h = JSON.parse(getSetting("storage_history") ?? "[]");
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

/** Today's snapshot (replacing an earlier one from today). Keeps two years. */
export function recordStorage() {
  const day = today();
  const list = storageHistory().filter((s) => s.date !== day);
  list.push({ date: day, ...storageUsage() });
  setSetting("storage_history", JSON.stringify(list.slice(-730)));
}

/** Runs every minute from the worker: one snapshot a day. */
export function storageTick() {
  if (storageHistory().at(-1)?.date !== today()) recordStorage();
}

/** "1.4 GB", "820 KB" */
export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
