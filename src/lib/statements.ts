import Papa from "papaparse";
import { createHash } from "node:crypto";
export { CATEGORIES } from "./categories";

export type ParsedTx = { date: string; description: string; amountCents: number };
export type ParseResult = { rows: ParsedTx[]; columns: { date: string; amount: string; description: string[] }; skipped: number };

const DATE_COLS = ["date", "transaction date", "processed date", "posted date", "trans date"];
// "gross" is PayPal's amount column
const AMOUNT_COLS = ["amount", "amount (nzd)", "transaction amount", "value", "gross"];
const DEBIT_COLS = ["debit", "withdrawals", "withdrawal", "debit amount", "money out"];
const CREDIT_COLS = ["credit", "deposits", "deposit", "credit amount", "money in"];
// Joined in this order to make one readable description. Covers ANZ, ASB, BNZ, Westpac and Kiwibank exports.
const DESC_COLS = ["payee", "other party", "name", "details", "description", "memo/description", "memo", "transaction details", "particulars", "code", "reference", "tran type", "type"];

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** NZ banks export dd/mm/yyyy; also accept ISO, dd-mm-yy and "12 Oct 2026". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

function ymd(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseAmount(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/CR$/i.test(s)) s = s.slice(0, -2);
  else if (/DR$/i.test(s)) { neg = true; s = s.slice(0, -2); }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100);
}

export function parseStatement(csv: string): ParseResult {
  const grid = Papa.parse<string[]>(csv.replace(/^﻿/, ""), { skipEmptyLines: true }).data;

  // ASB/Kiwibank put account details above the real header, so find the header row.
  const headerIdx = grid.findIndex((row) => {
    const cells = row.map((c) => c.trim().toLowerCase());
    return cells.some((c) => DATE_COLS.includes(c)) &&
      cells.some((c) => AMOUNT_COLS.includes(c) || DEBIT_COLS.includes(c) || CREDIT_COLS.includes(c));
  });
  if (headerIdx === -1) throw new Error("Couldn't find a header row with a Date and Amount column. Export the statement as CSV with headers.");

  const header = grid[headerIdx].map((c) => c.trim().toLowerCase());
  const find = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i !== -1) ?? -1;
  const dateI = find(DATE_COLS);
  const amountI = find(AMOUNT_COLS);
  const debitI = find(DEBIT_COLS);
  const creditI = find(CREDIT_COLS);
  const descIs = DESC_COLS.map((n) => header.indexOf(n)).filter((i) => i !== -1);

  const rows: ParsedTx[] = [];
  let skipped = 0;
  for (const row of grid.slice(headerIdx + 1)) {
    const date = row[dateI] ? parseDate(row[dateI]) : null;
    let amount: number | null;
    if (amountI !== -1) amount = parseAmount(row[amountI]);
    else {
      const debit = parseAmount(row[debitI]);
      const credit = parseAmount(row[creditI]);
      amount = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : null;
    }
    const description = [...new Set(descIs.map((i) => row[i]?.trim()).filter(Boolean))].join(" · ");
    if (!date || amount == null) { skipped++; continue; }
    rows.push({ date, amountCents: amount, description: description || "(no description)" });
  }

  return {
    rows,
    skipped,
    columns: {
      date: header[dateI],
      amount: amountI !== -1 ? header[amountI] : `${header[debitI] ?? "?"} / ${header[creditI] ?? "?"}`,
      description: descIs.map((i) => header[i]),
    },
  };
}

/** Stable per-row hash so re-importing an overlapping statement doesn't duplicate rows.
 *  `nth` separates genuinely identical transactions on the same day. */
export function txHash(accountId: number | null, t: ParsedTx, nth: number) {
  return createHash("sha1").update(`${accountId ?? ""}|${t.date}|${t.amountCents}|${t.description}|${nth}`).digest("hex");
}

/** Starter rules for common NZ merchants. */
export const DEFAULT_RULES: [string, string][] = [
  ["countdown", "Groceries"], ["woolworths", "Groceries"], ["new world", "Groceries"], ["pak n save", "Groceries"],
  ["paknsave", "Groceries"], ["four square", "Groceries"], ["fresh choice", "Groceries"],
  ["z energy", "Transport"], ["bp ", "Transport"], ["mobil", "Transport"], ["gull", "Transport"], ["waitomo", "Transport"], ["npd", "Transport"],
  ["supercheap", "Transport"], ["repco", "Transport"], ["nzta", "Transport"], ["waka kotahi", "Transport"], ["care park", "Transport"],
  ["mercury", "Bills"], ["genesis", "Bills"], ["contact energy", "Bills"], ["meridian", "Bills"],
  ["electric kiwi", "Bills"], ["flick", "Bills"], ["spark", "Bills"], ["one nz", "Bills"],
  ["2degrees", "Bills"], ["skinny", "Bills"], ["vodafone", "Bills"],
  ["netflix", "Bills"], ["spotify", "Bills"], ["disney", "Bills"], ["neon", "Bills"],
  ["sky ", "Bills"], ["youtube", "Bills"], ["apple.com", "Bills"], ["google one", "Bills"], ["icloud", "Bills"], ["xbox", "Bills"],
  ["council", "Bills"], ["hometown district", "Bills"], ["northland waste", "Bills"],
  ["tower", "Bills"], ["aa insurance", "Bills"], ["ami ", "Bills"], ["state insurance", "Bills"], ["partners life", "Bills"], ["aia", "Bills"],
  ["udc", "Bills"], ["loan repayment", "Bills"], ["afterpay", "Bills"], ["zip pay", "Bills"], ["gem visa", "Bills"],
  ["bunnings", "Home & family"], ["mitre 10", "Home & family"], ["placemakers", "Home & family"],
  ["kmart", "Home & family"], ["the warehouse", "Home & family"], ["farmers", "Home & family"],
  ["aliexpress", "Home & family"], ["jaycar", "Home & family"],
  ["chemist warehouse", "Home & family"], ["unichem", "Home & family"], ["life pharmacy", "Home & family"], ["pharmacy", "Home & family"],
  ["uber eats", "Eating out & fun"], ["delivereasy", "Eating out & fun"], ["mcdonalds", "Eating out & fun"], ["kfc", "Eating out & fun"],
  ["screening room", "Eating out & fun"], ["booking.com", "Eating out & fun"],
  ["salary", "Income"], ["wages", "Income"], ["ird", "Income"], ["acme ltd", "Income"],
  ["sharesies", "Savings"], ["bonus saver", "Savings"],
  // paying off the Q Card from the bank: the purchases on the card are the spending, so this isn't counted again
  ["columbus fin", "Transfers"],
];
