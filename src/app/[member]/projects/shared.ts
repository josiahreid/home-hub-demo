// Types and constants shared by the Default Name pages (no server-only imports).

export type JobStatus = "idea" | "planned" | "in_progress" | "blocked" | "done";
export const JOB_STATUSES: { value: JobStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];
export const statusLabel = (s: string) => JOB_STATUSES.find((x) => x.value === s)?.label ?? s;

export const DEFAULT_JOB_TYPES = ["Electronics", "3D printing", "Woodwork", "Car", "Garden", "Home automation", "Repair"];

export const PRIORITIES: [string, string][] = [
  ["1", "High"],
  ["2", "Normal"],
  ["3", "Low"],
];
export const priorityLabel = (p: number) => PRIORITIES.find(([v]) => Number(v) === p)?.[1] ?? "Normal";

export type PartStatus = "wishlist" | "ordered" | "received";
export const PART_STATUSES: { value: PartStatus; label: string }[] = [
  { value: "wishlist", label: "Wishlist" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
];

export type Job = {
  id: number;
  title: string;
  description: string | null;
  job_type: string | null;
  tags: string | null;
  status: JobStatus;
  priority: number;
  due: string | null;
  created_at: string;
};

export type Step = { id: number; job_id: number; text: string; done: number; sort: number };

export type Part = {
  id: number;
  job_id: number | null;
  name: string;
  url: string | null;
  price_cents: number | null;
  shipping_cents: number | null;
  arrives: string | null;
  quantity: number;
  status: PartStatus;
};

export function splitTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

/** price each × how many, plus shipping (once for the line) */
export const lineTotal = (p: Pick<Part, "price_cents" | "quantity" | "shipping_cents">) => (p.price_cents ?? 0) * (p.quantity || 1) + (p.shipping_cents ?? 0);

/** Sum of line totals, split by status. */
export function partTotals(parts: Pick<Part, "price_cents" | "quantity" | "shipping_cents" | "status">[]) {
  const t = { wishlist: 0, ordered: 0, received: 0, all: 0, unpriced: 0 };
  for (const p of parts) {
    const c = lineTotal(p);
    t[p.status] += c;
    t.all += c;
    if (p.price_cents == null) t.unpriced++;
  }
  return t;
}
