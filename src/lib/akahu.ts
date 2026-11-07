import "server-only";
import { format, subDays } from "date-fns";
import { db, getSetting, run, setSetting } from "./db";
import { hasSecret, logApi, readSecret, saveSecret, secretsAvailable } from "./api-lock";
import { applyRules } from "./category-rules";

/**
 * Akahu (NZ open banking) – READ ONLY.
 *
 * Home Hub only ever makes GET requests, and only to the paths in READ_ONLY_PATHS. There is no code here that
 * can move money, change anything at the bank, or even ask Akahu to refresh – so even a mistake in Home Hub
 * can't do more than read accounts and transactions.
 *
 * The two tokens are stored encrypted (Settings → API password), only decrypted in server memory, never
 * logged, and never sent to the browser.
 */

const AKAHU_BASE = "https://api.akahu.io/v1";
const READ_ONLY_PATHS = new Set(["/accounts", "/transactions"]);
const TOKENS = "akahu_tokens";

// For trying the sync against a fake Akahu on this PC. Ignored on the server (production build).
function base() {
  const test = process.env.AKAHU_TEST_BASE;
  if (test && process.env.NODE_ENV !== "production" && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(test)) return test.replace(/\/$/, "");
  return AKAHU_BASE;
}

type Tokens = { app: string; user: string };

export function validTokens(app: string, user: string): string | null {
  if (!/^app_token_[\w-]{10,200}$/.test(app)) return "The App ID token should start with app_token_ (copy it from my.akahu.nz → Developers).";
  if (!/^user_token_[\w-]{10,200}$/.test(user)) return "The User token should start with user_token_.";
  return null;
}

function tokens(): Tokens | null {
  const raw = readSecret(TOKENS);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Tokens;
    return t.app && t.user ? t : null;
  } catch {
    return null;
  }
}

