// Types and helpers shared by the Price compare pages (no server-only imports).

export { JOB_STATUSES as HUNT_STATUSES, statusLabel, splitTags, type JobStatus as HuntStatus } from "../projects/shared";
import type { JobStatus } from "../projects/shared";

export type Hunt = {
  id: number;
  member_id: number;
  title: string;
  description: string | null;
  tags: string | null;
  status: JobStatus;
  created_at: string;
};

export type PriceLink = {
  id: number;
  hunt_id: number;
  shop: string | null;
  url: string | null;
  price_cents: number | null;
  sale_cents: number | null;
  sale_ends: string | null;
  notes: string | null;
  checked_on: string;
};

/** A sale counts until the end of its last day; with no end date it counts until it's removed. */
export const saleOn = (l: Pick<PriceLink, "sale_cents" | "sale_ends">, today: string) =>
  l.sale_cents != null && (!l.sale_ends || l.sale_ends >= today);

/** What it costs today: the sale price while the sale is on, otherwise the normal price. */
export const priceNow = (l: Pick<PriceLink, "price_cents" | "sale_cents" | "sale_ends">, today: string) =>
  saleOn(l, today) ? l.sale_cents : l.price_cents;

export function shopName(l: Pick<PriceLink, "shop" | "url">): string {
  if (l.shop) return l.shop;
  if (l.url) {
    try {
      return new URL(l.url).hostname.replace(/^www\./, "");
    } catch {}
  }
  return "Shop";
}

/** Links cheapest first; ones without a price go last. */
export function byPrice<T extends Pick<PriceLink, "price_cents" | "sale_cents" | "sale_ends">>(links: T[], today: string): T[] {
  return [...links].sort((a, b) => (priceNow(a, today) ?? Infinity) - (priceNow(b, today) ?? Infinity));
}
