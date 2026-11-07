import type { Frequency } from "@/lib/format";

export const KINDS = ["Power", "Internet", "Mortgage", "Rates", "Water", "Phone", "Other"] as const;  // insurance has its own tab
export type Kind = (typeof KINDS)[number];

/** Utility joined with the recurring payment it owns. */
export type UtilityRow = {
  id: number;
  kind: string;
  provider: string;
  plan: string | null;
  account_number: string | null;
  contract_end: string | null;
  recurring_id: number | null;
  notes: string | null;
  amount_cents: number | null;
  frequency: Frequency | null;
  next_due: string | null;
};

export const UTILITY_SELECT = `
  SELECT u.*, r.amount_cents, r.frequency, r.next_due
    FROM utilities u LEFT JOIN recurring_payments r ON r.id = u.recurring_id`;

export const CONTRACT_SOON_DAYS = 60;

export function categoryFor(kind: string) {
  return kind === "Mortgage" ? "Mortgage" : "Utilities";
}

export function paymentName(kind: string, provider: string) {
  return `${kind} – ${provider}`;
}

export const DEFAULT_UNIT: Partial<Record<string, string>> = {
  Power: "kWh",
  Internet: "GB",
  Water: "m³",
  Phone: "GB",
};

export const TIPS: Record<string, { title: string; points: { text: string; href?: string }[] }> = {
  Power: {
    title: "Cheaper power",
    points: [
      { text: "Compare plans for your actual usage on Powerswitch (Consumer NZ).", href: "https://www.powerswitch.org.nz" },
      { text: "Check low-user vs standard user daily charges — the low-user fixed charge is being phased out, so re-check each April." },
      { text: "Ask about prompt-payment, dual-fuel and bundle discounts, and whether a time-of-use / free-hour plan suits you." },
      { text: "Log kWh on each bill so offers can be compared on real usage." },
    ],
  },
  Internet: {
    title: "Cheaper internet",
    points: [
      { text: "Compare fibre and wireless plans by address on Broadband Compare.", href: "https://www.broadbandcompare.co.nz" },
      { text: "Check fibre speed tiers — most households don't need more than Fibre 300." },
      { text: "Bundling with power or mobile often knocks $10–$20/month off. Watch for promo pricing that ends after 12 months." },
    ],
  },
  Mortgage: {
    title: "Mortgage",
    points: [
      { text: "Put your fixed-rate refix date in “Contract end” so it shows on the calendar 60 days out." },
      { text: "Banks will usually let you lock in a new rate up to 60 days before the refix — ask your bank or a broker for a retention offer." },
      { text: "Compare current advertised rates on interest.co.nz.", href: "https://www.interest.co.nz/borrowing" },
      { text: "Log offers as the monthly repayment on the same loan balance and term so they compare directly." },
    ],
  },
  Rates: {
    title: "Council rates",
    points: [
      { text: "Councils bill in instalments (usually quarterly) — set the frequency and next instalment date to match your rates notice." },
      { text: "Paying the full year by the first instalment date can earn a small discount with some councils." },
      { text: "Check eligibility for the government rates rebate if your income is low.", href: "https://www.govt.nz/browse/housing-and-property/getting-help-with-housing/rates-rebate/" },
    ],
  },
  Water: {
    title: "Water",
    points: [
      { text: "Water is often billed by your council or regional water entity — record the m³ used each bill to spot leaks early." },
      { text: "A sudden jump in usage with no change in habits usually means a leak (check the toilet cistern first)." },
    ],
  },
  Phone: {
    title: "Mobile & phone",
    points: [
      { text: "Compare mobile plans on Broadband Compare, and check whether you still need a landline.", href: "https://www.broadbandcompare.co.nz/mobile" },
      { text: "Prepay or a family/shared data plan is often cheaper than individual on-account plans." },
    ],
  },
  Other: {
    title: "Saving tips",
    points: [
      { text: "Check the price each year before it renews and log any competing offers here to see the saving." },
    ],
  },
};