/** The only way Home Hub talks to Akahu: a GET to an allowed path. */
async function akahuGet<T>(path: string, params: Record<string, string> = {}, t = tokens()): Promise<T> {
  if (!READ_ONLY_PATHS.has(path)) throw new Error("Home Hub only reads accounts and transactions from Akahu.");
  if (!t) throw new Error("Akahu isn't connected, or Settings → API hasn't been unlocked since Home Hub started.");
  const url = new URL(base() + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${t.user}`, "X-Akahu-Id": t.app, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as ({ success?: boolean; message?: string } & T) | null;
  // never pass a raw response or the request on – it could echo a token
  if (res.status === 401 || res.status === 403) throw new Error("Akahu didn't accept the tokens (they may have been revoked). Paste new ones in Settings → API → Akahu.");
  if (res.status === 429) throw new Error("Akahu says too many requests – try again in a few minutes.");
  if (!res.ok || !body?.success) throw new Error(`Akahu error (${res.status})${body?.message ? `: ${String(body.message).slice(0, 120)}` : ""}`);
  return body;
}

type AkahuAccount = {
  _id: string; name: string; formatted_account?: string; type: string; status?: string;
  connection?: { name?: string }; balance?: { current?: number; available?: number };
};
type AkahuTx = {
  _id: string; _account: string; date: string; description: string; amount: number; type?: string;
  merchant?: { name?: string }; meta?: { other_account?: string };
};

// Transaction accounts only – KiwiSaver, investments and term deposits aren't spending.
const FEED_TYPES: Record<string, string> = { CHECKING: "everyday", SAVINGS: "savings", CREDITCARD: "credit", LOAN: "loan" };
const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");

/** Saves new tokens (encrypted) after checking them with a read of the account list. */
export async function connectAkahu(app: string, user: string): Promise<{ accounts: number }> {
  const t = { app: app.trim(), user: user.trim() };
  const problem = validTokens(t.app, t.user);
  if (problem) throw new Error(problem);
  const { items } = await akahuGet<{ items: AkahuAccount[] }>("/accounts", {}, t);
  saveSecret(TOKENS, JSON.stringify(t));
  logApi("akahu-tokens", true, `connected – ${items.length} accounts visible`);
  return { accounts: items.length };
}

export function disconnectAkahu() {
  run("DELETE FROM settings WHERE key IN ('akahu_tokens', 'akahu_last_sync', 'akahu_status')");
  run("UPDATE accounts SET akahu_id = NULL");
  logApi("akahu-tokens", true, "disconnected – tokens removed");
}

export type AkahuStatus = { lastSync?: string; lastAdded?: number; error?: string; errorAt?: string };

export function akahuStatus(): AkahuStatus {
  try {
    return JSON.parse(getSetting("akahu_status") ?? "{}");
  } catch {
    return {};
  }
}

/** connected = tokens saved; ready = they can be used right now (unlocked since the last restart). */
export function akahuState() {
  const connected = hasSecret(TOKENS);
  return { connected, ready: connected && secretsAvailable() && !!tokens(), autoSync: getSetting("akahu_auto") !== "0" };
}

export type SyncResult = { added: number; covered: number; accounts: string[] };

const g = globalThis as unknown as { __hhAkahuSyncing?: boolean };

/**
 * Reads accounts and settled transactions from Akahu into Budget.
 * - Each Akahu account is matched to a Home Hub account by its number (so statement imports and the feed
 *   share an account), or created.
 * - Days already covered by imported statements for that account are skipped, so nothing is counted twice.
 * - Re-syncing is safe: each transaction is stored once by its Akahu ID.
 * - Money between your own accounts and home-loan entries are Transfers; then the shop rules sort the rest.
 */
export async function syncAkahu(trigger: "manual" | "auto"): Promise<SyncResult> {
  if (g.__hhAkahuSyncing) throw new Error("A sync is already running.");
  g.__hhAkahuSyncing = true;
  try {
    const { items: accounts } = await akahuGet<{ items: AkahuAccount[] }>("/accounts");
    const feed = accounts.filter((a) => FEED_TYPES[a.type] && (a.status ?? "ACTIVE") === "ACTIVE");
    const own = new Set(feed.map((a) => digits(a.formatted_account)).filter((d) => d.length >= 8));

    const local = new Map<string, { id: number; kind: string; cutover: string | null }>();
    for (const a of feed) {
      let row = db.prepare("SELECT id, kind FROM accounts WHERE akahu_id = ?").get(a._id) as { id: number; kind: string } | undefined;
      if (!row && digits(a.formatted_account)) {
        const all = db.prepare("SELECT id, kind, number FROM accounts WHERE number IS NOT NULL").all() as { id: number; kind: string; number: string }[];
        row = all.find((r) => digits(r.number) === digits(a.formatted_account));
      }
      if (!row) {
        const tail = a.formatted_account?.match(/(\d{4}-\d{2,3})$/)?.[1];
        const id = Number(run(
          "INSERT INTO accounts (name, institution, kind, number) VALUES (?, ?, ?, ?)",
          tail ? `${a.name} (…${tail})` : a.name, a.connection?.name ?? null, FEED_TYPES[a.type], a.formatted_account ?? null,
        ).lastInsertRowid);
        row = { id, kind: FEED_TYPES[a.type] };
      }
      run("UPDATE accounts SET akahu_id = ? WHERE id = ?", a._id, row.id);
      // its real balance, for the buckets on Budget → Pay & pots
      if (typeof a.balance?.current === "number") {
        run("UPDATE accounts SET balance_cents = ?, balance_at = datetime('now') WHERE id = ?", Math.round(a.balance.current * 100), row.id);
      }
      // the last day a statement covers for this account – the feed takes over the day after
      const { cutover } = db.prepare("SELECT max(date) AS cutover FROM transactions WHERE account_id = ? AND source <> 'akahu'").get(row.id) as { cutover: string | null };
      local.set(a._id, { id: row.id, kind: row.kind, cutover });
    }

    // first sync: the last year; after that, two weeks back from the last sync (catches late-settling ones)
    const last = getSetting("akahu_last_sync");
    const start = last ? subDays(new Date(last), 14) : subDays(new Date(), 365);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO transactions (account_id, date, description, amount_cents, category, source, import_hash) VALUES (?, ?, ?, ?, ?, 'akahu', ?)",
    );
    let added = 0;
    let covered = 0;
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const params: Record<string, string> = { start: start.toISOString(), end: new Date().toISOString() };
      if (cursor) params.cursor = cursor;
      const res = await akahuGet<{ items: AkahuTx[]; cursor?: { next?: string | null } }>("/transactions", params);
      db.exec("BEGIN");
      try {
        for (const t of res.items) {
          const acc = local.get(t._account);
          if (!acc) continue; // not a feed account (e.g. KiwiSaver)
          const date = format(new Date(t.date), "yyyy-MM-dd"); // NZ date (the app runs on NZ time)
          if (acc.cutover && date <= acc.cutover) { covered++; continue; }
          const other = digits(t.meta?.other_account);
          const transfer = acc.kind === "loan" || (other.length >= 8 && own.has(other)) || (acc.kind === "credit" && t.amount > 0 && /payment/i.test(t.description));
          const cents = Math.round(t.amount * 100);
          added += Number(insert.run(acc.id, date, (t.description || t.merchant?.name || "(no description)").trim(), cents, transfer ? "Transfers" : null, `akahu:${t._id}`).changes);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      cursor = res.cursor?.next ?? undefined;
      if (!cursor || res.items.length === 0) break;
    }

    applyRules(false);
    const now = new Date().toISOString();
    setSetting("akahu_last_sync", now);
    setSetting("akahu_status", JSON.stringify({ lastSync: now, lastAdded: added } satisfies AkahuStatus));
    logApi("akahu-sync", true, `${trigger}: ${added} new, ${covered} already in statements, ${feed.length} accounts`);
    return { added, covered, accounts: feed.map((a) => a.name) };
  } catch (e) {
    const msg = (e as Error).message;
    setSetting("akahu_status", JSON.stringify({ ...akahuStatus(), error: msg, errorAt: new Date().toISOString() }));
    logApi("akahu-sync", false, `${trigger}: ${msg}`);
    throw e;
  } finally {
    g.__hhAkahuSyncing = false;
  }
}

/** From the background worker: every 6 hours, if switched on and the key is in memory. */
export async function akahuAutoTick() {
  const s = akahuState();
  if (!s.ready || !s.autoSync) return;
  const last = getSetting("akahu_last_sync");
  if (last && Date.now() - new Date(last).getTime() < 6 * 3600_000) return;
  // after a failure, wait an hour before trying again (don't hammer Akahu)
  const { errorAt } = akahuStatus();
  if (errorAt && Date.now() - new Date(errorAt).getTime() < 3600_000) return;
  await syncAkahu("auto").catch(() => {});
}
