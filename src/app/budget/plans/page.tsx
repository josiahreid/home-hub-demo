import { io } from "next/cache";
import Link from "next/link";
import { all } from "@/lib/db";
import { centsToInput, money, niceDate, relDays, shortDate, today } from "@/lib/format";
import { findClashes, savingsNeeds, weeklyCapacity } from "@/lib/plans";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, PageHeader, Progress, Select, Stat, Textarea, btn, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addPlan, contributeToPlan, deletePlan, saveCapacity, setPlanStatus } from "../actions";

export default async function Plans() {
  await io();
  const capacity = weeklyCapacity();
  const { plans, needs } = await savingsNeeds();
  const { weeks, clashes } = findClashes(needs, capacity);
  const events = await all<{ id: number; title: string; start_date: string }>(
    "SELECT id, title, start_date FROM events WHERE start_date >= ? AND feed_id IS NULL ORDER BY start_date LIMIT 100", today());
  const required = needs.reduce((s, n) => s + n.perWeek, 0);
  const peak = Math.max(1, capacity ?? 0, ...weeks.map((w) => w.required));

  return (
    <>
      <PageHeader title="Plans & goals" subtitle="Save towards events and big purchases, and spot when plans overlap and ask for more than you can put aside." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Needed this week" value={money(weeks[0]?.required ?? 0)} tone={capacity != null && (weeks[0]?.required ?? 0) > capacity ? "bad" : "neutral"} />
        <Stat label="You can save / week" value={capacity != null ? money(capacity) : "not set"} />
        <Stat label="Active goals" value={needs.length} hint={`${money(required)} / wk if all run at once`} />
        <Stat label="Clashes" value={capacity == null ? "—" : clashes.length} tone={clashes.length ? "bad" : "good"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {clashes.length > 0 && (
            <Card title="Overlapping plans">
              <ul className="space-y-3 text-sm">
                {clashes.map((c, i) => (
                  <li key={i} className="rounded-lg bg-danger-soft p-3">
                    <div className="font-medium text-danger">
                      {shortDate(c.from)} – {shortDate(c.to)}: need {money(c.required)}/wk, you can save {money(c.capacity)}/wk
                    </div>
                    <div className="mt-1 text-xs">
                      Short by {money(c.required - c.capacity)} a week.{" "}
                      {c.names.length > 1 ? `Competing: ${c.names.join(", ")}.` : `${c.names[0]} needs more than that on its own.`}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Fixes: move a target date later, lower a target, or start saving for one earlier.</p>
            </Card>
          )}

          <Card title="Savings needed per week">
            {weeks.length <= 1 && needs.length === 0 ? (
              <Empty>Add a goal, or give an upcoming event a budget, to see the timeline.</Empty>
            ) : (
              <>
                <div className="relative flex h-40 items-end gap-px">
                  {capacity != null && (
                    <div className="absolute inset-x-0 border-t border-dashed border-accent" style={{ bottom: `${(capacity / peak) * 100}%` }}>
                      <span className="absolute -top-4 right-0 text-[10px] text-accent">capacity</span>
                    </div>
                  )}
                  {weeks.map((w) => (
                    <div
                      key={w.start}
                      title={`Week of ${shortDate(w.start)}: ${money(w.required)}\n${w.names.join(", ")}`}
                      className={cx("min-w-[3px] flex-1 rounded-t-sm", capacity != null && w.required > capacity ? "bg-danger" : "bg-accent")}
                      style={{ height: `${(w.required / peak) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted">
                  <span>{shortDate(weeks[0]?.start)}</span>
                  <span>{shortDate(weeks.at(-1)?.start)}</span>
                </div>
              </>
            )}
          </Card>

          <AddPanel label="New goal">
            <form action={addPlan}>
              <FormGrid>
                <Field label="Goal"><Input name="name" required placeholder="Christmas, new couch, Fiji trip…" /></Field>
                <Field label="Target ($)"><Input name="target" inputMode="decimal" required /></Field>
                <Field label="Already saved ($)"><Input name="saved" inputMode="decimal" /></Field>
                <Field label="Start saving"><Input type="date" name="start_date" defaultValue={today()} /></Field>
                <Field label="Need it by"><Input type="date" name="target_date" required /></Field>
                <Field label="Linked event">
                  <Select name="event_id" options={[["", "—"], ...events.map((e) => [String(e.id), `${e.title} (${shortDate(e.start_date)})`] as [string, string])]} />
                </Field>
                <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><Textarea name="notes" rows={2} /></Field>
              </FormGrid>
              <div className="mt-3"><SubmitButton>Create goal</SubmitButton></div>
            </form>
          </AddPanel>

          {plans.length === 0 ? (
            <Empty>No goals yet.</Empty>
          ) : (
            plans.map((p) => {
              const n = needs.find((x) => x.key === `plan-${p.id}`);
              const pct = p.saved_cents / p.target_cents;
              return (
                <Card key={p.id} className={p.status !== "active" ? "opacity-60" : ""}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{p.name}</h3>
                      <p className="text-xs text-muted">
                        by {niceDate(p.target_date)} ({relDays(p.target_date)})
                        {p.event_title && <> · for <Link href={`/calendar?event=${p.event_id}`} className="text-accent">{p.event_title}</Link></>}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {p.status !== "active" && <Badge>{p.status}</Badge>}
                      {n && <Badge tone="info">{money(n.perWeek)}/wk for {n.weeks} wk</Badge>}
                    </div>
                  </div>
                  <div className="mt-3 mb-1 flex justify-between text-sm tabular-nums">
                    <span>{money(p.saved_cents)} saved</span>
                    <span className="text-muted">of {money(p.target_cents)}</span>
                  </div>
                  <Progress value={p.saved_cents} max={p.target_cents} tone={pct >= 1 ? "good" : "info"} />
                  {p.notes && <p className="mt-2 text-sm text-muted">{p.notes}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={contributeToPlan} className="flex gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      <Input name="amount" inputMode="decimal" placeholder="$" className="!w-24 !py-1" defaultValue={n ? centsToInput(n.perWeek) : ""} />
                      <button className={`${btn.secondary} ${btn.small}`}>Add savings</button>
                    </form>
                    <form action={setPlanStatus}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="status" value={p.status === "active" ? "done" : "active"} />
                      <button className={`${btn.ghost} ${btn.small}`}>{p.status === "active" ? "Mark done" : "Reactivate"}</button>
                    </form>
                    <DeleteButton action={deletePlan} id={p.id} confirmText="Delete this goal?" />
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          <Card title="What can you save?">
            <form action={saveCapacity} className="space-y-2">
              <Field label="Amount you can put aside each week ($)">
                <Input name="capacity" inputMode="decimal" defaultValue={centsToInput(capacity)} />
              </Field>
              <SubmitButton variant="secondary">Save</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-muted">Weeks where goals need more than this are flagged as clashes.</p>
          </Card>
          <Card title="All savings needs">
            {needs.length === 0 ? <Empty>None.</Empty> : (
              <ul className="divide-y divide-line text-sm">
                {needs.map((n) => (
                  <li key={n.key} className="py-2">
                    <Link href={n.href} className="font-medium hover:underline">{n.name}</Link>
                    <div className="text-xs text-muted">{money(n.remaining)} to go · {money(n.perWeek)}/wk until {shortDate(n.to)}</div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">Calendar events with a budget count too, until you link them to a goal.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
