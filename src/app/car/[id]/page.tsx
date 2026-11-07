import Link from "next/link";
import { notFound } from "next/navigation";
import { subMonths } from "date-fns";
import { all, get } from "@/lib/db";
import {
  centsToInput, FREQUENCIES, iso, money, niceDate, perMonth, relDays, shortDate, today, type Frequency,
} from "@/lib/format";
import {
  AddPanel, Badge, btn, Card, cx, Empty, Field, FormGrid, Input, PageHeader, Select, Stat, Table, td, Textarea,
} from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import {
  addLog, addPart, addPayment, addService, deleteLog, deletePart, deletePayment, deleteService, deleteVehicle,
  markServiceDone, partReplacedToday, updateOdometer, updatePart, updateService, updateVehicle,
} from "../actions";
import {
  dueTone, km, PART_SUGGESTIONS, SERVICE_SUGGESTIONS, serviceDue, vehicleSubtitle, type Service, type ServiceStatus,
  type Vehicle,
} from "../lib";

type Part = {
  id: number;
  part: string;
  spec: string | null;
  brand: string | null;
  part_number: string | null;
  cost_cents: number | null;
  supplier: string | null;
  last_replaced: string | null;
  notes: string | null;
};
type LogRow = { id: number; date: string; odometer_km: number | null; description: string; cost_cents: number | null };
type Payment = {
  id: number;
  name: string;
  amount_cents: number;
  frequency: Frequency;
  next_due: string;
  category: string | null;
  active: number;
  notes: string | null;
};

const STATUS: Record<ServiceStatus, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  ok: { label: "OK", tone: "good" },
  soon: { label: "Due soon", tone: "warn" },
  overdue: { label: "Overdue", tone: "bad" },
  unknown: { label: "Not recorded", tone: "neutral" },
};

