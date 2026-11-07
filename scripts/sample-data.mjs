// Fills every tab with realistic sample data for showing the app off.
// Everything added is recorded in sample_rows / sample_fills, so the "Remove sample data"
// button on the Home page takes out exactly this and nothing else.
//
//   npm run sample          (the app must have been opened once so the database is up to date)

import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const db = new DatabaseSync(path.join(process.env.HOME_HUB_DATA_DIR || path.join(process.cwd(), "app-data"), "home-hub.db"));
db.exec("PRAGMA foreign_keys = ON");

const { user_version } = db.prepare("PRAGMA user_version").get();
if (user_version < 3) {
  console.error("Open the app once first (npm run dev, then load any page) so the database is up to date.");
  process.exit(1);
}
// Each section loads once; sections added later still load on top of earlier sample data.
const loaded = (table) => db.prepare("SELECT count(*) AS n FROM sample_rows WHERE tbl = ?").get(table).n > 0;
const loadMain = !loaded("accounts");
const loadChurch = !loaded("church_services");
if (!loadMain && !loadChurch) {
  console.error("Sample data is already loaded. Remove it from the Home page first if you want to reload it.");
  process.exit(1);
}

const c = (dollars) => Math.round(dollars * 100);

function add(table, row) {
  const cols = Object.keys(row);
  const id = Number(
    db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
      .run(...cols.map((k) => row[k] ?? null)).lastInsertRowid,
  );
  db.prepare("INSERT INTO sample_rows (tbl, row_id) VALUES (?, ?)").run(table, id);
  return id;
}

/** Fill empty columns on an existing (real) row; removal sets them back to NULL. */
function fill(table, id, values) {
  for (const [col, value] of Object.entries(values)) {
    const current = db.prepare(`SELECT ${col} AS v FROM ${table} WHERE id = ?`).get(id);
    if (current && current.v == null) {
      db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).run(value, id);
      db.prepare("INSERT INTO sample_fills (tbl, row_id, col) VALUES (?, ?, ?)").run(table, id, col);
    }
  }
}

