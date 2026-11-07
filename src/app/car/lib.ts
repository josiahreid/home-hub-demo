import { addMonths } from "date-fns";
import { daysUntil, iso, parseISO } from "@/lib/format";

export type Vehicle = {
  id: number;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  vin: string | null;
  odometer_km: number | null;
  wof_due: string | null;
  rego_due: string | null;
  insurance_due: string | null;
  notes: string | null;
};

export type Service = {
  id: number;
  vehicle_id: number;
  task: string;
  interval_months: number | null;
  interval_km: number | null;
  last_done_date: string | null;
  last_done_km: number | null;
  est_cost_cents: number | null;
};

export type ServiceStatus = "ok" | "soon" | "overdue" | "unknown";

/** Days / km before a due item counts as "due soon". */
export const SOON_DAYS = 30;
export const SOON_KM = 1000;

export function serviceDue(s: Service, odometer: number | null) {
  const nextDate =
    s.interval_months && s.last_done_date ? iso(addMonths(parseISO(s.last_done_date), s.interval_months)) : null;
  const nextKm = s.interval_km && s.last_done_km != null ? s.last_done_km + s.interval_km : null;
  const daysLeft = nextDate ? daysUntil(nextDate) : null;
  const kmLeft = nextKm != null && odometer != null ? nextKm - odometer : null;

  let status: ServiceStatus = "unknown";
  if (daysLeft != null || kmLeft != null) {
    if ((daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft <= 0)) status = "overdue";
    else if ((daysLeft != null && daysLeft <= SOON_DAYS) || (kmLeft != null && kmLeft <= SOON_KM)) status = "soon";
    else status = "ok";
  }
  return { nextDate, nextKm, daysLeft, kmLeft, status };
}

/** Tone for a WOF / rego / insurance style due date. */
export function dueTone(date: string | null): "neutral" | "warn" | "bad" {
  if (!date) return "neutral";
  const d = daysUntil(date);
  if (d < 0) return "bad";
  if (d < SOON_DAYS) return "warn";
  return "neutral";
}

export function km(n: number | null | undefined) {
  return n == null ? "—" : `${n.toLocaleString("en-NZ")} km`;
}

export function vehicleSubtitle(v: Pick<Vehicle, "make" | "model" | "year">) {
  return [v.year, v.make, v.model].filter(Boolean).join(" ");
}

export const PART_SUGGESTIONS = [
  "Wiper blade (driver)",
  "Wiper blade (passenger)",
  "Rear wiper",
  "Tyres (front)",
  "Tyres (rear)",
  "Engine oil",
  "Oil filter",
  "Air filter",
  "Cabin filter",
  "Battery",
  "Spark plugs",
  "Brake pads",
  "Bulbs",
];

export const SERVICE_SUGGESTIONS = [
  "Oil & filter change",
  "Full service",
  "Tyre rotation",
  "Brake fluid flush",
  "Coolant flush",
  "Cambelt / timing belt",
  "Transmission fluid",
  "Wheel alignment",
  "Air-con regas",
  "RUC top-up",
];
