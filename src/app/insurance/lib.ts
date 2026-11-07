import { PER_YEAR, type Frequency } from "@/lib/format";

export const KINDS = ["Car", "House", "Contents", "Life", "Health", "Income protection", "Travel", "Pet", "Other"] as const;

export const KIND_ICON: Record<string, string> = {
  Car: "🚗", House: "🏠", Contents: "🛋️", Life: "❤️", Health: "🩺", "Income protection": "💼", Travel: "✈️", Pet: "🐾", Other: "🛡️",
};

export const DOC_KINDS = ["Policy schedule", "Policy wording", "Renewal notice", "Claim", "Receipt", "Other"] as const;

/** Policy joined with the recurring payment it owns. */
export type PolicyRow = {
  id: number;
  kind: string;
  insurer: string;
  covers: string | null;
  policy_number: string | null;
  renewal_date: string | null;
  excess_cents: number | null;
  sum_insured_cents: number | null;
  claims_phone: string | null;
  website: string | null;
  recurring_id: number | null;
  notes: string | null;
  vehicle_id: number | null;
  people: string | null;
  reminded_for: string | null;
  amount_cents: number | null;
  frequency: Frequency | null;
  next_due: string | null;
};

export type PolicyDoc = { id: number; policy_id: number; kind: string; title: string; file_name: string; added_on: string; claim_id: number | null };

export const CLAIM_STATUSES = ["open", "approved", "paid", "declined", "withdrawn"] as const;
export const CLAIM_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "info"> = {
  open: "warn", approved: "info", paid: "good", declined: "bad", withdrawn: "neutral",
};
export type Claim = {
  id: number; policy_id: number; date: string; what: string; claim_number: string | null; status: string;
  excess_cents: number | null; payout_cents: number | null; notes: string | null;
};
export type Quote = {
  id: number; policy_id: number; insurer: string; amount_cents: number; frequency: Frequency;
  excess_cents: number | null; url: string | null; notes: string | null; checked_on: string;
};
export type Price = { id: number; policy_id: number; date: string; amount_cents: number; frequency: Frequency };

export const yearly = (cents: number | null | undefined, freq: Frequency | null | undefined) =>
  cents != null && freq ? cents * PER_YEAR[freq] : null;

/** Member slugs from the "people" column; empty means the whole household. */
export const peopleOf = (p: Pick<PolicyRow, "people">) => (p.people ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Days before renewal the "time to get quotes" reminder goes out (0 = off). Setting: insurance_remind_days. */
export const DEFAULT_REMIND_DAYS = 42;

export const POLICY_SELECT = `
  SELECT p.*, r.amount_cents, r.frequency, r.next_due
    FROM insurance_policies p LEFT JOIN recurring_payments r ON r.id = p.recurring_id`;

/** Renewal this close (days) shows as "due soon" – time to get other quotes. */
export const RENEWAL_SOON_DAYS = 45;

export function policyTitle(p: Pick<PolicyRow, "kind" | "covers">) {
  return p.covers ? `${p.kind} – ${p.covers}` : `${p.kind} insurance`;
}

export function paymentName(p: Pick<PolicyRow, "kind" | "covers" | "insurer">) {
  return `${policyTitle(p)} (${p.insurer})`;
}

export const TIPS = [
  "About 6 weeks before renewal, get two or three quotes – the renewal price is often higher than a new-customer price.",
  "Paying yearly instead of monthly usually saves 5–10%, and most insurers give a multi-policy discount.",
  "A higher excess lowers the premium – pick one you could pay tomorrow without stress.",
  "Check sums insured each year: house rebuild costs and contents values go up.",
  "Keep the policy schedule (the page with your cover, excess and sum insured) here, so it's handy for a claim.",
];
