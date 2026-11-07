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
  // the starting point; a new number when what the demo starts with changes, so a running demo picks it up
  const snapshot = path.join(DATA_DIR, "demo-start-v2.db");
  if (!existsSync(snapshot)) {
    db.prepare("SELECT 1").get(); // opens the database, so it's set up before the sample data goes in
    try {
      // the sample data script fills every tab (it uses its own connection to the same database)
      execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "sample-data.mjs")], { env: process.env, stdio: "ignore" });
    } catch {
      // already loaded, or nothing to add – the demo still works, just emptier
    }
    demoBudget(db);
    bringUpToDate(db);
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
      bringUpToDate(db);
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

// ── making the demo look lived-in ──

type Db = import("node:sqlite").DatabaseSync;
const nzToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// every date the sample data has, so it can all be moved forward together
const DATED: [table: string, column: string][] = [
  ["transactions", "date"], ["events", "start_date"], ["events", "end_date"], ["recurring_payments", "next_due"], ["todos", "due"],
  ["church_services", "date"], ["chores", "last_done"], ["vehicles", "wof_due"], ["vehicles", "rego_due"], ["vehicles", "insurance_due"],
  ["plans", "target_date"], ["wishlist", "buy_by"], ["job_cards", "due"], ["receipts", "date"], ["insurance_policies", "renewal_date"],
  ["utilities", "contract_end"], ["health_notes", "date"], ["income_sources", "ends_on"], ["parts", "arrives"], ["cardio_log", "date"],
];

/**
 * Moves every sample date forward so the newest transaction is yesterday – the money cards, This fortnight, the
 * calendar and Home always have something on them, however long the demo has been running.
 */
function bringUpToDate(db: Db) {
  const latest = (db.prepare("SELECT max(date) AS d FROM transactions").get() as { d: string | null }).d;
  if (!latest) return;
  const by = daysBetween(latest, nzToday()) - 1;
  if (by <= 0) return;
  for (const [t, c] of DATED) {
    try {
      db.prepare(`UPDATE "${t}" SET "${c}" = date("${c}", ?) WHERE "${c}" IS NOT NULL AND "${c}" <> ''`).run(`+${by} days`);
    } catch {
      // that table or column isn't in this version
    }
  }
  // payday moves by whole fortnights, so it stays on the same weekday
  const payday = (db.prepare("SELECT value FROM settings WHERE key = 'next_payday'").get() as { value: string } | undefined)?.value;
  if (payday) {
    const moved = new Date(Date.parse(payday) + Math.floor(by / 14) * 14 * 86_400_000).toISOString().slice(0, 10);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'next_payday'").run(moved);
  }
}

/** A filled-in budget: pay, payday, buckets made of lines (made-up amounts), ways to close the gap, balances. */
function demoBudget(db: Db) {
  const has = (sql: string) => (db.prepare(sql).get() as { n: number }).n > 0;
  if (has("SELECT count(*) AS n FROM budget_lines")) return;
  // a Friday payday, a few days ago (in the sample data's own time – it's moved forward with everything else)
  const latest = (db.prepare("SELECT max(date) AS d FROM transactions").get() as { d: string | null }).d ?? nzToday();
  const d = new Date(Date.parse(latest) - 4 * 86_400_000);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  db.prepare("INSERT INTO settings (key, value) VALUES ('next_payday', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(d.toISOString().slice(0, 10));
  if (!has("SELECT count(*) AS n FROM income_sources")) db.prepare("INSERT INTO income_sources (name, fortnightly_cents, included) VALUES ('Pay', 240000, 1)").run();

  const lines: [pot: string, name: string, dollars: number, category: string][] = [
    ["bills", "Mortgage", 750, "Bills"], ["bills", "Rates", 140, "Bills"], ["bills", "Power & internet", 210, "Bills"],
    ["bills", "Phones", 30, "Bills"], ["bills", "House & car insurance", 120, "Bills"], ["bills", "Subscriptions", 25, "Bills"],
    ["food", "Groceries", 400, "Groceries"], ["food", "Petrol", 100, "Transport"],
    ["sinking", "Car upkeep (WOF, rego, servicing)", 30, "Transport"], ["sinking", "Health & dental", 25, "Home & family"], ["sinking", "Christmas & birthdays", 20, "Eating out & fun"],
    ["spending", "Takeaways & cafés", 60, "Eating out & fun"], ["spending", "Shopping & household", 80, "Home & family"], ["spending", "Cash & misc", 30, "Other"],
    ["savings", "Emergency fund", 50, "Savings"],
  ];
  const pots = new Set((db.prepare("SELECT key FROM pots").all() as { key: string }[]).map((p) => p.key));
  lines.forEach(([pot, name, dollars, category], i) => {
    if (!pots.has(pot)) return;
    db.prepare("INSERT INTO budget_lines (grp, name, category, pot, budget_cents, sort, source) VALUES (?, ?, ?, ?, ?, ?, 'manual')").run(pot, name, category, pot, dollars * 100, i);
  });
  db.exec(`UPDATE pots SET fortnightly_cents = (SELECT coalesce(sum(budget_cents), 0) FROM budget_lines l WHERE l.pot = pots.key)
            WHERE EXISTS (SELECT 1 FROM budget_lines l WHERE l.pot = pots.key)`);
  const options: [string, number, string][] = [
    ["Switch power & internet plan", 40, "Compare plans on powerswitch.org.nz"],
    ["Cancel one streaming service", 15, ""],
    ["Meal-plan the groceries", 30, "Plan the week, one big shop"],
    ["Keep life cover", -19, "Costs money – shown as a negative"],
  ];
  options.forEach(([name, dollars, notes], i) =>
    db.prepare("INSERT INTO budget_options (name, saves_cents, used, notes, sort) VALUES (?, ?, 0, ?, ?)").run(name, dollars * 100, notes || null, i));
  const balances: [string, string, number][] = [["Everyday", "cash", 650], ["Savings", "cash", 3200], ["Credit card owing", "debt", 400]];
  balances.forEach(([name, kind, dollars], i) =>
    db.prepare("INSERT INTO balances (name, kind, amount_cents, sort) VALUES (?, ?, ?, ?)").run(name, kind, dollars * 100, i));
}
