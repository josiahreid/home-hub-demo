import Papa from "papaparse";
import { strFromU8, unzipSync } from "fflate";

/**
 * Reads the "HOUSEHOLD BUDGET" spreadsheet – the Excel file itself (.xlsx, its "claude" tab) or saved as CSV.
 * It finds each section by its heading, so moving rows around in Excel is fine
 * as long as the headings and column order stay the same.
 */

export type SheetLine = { grp: string; name: string; old: number | null; actual: number | null; budget: number; notes: string | null };
export type SheetIncome = { name: string; amount: number };
export type SheetOption = { name: string; saves: number | null; used: boolean; notes: string | null };
export type SheetBalance = { name: string; kind: "cash" | "debt"; amount: number };
export type BudgetSheet = {
  income: SheetIncome[];
  lines: SheetLine[];
  options: SheetOption[];
  balances: SheetBalance[];
  balancesAsOf: string | null;
  payOffDebts: boolean | null;
};

/** "$1,465.37" → 146537, "-$315.51" → -31551, "-" or "" → null. */
export function sheetMoney(raw: string | undefined): number | null {
  const s = (raw ?? "").trim().replace(/[$,\s]/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

export function parseBudgetSheet(csv: string): BudgetSheet {
  return parseBudgetRows(Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), { skipEmptyLines: false }).data);
}

/**
 * The rows of an Excel file's sheet as text (like a CSV would give): the tab named "claude" if there is one,
 * otherwise the first. Only reads what's stored – formulas come back as their last calculated value.
 */
