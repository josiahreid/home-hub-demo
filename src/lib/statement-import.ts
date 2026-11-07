import "server-only";
import { db, run } from "./db";
import { parseStatement, txHash } from "./statements";

/** Result of importing one statement file – shown per file on the Import page. */
export type FileResult = {
  file: string;
  status: "imported" | "skipped" | "error";
  account?: string;
  period?: string;
  added?: number;
  duplicates?: number;
  check?: { ok: boolean; note: string };
  note?: string;
};

const ACCOUNT_KIND: Record<string, string> = { everyday: "everyday", savings: "savings", loan: "loan", credit: "credit" };

/** Finds the account for a statement by its number, creating it the first time. */
function accountFor(number: string, name: string, institution: string, kind: string): { id: number; name: string } {
  const existing = db.prepare("SELECT id, name FROM accounts WHERE number = ?").get(number) as { id: number; name: string } | undefined;
  if (existing) return existing;
  // "03 0123 0456789-00" → "Westpac Everyday (…6789-00)"; card customer IDs → "Q Mastercard"
  const tail = number.match(/(\d{4}-\d{2,3})$/)?.[1];
  const label = tail ? `${name} (…${tail})` : name;
  const id = Number(run("INSERT INTO accounts (name, institution, kind, number) VALUES (?, ?, ?, ?)", label, institution, ACCOUNT_KIND[kind] ?? "everyday", number).lastInsertRowid);
  return { id, name: label };
}

function insertRows(accountId: number, rows: { date: string; description: string; amountCents: number; category?: string }[]) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO transactions (account_id, date, description, amount_cents, category, source, import_hash) VALUES (?, ?, ?, ?, ?, 'import', ?)",
  );
  const seen = new Map<string, number>();
  let added = 0;
  db.exec("BEGIN");
  try {
    for (const t of rows) {
      const k = `${t.date}|${t.amountCents}|${t.description}`;
      const nth = seen.get(k) ?? 0;
      seen.set(k, nth + 1);
      added += Number(insert.run(accountId, t.date, t.description, t.amountCents, t.category ?? null, txHash(accountId, t, nth)).changes);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return added;
}

/**
 * Imports one statement file (Westpac / Q Card PDF, PayPal or bank CSV).
 * Duplicates are skipped by each transaction's hash, so importing the same file twice is safe.
 * The caller applies category rules and refreshes pages afterwards.
 */
export async function importStatementBytes(
  name: string,
  bytes: Uint8Array,
  opts: { accountId?: number | null; newAccount?: string | null } = {},
): Promise<FileResult> {
  const ext = name.toLowerCase().split(".").pop();
  try {
    if (ext === "pdf") {
      const { parseStatementPdf } = await import("./statement-pdf");
      let s;
      try {
        s = await parseStatementPdf(bytes);
      } catch (e) {
        return { file: name, status: "skipped", note: (e as Error).message };
      }
      const account = accountFor(s.accountNumber, s.accountName, s.bank, s.kind);
      const added = insertRows(account.id, s.rows);
      return {
        file: name, status: "imported", account: account.name,
        period: s.from && s.to ? `${s.from} → ${s.to}` : undefined,
        added, duplicates: s.rows.length - added, check: s.check,
      };
    }

    if (ext === "csv") {
      const text = new TextDecoder().decode(bytes);
      const isPaypal = /"Gross"/.test(text.slice(0, 500)) && /"Transaction ID"/.test(text.slice(0, 600));
      let accountId = opts.accountId ?? null;
      let accountName = "";
      if (accountId == null && opts.newAccount) {
        // the first CSV creates it; later files in the same batch find it by name
        const found = db.prepare("SELECT id FROM accounts WHERE name = ? COLLATE NOCASE").get(opts.newAccount) as { id: number } | undefined;
        accountId = found?.id ?? Number(run("INSERT INTO accounts (name) VALUES (?)", opts.newAccount).lastInsertRowid);
      }
      if (isPaypal) {
        const a = accountFor("paypal", "PayPal", "PayPal", "everyday");
        accountId = a.id;
        accountName = a.name;
      } else if (accountId == null) {
        return { file: name, status: "skipped", note: "CSV files need an account – import this one with Choose files and pick its account." };
      } else {
        accountName = (db.prepare("SELECT name FROM accounts WHERE id = ?").get(accountId) as { name: string } | undefined)?.name ?? "";
      }
      let parsed;
      try {
        parsed = parseStatement(text);
      } catch (e) {
        return { file: name, status: "skipped", note: (e as Error).message };
      }
      // PayPal rows are kept for detail but count as Transfers – the same purchase is on the bank or Q Card statement
      const added = insertRows(accountId, isPaypal ? parsed.rows.map((r) => ({ ...r, category: "Transfers" })) : parsed.rows);
      return {
        file: name, status: "imported", account: accountName, added, duplicates: parsed.rows.length - added,
        note: isPaypal ? "PayPal is kept for detail but not counted as spending – the same purchases are on your bank or Q Card statement."
          : parsed.skipped ? `${parsed.skipped} unreadable rows ignored` : undefined,
      };
    }

    return { file: name, status: "skipped", note: "Not a statement file (only .pdf and .csv are read)." };
  } catch (e) {
    return { file: name, status: "error", note: (e as Error).message };
  }
}
