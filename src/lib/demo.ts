import "server-only";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Demo mode (HOME_HUB_DEMO=1) – for a public "try it out" copy, never the real one. It starts filled with sample
 * data (people called "Default Name" until they're renamed), puts everything back the way it started every night,
 * and switches off anything that talks to the outside world: bank feed, Telegram, phone notifications, calendar
 * imports. A banner on every page says it's a demo.
 */
export const DEMO = process.env.HOME_HUB_DEMO === "1";

/** Why something's switched off – shown instead of doing it. */
export const DEMO_OFF = "Switched off in the demo – this only works in your own copy of Home Hub.";

const g = globalThis as unknown as { __homeHubDemo?: boolean };

/** Starts once per server: fills a fresh demo with sample data (and keeps a copy of it), then resets it nightly. */
export async function startDemo() {
  if (!DEMO || g.__homeHubDemo) return;
  g.__homeHubDemo = true;
  const { BACKUP_DIR, DATA_DIR, UPLOAD_DIR, db, getSetting, setSetting } = await import("./db");
  const snapshot = path.join(DATA_DIR, "demo-start.db");
  if (!existsSync(snapshot)) {
    db.prepare("SELECT 1").get(); // opens the database, so it's set up before the sample data goes in
    try {
      // the sample data script fills every tab (it uses its own connection to the same database)
      execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "sample-data.mjs")], { env: process.env, stdio: "ignore" });
    } catch {
      // already loaded, or nothing to add – the demo still works, just emptier
    }
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  }
  // every minute: is it time for tonight's reset (3am NZ)?
  setInterval(() => {
    const now = new Date();
    const day = now.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
    const hour = Number(now.toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", hour12: false }));
    if (hour !== 3 || getSetting("demo_reset") === day) return;
    try {
      resetDemo(db, snapshot, [UPLOAD_DIR, BACKUP_DIR]);
    } finally {
      setSetting("demo_reset", day);
    }
  }, 60_000);
}

/** Puts every table back the way the demo started, and clears uploaded files. */
function resetDemo(db: import("node:sqlite").DatabaseSync, snapshot: string, folders: string[]) {
  db.exec(`ATTACH '${snapshot.replace(/'/g, "''")}' AS snap`);
  try {
    const tables = (db.prepare("SELECT name FROM snap.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    for (const t of tables) {
      db.exec(`DELETE FROM main."${t}"`);
      db.exec(`INSERT INTO main."${t}" SELECT * FROM snap."${t}"`);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("DETACH snap");
  }
  for (const dir of folders) {
    try {
      for (const f of readdirSync(dir)) rmSync(path.join(dir, f), { recursive: true, force: true });
    } catch {}
  }
}
