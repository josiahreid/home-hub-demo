import "server-only";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { BACKUP_DIR, UPLOAD_DIR, db, fileStamp, getSetting, setSetting } from "./db";
import { today } from "./format";

/**
 * Backups of the database, kept in the data folder (so they're in the server's data volume too):
 * - before every update that changes the database (made in db.ts, before anything changes)
 * - once a day automatically
 * - whenever you press "Make a backup now"
 * A full backup to download is the database plus every uploaded photo/PDF, as one .zip.
 */

export type Backup = { file: string; kind: "update" | "daily" | "manual"; size: number; at: Date };

const KEEP: Record<Backup["kind"], number> = { update: 10, daily: 14, manual: 10 };
export const isBackupName = (f: string) => /^home-hub-\d{12}-[a-z0-9-]+\.db$/.test(f);

export function listBackups(): Backup[] {
  mkdirSync(BACKUP_DIR, { recursive: true });
  return readdirSync(BACKUP_DIR)
    .filter(isBackupName)
    .map((file) => {
      const st = statSync(path.join(BACKUP_DIR, file));
      const kind: Backup["kind"] = file.includes("before-update") ? "update" : file.includes("-daily") ? "daily" : "manual";
      return { file, kind, size: st.size, at: st.mtime };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** A consistent copy of the database right now (safe while the app is running). */
export function makeBackup(kind: "daily" | "manual") {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = fileStamp();
  const file = `home-hub-${stamp}-${kind}.db`;
  const full = path.join(BACKUP_DIR, file);
  try {
    unlinkSync(full); // VACUUM INTO won't overwrite (two in the same minute)
  } catch {}
  db.exec(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
  prune();
  return file;
}

/** Keeps the newest few of each kind so the backups don't fill the disk. */
function prune() {
  const byKind = Map.groupBy(listBackups(), (b) => b.kind);
  for (const [kind, list] of byKind) {
    for (const old of list.slice(KEEP[kind])) {
      try {
        unlinkSync(path.join(BACKUP_DIR, old.file));
      } catch {}
    }
  }
}

/** Once a day (called by the background clock): a daily backup if there isn't one yet today. */
export function dailyBackupTick() {
  if (getSetting("backup_daily_on") === "0" || getSetting("backup_daily_last") === today()) return;
  setSetting("backup_daily_last", today());
  makeBackup("daily");
}

function filesUnder(dir: string, base = dir): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(filesUnder(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

/** Everything in one .zip: a fresh copy of the database, plus every uploaded file. */
export function fullBackupZip(): { name: string; bytes: Uint8Array } {
  const tmpName = makeBackup("manual");
  const files: Record<string, Uint8Array> = { "home-hub.db": readFileSync(path.join(BACKUP_DIR, tmpName)) };
  mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const rel of filesUnder(UPLOAD_DIR)) files[`uploads/${rel.split(path.sep).join("/")}`] = readFileSync(path.join(UPLOAD_DIR, rel));
  // photos and PDFs are already compressed – storing them is as small and much faster
  const bytes = zipSync(files, { level: 0 });
  return { name: `home-hub-full-backup-${today()}.zip`, bytes };
}