export function xlsxRows(bytes: Uint8Array): string[][] {
  const z = unzipSync(bytes);
  const txt = (p: string) => (z[p] ? strFromU8(z[p]) : "");
  const decode = (x: string) => x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  if (!z["xl/workbook.xml"]) throw new Error("That doesn't look like an Excel file (.xlsx).");
  const shared = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rels = txt("xl/_rels/workbook.xml.rels");
  const sheets = [...txt("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].map((m) => {
    const rel = rels.match(new RegExp(`<Relationship [^>]*Id="${m[2]}"[^>]*>`))?.[0] ?? "";
    return { name: decode(m[1]), path: "xl/" + (rel.match(/Target="([^"]*)"/)?.[1] ?? "").replace(/^\/?xl\//, "") };
  });
  const sheet = sheets.find((x) => /^claude$/i.test(x.name.trim())) ?? sheets[0];
  if (!sheet) throw new Error("The Excel file has no sheets.");
  const col = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  for (const row of txt(sheet.path).matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = Number(row[1]) - 1;
    const out: string[] = [];
    for (const c of row[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/r="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      const t = c[1].match(/t="([^"]*)"/)?.[1];
      const inner = c[2] ?? "";
      let v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (t === "s" && v != null) v = shared[Number(v)];
      else if (t === "inlineStr") v = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("");
      else if (v != null) v = decode(v);
      out[col(ref)] = v ?? "";
    }
    rows[r] = Array.from(out, (x) => x ?? "");
  }
  return Array.from(rows, (x) => x ?? []);
}

/** The spreadsheet's sections, from its rows (whether they came from Excel or a CSV). */
export function parseBudgetRows(rows: string[][]): BudgetSheet {
  const cell = (r: number, c: number) => (rows[r]?.[c] ?? "").replace(/ /g, " ");
  const find = (test: (first: string) => boolean, from = 0) => {
    for (let i = from; i < rows.length; i++) if (test(cell(i, 0).trim().toLowerCase())) return i;
    return -1;
  };

  // ── income ──
  const income: SheetIncome[] = [];
  const incomeStart = find((s) => s.startsWith("income (fn)"));
  if (incomeStart === -1) throw new Error("Couldn't find the INCOME (FN) section. Is this the budget spreadsheet?");
  for (let i = incomeStart + 1; i < rows.length; i++) {
    const name = cell(i, 0).trim();
    if (!name || /^total income/i.test(name)) break;
    income.push({ name, amount: sheetMoney(cell(i, 1)) ?? 0 });
  }

  // ── outgoings: group rows are flush left, item rows are indented ──
  const lines: SheetLine[] = [];
  const outStart = find((s) => s.startsWith("outgoings (fn)"));
  if (outStart === -1) throw new Error("Couldn't find the OUTGOINGS (FN) section.");
  let grp = "";
  for (let i = outStart + 1; i < rows.length; i++) {
    const raw = cell(i, 0);
    const name = raw.trim();
    if (/^total incoming/i.test(name)) break;
    if (!name) continue;
    if (/^\s/.test(raw)) {
      lines.push({
        grp, name,
        old: sheetMoney(cell(i, 1)), actual: sheetMoney(cell(i, 2)), budget: sheetMoney(cell(i, 3)) ?? 0,
        notes: cell(i, 5).trim() || null,
      });
    } else {
      grp = name;
    }
  }
  if (lines.length === 0) throw new Error("No budget lines found under OUTGOINGS. Item rows should be indented under their group.");

  // ── ways to close the gap ──
  const options: SheetOption[] = [];
  const optHeader = find((s) => s === "option");
  if (optHeader !== -1) {
    for (let i = optHeader + 1; i < rows.length; i++) {
      const name = cell(i, 0).trim();
      if (!name || /^total from chosen/i.test(name)) break;
      options.push({ name, saves: sheetMoney(cell(i, 1)), used: cell(i, 2).trim() === "1", notes: cell(i, 5).trim() || null });
    }
  }

  // ── savings runway balances ──
  const balances: SheetBalance[] = [];
  let balancesAsOf: string | null = null;
  let payOffDebts: boolean | null = null;
  const balHeader = find((s) => s.startsWith("account balances"));
  if (balHeader !== -1) {
    const m = cell(balHeader, 0).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
    if (m && MONTHS[m[2].toLowerCase()]) balancesAsOf = `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
    for (let i = balHeader + 1; i < rows.length; i++) {
      const name = cell(i, 0).trim();
      if (!name || /^starting savings/i.test(name)) break;
      if (/^total cash/i.test(name)) continue;
      if (/^pay off/i.test(name)) { payOffDebts = cell(i, 1).trim() === "1"; continue; }
      balances.push({ name, kind: /owing|owed|debt/i.test(name) ? "debt" : "cash", amount: sheetMoney(cell(i, 1)) ?? 0 });
    }
  }

  return { income, lines, options, balances, balancesAsOf, payOffDebts };
}

/** Which payday pot a group's money goes to, and which category each line is tracked against. */
export function potFor(grp: string): string {
  const g = grp.toLowerCase();
  if (/food|fuel/.test(g)) return "food";
  if (/kids|health|upkeep|sinking/.test(g)) return "sinking";
  if (/everyday|spending/.test(g)) return "spending";
  if (/saving/.test(g)) return "savings";
  return "bills";
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/mortgage/i, "Mortgage"], [/rates/i, "Rates"], [/car loan|udc/i, "Car loan"], [/life ins/i, "Life insurance"],
  [/insurance/i, "Insurance"], [/q card|gem visa|afterpay|zip|repayment/i, "Debt repayments"],
  [/power|internet|2degrees|broadband/i, "Utilities"], [/phone/i, "Phone"], [/rubbish|waste/i, "Rubbish"],
  [/subscription/i, "Subscriptions"], [/grocer/i, "Groceries"], [/petrol|fuel/i, "Fuel"], [/kids|baby/i, "Kids & baby"],
  [/health|pharmacy|dental|doctor/i, "Health"], [/vehicle|rego|wof|servic/i, "Car"], [/christmas/i, "Christmas"],
  [/birthday/i, "Birthdays"], [/takeaway|caf|canteen/i, "Eating out"], [/shopping|hardware|household/i, "Shopping & household"],
  [/entertainment|event|holiday/i, "Entertainment"], [/cash|giving|misc/i, "Cash & giving"],
  [/spending money/i, "Spending money"], [/sharesies|shares|invest/i, "Investing"], [/emergency|saving/i, "Savings"],
];

export function categoryForLine(name: string): string | null {
  return CATEGORY_RULES.find(([re]) => re.test(name))?.[1] ?? null;
}

/**
 * Which of today's budget categories a bucket line's spending is in (Bills, Groceries, Transport…), so each line can
 * show what was actually spent. `custom` = your own categories, e.g. "Default Name Spending" for "Default Name spending money".
 */
export function bucketCategory(name: string, custom: string[] = []): string {
  const has = (c: string) => custom.find((x) => x.toLowerCase() === c.toLowerCase());
  if (/sharesies|shares|invest|emergency|saving/i.test(name)) return "Savings";
  if (/(personA|default-name).*spending/i.test(name)) return has("Default Name Spending") ?? "Other";
  if (/(personB|default-name-2).*spending/i.test(name)) return has("Default Name 2 Spending") ?? "Other";
  if (/mortgage|rates|loan|insurance|q card|gem|afterpay|zip|power|internet|2degrees|phone|spark|rubbish|waste|subscription/i.test(name)) return "Bills";
  if (/grocer/i.test(name)) return "Groceries";
  if (/petrol|fuel|vehicle|rego|wof|servic/i.test(name)) return "Transport";
  if (/takeaway|caf|canteen|entertainment|event|holiday|christmas|birthday/i.test(name)) return "Eating out & fun";
  if (/kids|baby|health|pharmacy|dental|doctor|shopping|hardware|household/i.test(name)) return "Home & family";
  return "Other";
}

export const POTS: Record<string, { label: string; note: string }> = {
  bills: { label: "Bills (automatic payments)", note: "Everything on autopay – never touch it" },
  food: { label: "Food & fuel (one card)", note: "Groceries and petrol only" },
  sinking: { label: "Sinking fund", note: "Saves up for the lumpy stuff" },
  spending: { label: "Spending", note: "When it's gone, it's gone" },
  savings: { label: "Savings / emergency", note: "Don't touch" },
};
