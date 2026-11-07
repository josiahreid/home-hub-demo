"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run } from "@/lib/db";
import { FREQUENCIES, int, str, toCents, today, type Frequency } from "@/lib/format";

function refresh() {
  revalidatePath("/car", "layout");
}

function vehicleFields(fd: FormData) {
  return [
    str(fd.get("make")),
    str(fd.get("model")),
    int(fd.get("year")),
    str(fd.get("plate"))?.toUpperCase() ?? null,
    str(fd.get("vin")),
    int(fd.get("odometer_km")),
    str(fd.get("wof_due")),
    str(fd.get("rego_due")),
    str(fd.get("insurance_due")),
    str(fd.get("notes")),
  ] as const;
}

// ── vehicles ──

export async function addVehicle(fd: FormData) {
  const name = str(fd.get("name"));
  if (!name) return;
  const res = run(
    `INSERT INTO vehicles (name, make, model, year, plate, vin, odometer_km, wof_due, rego_due, insurance_due, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    name,
    ...vehicleFields(fd),
  );
  refresh();
  redirect(`/car/${res.lastInsertRowid}`);
}

export async function updateVehicle(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (!id || !name) return;
  run(
    `UPDATE vehicles SET name = ?, make = ?, model = ?, year = ?, plate = ?, vin = ?, odometer_km = ?,
       wof_due = ?, rego_due = ?, insurance_due = ?, notes = ? WHERE id = ?`,
    name,
    ...vehicleFields(fd),
    id,
  );
  refresh();
}

export async function updateOdometer(fd: FormData) {
  const id = int(fd.get("id"));
  const odo = int(fd.get("odometer_km"));
  if (!id || odo == null) return;
  run("UPDATE vehicles SET odometer_km = ? WHERE id = ?", odo, id);
  refresh();
}

export async function deleteVehicle(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  db.exec("BEGIN");
  try {
    run("DELETE FROM recurring_payments WHERE linked_type = 'vehicle' AND linked_id = ?", id);
    run("DELETE FROM vehicles WHERE id = ?", id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  refresh();
  redirect("/car");
}

// ── parts & consumables ──

function partFields(fd: FormData) {
  return [
    str(fd.get("part")),
    str(fd.get("spec")),
    str(fd.get("brand")),
    str(fd.get("part_number")),
    toCents(fd.get("cost")),
    str(fd.get("supplier")),
    str(fd.get("last_replaced")),
    str(fd.get("notes")),
  ] as const;
}

export async function addPart(fd: FormData) {
  const vehicleId = int(fd.get("vehicle_id"));
  const fields = partFields(fd);
  if (!vehicleId || !fields[0]) return;
  run(
    `INSERT INTO vehicle_parts (vehicle_id, part, spec, brand, part_number, cost_cents, supplier, last_replaced, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    vehicleId,
    ...fields,
  );
  refresh();
}

export async function updatePart(fd: FormData) {
  const id = int(fd.get("id"));
  const vehicleId = int(fd.get("vehicle_id"));
  const fields = partFields(fd);
  if (!id || !fields[0]) return;
  run(
    `UPDATE vehicle_parts SET part = ?, spec = ?, brand = ?, part_number = ?, cost_cents = ?, supplier = ?,
       last_replaced = ?, notes = ? WHERE id = ?`,
    ...fields,
    id,
  );
  refresh();
  redirect(`/car/${vehicleId}#parts`);
}

export async function deletePart(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM vehicle_parts WHERE id = ?", id);
  refresh();
}

/** Sets last replaced to today and records it in the service log with the part's cost. */
export async function partReplacedToday(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const p = db
    .prepare(
      `SELECT p.vehicle_id, p.part, p.brand, p.spec, p.cost_cents, v.odometer_km
         FROM vehicle_parts p JOIN vehicles v ON v.id = p.vehicle_id WHERE p.id = ?`,
    )
    .get(id) as
    | { vehicle_id: number; part: string; brand: string | null; spec: string | null; cost_cents: number | null; odometer_km: number | null }
    | undefined;
  if (!p) return;
  const d = today();
  const detail = [p.brand, p.spec].filter(Boolean).join(" ");
  run("UPDATE vehicle_parts SET last_replaced = ? WHERE id = ?", d, id);
  run(
    "INSERT INTO vehicle_log (vehicle_id, date, odometer_km, description, cost_cents) VALUES (?, ?, ?, ?, ?)",
    p.vehicle_id,
    d,
    p.odometer_km,
    `Replaced ${p.part}${detail ? ` (${detail})` : ""}`,
    p.cost_cents,
  );
  refresh();
}

// ── service schedule ──

function serviceFields(fd: FormData) {
  return [
    str(fd.get("task")),
    int(fd.get("interval_months")),
    int(fd.get("interval_km")),
    str(fd.get("last_done_date")),
    int(fd.get("last_done_km")),
    toCents(fd.get("est_cost")),
  ] as const;
}

export async function addService(fd: FormData) {
  const vehicleId = int(fd.get("vehicle_id"));
  const fields = serviceFields(fd);
  if (!vehicleId || !fields[0]) return;
  run(
    `INSERT INTO vehicle_services (vehicle_id, task, interval_months, interval_km, last_done_date, last_done_km, est_cost_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    vehicleId,
    ...fields,
  );
  refresh();
}

export async function updateService(fd: FormData) {
  const id = int(fd.get("id"));
  const vehicleId = int(fd.get("vehicle_id"));
  const fields = serviceFields(fd);
  if (!id || !fields[0]) return;
  run(
    `UPDATE vehicle_services SET task = ?, interval_months = ?, interval_km = ?, last_done_date = ?, last_done_km = ?,
       est_cost_cents = ? WHERE id = ?`,
    ...fields,
    id,
  );
  refresh();
  redirect(`/car/${vehicleId}#services`);
}

export async function deleteService(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM vehicle_services WHERE id = ?", id);
  refresh();
}

/** Marks a service done today at the current odometer and adds it to the log. */
export async function markServiceDone(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const s = db
    .prepare(
      `SELECT s.vehicle_id, s.task, s.est_cost_cents, v.odometer_km
         FROM vehicle_services s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.id = ?`,
    )
    .get(id) as { vehicle_id: number; task: string; est_cost_cents: number | null; odometer_km: number | null } | undefined;
  if (!s) return;
  const cost = fd.has("cost") ? toCents(fd.get("cost")) : s.est_cost_cents;
  const d = today();
  run("UPDATE vehicle_services SET last_done_date = ?, last_done_km = ? WHERE id = ?", d, s.odometer_km, id);
  run(
    "INSERT INTO vehicle_log (vehicle_id, date, odometer_km, description, cost_cents) VALUES (?, ?, ?, ?, ?)",
    s.vehicle_id,
    d,
    s.odometer_km,
    s.task,
    cost,
  );
  refresh();
}

// ── service log ──

export async function addLog(fd: FormData) {
  const vehicleId = int(fd.get("vehicle_id"));
  const description = str(fd.get("description"));
  if (!vehicleId || !description) return;
  const odo = int(fd.get("odometer_km"));
  run(
    "INSERT INTO vehicle_log (vehicle_id, date, odometer_km, description, cost_cents) VALUES (?, ?, ?, ?, ?)",
    vehicleId,
    str(fd.get("date")) ?? today(),
    odo,
    description,
    toCents(fd.get("cost")),
  );
  // keep the odometer current if the log entry is newer than what we have
  if (odo != null) {
    run("UPDATE vehicles SET odometer_km = ? WHERE id = ? AND (odometer_km IS NULL OR odometer_km < ?)", odo, vehicleId, odo);
  }
  refresh();
}

export async function deleteLog(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM vehicle_log WHERE id = ?", id);
  refresh();
}

// ── payments (recurring_payments linked to the vehicle) ──

export async function addPayment(fd: FormData) {
  const vehicleId = int(fd.get("vehicle_id"));
  const name = str(fd.get("name"));
  const amount = toCents(fd.get("amount"));
  const freq = str(fd.get("frequency")) as Frequency | null;
  const nextDue = str(fd.get("next_due"));
  if (!vehicleId || !name || amount == null || !freq || !FREQUENCIES.includes(freq) || !nextDue) return;
  run(
    `INSERT INTO recurring_payments (name, amount_cents, frequency, next_due, category, linked_type, linked_id, notes)
     VALUES (?, ?, ?, ?, ?, 'vehicle', ?, ?)`,
    name,
    Math.abs(amount),
    freq,
    nextDue,
    str(fd.get("category")) ?? "Car",
    vehicleId,
    str(fd.get("notes")),
  );
  refresh();
  revalidatePath("/budget", "layout");
}

export async function deletePayment(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("DELETE FROM recurring_payments WHERE id = ? AND linked_type = 'vehicle'", id);
  refresh();
  revalidatePath("/budget", "layout");
}