db.exec("BEGIN");
try {
  if (loadMain) main();
  if (loadChurch) church();
  db.exec("COMMIT");
  console.log(`Sample data loaded (${[loadMain && "main", loadChurch && "church"].filter(Boolean).join(" + ")}): ${db.prepare("SELECT count(*) AS n FROM sample_rows").get().n} sample rows in total.`);
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

function church() {
  const service = (date, title = "Sunday service", time = "10:00", extra = {}) =>
    add("church_services", { date, title, time, kind: /sunday/i.test(title) ? "sunday" : "event", ...extra });
  const role = (service_id, person, r, instruments = null) => add("church_roles", { service_id, person, role: "Serving", notes: [r, instruments].filter(Boolean).join(" · ") });
  const songs = (service_id, list) => list.forEach(([title, artist, song_key], i) => add("church_songs", { service_id, title, artist, song_key, sort: i + 1 }));

  // past
  const sep27 = service("2026-09-27");
  role(sep27, "Default Name", "Band", "Bass");
  songs(sep27, [["Goodness of God", "Bethel Music", "A"], ["Way Maker", "Sinach", "E"], ["Build My Life", "Pat Barrett", "G"]]);
  const oct4 = service("2026-10-04");
  role(oct4, "Default Name 2", "MC");
  role(oct4, "Default Name", "Production", "Sound");
  songs(oct4, [["10,000 Reasons", "Matt Redman", "G"], ["Living Hope", "Phil Wickham", "C"], ["Goodness of God", "Bethel Music", "A"]]);

  // coming up
  const oct18 = service("2026-10-18", "Sunday service", "10:00", { spotify_url: "https://open.spotify.com/" });
  role(oct18, "Default Name", "Band", "Bass, Vocals (BV)");
  role(oct18, "Default Name 2", "MC");
  songs(oct18, [["Gratitude", "Brandon Lake", "B"], ["Goodness of God", "Bethel Music", "A"], ["King of Kings", "Hillsong Worship", "D"], ["Holy Forever", "Chris Tomlin", "A"]]);
  const nov1 = service("2026-11-01");
  role(nov1, "Default Name 2", "Band", "Vocals (BV)");
  role(nov1, "Default Name", "Production", "Lyrics / slides");
  songs(nov1, [["Way Maker", "Sinach", "E"], ["Living Hope", "Phil Wickham", "C"]]);
  const nov15 = service("2026-11-15");
  role(nov15, "Default Name", "MC");
  const nov22 = service("2026-11-22");
  role(nov22, "Default Name", "Band", "Acoustic guitar");
  role(nov22, "Default Name 2", "Band", "Lead vocals");

  // not Sundays
  const workingBee = service("2026-10-24", "Working bee", "09:00", { location: "Church grounds", notes: "Bring gloves and a rake" });
  role(workingBee, "Default Name", "Other");
  service("2026-11-06", "Worship night", "19:00", { location: "Church" });
  const carols = service("2026-12-20", "Carols by candlelight", "18:30", { location: "Queen Elizabeth Park" });
  role(carols, "Default Name", "Band", "Bass");
  role(carols, "Default Name 2", "Band", "Vocals (BV)");

  // practices
  add("church_practices", { person: "Default Name", service_id: oct18, date: "2026-10-15", time: "19:00", location: "Church", notes: "Full band run-through" });
  add("church_practices", { person: "Both", service_id: nov22, date: "2026-11-19", time: "19:00", location: "Church" });
  add("church_practices", { person: "Both", service_id: carols, date: "2026-12-17", time: "19:00", location: "Church", notes: "Carols set" });

  // links (placeholders to replace with the real ones)
  for (const person of ["Default Name", "Default Name 2"]) {
    add("church_links", { person, kind: "calendar", label: "Church roster (sample link)", url: "https://www.planningcenter.com/" });
    add("church_links", { person, kind: "spotify", label: "Worship set playlist (sample link)", url: "https://open.spotify.com/" });
  }
}

function main() {
  // ── Budget: two fortnights of Westpac Everyday transactions ──
  const acct = add("accounts", { name: "Westpac Everyday (sample)", institution: "Westpac", kind: "everyday" });
  const tx = (date, description, amount, category) =>
    add("transactions", { account_id: acct, date, description, amount_cents: c(amount), category, source: "import" });

  for (const payday of ["2026-09-17", "2026-10-01"]) {
    tx(payday, "ACME LTD · Salary", 2250, "Income");
    tx(payday, "WESTPAC HOME LOAN · 0123-0456789-091", -850, "Mortgage");
    tx(payday, "HOMETOWN DISTRICT COUNCIL · Rates", -150, "Rates");
    tx(payday, "UDC FINANCE · Outlander", -195.62, "Car loan");
    tx(payday, "TOWER INSURANCE · House contents car", -130, "Insurance");
  }
  tx("2026-09-25", "2DEGREES · Power + broadband", -578.5, "Utilities");
  tx("2026-09-20", "SPARK NZ · Mobile", -55.0, "Phone");
  tx("2026-10-03", "NORTHLAND WASTE", -28.17, "Rubbish");

  // last fortnight
  tx("2026-09-19", "PAK N SAVE HOMETOWN · 1234****", -201.15, "Groceries");
  tx("2026-09-26", "NEW WORLD HOMETOWN · 1234****", -58.4, "Groceries");
  tx("2026-09-22", "WAITOMO HOMETOWN · 1234****", -61.0, "Fuel");
  tx("2026-09-24", "UBER EATS · 1234****", -42.9, "Eating out");
  tx("2026-09-28", "THE WAREHOUSE HOMETOWN · 1234****", -48.0, "Shopping & household");
  tx("2026-09-29", "SCREENING ROOM · Tickets", -32.0, "Entertainment");
  // this fortnight (1–14 Oct)
  tx("2026-10-02", "SPOTIFY P2D4A8 · Subscription", -28.99, "Subscriptions");
  tx("2026-10-03", "PAK N SAVE HOMETOWN · 1234****", -187.43, "Groceries");
  tx("2026-10-04", "UBER EATS · 1234****", -38.5, "Eating out");
  tx("2026-10-05", "Z ENERGY HOMETOWN · 1234****", -84.2, "Fuel");
  tx("2026-10-06", "XBOX GAME PASS · Microsoft", -21.95, "Subscriptions");
  tx("2026-10-06", "CAFE ON QUEEN · 1234****", -12.8, "Eating out");
  tx("2026-10-07", "NEW WORLD HOMETOWN · 1234****", -42.1, "Groceries");
  tx("2026-10-07", "BABY FACTORY · 1234****", -34.99, "Kids & baby");
  tx("2026-10-08", "KMART HOMETOWN · 1234****", -64.0, "Shopping & household");
  tx("2026-10-09", "APPLE.COM/BILL · iCloud", -16.99, "Subscriptions");
  tx("2026-10-09", "MCDONALDS HOMETOWN · 1234****", -21.4, "Eating out");
  tx("2026-10-10", "WOOLWORTHS HOMETOWN · 1234****", -63.2, "Groceries");
  tx("2026-10-10", "UNICHEM HOMETOWN · 1234****", -18.5, "Health");
  tx("2026-10-11", "MITRE 10 HOMETOWN · 1234****", -37.98, "Shopping & household");
  tx("2026-10-11", "GULL HOMETOWN · 1234****", -70.0, "Fuel");
  tx("2026-10-12", "POS W/D 1234 HOMETOWN", -20.0, null); // left uncategorised on purpose

  // ── Calendar ──
  const xmas = add("events", { title: "Christmas Day", start_date: "2026-12-25", kind: "general", budget_cents: c(300), notes: "Lunch at ours" });
  add("events", { title: "Date night", start_date: "2026-10-24", start_time: "18:30", kind: "general", budget_cents: c(80), location: "Hometown" });
  add("events", { title: "Labour Day", start_date: "2026-10-26", kind: "general" });
  add("events", { title: "Plunket check", start_date: "2026-10-20", start_time: "10:00", kind: "appointment", location: "Plunket Hometown" });
  add("events", { title: "Family BBQ", start_date: "2026-11-07", start_time: "12:00", kind: "party", budget_cents: c(120) });
  add("bin_schedules", { bin: "Rubbish", anchor_date: "2026-10-13", interval_weeks: 1 });
  add("bin_schedules", { bin: "Recycling", anchor_date: "2026-10-20", interval_weeks: 2 });

  // ── Plans & goals ──
  add("plans", { name: "Christmas", target_cents: c(400), saved_cents: c(60), start_date: "2026-10-01", target_date: "2026-12-20", event_id: xmas, notes: "Presents + food" });
  add("plans", { name: "Emergency fund (3 months)", target_cents: c(7953.72), saved_cents: c(4000), start_date: "2026-10-01", target_date: "2027-12-31", notes: "Goal from the budget spreadsheet" });

  // ── Car: fill in the real Outlander, plus sample parts and servicing ──
  const outlander = db.prepare("SELECT id FROM vehicles WHERE name LIKE '%Outlander%'").get()?.id
    ?? add("vehicles", { name: "Outlander", make: "Mitsubishi", model: "Outlander" });
  fill("vehicles", outlander, { year: 2017, odometer_km: 128400, wof_due: "2026-11-03", rego_due: "2027-02-14", insurance_due: "2027-03-01" });
  for (const p of [
    { part: "Wiper blade (driver)", spec: '26" hook', brand: "Bosch", cost_cents: c(24.99), supplier: "Repco" },
    { part: "Wiper blade (passenger)", spec: '16" hook', brand: "Bosch", cost_cents: c(19.99), supplier: "Repco" },
    { part: "Tyres (front)", spec: "225/55R18 98V", brand: "Bridgestone Turanza", cost_cents: c(219), supplier: "Hometown Tyres", last_replaced: "2025-08-14" },
    { part: "Engine oil", spec: "5W-30, 4.3 L", brand: "Castrol Edge", cost_cents: c(74.99), supplier: "Supercheap Auto" },
    { part: "Battery", spec: "Q85 (EFB)", brand: "Century", cost_cents: c(289), supplier: "Repco" },
  ]) add("vehicle_parts", { vehicle_id: outlander, ...p });
  add("vehicle_services", { vehicle_id: outlander, task: "Oil & filter change", interval_months: 12, interval_km: 10000, last_done_date: "2026-03-20", last_done_km: 120500, est_cost_cents: c(180) });
  add("vehicle_services", { vehicle_id: outlander, task: "Tyre rotation", interval_months: 6, interval_km: 10000, last_done_date: "2026-03-20", last_done_km: 120500, est_cost_cents: c(40) });
  add("vehicle_services", { vehicle_id: outlander, task: "Brake fluid", interval_months: 24, last_done_date: "2025-01-15", last_done_km: 104000, est_cost_cents: c(120) });
  add("vehicle_log", { vehicle_id: outlander, date: "2026-03-20", odometer_km: 120500, description: "Full service + tyre rotation", cost_cents: c(219) });
  add("vehicle_log", { vehicle_id: outlander, date: "2025-11-02", odometer_km: 113900, description: "WOF", cost_cents: c(76) });

  // ── Utilities: 2degrees bill history (from the spreadsheet) and an offer to compare ──
  const twoDeg = db.prepare("SELECT id FROM utilities WHERE provider = '2degrees'").get()?.id;
  if (twoDeg) {
    for (const [end, amount] of [["2026-02-22", 563], ["2026-03-22", 439], ["2026-04-22", 453], ["2026-05-22", 753], ["2026-06-22", 555], ["2026-07-22", 613], ["2026-08-22", 928], ["2026-09-22", 756]]) {
      add("utility_bills", { utility_id: twoDeg, period_end: end, amount_cents: c(amount) });
    }
    add("utility_offers", { utility_id: twoDeg, provider: "Electric Kiwi + broadband", plan: "Estimate", monthly_cents: c(448.5), url: "https://www.powerswitch.org.nz", notes: "≈ $60/fortnight saving estimate from the budget – check on Powerswitch" });
  }

  // ── House ──
  const daysAgo = (n) => new Date(Date.UTC(2026, 9, 12 - n)).toISOString().slice(0, 10);
  for (const [name, kind, area, every, last] of [
    ["Mow lawns", "chore", "Outdoor", 14, 16], ["Clean gutters", "chore", "Outdoor", 182, 150], ["Wash the car", "chore", "Garage", 30, 20],
    ["Vacuum whole house", "cleaning", "Whole house", 7, 8], ["Clean bathroom", "cleaning", "Bathroom", 7, 5], ["Change sheets", "cleaning", "Bedroom", 7, 7],
    ["Wipe kitchen benches", "cleaning", "Kitchen", 1, 0], ["Clean oven", "cleaning", "Kitchen", 90, 95], ["Wash windows", "cleaning", "Whole house", 90, 30],
  ]) add("chores", { name, kind, area, every_days: every, last_done: daysAgo(last) });
  const bathroom = add("house_projects", { name: "Bathroom refresh", status: "planning", budget_cents: c(1500), notes: "New vanity, paint, extractor fan" });
  add("project_costs", { project_id: bathroom, date: "2026-10-04", description: "Paint + primer (Mitre 10)", amount_cents: c(89.9) });
  const plumber = add("businesses", { name: "Hometown Plumbing", trade: "Plumber", contact_name: "Dave", email: "quotes@hometownplumbing.example", phone: "021 555 0101", notes: "Sample business" });
  const sparky = add("businesses", { name: "Wairarapa Electrical", trade: "Electrician", contact_name: "Sarah", email: "office@wairarapaelectrical.example", phone: "027 555 0202", notes: "Sample business" });
  add("quotes", { project_id: bathroom, business_id: plumber, supplier: "Hometown Plumbing", description: "Supply & install vanity", amount_cents: c(1150), date: "2026-10-02", valid_until: "2026-11-02", status: "received" });
  add("quotes", { project_id: bathroom, business_id: sparky, supplier: "Wairarapa Electrical", description: "Extractor fan install", amount_cents: c(420), date: "2026-09-28", valid_until: "2026-10-10", status: "received" });
  add("project_emails", {
    project_id: bathroom, business_id: plumber, direction: "received", from_addr: "Dave <quotes@hometownplumbing.example>",
    subject: "Quote – bathroom vanity", date: "2026-10-02",
    body: "Hi Default Name,\n\nThanks for having us round. Quote attached for supplying and installing the 900mm vanity, including disconnect/reconnect of the existing waste.\n\nWe can start the week of 9 November.\n\nCheers,\nDave",
  });

  // ── Default Name: projects ──
  // (older databases have no members table; newer ones put these on Default Name's and Default Name 2's pages)
  const memberId = (slug) => { try { return db.prepare("SELECT id FROM members WHERE slug = ?").get(slug)?.id ?? null; } catch { return null; } };
  const personA = memberId("default-name");
  const rosList = db.prepare("SELECT min(id) AS id FROM wish_lists").get()?.id ?? null;
  const esp = add("job_cards", { member_id: personA, title: "ESP32 garage door sensor", description: "Know if the garage is open from the phone", job_type: "Home automation", tags: "esp32,garage,3d print", status: "in_progress", priority: 1 });
  ["Order parts", "Flash ESPHome", "Print case", "Mount reed switch on door", "Add to Home Assistant"].forEach((text, i) =>
    add("job_steps", { job_id: esp, text, done: i < 2 ? 1 : 0, sort: i + 1 }));
  add("parts", { member_id: personA, job_id: esp, name: "ESP32 dev board", url: "https://www.aliexpress.com/w/wholesale-esp32-devkit.html", price_cents: c(8.5), quantity: 2, status: "received" });
  add("parts", { member_id: personA, job_id: esp, name: "Magnetic reed switch", url: "https://www.aliexpress.com/w/wholesale-reed-switch-door.html", price_cents: c(3.2), quantity: 3, status: "ordered" });
  add("parts", { member_id: personA, job_id: esp, name: "PETG filament 1 kg", url: "https://www.aliexpress.com/w/wholesale-petg-filament.html", price_cents: c(24), quantity: 1, status: "wishlist" });
  const dashcam = add("job_cards", { member_id: personA, title: "Outlander dashcam hardwire", job_type: "Car", tags: "car,wiring", status: "planned", priority: 2, due: "2026-11-15" });
  ["Find fuse tap location", "Run cable along headliner", "Test parking mode"].forEach((text, i) => add("job_steps", { job_id: dashcam, text, sort: i + 1 }));
  add("parts", { member_id: personA, job_id: dashcam, name: "Hardwire kit (USB-C)", url: "https://www.aliexpress.com/w/wholesale-dashcam-hardwire-kit.html", price_cents: c(15.8), quantity: 1, status: "wishlist" });
  add("parts", { member_id: personA, job_id: dashcam, name: "Add-a-fuse taps", url: "https://www.aliexpress.com/w/wholesale-add-a-fuse.html", price_cents: c(4.6), quantity: 1, status: "wishlist" });
  add("job_cards", { member_id: personA, title: "Raised garden beds", job_type: "Woodwork", tags: "garden", status: "idea", priority: 3 });

  // ── Default Name 2: wish list ──
  for (const w of [
    { item: "Kindle Paperwhite", occasion: "Birthday", price_cents: c(299), priority: 1 },
    { item: "Spa day voucher", occasion: "Anniversary", price_cents: c(180), priority: 1 },
    { item: "Le Creuset casserole dish", occasion: "Christmas", price_cents: c(420), priority: 2, notes: "The deep teal one" },
    { item: "Pandora charm", occasion: "Christmas", price_cents: c(89), priority: 2, status: "bought" },
    { item: "Gardening gloves (green, size S)", occasion: "Any time", price_cents: c(25), priority: 3 },
  ]) add("wishlist", { list_id: rosList, ...w });
}