export default async function VehiclePage({ params, searchParams }: PageProps<"/car/[id]">) {
  const { id: idParam } = await params;
  const sp = await searchParams;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const v = await get<Vehicle>("SELECT * FROM vehicles WHERE id = ?", id);
  if (!v) notFound();

  const [parts, services, log, payments, policies] = await Promise.all([
    all<Part>("SELECT * FROM vehicle_parts WHERE vehicle_id = ? ORDER BY part COLLATE NOCASE", id),
    all<Service>("SELECT * FROM vehicle_services WHERE vehicle_id = ? ORDER BY task COLLATE NOCASE", id),
    all<LogRow>("SELECT * FROM vehicle_log WHERE vehicle_id = ? ORDER BY date DESC, id DESC", id),
    all<Payment>(
      "SELECT * FROM recurring_payments WHERE linked_type = 'vehicle' AND linked_id = ? ORDER BY next_due",
      id,
    ),
    all<{ id: number; insurer: string; policy_number: string | null; renewal_date: string | null; amount_cents: number | null; frequency: Frequency | null; excess_cents: number | null }>(
      `SELECT p.id, p.insurer, p.policy_number, p.renewal_date, p.excess_cents, r.amount_cents, r.frequency
         FROM insurance_policies p LEFT JOIN recurring_payments r ON r.id = p.recurring_id WHERE p.vehicle_id = ?`,
      id,
    ),
  ]);

  // a linked policy on the Insurance tab decides the renewal date (the earliest, if there's more than one)
  const policyRenewal = policies.map((p) => p.renewal_date).filter((d): d is string => !!d).sort()[0] ?? null;
  const insuranceDue = policyRenewal ?? v.insurance_due;
  const editPart = Number(sp.editPart) || null;
  const editService = Number(sp.editService) || null;
  const self = `/car/${id}`;

  const monthly = payments.filter((p) => p.active).reduce((s, p) => s + perMonth(p.amount_cents, p.frequency), 0);
  const logTotal = log.reduce((s, l) => s + (l.cost_cents ?? 0), 0);
  const yearAgoIso = iso(subMonths(new Date(), 12));
  const logYear = log.filter((l) => l.date >= yearAgoIso).reduce((s, l) => s + (l.cost_cents ?? 0), 0);

  const servicesDue = services
    .map((s) => ({ ...s, due: serviceDue(s, v.odometer_km) }))
    .sort((a, b) => order(a.due.status) - order(b.due.status));

  return (
    <>
      <Link href="/car" className="mb-2 inline-block text-sm text-muted hover:text-ink">← All vehicles</Link>
      <PageHeader
        title={v.name}
        subtitle={[vehicleSubtitle(v), v.plate].filter(Boolean).join(" · ") || undefined}
        actions={
          <form action={updateOdometer} className="flex items-end gap-2">
            <input type="hidden" name="id" value={v.id} />
            <Field label="Odometer (km)">
              <Input name="odometer_km" type="number" min={0} defaultValue={v.odometer_km ?? ""} className="w-32" required />
            </Field>
            <SubmitButton variant="secondary">Update</SubmitButton>
          </form>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["WOF due", v.wof_due],
            ["Rego due", v.rego_due],
            ["Insurance renewal", insuranceDue],
          ] as const
        ).map(([label, date]) => {
          const tone = dueTone(date);
          return (
            <Stat
              key={label}
              label={label}
              value={date ? shortDate(date) : "—"}
              tone={tone === "neutral" ? undefined : tone}
              hint={date ? relDays(date) : "Not set"}
            />
          );
        })}
        <Stat label="Payments / month" value={money(monthly)} hint={`${money(monthly * 12)} a year`} />
      </div>

      <div className="space-y-6">
        {/* ── service schedule ── */}
        <Card title="Service schedule">
          <div id="services" className="scroll-mt-24" />
          {servicesDue.length === 0 ? (
            <Empty>No service items yet. Add oil changes, cambelt, tyre rotations etc. with their interval.</Empty>
          ) : (
            <Table head={["Task", "Every", "Last done", "Next due", "Status", "Est. cost", ""]}>
              {servicesDue.map((s) =>
                s.id === editService ? (
                  <tr key={s.id} className="bg-surface-2">
                    <td className={td}>
                      <Input form={`svc-${s.id}`} name="task" defaultValue={s.task} required list="service-suggestions" />
                    </td>
                    <td className={td}>
                      <div className="flex flex-col gap-1">
                        <Input form={`svc-${s.id}`} name="interval_months" type="number" min={1} defaultValue={s.interval_months ?? ""} placeholder="months" />
                        <Input form={`svc-${s.id}`} name="interval_km" type="number" min={1} defaultValue={s.interval_km ?? ""} placeholder="km" />
                      </div>
                    </td>
                    <td className={td}>
                      <div className="flex flex-col gap-1">
                        <Input form={`svc-${s.id}`} name="last_done_date" type="date" defaultValue={s.last_done_date ?? ""} />
                        <Input form={`svc-${s.id}`} name="last_done_km" type="number" min={0} defaultValue={s.last_done_km ?? ""} placeholder="km" />
                      </div>
                    </td>
                    <td className={td} colSpan={2} />
                    <td className={td}>
                      <Input form={`svc-${s.id}`} name="est_cost" inputMode="decimal" defaultValue={centsToInput(s.est_cost_cents)} className="w-24" />
                    </td>
                    <td className={td}>
                      <form id={`svc-${s.id}`} action={updateService} className="flex flex-col gap-1">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="vehicle_id" value={v.id} />
                        <SubmitButton className={btn.small}>Save</SubmitButton>
                        <Link href={`${self}#services`} className={cx(btn.ghost, btn.small)}>Cancel</Link>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td className={cx(td, "font-medium")}>{s.task}</td>
                    <td className={cx(td, "text-muted")}>
                      {[s.interval_months && `${s.interval_months} mo`, s.interval_km && km(s.interval_km)].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className={td}>
                      <div>{s.last_done_date ? niceDate(s.last_done_date) : "—"}</div>
                      {s.last_done_km != null && <div className="text-xs text-muted">{km(s.last_done_km)}</div>}
                    </td>
                    <td className={td}>
                      {s.due.nextDate && (
                        <div>
                          {shortDate(s.due.nextDate)} <span className="text-xs text-muted">({relDays(s.due.nextDate)})</span>
                        </div>
                      )}
                      {s.due.nextKm != null && (
                        <div className="text-xs text-muted">
                          at {km(s.due.nextKm)}
                          {s.due.kmLeft != null &&
                            (s.due.kmLeft >= 0 ? ` · ${km(s.due.kmLeft)} to go` : ` · ${km(-s.due.kmLeft)} over`)}
                        </div>
                      )}
                      {!s.due.nextDate && s.due.nextKm == null && <span className="text-muted">—</span>}
                    </td>
                    <td className={td}>
                      <Badge tone={STATUS[s.due.status].tone}>{STATUS[s.due.status].label}</Badge>
                    </td>
                    <td className={cx(td, "tabular-nums")}>{money(s.est_cost_cents)}</td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <form action={markServiceDone} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={s.id} />
                          <Input
                            name="cost"
                            inputMode="decimal"
                            defaultValue={centsToInput(s.est_cost_cents)}
                            placeholder="cost"
                            aria-label="Actual cost"
                            className="!w-20 !px-2 !py-1 text-xs"
                          />
                          <SubmitButton variant="secondary" className={btn.small}>Mark done</SubmitButton>
                        </form>
                        <Link href={`${self}?editService=${s.id}#services`} className={cx(btn.ghost, btn.small)}>Edit</Link>
                        <DeleteButton action={deleteService} id={s.id} confirmText={`Delete "${s.task}" from the schedule?`} />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </Table>
          )}
          <p className="mt-2 text-xs text-muted">
            &ldquo;Mark done&rdquo; sets last done to today at {km(v.odometer_km)} and adds it to the service log. Update the odometer first.
            Date-based items also appear on the calendar.
          </p>
          <div className="mt-4">
            <AddPanel label="Add service item">
              <form action={addService} className="space-y-3">
                <input type="hidden" name="vehicle_id" value={v.id} />
                <FormGrid>
                  <Field label="Task *">
                    <Input name="task" required list="service-suggestions" placeholder="Oil & filter change" />
                  </Field>
                  <Field label="Every (months)">
                    <Input name="interval_months" type="number" min={1} placeholder="12" />
                  </Field>
                  <Field label="Every (km)">
                    <Input name="interval_km" type="number" min={1} placeholder="10000" />
                  </Field>
                  <Field label="Last done">
                    <Input name="last_done_date" type="date" />
                  </Field>
                  <Field label="Last done at (km)">
                    <Input name="last_done_km" type="number" min={0} />
                  </Field>
                  <Field label="Est. cost ($)">
                    <Input name="est_cost" inputMode="decimal" />
                  </Field>
                </FormGrid>
                <SubmitButton>Add to schedule</SubmitButton>
              </form>
            </AddPanel>
          </div>
        </Card>

        {/* ── parts & consumables ── */}
        <Card title="Parts & consumables">
          <div id="parts" className="scroll-mt-24" />
          {parts.length === 0 ? (
            <Empty>Record wiper sizes, tyre specs, oil grade, battery type and what they cost so reordering is easy.</Empty>
          ) : (
            <Table head={["Part", "Spec", "Brand", "Part no.", "Cost", "Supplier", "Last replaced", ""]}>
              {parts.map((p) =>
                p.id === editPart ? (
                  <tr key={p.id} className="bg-surface-2">
                    <td className={td}><Input form={`part-${p.id}`} name="part" defaultValue={p.part} required list="part-suggestions" /></td>
                    <td className={td}><Input form={`part-${p.id}`} name="spec" defaultValue={p.spec ?? ""} /></td>
                    <td className={td}><Input form={`part-${p.id}`} name="brand" defaultValue={p.brand ?? ""} /></td>
                    <td className={td}><Input form={`part-${p.id}`} name="part_number" defaultValue={p.part_number ?? ""} /></td>
                    <td className={td}><Input form={`part-${p.id}`} name="cost" inputMode="decimal" defaultValue={centsToInput(p.cost_cents)} className="w-24" /></td>
                    <td className={td}><Input form={`part-${p.id}`} name="supplier" defaultValue={p.supplier ?? ""} /></td>
                    <td className={td}><Input form={`part-${p.id}`} name="last_replaced" type="date" defaultValue={p.last_replaced ?? ""} /></td>
                    <td className={td}>
                      <form id={`part-${p.id}`} action={updatePart} className="flex flex-col gap-1">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="vehicle_id" value={v.id} />
                        <input type="hidden" name="notes" value={p.notes ?? ""} />
                        <SubmitButton className={btn.small}>Save</SubmitButton>
                        <Link href={`${self}#parts`} className={cx(btn.ghost, btn.small)}>Cancel</Link>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td className={cx(td, "font-medium")}>{p.part}</td>
                    <td className={td}>{p.spec ?? "—"}</td>
                    <td className={td}>{p.brand ?? "—"}</td>
                    <td className={cx(td, "font-mono text-xs")}>{p.part_number ?? "—"}</td>
                    <td className={cx(td, "tabular-nums")}>{money(p.cost_cents)}</td>
                    <td className={td}>{p.supplier ?? "—"}</td>
                    <td className={td}>
                      {p.last_replaced ? (
                        <>
                          <div>{shortDate(p.last_replaced)}</div>
                          <div className="text-xs text-muted">{relDays(p.last_replaced)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {p.last_replaced !== today() && (
                          <form action={partReplacedToday}>
                            <input type="hidden" name="id" value={p.id} />
                            <SubmitButton variant="secondary" className={btn.small}>Replaced today</SubmitButton>
                          </form>
                        )}
                        <Link href={`${self}?editPart=${p.id}#parts`} className={cx(btn.ghost, btn.small)}>Edit</Link>
                        <DeleteButton action={deletePart} id={p.id} confirmText={`Delete ${p.part}?`} />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </Table>
          )}
          {parts.length > 0 && (
            <p className="mt-2 text-xs text-muted">&ldquo;Replaced today&rdquo; also adds an entry with the part cost to the service log.</p>
          )}
          <div className="mt-4">
            <AddPanel label="Add part">
              <form action={addPart} className="space-y-3">
                <input type="hidden" name="vehicle_id" value={v.id} />
                <FormGrid>
                  <Field label="Part *">
                    <Input name="part" required list="part-suggestions" placeholder="Start typing or pick…" />
                  </Field>
                  <Field label="Spec / size">
                    <Input name="spec" placeholder={'22" hook, 205/55R16 91V, 5W-30…'} />
                  </Field>
                  <Field label="Brand">
                    <Input name="brand" />
                  </Field>
                  <Field label="Part number">
                    <Input name="part_number" />
                  </Field>
                  <Field label="Cost ($)">
                    <Input name="cost" inputMode="decimal" />
                  </Field>
                  <Field label="Supplier">
                    <Input name="supplier" placeholder="Repco, Supercheap, Tyre shop…" />
                  </Field>
                  <Field label="Last replaced">
                    <Input name="last_replaced" type="date" />
                  </Field>
                </FormGrid>
                <Field label="Notes">
                  <Textarea name="notes" rows={2} />
                </Field>
                <SubmitButton>Add part</SubmitButton>
              </form>
            </AddPanel>
          </div>
        </Card>

        {/* ── insurance (from the Insurance tab) ── */}
        <Card title="Insurance" actions={<Link href="/insurance" className="text-xs text-accent">Insurance tab</Link>}>
          {policies.length === 0 ? (
            <Empty>No policy linked. Add it on the Insurance tab and pick this car – its cost, renewal and documents then show here.</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {policies.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/insurance/${p.id}`} className="font-medium hover:text-accent">
                    {p.insurer}{p.policy_number && <span className="font-normal text-muted"> · {p.policy_number}</span>}
                  </Link>
                  <span className="flex items-center gap-3">
                    {p.amount_cents != null && <span className="tabular-nums">{money(p.amount_cents)} <span className="text-xs text-muted">{p.frequency}</span></span>}
                    {p.excess_cents != null && <span className="text-xs text-muted">excess {money(p.excess_cents)}</span>}
                    {p.renewal_date && <Badge tone={dueTone(p.renewal_date)}>renews {shortDate(p.renewal_date)}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── payments ── */}
        <Card
          title="Payments"
          actions={monthly > 0 && <span className="text-sm text-muted">{money(monthly)}/mo · {money(monthly * 12)}/yr</span>}
        >
          {payments.length === 0 ? (
            <Empty>Add loan / finance repayments, insurance premiums, rego, RUC and roadside cover.</Empty>
          ) : (
            <Table head={["Payment", "Amount", "Frequency", "Per month", "Next due", "Category", ""]}>
              {payments.map((p) => (
                <tr key={p.id} className={p.active ? undefined : "opacity-60"}>
                  <td className={cx(td, "font-medium")}>
                    {p.name}
                    {!p.active && <span className="ml-2"><Badge>Paused</Badge></span>}
                    {p.notes && <div className="text-xs font-normal text-muted">{p.notes}</div>}
                  </td>
                  <td className={cx(td, "tabular-nums")}>{money(p.amount_cents)}</td>
                  <td className={cx(td, "capitalize")}>{p.frequency}</td>
                  <td className={cx(td, "tabular-nums")}>{money(perMonth(p.amount_cents, p.frequency))}</td>
                  <td className={td}>
                    <div>{shortDate(p.next_due)}</div>
                    <div className="text-xs text-muted">{relDays(p.next_due)}</div>
                  </td>
                  <td className={td}>{p.category ?? "—"}</td>
                  <td className={cx(td, "text-right")}>
                    <DeleteButton action={deletePayment} id={p.id} confirmText={`Delete payment "${p.name}"?`} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-2 text-xs text-muted">These also appear in the budget&rsquo;s recurring payments and on the calendar.</p>
          <div className="mt-4">
            <AddPanel label="Add payment">
              <form action={addPayment} className="space-y-3">
                <input type="hidden" name="vehicle_id" value={v.id} />
                <FormGrid>
                  <Field label="Name *">
                    <Input name="name" required placeholder={`${v.name} loan`} list="payment-suggestions" />
                  </Field>
                  <Field label="Amount ($) *">
                    <Input name="amount" required inputMode="decimal" />
                  </Field>
                  <Field label="Frequency *">
                    <Select name="frequency" defaultValue="monthly" options={FREQUENCIES} />
                  </Field>
                  <Field label="Next due *">
                    <Input name="next_due" type="date" required defaultValue={today()} />
                  </Field>
                  <Field label="Category">
                    <Input name="category" defaultValue="Car" />
                  </Field>
                  <Field label="Notes">
                    <Input name="notes" />
                  </Field>
                </FormGrid>
                <SubmitButton>Add payment</SubmitButton>
              </form>
            </AddPanel>
          </div>
        </Card>

        {/* ── service log ── */}
        <Card
          title="Service history"
          actions={<span className="text-sm text-muted">Total {money(logTotal)} · last 12 mo {money(logYear)}</span>}
        >
          {log.length === 0 ? (
            <Empty>No history yet. Services marked done and parts replaced are logged here automatically.</Empty>
          ) : (
            <Table head={["Date", "Odometer", "Description", "Cost", ""]}>
              {log.map((l) => (
                <tr key={l.id}>
                  <td className={cx(td, "whitespace-nowrap")}>{niceDate(l.date)}</td>
                  <td className={cx(td, "whitespace-nowrap tabular-nums")}>{km(l.odometer_km)}</td>
                  <td className={td}>{l.description}</td>
                  <td className={cx(td, "tabular-nums")}>{money(l.cost_cents)}</td>
                  <td className={cx(td, "text-right")}>
                    <DeleteButton action={deleteLog} id={l.id} confirmText="Delete this log entry?" />
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="mt-4">
            <AddPanel label="Add log entry">
              <form action={addLog} className="space-y-3">
                <input type="hidden" name="vehicle_id" value={v.id} />
                <FormGrid>
                  <Field label="Date">
                    <Input name="date" type="date" defaultValue={today()} />
                  </Field>
                  <Field label="Odometer (km)">
                    <Input name="odometer_km" type="number" min={0} defaultValue={v.odometer_km ?? ""} />
                  </Field>
                  <Field label="Cost ($)">
                    <Input name="cost" inputMode="decimal" />
                  </Field>
                </FormGrid>
                <Field label="Description *">
                  <Input name="description" required placeholder="WOF inspection, puncture repair, new tyres…" />
                </Field>
                <SubmitButton>Add entry</SubmitButton>
              </form>
            </AddPanel>
          </div>
        </Card>

        {/* ── details ── */}
        <AddPanel label="Edit vehicle details">
          <form action={updateVehicle} className="space-y-3">
            <input type="hidden" name="id" value={v.id} />
            <FormGrid>
              <Field label="Name *">
                <Input name="name" required defaultValue={v.name} />
              </Field>
              <Field label="Make">
                <Input name="make" defaultValue={v.make ?? ""} />
              </Field>
              <Field label="Model">
                <Input name="model" defaultValue={v.model ?? ""} />
              </Field>
              <Field label="Year">
                <Input name="year" type="number" min={1900} max={2100} defaultValue={v.year ?? ""} />
              </Field>
              <Field label="Plate">
                <Input name="plate" className="uppercase" defaultValue={v.plate ?? ""} />
              </Field>
              <Field label="VIN">
                <Input name="vin" defaultValue={v.vin ?? ""} />
              </Field>
              <Field label="Odometer (km)">
                <Input name="odometer_km" type="number" min={0} defaultValue={v.odometer_km ?? ""} />
              </Field>
              <Field label="WOF due">
                <Input name="wof_due" type="date" defaultValue={v.wof_due ?? ""} />
              </Field>
              <Field label="Rego due">
                <Input name="rego_due" type="date" defaultValue={v.rego_due ?? ""} />
              </Field>
              <Field label="Insurance renewal">
                {policyRenewal ? (
                  <>
                    <input type="hidden" name="insurance_due" value={policyRenewal} />
                    <p className="py-2 text-sm">
                      {shortDate(policyRenewal)} <span className="text-xs text-muted">· from the <Link href={`/insurance/${policies.find((p) => p.renewal_date === policyRenewal)!.id}`} className="text-accent underline">Insurance tab</Link> – change it there</span>
                    </p>
                  </>
                ) : (
                  <Input name="insurance_due" type="date" defaultValue={v.insurance_due ?? ""} />
                )}
              </Field>
            </FormGrid>
            <Field label="Notes">
              <Textarea name="notes" rows={3} defaultValue={v.notes ?? ""} />
            </Field>
            <SubmitButton>Save details</SubmitButton>
          </form>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <span className="text-xs text-muted">Deleting removes parts, schedule, history and linked payments.</span>
            <DeleteButton
              action={deleteVehicle}
              id={v.id}
              label="Delete vehicle"
              confirmText={`Delete ${v.name} and all its records and payments?`}
            />
          </div>
        </AddPanel>

        {v.notes && (
          <Card title="Notes">
            <p className="whitespace-pre-wrap text-sm">{v.notes}</p>
          </Card>
        )}
      </div>

      <datalist id="part-suggestions">
        {PART_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>
      <datalist id="service-suggestions">
        {SERVICE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>
      <datalist id="payment-suggestions">
        {["Car loan", "Car insurance", "Registration", "Road user charges (RUC)", "Roadside assistance", "Parking"].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function order(s: ServiceStatus) {
  return { overdue: 0, soon: 1, ok: 2, unknown: 3 }[s];
}
