import { io } from "next/cache";
import Link from "next/link";
import { all, getSetting } from "@/lib/db";
import { centsToInput, money, niceDate, shortDate, today } from "@/lib/format";
import { POTS } from "@/lib/budget-sheet";
import { currentFortnight, loadPlan } from "@/lib/budget-plan";
import { AddPanel, Badge, Card, Empty, Field, Input, PageHeader, Progress, Stat, Table, btn, cx, td } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import {
  addIncome, addLine, deleteIncome, deleteLine, editLine, setPayday, setPotAccount, toggleIncome, toggleOption, togglePayOffDebts,
  updateBalance, updateIncome, updateLine,
} from "./actions";
import { SheetImport } from "./sheet-import";
import { GROUPS_LIST, LineForm } from "./line-form";
import { EditableRow } from "./editable-row";

const GROUP_SUGGESTIONS = ["Mortgage, loans & insurance", "Bills & utilities", "Food & fuel", "Kids & health", "Everyday spending", "Savings"];

export default async function FortnightPlan() {
  await io();
  const p = await loadPlan();
  const fortnight = currentFortnight();
  const nextPayday = getSetting("next_payday");
  const spentByCategory = fortnight
    ? new Map(
        (await all<{ category: string; spent: number }>(
          `SELECT category, -SUM(amount_cents) AS spent FROM transactions
            WHERE amount_cents < 0 AND category IS NOT NULL AND same_as IS NULL AND date BETWEEN ? AND ? GROUP BY category`,
          fortnight.start, fortnight.end,
        )).map((r) => [r.category, r.spent]),
      )
    : null;
  // a category shared by several lines (e.g. Spending money) is compared against their combined budget
  const budgetByCategory = new Map<string, number>();
  for (const l of p.lines) if (l.category) budgetByCategory.set(l.category, (budgetByCategory.get(l.category) ?? 0) + l.budget_cents);

  const groupList = (
    <datalist id={GROUPS_LIST}>
      {[...new Set([...p.groups.map((g) => g.name), ...GROUP_SUGGESTIONS])].map((g) => <option key={g} value={g} />)}
    </datalist>
  );

  if (p.lines.length === 0) {
    return (
      <>
        <PageHeader title="Fortnight plan" subtitle="Your household budget, per pay fortnight." />
        {groupList}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Build it here">
            <p className="mb-3 text-sm text-muted">
              Add each outgoing (mortgage, power, groceries…) one at a time. Then add your pay under Income and the app works out the rest.
            </p>
            <LineForm action={addLine} potAccounts={p.potAccounts} submit="Add line" />
          </Card>
          <Card title="Or load your budget spreadsheet">
            <p className="mb-3 text-sm text-muted">
              In Excel, save the budget as <strong>CSV</strong> (File → Save As → CSV) and choose it here. You can re-import any time you change the spreadsheet.
            </p>
            <SheetImport hasPlan={false} />
          </Card>
        </div>
      </>
    );
  }

  const runwayTone = p.runwayFortnights == null ? "good" : p.runwayFortnights < 6 ? "bad" : p.runwayFortnights < 13 ? "warn" : "neutral";
  const maxProj = Math.max(1, ...p.projection.map((v) => Math.abs(v)), Math.abs(p.startingSavings));

  return (
    <>
      <PageHeader
        title="Fortnight plan"
        subtitle={fortnight ? `This pay fortnight: ${shortDate(fortnight.start)} – ${shortDate(fortnight.end)} · next payday ${niceDate(fortnight.payday)}` : "All figures per pay fortnight"}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income / fortnight" value={money(p.incomeFn)} />
        <Stat label="Planned outgoings" value={money(p.outgoingFn)} />
        <Stat
          label="Left each fortnight"
          value={money(p.afterOptions)}
          tone={p.afterOptions >= 0 ? "good" : "bad"}
          hint={p.chosen ? `${money(p.remaining)} before ${money(p.chosen)} of chosen savings` : "no options chosen yet"}
        />
        <Stat
          label="Savings runway"
          value={p.runwayFortnights == null ? "OK" : `${p.runwayFortnights.toFixed(1)} fn`}
          tone={runwayTone}
          hint={p.runwayFortnights == null ? "not running down savings" : `≈ ${(p.runwayFortnights * 14 / 30.4).toFixed(1)} months from ${money(p.startingSavings)}`}
        />
      </div>

      {!nextPayday && (
        <Card className="mb-4 border-accent">
          <form action={setPayday} className="flex flex-wrap items-end gap-3">
            <Field label="When is your next payday?"><Input type="date" name="payday" required defaultValue={today()} /></Field>
            <SubmitButton>Put bills on the calendar</SubmitButton>
            <p className="basis-full text-xs text-muted">
              Every bill in the plan becomes a fortnightly payment on payday. Power, phone, rates, mortgage, insurance and rubbish also show on the Utilities tab, and the car loan on the Car tab.
            </p>
          </form>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Outgoings" actions={<Link href="/budget/year" className="text-xs text-accent">Over the year →</Link>}>
            {groupList}
            <Table head={["", "Old", "Actual", "Plan", fortnight ? "Spent this fn" : "", ""]}>
              {p.groups.map((g) => (
                <GroupRows key={g.name} group={g} spentByCategory={spentByCategory} budgetByCategory={budgetByCategory} potAccounts={p.potAccounts} />
              ))}
              <tr className="font-semibold">
                <td className={td}>Total</td>
                <td className={`${td} text-right tabular-nums text-muted`}>{money(p.groups.reduce((s, g) => s + g.old, 0))}</td>
                <td className={`${td} text-right tabular-nums text-muted`}>{money(p.groups.reduce((s, g) => s + g.actual, 0))}</td>
                <td className={`${td} text-right tabular-nums`}>{money(p.outgoingFn)}</td>
                <td className={td} />
                <td className={td} />
              </tr>
            </Table>
            <p className="mt-3 text-xs text-muted">
              Old = previous budget · Actual = last year&apos;s fortnightly average · Plan = what you&apos;re aiming for. Edit a plan amount and press Enter,
              or ✎ to rename, move or delete a line. Monthly category limits on the Overview follow this plan.
            </p>
            <div className="mt-3">
              <AddPanel label="Add a line">
                <LineForm action={addLine} potAccounts={p.potAccounts} submit="Add line" />
              </AddPanel>
            </div>
          </Card>

          <Card title="Ways to close the gap">
            <ul className="divide-y divide-line">
              {p.options.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                  <form action={toggleOption}>
                    <input type="hidden" name="id" value={o.id} />
                    <button
                      aria-label={o.used ? "Stop counting this" : "Count this"}
                      className={cx("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", o.used ? "bg-accent" : "bg-line")}
                    >
                      <span className={cx("h-4 w-4 rounded-full bg-surface transition-transform", !!o.used && "translate-x-4")} />
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <div className={o.used ? "font-medium" : ""}>{o.name}</div>
                    {o.notes && <div className="text-xs text-muted">{o.notes}</div>}
                  </div>
                  <span className={cx("tabular-nums", o.used ? "text-accent" : "text-muted")}>{o.saves_cents ? `+${money(o.saves_cents)}` : "—"}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-medium">
              <span>Left each fortnight with chosen options</span>
              <span className={cx("tabular-nums", p.afterOptions >= 0 ? "text-accent" : "text-danger")}>{money(p.afterOptions)}</span>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Income">
            <ul className="divide-y divide-line text-sm">
              {p.income.map((i) => {
                const ended = i.ends_on != null && i.ends_on < today();
                return (
                  <li key={i.id} className={cx("py-2", (!i.included || ended) && "opacity-60")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{i.name}</span>
                      <span className="tabular-nums">{money(i.fortnightly_cents)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {!i.included && <Badge>not counted</Badge>}
                      {i.ends_on && <Badge tone={ended ? "neutral" : "warn"}>{ended ? "ended" : "ends"} {shortDate(i.ends_on)}</Badge>}
                      {i.notes && <span className="text-xs text-muted">{i.notes}</span>}
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-accent">Edit</summary>
                      <form action={updateIncome} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={i.id} />
                        <Field label="Per fortnight ($)"><Input name="amount" inputMode="decimal" defaultValue={centsToInput(i.fortnightly_cents)} /></Field>
                        <Field label="Ends on (optional)"><Input type="date" name="ends_on" defaultValue={i.ends_on ?? ""} /></Field>
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="included" defaultChecked={!!i.included} /> Count in the plan</label>
                        <div className="flex items-center justify-between">
                          <SubmitButton variant="secondary">Save</SubmitButton>
                        </div>
                      </form>
                      <div className="mt-2 flex gap-1">
                        <form action={toggleIncome}><input type="hidden" name="id" value={i.id} /><button className={`${btn.ghost} ${btn.small}`}>{i.included ? "Don't count" : "Count it"}</button></form>
                        <DeleteButton action={deleteIncome} id={i.id} label="Remove" confirmText={`Remove ${i.name}?`} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3">
              <AddPanel label="Add income">
                <form action={addIncome} className="space-y-2">
                  <Field label="Name"><Input name="name" required placeholder="Paid Parental Leave" /></Field>
                  <Field label="Per fortnight ($)"><Input name="amount" inputMode="decimal" required /></Field>
                  <Field label="Ends on (optional)"><Input type="date" name="ends_on" /></Field>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="included" defaultChecked /> Count in the plan</label>
                  <SubmitButton>Add</SubmitButton>
                </form>
              </AddPanel>
            </div>
          </Card>

          <Card title="Payday split">
            <ul className="divide-y divide-line text-sm">
              {Object.entries(POTS).map(([key, pot]) => {
                const lines = p.pots.get(key) ?? [];
                const amount = lines.reduce((s, l) => s + l.budget_cents, 0);
                return (
                  <li key={key} className="py-2">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium"><span className="text-muted group-open:hidden">▸</span><span className="hidden text-muted group-open:inline">▾</span> {pot.label}</div>
                          <div className="text-xs text-muted">{p.potAccounts.get(key) || pot.note}</div>
                        </div>
                        <span className="tabular-nums">{amount ? money(amount) : "—"}</span>
                      </summary>
                      <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
                        <form action={setPotAccount} className="flex items-end gap-2">
                          <input type="hidden" name="pot" value={key} />
                          <Field label="Bank account" className="flex-1">
                            <Input name="account" defaultValue={p.potAccounts.get(key)} placeholder="e.g. Westpac Bills 01-…" className="!py-1" />
                          </Field>
                          <SubmitButton variant="secondary" className={btn.small}>Save</SubmitButton>
                        </form>
                        {lines.length === 0 ? <p className="text-xs text-muted">Nothing goes here yet. Pick this account when adding or editing a line.</p> : (
                          <ul className="space-y-1">
                            {lines.map((l) => (
                              <li key={l.id} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-xs">{l.name}</span>
                                <form action={updateLine}>
                                  <input type="hidden" name="id" value={l.id} />
                                  <Input name="budget" inputMode="decimal" defaultValue={centsToInput(l.budget_cents)} className="!w-24 !py-0.5 text-right text-xs tabular-nums" aria-label={`Plan for ${l.name}`} />
                                </form>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
              <div className="flex justify-between font-medium"><span>Total per payday</span><span className="tabular-nums">{money(p.outgoingFn)}</span></div>
              <div className="flex justify-between">
                <span>Left over (not allocated)</span>
                <span className={cx("tabular-nums", p.remaining < 0 && "text-danger")}>{money(p.remaining)}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Open an account to name it and tweak what goes into it. Type an amount and press Enter.</p>
          </Card>

          <Card title="Savings runway">
            {p.balances.length === 0 ? <Empty>No balances yet. They come in with the spreadsheet import.</Empty> : (
              <>
                <ul className="divide-y divide-line text-sm">
                  {p.balances.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className={b.kind === "debt" ? "text-danger" : ""}>{b.name}</span>
                      <form action={updateBalance} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={b.id} />
                        <Input name="amount" inputMode="decimal" defaultValue={centsToInput(b.amount_cents)} className="!w-24 !py-1 text-right" />
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={togglePayOffDebts} className="mt-2">
                  <input type="hidden" name="value" value={p.payOffDebts ? "0" : "1"} />
                  <button className={`${btn.ghost} ${btn.small}`}>{p.payOffDebts ? "☑" : "☐"} Pay off debts from savings first</button>
                </form>
                <div className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
                  <div className="flex justify-between"><span>Starting savings</span><span className="tabular-nums">{money(p.startingSavings)}</span></div>
                  <div className="flex justify-between"><span>Each fortnight</span><span className={cx("tabular-nums", p.afterOptions < 0 && "text-danger")}>{money(p.afterOptions)}</span></div>
                  <div className="flex justify-between font-medium">
                    <span>Runs out in</span>
                    <span>{p.runwayFortnights == null ? "never at this rate" : `${p.runwayFortnights.toFixed(1)} fortnights`}</span>
                  </div>
                </div>
                <div className="mt-3 flex h-20 items-center gap-px" title="Savings balance each fortnight for the next year">
                  {p.projection.map((v, i) => (
                    <div key={i} className="flex h-full flex-1 flex-col justify-center">
                      <div className="flex h-1/2 items-end">{v > 0 && <div className="w-full rounded-t-sm bg-accent" style={{ height: `${(v / maxProj) * 100}%` }} />}</div>
                      <div className="flex h-1/2 items-start">{v < 0 && <div className="w-full rounded-b-sm bg-danger" style={{ height: `${(-v / maxProj) * 100}%` }} />}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">
                  Next 26 fortnights. Balances as of {niceDate(p.asOf)}; type a new amount and press Enter to update.
                  Savings also need to cover surprises, so the real runway is shorter.
                </p>
              </>
            )}
          </Card>

          <Card title="Spreadsheet">
            <SheetImport hasPlan />
            {nextPayday && (
              <form action={setPayday} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <Field label="Next payday"><Input type="date" name="payday" defaultValue={nextPayday} /></Field>
                <SubmitButton variant="secondary">Update bill dates</SubmitButton>
              </form>
            )}
            <p className="mt-2 text-xs text-muted">
              Re-importing replaces the lines that came from the spreadsheet (including changes made to them here). Lines you added here,
              your bill schedule and any income you added are kept.{" "}
              <Link href="/budget/recurring" className="text-accent underline">See scheduled bills</Link>
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function GroupRows({ group: g, spentByCategory, budgetByCategory, potAccounts }: {
  group: Awaited<ReturnType<typeof loadPlan>>["groups"][number];
  spentByCategory: Map<string, number> | null;
  budgetByCategory: Map<string, number>;
  potAccounts: Map<string, string>;
}) {
  return (
    <>
      <tr className="bg-surface-2/60 font-medium">
        <td className={td}>{g.name}</td>
        <td className={`${td} text-right tabular-nums text-muted`}>{money(g.old)}</td>
        <td className={`${td} text-right tabular-nums text-muted`}>{money(g.actual)}</td>
        <td className={`${td} text-right tabular-nums`}>{money(g.budget)}</td>
        <td className={td} />
        <td className={td} />
      </tr>
      {g.items.map((l) => {
        const spent = spentByCategory && l.category ? spentByCategory.get(l.category) ?? 0 : null;
        const catBudget = l.category ? budgetByCategory.get(l.category) ?? 0 : 0;
        const over = l.actual_cents != null && l.budget_cents < l.actual_cents;
        return (
          <EditableRow
            key={l.id}
            columns={6}
            label={l.name}
            editor={
              <div className="space-y-3">
                <LineForm action={editLine} line={l} potAccounts={potAccounts} submit="Save line" />
                <div className="flex justify-end">
                  <DeleteButton
                    action={deleteLine} id={l.id} label="Delete line"
                    confirmText={`Delete ${l.name}?${l.recurring_id ? " Its payday payment will be paused." : ""}`}
                  />
                </div>
              </div>
            }
            cells={<>
            <td className={`${td} pl-6`}>
              <div>{l.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {l.category && <Badge>{l.category}</Badge>}
                {l.recurring_id && <Badge tone="info">scheduled</Badge>}
                {l.source === "manual" && <Badge tone="good">added here</Badge>}
                {l.notes && <span className="text-xs text-muted">{l.notes}</span>}
              </div>
            </td>
            <td className={`${td} text-right tabular-nums text-muted`}>{money(l.old_cents)}</td>
            <td className={`${td} text-right tabular-nums ${over ? "text-warn" : "text-muted"}`}>{money(l.actual_cents)}</td>
            <td className={`${td} text-right`}>
              <form action={updateLine}>
                <input type="hidden" name="id" value={l.id} />
                <Input name="budget" inputMode="decimal" defaultValue={centsToInput(l.budget_cents)} className="!w-24 !py-1 text-right tabular-nums" aria-label={`Plan for ${l.name}`} />
              </form>
            </td>
            <td className={`${td} w-32`}>
              {spent != null && catBudget > 0 && (
                <div title={`${money(spent)} of ${money(catBudget)} in ${l.category} this fortnight`}>
                  <div className="mb-1 text-right text-xs tabular-nums">{money(spent)}</div>
                  <Progress value={spent} max={catBudget} tone={spent > catBudget ? "bad" : spent > catBudget * 0.85 ? "warn" : "good"} />
                </div>
              )}
            </td>
            </>}
          />
        );
      })}
    </>
  );
}

