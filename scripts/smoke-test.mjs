// Checks a running Home Hub the way a person would: the database opens, the main pages load, and the
// page scripts they need are really there (missing scripts = a blank white screen).
// Used by the GitHub release check before a new version is allowed onto the server; works locally too:
//   node scripts/smoke-test.mjs http://127.0.0.1:3000
// Exits 1 and says what failed if anything is wrong.

const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
// pick a person, so pages render properly instead of the "Who are you?" screen
const headers = { cookie: "hh_user=default-name" };
const PAGES = [
  "/",
  "/budget",
  "/budget/setup",
  "/budget/sort",
  "/calendar",
  "/default-name/calendar",
  "/default-name/health",
  "/default-name/workout",
  "/todos",
  "/food/groceries",
  "/house/chores",
  "/church",
  "/insurance",
  "/files",
  "/settings",
  "/settings/backups",
  "/settings/storage",
  "/settings/push",
  "/settings/api/akahu",
];

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
};

async function waitForHealth() {
  const until = Date.now() + 120_000;
  let last = "no answer";
  while (Date.now() < until) {
    try {
      const r = await fetch(`${base}/api/health`);
      const j = await r.json();
      if (r.ok && j.ok) return j;
      last = `${r.status} ${JSON.stringify(j)}`;
    } catch (e) {
      last = e.cause?.code || e.message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Home Hub didn't start within 2 minutes (last: ${last})`);
}

const health = await waitForHealth();
console.log(`Home Hub is up – database version ${health.db}`);
// --up-only: just wait until it's running (an older version may not have all of today's pages)
if (process.argv.includes("--up-only")) process.exit(0);

const scripts = new Set();
for (const page of PAGES) {
  try {
    const r = await fetch(base + page, { headers });
    const html = await r.text();
    if (!r.ok) fail(`${page} → ${r.status}`);
    else if (!html.includes("</html>")) fail(`${page} → page didn't finish`);
    else if (/Application error|Internal Server Error/i.test(html)) fail(`${page} → shows an error`);
    else console.log(`  ✓ ${page}`);
    for (const m of html.matchAll(/\/_next\/static\/[^"'\s)]+?\.(?:js|css)/g)) scripts.add(m[0]);
  } catch (e) {
    fail(`${page} → ${e.cause?.code || e.message}`);
  }
}

if (scripts.size === 0) fail("no page scripts found – the app would be a blank screen");
let missing = 0;
for (const s of scripts) {
  const r = await fetch(base + s);
  await r.arrayBuffer();
  if (!r.ok) {
    missing++;
    fail(`${s} → ${r.status}`);
  }
}
if (!missing) console.log(`  ✓ all ${scripts.size} page scripts and styles load`);

if (failures.length) {
  console.log(`\n${failures.length} problem(s) – this version must not go to the server.`);
  process.exit(1);
}
console.log("\nAll good.");
// for the release check: the database version this copy is on
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, `db=${health.db}\n`);
}
