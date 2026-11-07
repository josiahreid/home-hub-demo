import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO } from "date-fns";

const nzd = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return nzd.format(cents / 100);
}

/** "12.50", "$1,200", "-4" → cents. Empty → null. */
export function toCents(value: FormDataEntryValue | null | undefined): number | null {
  if (value == null) return null;
  const s = String(value).replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function str(value: FormDataEntryValue | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function int(value: FormDataEntryValue | null | undefined): number | null {
  const s = str(value);
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// ── dates (stored as YYYY-MM-DD strings, local time) ──

export function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function niceDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  return format(parseISO(isoDate), "EEE d MMM yyyy");
}

export function shortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  return format(parseISO(isoDate), "d MMM");
}

export function daysUntil(isoDate: string): number {
  return differenceInCalendarDays(parseISO(isoDate), new Date());
}

export function relDays(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const d = daysUntil(isoDate);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
export const FREQUENCIES: Frequency[] = ["weekly", "fortnightly", "monthly", "quarterly", "yearly"];

export function advance(isoDate: string, freq: Frequency): string {
  const d = parseISO(isoDate);
  switch (freq) {
    case "weekly": return iso(addWeeks(d, 1));
    case "fortnightly": return iso(addWeeks(d, 2));
    case "monthly": return iso(addMonths(d, 1));
    case "quarterly": return iso(addMonths(d, 3));
    case "yearly": return iso(addYears(d, 1));
  }
}

export const PER_YEAR: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 };

/** Average monthly cost of something that recurs at `freq`. */
export function perMonth(cents: number, freq: Frequency): number {
  return Math.round((cents * PER_YEAR[freq]) / 12);
}

/** "$100 a month" → what that is per pay fortnight. */
export function toFortnightly(cents: number, freq: Frequency): number {
  return Math.round((cents * PER_YEAR[freq]) / 26);
}

export function asFrequency(value: FormDataEntryValue | null | undefined): Frequency {
  return FREQUENCIES.find((f) => f === value) ?? "fortnightly";
}

/** All occurrences of a recurring item between from..to inclusive. */
export function occurrences(nextDue: string, freq: Frequency, from: string, to: string): string[] {
  const out: string[] = [];
  let d = nextDue;
  for (let i = 0; i < 400 && d <= to; i++) {
    if (d >= from) out.push(d);
    d = advance(d, freq);
  }
  return out;
}

export type Repeat = "daily" | "weekly" | "monthly" | "yearly";
export const REPEATS: [Repeat | "", string][] = [["", "Doesn't repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"], ["yearly", "Every year"]];
export const asRepeat = (v: unknown): Repeat | null => (["daily", "weekly", "monthly", "yearly"].includes(String(v)) ? (v as Repeat) : null);

/** Dates a repeating event falls on between from..to (inclusive), stopping after `until` if set. */
export function repeatDates(start: string, repeat: Repeat, from: string, to: string, until?: string | null): string[] {
  const s = parseISO(start);
  const step = (n: number) =>
    repeat === "daily" ? addDays(s, n) : repeat === "weekly" ? addWeeks(s, n) : repeat === "monthly" ? addMonths(s, n) : addYears(s, n);
  // jump close to `from` instead of walking from a start date years ago
  const span = differenceInCalendarDays(parseISO(from), s);
  let n = span <= 0 ? 0 : Math.max(0, Math.floor(span / ({ daily: 1, weekly: 7, monthly: 31, yearly: 366 } as const)[repeat]) - 1);
  const last = until && until < to ? until : to;
  const out: string[] = [];
  for (let i = 0; i < 1000; i++, n++) {
    const d = iso(step(n));
    if (d > last) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export { addDays, parseISO };
