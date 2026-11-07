import "server-only";
import { getDocumentProxy } from "unpdf";
import type { ParsedTx } from "./statements";

/**
 * Reads PDF bank statements: Westpac (Everyday, savings, home loan) and Q Mastercard.
 * Everything happens on this machine. Each statement is checked against its own
 * opening/closing balances so a misread shows up instead of slipping in silently.
 */

export type PdfStatement = {
  bank: "Westpac" | "Q Card";
  accountNumber: string;        // e.g. "03 0123 0456789-00", or the Q Card customer ID
  accountName: string;          // e.g. "Westpac Everyday", "Q Mastercard"
  kind: "everyday" | "savings" | "loan" | "credit";
  from: string | null;          // statement period, YYYY-MM-DD
  to: string | null;
  rows: (ParsedTx & { category?: string })[];
  check: { ok: boolean; note: string };
};

type Item = { str: string; x: number; right: number; y: number };
type Row = { y: number; items: Item[]; text: string };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// a running balance on a loan reads "348,825.61 OD"
const AMOUNT = /^-?[\d,]+\.\d{2}(\s+(OD|CR))?$/;
const cents = (s: string) => Math.round(Number(s.replace(/\s+(OD|CR)$/, "").replace(/[$,\s]/g, "")) * 100);
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const money = (c: number) => `$${(c / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "23 September 2025" → 2025-09-23 */
function longDate(s: string | undefined): string | null {
  const m = s?.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const mo = m && MONTHS[m[2].slice(0, 3).toLowerCase()];
  return m && mo ? ymd(+m[3], mo, +m[1]) : null;
}

/** Text items grouped into visual rows (top to bottom), per page. */
async function readPages(data: Uint8Array): Promise<Row[][]> {
  const pdf = await getDocumentProxy(data);
  const pages: Row[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const list: Item[] = [];
    for (const it of items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str?.trim() || !it.transform) continue;
      list.push({ str: it.str.trim(), x: it.transform[4], right: it.transform[4] + (it.width ?? 0), y: it.transform[5] });
    }
    list.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Row[] = [];
    for (const it of list) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it], text: "" });
    }
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      r.text = r.items.map((i) => i.str).join(" ");
    }
    pages.push(rows.sort((a, b) => b.y - a.y));
  }
  return pages;
}

export async function parseStatementPdf(data: Uint8Array): Promise<PdfStatement> {
  const pages = await readPages(data);
  const all = pages.flat().map((r) => r.text).join("\n");
  if (/Westpac New Zealand Limited/i.test(all) && /MONEY OUT/i.test(all)) return westpac(pages, all);
  if (/Q Mastercard|qmastercard\.co\.nz/i.test(all) && /TRANSACTIONS FOR THIS STATEMENT PERIOD/i.test(all)) return qcard(pages, all);
  throw new Error("Not a statement Home Hub can read yet (Westpac and Q Card PDFs are supported; other banks: export CSV instead).");
}

// ── Westpac ──

function westpac(pages: Row[][], all: string): PdfStatement {
  const number = all.match(/Account number:\s*(\d{2}\s?\d{4}\s?\d{7}-\d{2,3})/)?.[1] ?? "unknown";
  const lines = all.split("\n");
  const nameIdx = lines.findIndex((l) => /^Account name:/.test(l));
  const product = nameIdx > 0 ? lines[nameIdx - 1].trim() : "Westpac account";
  const from = longDate(all.match(/Statement Opening date:\s*([^\n]+)/)?.[1]);
  const to = longDate(all.match(/Statement Closing date:\s*([^\n]+)/)?.[1]);
  // home loans are titled things like "Choices Fixed Home Loan" or just "Choices fixed"
  const kind: PdfStatement["kind"] = /loan|mortgage|choices|fixed|floating/i.test(product) ? "loan" : /saver|saving|bonus/i.test(product) ? "savings" : "everyday";

  // balances: "OD" means overdrawn / owing, i.e. negative
  const bal = (label: string) => {
    const m = all.match(new RegExp(`${label} BALANCE \\$([\\d,]+\\.\\d{2})( OD)?`, "i"));
    return m ? cents(m[1]) * (m[2] ? -1 : 1) : null;
  };
  const opening = bal("OPENING");
  const closing = bal("CLOSING");

  // statement dates like "23 Sep" have no year: pick the year that puts the date inside the statement period
  const endYear = to ? +to.slice(0, 4) : new Date().getFullYear();
  const dateOf = (dd: string, mon: string) => {
    const m = MONTHS[mon.toLowerCase()];
    let d = ymd(endYear, m, +dd);
    if (to && d > to) d = ymd(endYear - 1, m, +dd);
    return d;
  };

  type Tx = { date: string; type: string; parts: string[]; out: number; in: number; y: number };
  const txs: Tx[] = [];
  for (const rows of pages) {
    const header = rows.find((r) => /MONEY OUT/.test(r.text) && /MONEY IN/.test(r.text));
    if (!header) continue;
    const col = (re: RegExp) => header.items.find((i) => re.test(i.str));
    const outRight = col(/MONEY OUT/)!.right;
    const inRight = col(/MONEY IN/)!.right;
    const balRight = col(/BALANCE/)?.right ?? inRight + 70;
    const typeX = col(/^TYPE$/)?.x ?? 79;
    const nameX = col(/NAME OF OTHER PARTY/)?.x ?? 107;

    let current: Tx | null = null;
    for (const r of rows) {
      if (r.y >= header.y) continue;
      if (/^(CLOSING BALANCE|continued on next page|CR Credit)/i.test(r.text)) { current = null; if (/CLOSING BALANCE/i.test(r.text)) break; continue; }
      const first = r.items[0];
      // newer statements put the type in the same text piece as the date: "28 May DE"
      const dm = first.str.match(/^(\d{2})\s+([A-Za-z]{3})(?:\s+([A-Z]{2}))?$/);
      if (dm && first.x < typeX) {
        current = { date: dateOf(dm[1], dm[2]), type: dm[3] ?? "", parts: [], out: 0, in: 0, y: r.y };
        txs.push(current);
      }
      if (!current) continue;
      for (const it of r.items) {
        if (it === first && dm) continue;
        if (AMOUNT.test(it.str) && it.x > nameX + 150) {
          // whichever money column this number lines up with (right-aligned)
          const d = [[Math.abs(it.right - outRight), "out"], [Math.abs(it.right - inRight), "in"], [Math.abs(it.right - balRight), "bal"]] as const;
          const best = [...d].sort((a, b) => a[0] - b[0])[0][1];
          if (best === "out") current.out += cents(it.str);
          else if (best === "in") current.in += cents(it.str);
          continue;
        }
        if (dm && Math.abs(it.x - typeX) < 6 && /^[A-Z]{2}$/.test(it.str)) { current.type = it.str; continue; }
        if (/^OD$/.test(it.str)) continue;
        current.parts.push(it.str);
      }
    }
  }

  const rows = txs.map((t) => {
    const amountCents = t.in - t.out;
    // drop masked card numbers and transfer timestamps; keep the merchant and useful particulars
    const parts = t.parts
      .filter((p) => !/^[\d*]{6,}[*]+\s*\d{4}/.test(p) && !/^\*{4,}/.test(p) && !/^\d{2}:\d{2}-\d+$/.test(p))
      .map((p) => p.replace(/\*{4,}\s*\d{4}/g, "").trim())
      .filter(Boolean);
    let name = parts.join(" ").replace(/\s+/g, " ").trim();
    if (t.type === "PS") name = name.replace(/\s+\d{2}(?=\s|$)/, ""); // eftpos day code: "Woolworths NZ 9 22" → "Woolworths NZ 9"
    const description = name || "(no description)";
    // money moving between your own accounts isn't spending
    const transfer = /\b(To|From|FRM)\s+\d{4}-\d{7}-\d{2}\b/i.test(name) || kind === "loan";
    return { date: t.date, description, amountCents, category: transfer ? "Transfers" : undefined };
  });

  const sum = rows.reduce((s, r) => s + r.amountCents, 0);
  let check: PdfStatement["check"];
  if (opening == null || closing == null) check = { ok: false, note: "couldn't find the opening/closing balance to check against" };
  else if (opening + sum === closing) check = { ok: true, note: `adds up: ${money(opening)} → ${money(closing)}` };
  else check = { ok: false, note: `doesn't add up: expected ${money(closing - opening)} of movement, read ${money(sum)}` };

  return { bank: "Westpac", accountNumber: number, accountName: product, kind, from, to, rows, check };
}

