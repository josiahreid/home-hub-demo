import { io } from "next/cache";
import { addDays, iso, money, niceDate, relDays, today } from "@/lib/format";
import { all } from "@/lib/db";
import { upcoming } from "@/lib/upcoming";
import { Badge, Card, Empty, Field, FormGrid, Input, PageHeader, Select } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addBin, deleteBin, setBinCost } from "../actions";

const BINS = ["Rubbish", "Recycling", "Glass", "Food scraps", "Garden"];

type Schedule = { id: number; bin: string; anchor_date: string; interval_weeks: number; cost_cents: number | null; cost_per: string | null };
const PER_OPTIONS: [string, string][] = [["collection", "a collection"], ["month", "a month"], ["quarter", "a quarter"], ["year", "a year"]];

/** What a bin costs over a year: per collection × collections a year (52 ÷ how many weeks apart), or per month/quarter/year. */
function yearly(s: Schedule) {
  if (s.cost_cents == null) return null;
  const times = { collection: 52 / Math.max(1, s.interval_weeks), month: 12, quarter: 4, year: 1 }[s.cost_per ?? "collection"] ?? 52 / Math.max(1, s.interval_weeks);
  return Math.round(s.cost_cents * times);
}

/** The cost boxes: an amount and what it's per (blank amount = not recorded). */
function CostFields({ s }: { s?: Schedule }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input name="cost" inputMode="decimal" placeholder="$ e.g. 4.50" defaultValue={s?.cost_cents != null ? (s.cost_cents / 100).toFixed(2) : ""} className="!w-28" aria-label="Cost" />
      <Select name="cost_per" options={PER_OPTIONS} defaultValue={s?.cost_per ?? "collection"} className="!w-auto" aria-label="Per" />
    </div>
  );
}

export default async function Bins() {
  await io();
  const [schedules, next] = await Promise.all([
    all<Schedule>("SELECT * FROM bin_schedules ORDER BY bin"),
    upcoming(today(), iso(addDays(new Date(), 28))).then((items) => items.filter((i) => i.kind === "bin")),
  ]);
  const byDate = Map.groupBy(next, (i) => i.date);
  const costed = schedules.filter((s) => s.cost_cents != null);
  const perYear = costed.reduce((t, s) => t + (yearly(s) ?? 0), 0);

  return (
    <>
      <PageHeader title="Bin days" subtitle="Enter one known collection date per bin; the rest are worked out and shown on the calendar." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Next 4 weeks">
          {byDate.size === 0 ? <Empty>Add a bin schedule to see collection days.</Empty> : (
            <ul className="divide-y divide-line">
              {[...byDate].map(([date, items]) => (
                <li key={date} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium">{niceDate(date)}</span>
                    <span className="ml-2 text-xs text-muted">{relDays(date)}</span>
                  </span>
                  <span className="flex gap-1">{items.map((i) => <Badge key={i.title} tone="good">{i.title.replace(" bin out", "")}</Badge>)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Collections move around public holidays; check your council&apos;s site near Christmas and Easter.</p>
        </Card>
        <div className="space-y-4">
          <Card title="Add a bin">
            <form action={addBin}>
              <FormGrid>
                <Field label="Bin"><Input name="bin" list="bins" required /></Field>
                <Field label="A collection date"><Input type="date" name="anchor_date" required defaultValue={today()} /></Field>
                <Field label="Every"><Select name="interval_weeks" options={[["1", "Week"], ["2", "Fortnight"], ["4", "4 weeks"]]} /></Field>
                <Field label="Cost (optional)"><CostFields /></Field>
              </FormGrid>
              <datalist id="bins">{BINS.map((b) => <option key={b} value={b} />)}</datalist>
              <div className="mt-3"><SubmitButton>Add</SubmitButton></div>
            </form>
          </Card>
          <Card
            title="Schedules & costs"
            actions={costed.length > 0 && <span className="text-xs text-muted tabular-nums">{money(perYear)} a year · {money(Math.round(perYear / 12))} a month</span>}
          >
            {schedules.length === 0 ? <Empty>None yet.</Empty> : (
              <ul className="divide-y divide-line text-sm">
                {schedules.map((s) => {
                  const year = yearly(s);
                  return (
                    <li key={s.id} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="font-medium">{s.bin}</span> — every {s.interval_weeks === 1 ? "week" : s.interval_weeks === 2 ? "fortnight" : `${s.interval_weeks} weeks`} (from {niceDate(s.anchor_date)})
                          <span className="block text-xs text-muted">
                            {s.cost_cents == null ? "No cost recorded" : <>{money(s.cost_cents)} {PER_OPTIONS.find(([v]) => v === (s.cost_per ?? "collection"))?.[1]} · about {money(year!)} a year</>}
                          </span>
                        </span>
                        <DeleteButton action={deleteBin} id={s.id} label="×" confirmText={`Remove the ${s.bin} bin?`} />
                      </div>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-accent">{s.cost_cents == null ? "Add its cost" : "Change its cost"}</summary>
                        <form action={setBinCost} className="mt-2 flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={s.id} />
                          <CostFields s={s} />
                          <SubmitButton variant="secondary">Save</SubmitButton>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
            {costed.length > 0 && costed.length < schedules.length && (
              <p className="mt-2 text-xs text-muted">The total only counts bins with a cost.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
