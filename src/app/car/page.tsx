import Link from "next/link";
import { all } from "@/lib/db";
import { money, perMonth, relDays, shortDate, type Frequency } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, PageHeader, Stat, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { addVehicle } from "./actions";
import { dueTone, km, serviceDue, vehicleSubtitle, type Service, type Vehicle } from "./lib";

export default async function CarPage() {
  const vehicles = await all<Vehicle>("SELECT * FROM vehicles ORDER BY name");
  const payments = await all<{ linked_id: number; amount_cents: number; frequency: Frequency }>(
    "SELECT linked_id, amount_cents, frequency FROM recurring_payments WHERE linked_type = 'vehicle' AND active = 1",
  );
  const services = await all<Service>("SELECT * FROM vehicle_services");
  const renewals = await all<{ vehicle_id: number; renewal_date: string }>(
    "SELECT vehicle_id, min(renewal_date) AS renewal_date FROM insurance_policies WHERE vehicle_id IS NOT NULL AND renewal_date IS NOT NULL GROUP BY vehicle_id",
  );
  const spentYear = await all<{ vehicle_id: number; total: number }>(
    "SELECT vehicle_id, SUM(cost_cents) AS total FROM vehicle_log WHERE date >= date('now', '-12 months') GROUP BY vehicle_id",
  );

  const monthlyFor = (id: number) =>
    payments.filter((p) => p.linked_id === id).reduce((sum, p) => sum + perMonth(p.amount_cents, p.frequency), 0);
  const totalMonthly = vehicles.reduce((sum, v) => sum + monthlyFor(v.id), 0);
  const totalSpent = spentYear.reduce((sum, r) => sum + (r.total ?? 0), 0);

  return (
    <>
      <PageHeader title="Car" subtitle="Payments, servicing, parts and due dates for each vehicle" />

      {vehicles.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Vehicles" value={vehicles.length} />
          <Stat label="Payments / month" value={money(totalMonthly)} hint={`${money(totalMonthly * 12)} a year`} />
          <Stat label="Spent last 12 months" value={money(totalSpent)} hint="Servicing, parts & repairs" />
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {vehicles.length === 0 && (
          <div className="md:col-span-2">
            <Empty>No vehicles yet. Add one below to start tracking WOF, rego, servicing and running costs.</Empty>
          </div>
        )}
        {vehicles.map((v) => {
          const vServices = services.filter((s) => s.vehicle_id === v.id).map((s) => serviceDue(s, v.odometer_km));
          const overdue = vServices.filter((s) => s.status === "overdue").length;
          const soon = vServices.filter((s) => s.status === "soon").length;
          const monthly = monthlyFor(v.id);
          return (
            <Link key={v.id} href={`/car/${v.id}`} className="block rounded-xl transition-shadow hover:shadow-md">
              <Card className="h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{v.name}</div>
                    <div className="text-sm text-muted">{vehicleSubtitle(v) || "—"}</div>
                  </div>
                  {v.plate && (
                    <span className="shrink-0 rounded border border-line bg-surface-2 px-2 py-0.5 font-mono text-sm font-semibold tracking-wider">
                      {v.plate}
                    </span>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  {(
                    [
                      ["WOF", v.wof_due],
                      ["Rego", v.rego_due],
                      ["Insurance", renewals.find((r) => r.vehicle_id === v.id)?.renewal_date ?? v.insurance_due],
                    ] as const
                  ).map(([label, date]) => (
                    <div key={label} className="rounded-lg bg-surface-2 p-2">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="font-medium">{date ? shortDate(date) : "—"}</dd>
                      {date && (
                        <dd className="mt-1">
                          <Badge tone={dueTone(date)}>{relDays(date)}</Badge>
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span>
                    <span className="text-muted">Odometer </span>
                    <span className="font-medium tabular-nums">{km(v.odometer_km)}</span>
                  </span>
                  <span>
                    <span className="text-muted">Payments </span>
                    <span className="font-medium tabular-nums">{monthly ? `${money(monthly)}/mo` : "—"}</span>
                  </span>
                  {overdue > 0 && <Badge tone="bad">{overdue} service{overdue > 1 ? "s" : ""} overdue</Badge>}
                  {soon > 0 && <Badge tone="warn">{soon} due soon</Badge>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <AddPanel label="Add vehicle" open={vehicles.length === 0}>
        <form action={addVehicle} className="space-y-3">
          <FormGrid>
            <Field label="Name *">
              <Input name="name" required placeholder="e.g. Family wagon" />
            </Field>
            <Field label="Make">
              <Input name="make" placeholder="Toyota" />
            </Field>
            <Field label="Model">
              <Input name="model" placeholder="Corolla" />
            </Field>
            <Field label="Year">
              <Input name="year" type="number" min={1900} max={2100} />
            </Field>
            <Field label="Plate">
              <Input name="plate" className="uppercase" />
            </Field>
            <Field label="VIN">
              <Input name="vin" />
            </Field>
            <Field label="Odometer (km)">
              <Input name="odometer_km" type="number" min={0} />
            </Field>
            <Field label="WOF due">
              <Input name="wof_due" type="date" />
            </Field>
            <Field label="Rego due">
              <Input name="rego_due" type="date" />
            </Field>
            <Field label="Insurance renewal">
              <Input name="insurance_due" type="date" />
            </Field>
          </FormGrid>
          <Field label="Notes">
            <Textarea name="notes" rows={2} />
          </Field>
          <SubmitButton>Add vehicle</SubmitButton>
        </form>
      </AddPanel>
    </>
  );
}