// ── Q Mastercard ──

function qcard(pages: Row[][], all: string): PdfStatement {
  const id = all.match(/Customer ID:\s*(\d{6,})/)?.[1] ?? all.match(/Reference:\s*ID(\d{6,})/)?.[1] ?? "unknown";
  const period = all.match(/(\d{1,2} [A-Za-z]+ \d{4})\s+to\s+(\d{1,2} [A-Za-z]+ \d{4})/);
  const lines = pages.flat().map((r) => r.text);
  const start = lines.findIndex((l) => /TRANSACTIONS FOR THIS STATEMENT PERIOD/i.test(l));
  const section = start >= 0 ? lines.slice(start) : lines;
  const balanceOf = (label: string) => {
    const l = section.find((x) => new RegExp(`^${label} balance`, "i").test(x));
    const m = l?.match(/\$\s*([\d,]+\.\d{2})(\s*CR)?/);
    return m ? cents(m[1]) * (m[2] ? -1 : 1) : null; // owing is positive; CR means in credit
  };
  const opening = balanceOf("Opening");
  const closing = balanceOf("Closing");

  const rows: PdfStatement["rows"] = [];
  for (const l of section) {
    const m = l.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})\s+(?:(\d{4})\s+)?(.+?)\s+\$\s*([\d,]+\.\d{2})(\s*CR)?$/);
    if (!m) continue;
    const mo = MONTHS[m[2].toLowerCase()];
    if (!mo) continue;
    const credit = !!m[7];
    // drop finance-plan wording: "… 18 Mth 0% Int", "… 6 Months No Payments No Interest"
    const description = m[5].replace(/\s+/g, " ").replace(/\s+\d+\s*(Mths?|Months?)\b.*$/i, "").trim();
    rows.push({
      date: ymd(2000 + +m[3], mo, +m[1]),
      description: `${description} · Q Card`,
      // purchases are money out (negative); payments/refunds (CR) are money in
      amountCents: credit ? cents(m[6]) : -cents(m[6]),
      category: /payment received/i.test(description) ? "Transfers" : undefined,
    });
  }

  const sum = rows.reduce((s, r) => s + r.amountCents, 0);
  let check: PdfStatement["check"];
  if (opening == null || closing == null) check = { ok: false, note: "couldn't find the opening/closing balance to check against" };
  else if (opening - sum === closing) check = { ok: true, note: `adds up: ${money(opening)} owing → ${money(closing)} owing` };
  else check = { ok: false, note: `doesn't add up: expected ${money(closing - opening)} of new charges, read ${money(-sum)}` };

  return {
    bank: "Q Card", accountNumber: id, accountName: "Q Mastercard", kind: "credit",
    from: longDate(period?.[1]), to: longDate(period?.[2]), rows, check,
  };
}
