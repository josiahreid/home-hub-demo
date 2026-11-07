import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { io } from "next/cache";

// Not "data": on Windows that's the same folder as the user's own "Data" folder of budget files.
export const DATA_DIR = process.env.HOME_HUB_DATA_DIR || path.join(process.cwd(), "app-data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

// Each entry runs once, in order. Never edit a shipped migration: add a new one.
/** Old detailed categories → the few big ones (used once, by the budget rework migration). */
function newCategory(col: string) {
  const groups: [string, string[]][] = [
    ["Bills", ["Mortgage", "Rates", "Car loan", "Insurance", "Life insurance", "Debt repayments", "Utilities", "Phone", "Rubbish", "Subscriptions", "Fees"]],
    ["Groceries", ["Groceries", "Meal prep"]],
    ["Transport", ["Fuel", "Car"]],
    ["Eating out & fun", ["Eating out", "Entertainment", "Holidays", "Christmas", "Birthdays", "Spending money", "Cash & giving"]],
    ["Home & family", ["Kids & baby", "Health", "Shopping & household", "Home & garden", "Renovations", "Projects"]],
    ["Savings", ["Investing", "Savings"]],
  ];
  const whens = groups.flatMap(([to, from]) => from.map((f) => `WHEN '${f}' THEN '${to}'`)).join(" ");
  return `CASE ${col} ${whens} ELSE ${col} END`;
}

const MIGRATIONS: string[] = [
  `
  -- ───────────── Budget ─────────────
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    institution TEXT,
    kind TEXT NOT NULL DEFAULT 'everyday'   -- everyday | savings | credit | loan
  );

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    date TEXT NOT NULL,                      -- YYYY-MM-DD
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,           -- negative = money out
    category TEXT,
    source TEXT NOT NULL DEFAULT 'manual',   -- import | manual | receipt
    import_hash TEXT UNIQUE,                 -- dedupes re-imported statements
    receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_tx_date ON transactions(date);

  CREATE TABLE category_rules (
    id INTEGER PRIMARY KEY,
    pattern TEXT NOT NULL,                   -- case-insensitive substring of description
    category TEXT NOT NULL
  );

  CREATE TABLE budgets (
    id INTEGER PRIMARY KEY,
    category TEXT NOT NULL UNIQUE,
    monthly_limit_cents INTEGER NOT NULL
  );

  CREATE TABLE recurring_payments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,           -- positive number; always an outgoing
    frequency TEXT NOT NULL,                 -- weekly | fortnightly | monthly | quarterly | yearly
    next_due TEXT NOT NULL,
    category TEXT,
    linked_type TEXT,                        -- vehicle | house_project | null
    linked_id INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT
  );

  -- Savings plans for events/goals. Overlapping windows are checked against income.
  CREATE TABLE plans (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    target_cents INTEGER NOT NULL,
    saved_cents INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    target_date TEXT NOT NULL,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active'    -- active | done | cancelled
  );

  CREATE TABLE receipts (
    id INTEGER PRIMARY KEY,
    file_name TEXT NOT NULL,                 -- inside data/uploads
    store TEXT,
    date TEXT,
    total_cents INTEGER,
    is_meal_prep INTEGER NOT NULL DEFAULT 0,
    meal_week_id INTEGER REFERENCES meal_weeks(id) ON DELETE SET NULL,
    notes TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- ───────────── Calendar ─────────────
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,                -- YYYY-MM-DD
    start_time TEXT,                         -- HH:MM, null = all day
    end_date TEXT,
    end_time TEXT,
    location TEXT,
    notes TEXT,
    kind TEXT NOT NULL DEFAULT 'general',    -- general | birthday | trip | party | appointment
    budget_cents INTEGER,                    -- expected spend, feeds the budget
    feed_id INTEGER REFERENCES calendar_feeds(id) ON DELETE CASCADE,
    external_uid TEXT,
    UNIQUE (feed_id, external_uid)
  );
  CREATE INDEX idx_events_start ON events(start_date);

  CREATE TABLE calendar_feeds (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,                       -- Google "secret iCal address" or iCloud public link
    last_synced TEXT
  );

  CREATE TABLE bin_schedules (
    id INTEGER PRIMARY KEY,
    bin TEXT NOT NULL,                       -- Rubbish | Recycling | Glass | Food scraps | Garden
    anchor_date TEXT NOT NULL,               -- any known collection date
    interval_weeks INTEGER NOT NULL DEFAULT 1
  );

  -- ───────────── Meal prep ─────────────
  CREATE TABLE meals (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    servings INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    external_id TEXT UNIQUE                  -- id from the meal-prep app
  );

  CREATE TABLE meal_ingredients (
    id INTEGER PRIMARY KEY,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    cost_cents INTEGER                       -- cost of the amount used in this meal
  );

  CREATE TABLE meal_weeks (
    id INTEGER PRIMARY KEY,
    week_start TEXT NOT NULL UNIQUE,         -- Monday, YYYY-MM-DD
    source TEXT NOT NULL DEFAULT 'manual',   -- manual | app
    cart_status TEXT NOT NULL DEFAULT 'draft', -- draft | awaiting_approval | approved | ordered
    store TEXT,
    notes TEXT
  );

  CREATE TABLE meal_week_entries (
    id INTEGER PRIMARY KEY,
    week_id INTEGER NOT NULL REFERENCES meal_weeks(id) ON DELETE CASCADE,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    day TEXT,                                -- Mon..Sun, null = batch
    portions INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE shopping_items (
    id INTEGER PRIMARY KEY,
    week_id INTEGER NOT NULL REFERENCES meal_weeks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT,
    est_cents INTEGER,
    checked INTEGER NOT NULL DEFAULT 0
  );

  -- ───────────── Car ─────────────
  CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    make TEXT, model TEXT, year INTEGER,
    plate TEXT, vin TEXT,
    odometer_km INTEGER,
    wof_due TEXT, rego_due TEXT, insurance_due TEXT,
    notes TEXT
  );

  CREATE TABLE vehicle_parts (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    part TEXT NOT NULL,                      -- Wiper (driver), Tyres, Oil, Battery…
    spec TEXT,                               -- 22" hook, 205/55R16 91V, 5W-30…
    brand TEXT,
    part_number TEXT,
    cost_cents INTEGER,
    supplier TEXT,
    last_replaced TEXT,
    notes TEXT
  );

  CREATE TABLE vehicle_services (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    interval_months INTEGER,
    interval_km INTEGER,
    last_done_date TEXT,
    last_done_km INTEGER,
    est_cost_cents INTEGER
  );

  CREATE TABLE vehicle_log (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    odometer_km INTEGER,
    description TEXT NOT NULL,
    cost_cents INTEGER,
    receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL
  );

  -- ───────────── House ─────────────
  CREATE TABLE chores (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'chore',      -- chore | cleaning
    area TEXT,
    every_days INTEGER NOT NULL DEFAULT 7,
    assignee TEXT,
    last_done TEXT
  );

  CREATE TABLE house_projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idea',     -- idea | planning | in_progress | done
    budget_cents INTEGER,
    plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
    notes TEXT
  );

  CREATE TABLE project_costs (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES house_projects(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL
  );

  CREATE TABLE quotes (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES house_projects(id) ON DELETE SET NULL,
    supplier TEXT NOT NULL,
    description TEXT,
    amount_cents INTEGER,
    date TEXT,
    valid_until TEXT,
    status TEXT NOT NULL DEFAULT 'received',  -- received | accepted | declined
    file_name TEXT
  );

  -- ───────────── Utilities ─────────────
  -- Each utility owns a recurring_payments row (linked_type = 'utility') so it shows in the budget.
  CREATE TABLE utilities (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,                      -- Power | Internet | Mortgage | Rates | Water | Phone | Insurance | Other
    provider TEXT NOT NULL,
    plan TEXT,
    account_number TEXT,
    contract_end TEXT,
    recurring_id INTEGER REFERENCES recurring_payments(id) ON DELETE SET NULL,
    notes TEXT
  );

  CREATE TABLE utility_bills (
    id INTEGER PRIMARY KEY,
    utility_id INTEGER NOT NULL REFERENCES utilities(id) ON DELETE CASCADE,
    period_end TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    usage REAL,                              -- kWh, GB…
    usage_unit TEXT,
    file_name TEXT
  );

  -- Alternative offers, to compare against what we pay now.
  CREATE TABLE utility_offers (
    id INTEGER PRIMARY KEY,
    utility_id INTEGER NOT NULL REFERENCES utilities(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    plan TEXT,
    monthly_cents INTEGER NOT NULL,          -- estimated monthly cost on that offer
    url TEXT,
    notes TEXT,
    checked_on TEXT NOT NULL DEFAULT (date('now'))
  );

  -- ───────────── Default Name: projects ─────────────
  CREATE TABLE job_cards (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    job_type TEXT,                           -- Electronics, 3D print, Woodwork…
    tags TEXT,                               -- comma separated
    status TEXT NOT NULL DEFAULT 'idea',     -- idea | planned | in_progress | blocked | done
    priority INTEGER NOT NULL DEFAULT 2,     -- 1 high, 2 normal, 3 low
    due TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE job_steps (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE parts (
    id INTEGER PRIMARY KEY,
    job_id INTEGER REFERENCES job_cards(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    url TEXT,                                -- AliExpress (or other) link
    price_cents INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'wishlist'  -- wishlist | ordered | received
  );

  -- ───────────── Default Name 2: wish list ─────────────
  CREATE TABLE wishlist (
    id INTEGER PRIMARY KEY,
    item TEXT NOT NULL,
    occasion TEXT,                           -- Birthday, Christmas, Anniversary, Any time
    url TEXT,
    price_cents INTEGER,
    priority INTEGER NOT NULL DEFAULT 2,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'idea',     -- idea | bought | given
    added_at TEXT NOT NULL DEFAULT (date('now'))
  );
  `,
  `
  -- ───────────── Fortnightly budget plan (imported from the budget spreadsheet) ─────────────
  CREATE TABLE budget_lines (
    id INTEGER PRIMARY KEY,
    grp TEXT NOT NULL,                       -- "Mortgage, loans & insurance", "Food & fuel"…
    name TEXT NOT NULL,
    category TEXT,                           -- transaction category it is tracked against
    pot TEXT NOT NULL DEFAULT 'bills',       -- payday split: bills | food | sinking | spending | savings
    old_cents INTEGER,
    actual_cents INTEGER,                    -- fortnightly average of last year's spending
    budget_cents INTEGER NOT NULL DEFAULT 0, -- the plan, per fortnight
    recurring_id INTEGER REFERENCES recurring_payments(id) ON DELETE SET NULL,
    notes TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE income_sources (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    fortnightly_cents INTEGER NOT NULL,
    included INTEGER NOT NULL DEFAULT 1,     -- counted in the plan?
    ends_on TEXT,                            -- e.g. when Paid Parental Leave stops
    notes TEXT
  );

  CREATE TABLE budget_options (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    saves_cents INTEGER,                     -- per fortnight
    used INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE balances (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'cash',       -- cash | debt
    amount_cents INTEGER NOT NULL DEFAULT 0,
    as_of TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );
  `,
  `
  -- Rows added by scripts/sample-data.mjs, so "Remove sample data" can take exactly them out again.
  CREATE TABLE sample_rows (tbl TEXT NOT NULL, row_id INTEGER NOT NULL);
  -- Columns sample data filled in on real rows (e.g. the Outlander's WOF date), cleared on removal.
  CREATE TABLE sample_fills (tbl TEXT NOT NULL, row_id INTEGER NOT NULL, col TEXT NOT NULL);
  `,
  `
  -- ───────────── To do ─────────────
  CREATE TABLE todos (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT,
    due TEXT,                                -- YYYY-MM-DD, optional
    important INTEGER NOT NULL DEFAULT 0,
    done_at TEXT,                            -- null = still to do
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  `
  -- ───────────── Church ─────────────
  CREATE TABLE church_services (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT,                               -- HH:MM
    title TEXT NOT NULL DEFAULT 'Sunday service',
    kind TEXT NOT NULL DEFAULT 'sunday',     -- sunday | event (anything not a regular Sunday)
    location TEXT,
    spotify_url TEXT,                        -- playlist for this service
    notes TEXT
  );
  CREATE INDEX idx_church_services_date ON church_services(date);

  CREATE TABLE church_roles (
    id INTEGER PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES church_services(id) ON DELETE CASCADE,
    person TEXT NOT NULL,                    -- Default Name | Default Name 2
    role TEXT NOT NULL,                      -- MC | Production | Band | Other
    instruments TEXT,                        -- comma separated tags, for Band
    notes TEXT
  );

  CREATE TABLE church_songs (
    id INTEGER PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES church_services(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    artist TEXT,
    song_key TEXT,
    link TEXT,                               -- Spotify / YouTube / chord chart
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE church_practices (
    id INTEGER PRIMARY KEY,
    person TEXT NOT NULL,                    -- Default Name | Default Name 2 | Both
    service_id INTEGER REFERENCES church_services(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    time TEXT,
    location TEXT,
    notes TEXT
  );

  CREATE TABLE church_links (
    id INTEGER PRIMARY KEY,
    person TEXT NOT NULL,                    -- Default Name | Default Name 2
    kind TEXT NOT NULL DEFAULT 'other',      -- calendar | spotify | other
    label TEXT NOT NULL,
    url TEXT NOT NULL
  );
  `,
  `
  -- ───────────── Several wish lists (Default Name 2's, the kids'…) ─────────────
  CREATE TABLE wish_lists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,                      -- whose list: "Default Name 2", "Ava"…
    notes TEXT,                              -- sizes, favourite colours…
    sort INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO wish_lists (id, name, sort) VALUES (1, 'Default Name 2', 0);
  ALTER TABLE wishlist ADD COLUMN list_id INTEGER REFERENCES wish_lists(id) ON DELETE CASCADE;
  UPDATE wishlist SET list_id = 1;
  `,
  `
  -- ───────────── House: invoices and receipts tagged to projects ─────────────
  CREATE TABLE project_documents (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES house_projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'receipt',    -- invoice | receipt
    supplier TEXT,
    date TEXT,
    amount_cents INTEGER,
    file_name TEXT NOT NULL,                 -- inside app-data/uploads
    notes TEXT,
    cost_id INTEGER REFERENCES project_costs(id) ON DELETE SET NULL,  -- the cost-log line it created, if any
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_project_documents_project ON project_documents(project_id);
  `,
  `
  -- ───────────── House: businesses (tradies, suppliers) and project emails ─────────────
  CREATE TABLE businesses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    trade TEXT,                              -- Plumber, Electrician, Builder…
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    gst_number TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_businesses_name ON businesses(name COLLATE NOCASE);

  ALTER TABLE quotes ADD COLUMN business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
  -- every supplier already quoted becomes a business, linked to its quotes
  INSERT OR IGNORE INTO businesses (name) SELECT DISTINCT trim(supplier) FROM quotes WHERE trim(supplier) <> '';
  UPDATE quotes SET business_id = (SELECT id FROM businesses b WHERE b.name = trim(quotes.supplier) COLLATE NOCASE);

  CREATE TABLE project_emails (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES house_projects(id) ON DELETE CASCADE,
    business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    direction TEXT NOT NULL DEFAULT 'received',  -- received | sent
    from_addr TEXT,
    subject TEXT,
    date TEXT,
    body TEXT,
    file_name TEXT,                          -- optional saved .eml / PDF of the email
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_project_emails_project ON project_emails(project_id);
  `,
  `
  -- Events can point at a wish list (e.g. Ava's birthday → Ava's list, filtered to Birthday)
  ALTER TABLE events ADD COLUMN wish_list_id INTEGER REFERENCES wish_lists(id) ON DELETE SET NULL;
  ALTER TABLE events ADD COLUMN wish_occasion TEXT;
  `,
  `
  -- Meals are breakfast, lunch or dinner (everything planned so far was dinner)
  ALTER TABLE meal_week_entries ADD COLUMN slot TEXT NOT NULL DEFAULT 'dinner';
  `,
  `
  -- Budget lines can be built by hand; re-importing the spreadsheet only replaces the ones it brought in
  ALTER TABLE budget_lines ADD COLUMN source TEXT NOT NULL DEFAULT 'sheet';  -- sheet | manual
  `,
  `
  -- Statement imports find the right account by its number (e.g. "03 0123 0456789-00", or a card's customer ID)
  ALTER TABLE accounts ADD COLUMN number TEXT;
  `,
  `
  -- Files already read from the linked statements folder, so "Refresh statements" only reads new or changed ones
  CREATE TABLE statement_files (
    path TEXT PRIMARY KEY,                   -- relative to the linked folder
    size INTEGER NOT NULL,
    modified TEXT NOT NULL,
    status TEXT NOT NULL,                    -- imported | skipped | error
    note TEXT,
    read_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  `
  -- ───────────── Family members (Default Name, Default Name 2, and anyone added in Settings) ─────────────
  CREATE TABLE members (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,               -- the page address: /default-name, /default-name-2, /ava
    name TEXT NOT NULL,
    features TEXT NOT NULL DEFAULT '',       -- comma separated: projects, wishlists, prices
    sort INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO members (id, slug, name, features, sort) VALUES (1, 'default-name', 'Default Name', 'projects', 0), (2, 'default-name-2', 'Default Name 2', 'wishlists', 1);
  ALTER TABLE job_cards ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
  ALTER TABLE parts ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
  ALTER TABLE wish_lists ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
  UPDATE job_cards SET member_id = 1;
  UPDATE parts SET member_id = 1;
  UPDATE wish_lists SET member_id = 2;
  UPDATE wishlist SET list_id = (SELECT min(id) FROM wish_lists) WHERE list_id IS NULL;

  -- Price compare: one card per thing being hunted, with a link per shop
  CREATE TABLE price_hunts (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,                        -- the goal: what's needed, must-haves
    tags TEXT,                               -- comma separated
    status TEXT NOT NULL DEFAULT 'idea',     -- same statuses as job cards
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE price_links (
    id INTEGER PRIMARY KEY,
    hunt_id INTEGER NOT NULL REFERENCES price_hunts(id) ON DELETE CASCADE,
    shop TEXT,
    url TEXT,
    price_cents INTEGER,                     -- normal price
    sale_cents INTEGER,                      -- sale price, while the sale lasts
    sale_ends TEXT,
    notes TEXT,
    checked_on TEXT NOT NULL DEFAULT (date('now'))
  );
  `,
  `
  -- Repeating events (birthdays every year, a class every week…)
  ALTER TABLE events ADD COLUMN repeat TEXT;              -- null | daily | weekly | monthly | yearly
  ALTER TABLE events ADD COLUMN repeat_until TEXT;        -- last date it repeats on, null = forever

  -- To-dos per person, in an order you choose
  ALTER TABLE todos ADD COLUMN person TEXT;               -- member slug ('default-name', 'default-name-2'), null = everyone
  ALTER TABLE todos ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
  UPDATE todos SET sort = id;

  -- Grocery list (Food → Grocery list, and Apple Shortcuts)
  CREATE TABLE groceries (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    urgent INTEGER NOT NULL DEFAULT 0,
    done_at TEXT,                            -- ticked off; cleared items drop off the list
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  `
  -- Push notifications: each phone/browser that said yes, and whose it is
  CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    person TEXT NOT NULL,                    -- member slug: personA, personB…
    mobile INTEGER NOT NULL DEFAULT 1,       -- phones get notifications; computers only when allowed
    label TEXT,                              -- "iPhone", "Chrome on Windows"…
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_sent TEXT,
    last_error TEXT
  );

  -- To-dos tagged as work or personal
  ALTER TABLE todos ADD COLUMN category TEXT;              -- work | personal | null
  `,
  `
  -- ───────────── Budget rework: a few big categories, pots, no double-counting ─────────────
  UPDATE transactions SET category = ${newCategory("category")} WHERE category IS NOT NULL;
  UPDATE category_rules SET category = ${newCategory("category")};
  UPDATE budget_lines SET category = ${newCategory("category")} WHERE category IS NOT NULL;
  UPDATE recurring_payments SET category = ${newCategory("category")} WHERE category IS NOT NULL;
  DELETE FROM budgets;                     -- monthly limits per old category; pots replace them

  -- the old starter rules sorted every Q Card purchase as a "debt repayment"
  DELETE FROM category_rules WHERE pattern IN ('q card', 'qcard');
  INSERT INTO category_rules (pattern, category)
    SELECT 'columbus fin', 'Transfers' WHERE NOT EXISTS (SELECT 1 FROM category_rules WHERE pattern = 'columbus fin');

  -- double-counting: paying the Q Card off is not spending (the purchases on the card are),
  -- and PayPal rows repeat purchases that are already on the bank / Q Card statement
  UPDATE transactions SET category = 'Transfers' WHERE amount_cents < 0 AND lower(description) LIKE '%columbus fin%';
  UPDATE transactions SET category = 'Transfers' WHERE account_id IN (SELECT id FROM accounts WHERE name = 'PayPal' OR institution = 'PayPal');
  UPDATE recurring_payments SET category = 'Transfers' WHERE lower(name) LIKE '%columbus fin%';

  -- Pots: where each payday's money goes, and which spending comes out of each
  CREATE TABLE pots (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    fortnightly_cents INTEGER NOT NULL DEFAULT 0,
    categories TEXT NOT NULL DEFAULT '',     -- comma separated spending categories that come out of it
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,   -- the bank account it lives in
    sort INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO pots (key, name, fortnightly_cents, categories, sort) VALUES
    ('bills', 'Bills', (SELECT coalesce(sum(budget_cents), 0) FROM budget_lines WHERE pot = 'bills'), 'Bills', 0),
    ('food', 'Food & fuel', (SELECT coalesce(sum(budget_cents), 0) FROM budget_lines WHERE pot = 'food'), 'Groceries,Transport', 1),
    ('spending', 'Spending', (SELECT coalesce(sum(budget_cents), 0) FROM budget_lines WHERE pot = 'spending'), 'Eating out & fun,Home & family,Other', 2),
    ('sinking', 'Sinking fund', (SELECT coalesce(sum(budget_cents), 0) FROM budget_lines WHERE pot = 'sinking'), '', 3),
    ('savings', 'Savings', (SELECT coalesce(sum(budget_cents), 0) FROM budget_lines WHERE pot = 'savings'), 'Savings', 4);
  `,
  `
  -- ───────────── Settings → API: Akahu bank feed (read-only) and an audit log ─────────────
  ALTER TABLE accounts ADD COLUMN akahu_id TEXT;   -- the Akahu account this one is fed from
  CREATE TABLE api_log (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    event TEXT NOT NULL,                     -- unlock | password | akahu-sync | akahu-tokens
    ok INTEGER NOT NULL,
    note TEXT                                -- never holds a token
  );
  `,
  `
  -- ───────────── Insurance (Other → Insurance) ─────────────
  -- Each policy owns a recurring_payments row (linked_type = 'insurance') so its cost shows in the budget and calendar.
  CREATE TABLE insurance_policies (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,                      -- Car | House | Contents | Life | Health | Income protection | Travel | Pet | Other
    insurer TEXT NOT NULL,
    covers TEXT,                             -- what or who: "Corolla", "12 Smith St", "Default Name"
    policy_number TEXT,
    renewal_date TEXT,
    excess_cents INTEGER,
    sum_insured_cents INTEGER,
    claims_phone TEXT,
    website TEXT,
    recurring_id INTEGER REFERENCES recurring_payments(id) ON DELETE SET NULL,
    notes TEXT,
    from_utility_id INTEGER                  -- moved across from Utilities (it used to have an Insurance kind)
  );

  CREATE TABLE insurance_docs (
    id INTEGER PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'Other',      -- Policy schedule | Policy wording | Renewal notice | Claim | Receipt | Other
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    added_on TEXT NOT NULL DEFAULT (date('now'))
  );

  -- Insurance entered under Utilities moves here, keeping its payment and any bill files
  INSERT INTO insurance_policies (kind, insurer, covers, policy_number, renewal_date, recurring_id, notes, from_utility_id)
    SELECT 'Other', provider, plan, account_number, contract_end, recurring_id, notes, id FROM utilities WHERE kind = 'Insurance';
  UPDATE recurring_payments SET linked_type = 'insurance', category = 'Bills',
         linked_id = (SELECT p.id FROM insurance_policies p WHERE p.recurring_id = recurring_payments.id)
   WHERE id IN (SELECT recurring_id FROM insurance_policies WHERE recurring_id IS NOT NULL);
  INSERT INTO insurance_docs (policy_id, kind, title, file_name, added_on)
    SELECT p.id, 'Other', 'Bill ' || b.period_end, b.file_name, b.period_end
      FROM utility_bills b JOIN insurance_policies p ON p.from_utility_id = b.utility_id
     WHERE b.file_name IS NOT NULL;
  DELETE FROM utilities WHERE kind = 'Insurance';
  `,
  `
  -- ───────────── Insurance: claims, quotes, price history, who's covered, car link, renewal reminders ─────────────
  ALTER TABLE insurance_policies ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL;
  ALTER TABLE insurance_policies ADD COLUMN people TEXT;        -- member slugs, comma separated; empty = the whole household
  ALTER TABLE insurance_policies ADD COLUMN reminded_for TEXT;  -- the renewal date the "get quotes" reminder went out for

  CREATE TABLE insurance_claims (
    id INTEGER PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
    date TEXT NOT NULL,                      -- when it happened
    what TEXT NOT NULL,
    claim_number TEXT,
    status TEXT NOT NULL DEFAULT 'open',     -- open | approved | paid | declined | withdrawn
    excess_cents INTEGER,
    payout_cents INTEGER,
    notes TEXT
  );
  ALTER TABLE insurance_docs ADD COLUMN claim_id INTEGER REFERENCES insurance_claims(id) ON DELETE SET NULL;

  -- quotes from other insurers, to compare at renewal
  CREATE TABLE insurance_quotes (
    id INTEGER PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
    insurer TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL,
    excess_cents INTEGER,
    url TEXT,
    notes TEXT,
    checked_on TEXT NOT NULL DEFAULT (date('now'))
  );

  -- what each policy cost over time (a row whenever the price changes)
  CREATE TABLE insurance_prices (
    id INTEGER PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL
  );
  INSERT INTO insurance_prices (policy_id, date, amount_cents, frequency)
    SELECT p.id, date('now'), r.amount_cents, r.frequency FROM insurance_policies p JOIN recurring_payments r ON r.id = p.recurring_id;
  `,
  `
  -- ───────────── Family members' own calendars ─────────────
  -- Who an event is for. Tagged events show on each person's Calendar tab, and on the main calendar only when
  -- that person's switch is on there; untagged events are for everyone and always show.
  ALTER TABLE events ADD COLUMN people TEXT;               -- member slugs, comma separated; null = everyone
  ALTER TABLE wishlist ADD COLUMN buy_by TEXT;             -- YYYY-MM-DD, optional – shows on the list owner's calendar
  -- every existing member gets the Calendar tab
  UPDATE members SET features = CASE WHEN trim(features) = '' THEN 'calendar' ELSE features || ',calendar' END;
  `,
  `
  -- ───────────── Health notes (a family member's Health tab) ─────────────
  CREATE TABLE health_notes (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    title TEXT NOT NULL,                     -- e.g. "GP visit – sore knee", "Flu jab"
    date TEXT NOT NULL,                      -- YYYY-MM-DD
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_health_notes_member ON health_notes(member_id, date);
  -- every existing member gets the Health tab
  UPDATE members SET features = CASE WHEN trim(features) = '' THEN 'health' ELSE features || ',health' END;
  `,
  `
  -- ───────────── Church made simple: no roles or instrument tags, just notes ─────────────
  -- Old serving dates keep what they said, as text at the start of their notes ("Band · Drums · …").
  UPDATE church_roles SET notes = role || coalesce(' · ' || instruments, '') || coalesce(' · ' || notes, ''),
                          role = 'Serving', instruments = NULL
   WHERE role <> 'Serving';
  DELETE FROM settings WHERE key = 'church_tags';
  `,
  `
  -- ───────────── Grocery list: "Clear all" ─────────────
  -- Items cleared in one go (rather than ticked off as bought) – they go to the Cleared list, not Bought.
  ALTER TABLE groceries ADD COLUMN cleared INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- ───────────── What each bin costs; car insurance renewal from the Insurance tab ─────────────
  ALTER TABLE bin_schedules ADD COLUMN cost_cents INTEGER;
  ALTER TABLE bin_schedules ADD COLUMN cost_per TEXT;      -- collection | month | quarter | year
  -- a car's renewal date follows its policy's (the earliest, if it has more than one)
  UPDATE vehicles SET insurance_due = (SELECT min(renewal_date) FROM insurance_policies p WHERE p.vehicle_id = vehicles.id AND p.renewal_date IS NOT NULL)
   WHERE EXISTS (SELECT 1 FROM insurance_policies p WHERE p.vehicle_id = vehicles.id AND p.renewal_date IS NOT NULL);
  `,
  `
  -- ───────────── Project parts: shipping ─────────────
  ALTER TABLE parts ADD COLUMN shipping_cents INTEGER;     -- for the whole line (not each), null = none / not known
  `,
  `
  -- ───────────── Project parts: when an ordered part should arrive ─────────────
  ALTER TABLE parts ADD COLUMN arrives TEXT;               -- YYYY-MM-DD, set when it's marked ordered; on its owner's calendar
  `,
  `
  -- ───────────── Workouts (a family member's Workout tab) ─────────────
  -- The routine: named workouts, each on some days of the week, each a list of exercises with their targets.
  CREATE TABLE workouts (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                      -- "Push day", "Easy run"
    days TEXT NOT NULL DEFAULT '',           -- weekdays it's on, "1,3,5" (1 = Monday … 7 = Sunday); empty = any time
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE workout_exercises (
    id INTEGER PRIMARY KEY,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'weights',    -- weights (sets × reps × kg) | bodyweight (sets × reps) | time (sets × seconds) | distance (km)
    sets INTEGER NOT NULL DEFAULT 3,
    reps INTEGER,
    weight REAL,                             -- kg
    seconds INTEGER,
    distance REAL,                           -- km
    notes TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );
  -- Each time a workout is done: its sets, as actually done (filled in from last time to start with).
  CREATE TABLE workout_sessions (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    workout_id INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
    name TEXT NOT NULL,                      -- the workout's name then, kept if it's renamed or deleted
    date TEXT NOT NULL,                      -- YYYY-MM-DD
    notes TEXT,
    finished_at TEXT                         -- null = still going
  );
  CREATE TABLE workout_sets (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES workout_exercises(id) ON DELETE SET NULL,
    exercise TEXT NOT NULL,                  -- its name then, for history and personal bests
    kind TEXT NOT NULL DEFAULT 'weights',
    set_no INTEGER NOT NULL,
    reps INTEGER,
    weight REAL,
    seconds INTEGER,
    distance REAL,
    done INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_workout_sessions_member ON workout_sessions(member_id, date);
  CREATE INDEX idx_workout_sets_session ON workout_sets(session_id);
  -- every existing member gets the Workout tab
  UPDATE members SET features = CASE WHEN trim(features) = '' THEN 'workout' ELSE features || ',workout' END;
  `,
  `
  -- ───────────── Cardio (on the Workout tab): runs, walks, rides, swims… logged as they're done ─────────────
  CREATE TABLE cardio_log (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    date TEXT NOT NULL,                      -- YYYY-MM-DD
    activity TEXT NOT NULL,                  -- Run | Walk | Bike | Swim | Row | Hike | Sport | Other
    minutes INTEGER,
    distance REAL,                           -- km
    notes TEXT
  );
  CREATE INDEX idx_cardio_member ON cardio_log(member_id, date);
  `,
  `
  -- ───────────── Budget: your own categories (the + on Budget → Sort) ─────────────
  CREATE TABLE custom_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    icon TEXT NOT NULL DEFAULT '🏷️',
    spending INTEGER NOT NULL DEFAULT 1,     -- 1 = spending (comes out of a pot), 0 = not spending (like Transfers)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  `
  -- ───────────── Same money, counted once ─────────────
  -- A bill that's the same money as other bills (Interest inside the Loan repayment; the "Tower Insurance" bank payment
  -- that pays the insurance policies): ids of the bills it duplicates. It's still listed, but never counted.
  ALTER TABLE recurring_payments ADD COLUMN same_as TEXT;
  -- What the bank calls it ("tower insurance"): bank payments containing this are this bill's payments
  ALTER TABLE recurring_payments ADD COLUMN match TEXT;
  -- A bank payment linked to a bill by hand (otherwise it's matched by the bill's "match" words)
  ALTER TABLE transactions ADD COLUMN bill_id INTEGER REFERENCES recurring_payments(id) ON DELETE SET NULL;
  -- Two transactions that are the same money: this one sits under the other and doesn't count
  ALTER TABLE transactions ADD COLUMN same_as INTEGER REFERENCES transactions(id) ON DELETE SET NULL;
  CREATE INDEX idx_transactions_bill ON transactions(bill_id);
  `,
  `
  -- ───────────── Buckets: real account balances (from the Akahu bank feed) ─────────────
  ALTER TABLE accounts ADD COLUMN balance_cents INTEGER;   -- the bank's current balance (negative = owing, on a card)
  ALTER TABLE accounts ADD COLUMN balance_at TEXT;         -- when it was read (UTC)
  `,
  `
  -- ───────────── Files: important documents, in category folders ─────────────
  CREATE TABLE doc_folders (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    icon TEXT NOT NULL DEFAULT '📁',
    sort INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO doc_folders (name, icon, sort) VALUES
    ('Home & property', '🏠', 1), ('Car', '🚗', 2), ('Insurance', '🛡️', 3), ('Money & tax', '💰', 4), ('Health', '🩺', 5),
    ('Kids & school', '🧒', 6), ('IDs & certificates', '🪪', 7), ('Warranties & manuals', '🧾', 8), ('Other', '📦', 9);
  CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    folder_id INTEGER REFERENCES doc_folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,                      -- what it's called (the original file name to start with)
    subfolder TEXT,                          -- from a whole-folder upload: the folder it was in ("Tax 2025/Receipts")
    file_name TEXT NOT NULL,                 -- the stored file in uploads/
    size INTEGER,
    notes TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_documents_folder ON documents(folder_id);
  `,
];

function open(): DatabaseSync {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "home-hub.db"));
  // wait (rather than fail) if another process – e.g. a build worker – is writing at the same moment
  db.exec("PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return db;
}

export const BACKUP_DIR = path.join(DATA_DIR, "backups");

/** "202610290650" – now, in NZ time (the app runs on NZ time), for backup file names. */
export function fileStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

function migrate(db: DatabaseSync) {
  const version = () => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version() >= MIGRATIONS.length) return;
  // An update is about to change the database: keep a full copy of it first (not for a brand-new, empty one).
  // If the copy can't be made, stop – better the app doesn't start than an update runs with no way back.
  const from = version();
  if (from > 0) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = fileStamp();
    const file = path.join(BACKUP_DIR, `home-hub-${stamp}-before-update-v${from}-to-v${MIGRATIONS.length}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }
  // IMMEDIATE takes the write lock up front, so two processes can't both start the same migration
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let v = version(); v < MIGRATIONS.length; v++) {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Opened on first use, not when this file loads: a production build loads every page in parallel workers
// and must not touch (or create) the database. The connection survives dev hot reloads; migrations
// re-check once per reload so new ones apply without a restart.
const g = globalThis as unknown as { __homeHubDb?: DatabaseSync };
let migrated = false;
function connection(): DatabaseSync {
  const conn = (g.__homeHubDb ??= open());
  if (!migrated) {
    migrate(conn);
    migrated = true;
  }
  return conn;
}

export const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const conn = connection();
    const value = Reflect.get(conn, prop, conn);
    return typeof value === "function" ? value.bind(conn) : value;
  },
});

type Params = (string | number | null)[];

// Reads go through these so pages stay out of the prerendered static shell.
// node:sqlite rows have a null prototype, which React refuses to pass to client
// components, so copy them into plain objects.
export async function all<T>(sql: string, ...params: Params): Promise<T[]> {
  await io();
  return db.prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
}

export async function get<T>(sql: string, ...params: Params): Promise<T | undefined> {
  await io();
  const row = db.prepare(sql).get(...params);
  return (row ? { ...row } : undefined) as T | undefined;
}

// Writes are only called from server actions / route handlers, so they stay sync.
export function run(sql: string, ...params: Params) {
  return db.prepare(sql).run(...params);
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}
