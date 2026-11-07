import { addDays, parseISO } from "date-fns";
import { categoryList } from "@/lib/category-list";
import { FREQUENCIES, advance, iso, money, niceDate, perMonth, relDays, daysUntil, shortDate, today } from "@/lib/format";
import { detectRepeats, hiddenRepeats } from "@/lib/repeats";
import { allBills, groupPayments, matchWords, paymentsFor, priceCheck, sameAsIds, type Bill } from "@/lib/bill-links";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, PageHeader, Select, Stat, Table, btn, td } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addRecurring, deleteRecurring, hideRepeat, markRecurringPaid, setBillMatch, setBillSameAs, showHiddenRepeats, toggleRecurring } from "../actions";
import { BillsTimeline } from "./timeline";

const LINK_LABEL: Record<string, string> = { vehicle: "Car", utility: "Utilities", house_project: "House", insurance: "Insurance" };

export default async function Recurring() {
  const rows = allBills();
  const active = rows.filter((r) => r.active);
  // a bill that's the same money as others is listed, but never counted
  const counted = active.filter((r) => !r.same_as);
  const monthly = counted.reduce((s, r) => s + perMonth(r.amount_cents, r.frequency), 0);
  const suggestions = await detectRepeats();
  const hiddenCount = hiddenRepeats().length;
  const now = today();
  const since = iso(addDays(parseISO(now), -91));
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));

  return (
    <>
      <PageHeader title="Bills" subtitle="Everything that comes out regularly – bills, subscriptions, loans. Car, utility and insurance payments added on their own tabs show here too." />
      <BillsTimeline />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Per month" value={money(monthly)} />
        <Stat label="Per year" value={money(monthly * 12)} />
        <Stat label="Overdue" value={counted.filter((r) => r.next_due < now).length} tone={counted.some((r) => r.next_due < now) ? "bad" : "neutral"} hint="not marked paid" />
        <Stat label="Active" value={counted.length} hint={active.length > counted.length ? `+ ${active.length - counted.length} same money as another` : undefined} />
      </div>

      <div className="mb-4">
        <AddPanel label="Add a repeat payment">
          <form action={addRecurring}>
            <FormGrid>
              <Field label="Name"><Input name="name" required placeholder="Netflix" /></Field>
              <Field label="Amount ($)"><Input name="amount" inputMode="decimal" required /></Field>
              <Field label="How often"><Select name="frequency" defaultValue="monthly" options={FREQUENCIES} /></Field>
              <Field label="Next due"><Input type="date" name="next_due" defaultValue={today()} required /></Field>
              <Field label="Category"><Select name="category" options={[["", "—"], ...categoryList().all]} /></Field>
              <Field label="Notes"><Input name="notes" /></Field>
            </FormGrid>
            <div className="mt-3"><SubmitButton>Add</SubmitButton></div>
          </form>
        </AddPanel>
      </div>

      {suggestions.length > 0 && (
        <Card title="Spotted in your statements" className="mb-4">
          <p className="mb-2 text-xs text-muted">Payments that came out at regular times. <strong>Track it</strong> moves one into your repeat payments below; <strong>Not a repeat</strong> hides it for good.</p>
          <ul className="divide-y divide-line text-sm">
            {suggestions.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted">{money(s.amount)} {s.frequency} · seen {s.count}× · last {niceDate(s.last)}</div>
                </div>
                <div className="flex gap-1">
                <form action={addRecurring}>
                  <input type="hidden" name="name" value={s.name} />
                  <input type="hidden" name="amount" value={(s.amount / 100).toFixed(2)} />
                  <input type="hidden" name="frequency" value={s.frequency} />
                  <input type="hidden" name="next_due" value={s.next} />
                  <input type="hidden" name="category" value={s.category ?? ""} />
                  <button className={`${btn.secondary} ${btn.small}`}>Track it</button>
                </form>
                <form action={hideRepeat}>
                  <input type="hidden" name="key" value={s.key} />
                  <button className={`${btn.ghost} ${btn.small}`}>Not a repeat</button>
                </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hiddenCount > 0 && (
        <form action={showHiddenRepeats} className="-mt-2 mb-4 text-xs text-muted">
          {hiddenCount} suggestion{hiddenCount === 1 ? "" : "s"} hidden as not a repeat ·{" "}
          <button className="text-accent underline">show them again</button>
        </form>
      )}

      <Card>
        <p className="mb-3 text-xs text-muted">
          Showing the same money twice (the mortgage <em>and</em> its interest, or the bank&apos;s &ldquo;Tower Insurance&rdquo; <em>and</em> your
          insurance policies)? Open <strong>Link…</strong> on the extra one and tick what it&apos;s the same money as – it stays listed but stops counting.
        </p>
        {rows.length === 0 ? (
          <Empty>No repeat payments yet.</Empty>
        ) : (
          <Table head={["Payment", "Amount", "Next due", "Per month", ""]}>
            {rows.map((r) => {
              const d = daysUntil(r.next_due);
              const copyOf = sameAsIds(r).map((id) => nameOf.get(id)).filter(Boolean);
              return (
                <tr key={r.id} className={r.active && !r.same_as ? "" : "opacity-60"}>
                  <td className={td}>
                    <div className="font-medium">{r.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.category && <Badge>{r.category}</Badge>}
                      {r.linked_type && <Badge tone="info">{LINK_LABEL[r.linked_type] ?? r.linked_type}</Badge>}
                      {!r.active && <Badge>paused</Badge>}
                      {r.same_as && <Badge tone="warn">same money as {copyOf.join(", ")} – not counted</Badge>}
                    </div>
                    <BankLine bill={r} bills={rows} since={since} now={now} />
                    <LinkPanel bill={r} bills={rows} />
                  </td>
                  <td className={`${td} tabular-nums`}>{money(r.amount_cents)}<div className="text-xs text-muted">{r.frequency}</div></td>
                  <td className={td}>
                    {niceDate(r.next_due)}
                    <div><Badge tone={d < 0 ? "bad" : d <= 3 ? "warn" : "neutral"}>{relDays(r.next_due)}</Badge></div>
                  </td>
                  <td className={`${td} tabular-nums`}>{r.same_as ? <span className="text-muted">—</span> : money(perMonth(r.amount_cents, r.frequency))}</td>
                  <td className={td}>
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.active ? (
                        <form action={markRecurringPaid}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className={`${btn.secondary} ${btn.small}`} title={`Moves next due to ${niceDate(advance(r.next_due, r.frequency))}`}>Paid</button>
                        </form>
                      ) : null}
                      <form action={toggleRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className={`${btn.ghost} ${btn.small}`}>{r.active ? "Pause" : "Resume"}</button>
                      </form>
                      {!r.linked_type && <DeleteButton action={deleteRecurring} id={r.id} label="×" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}

/**
 * Under a bill: its last bank payment and, for a bill that's counted, a 3-month price check – what the bank paid
 * against your price (for a policy paid as "Tower Insurance", the policies paid together are checked together).
 */
function BankLine({ bill, bills, since, now }: { bill: Bill; bills: Bill[]; since: string; now: string }) {
  if (bill.same_as) {
    const own = paymentsFor([bill.id], bills, since);
    return own[0] ? <div className="mt-1 text-xs text-muted">Bank: last {shortDate(own[0].date)} · {money(-own[0].amount_cents)}</div> : null;
  }
  const { payments, covering, ids } = groupPayments(bill, bills, since);
  if (!payments.length) {
    return matchWords(bill) || covering.length ? <div className="mt-1 text-xs text-muted">No bank payments found in the last 3 months.</div> : null;
  }
  const check = priceCheck(ids, bills, payments, since, now);
  const together = check.priced.filter((b) => b.id !== bill.id);
  return (
    <div className="mt-1 text-xs text-muted">
      Bank: last {shortDate(payments[0].date)} · {money(-payments[0].amount_cents)}
      {covering.length > 0 && <> · paid as &ldquo;{covering.map((c) => c.name).join("”, “")}&rdquo;</>}
      <span className={check.ok ? "text-accent" : "text-warn"}>
        {" "}· 3 months: bank {money(check.paid)}, {together.length ? `these ${check.priced.length} come to` : "price comes to"} {money(check.expected)} {check.ok ? "✓" : `(${check.diff > 0 ? "+" : "−"}${money(Math.abs(check.diff))})`}
      </span>
      {together.length > 0 && <span className="block">checked together with {together.map((b) => b.name).join(", ")}</span>}
    </div>
  );
}

/** "Link…": what this bill is the same money as, and what the bank calls it. */
function LinkPanel({ bill, bills }: { bill: Bill; bills: Bill[] }) {
  const mine = new Set(sameAsIds(bill));
  // not ones that are themselves a copy of this bill (then neither would count)
  const options = bills.filter((b) => b.id !== bill.id && b.active && !sameAsIds(b).includes(bill.id));
  const auto = matchWords({ ...bill, match: null });
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-accent select-none">Link…</summary>
      <div className="mt-2 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
        <form action={setBillSameAs} className="space-y-2">
          <input type="hidden" name="id" value={bill.id} />
          <div className="text-xs font-medium">This is the same money as… <span className="font-normal text-muted">(it stops counting)</span></div>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {options.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="same_as" value={b.id} defaultChecked={mine.has(b.id)} />
                <span className="min-w-0 truncate">{b.name}</span>
                <span className="ml-auto shrink-0 text-muted tabular-nums">{money(b.amount_cents)} {b.frequency}</span>
              </label>
            ))}
          </div>
          <SubmitButton variant="secondary" className="!py-1 text-xs">Save</SubmitButton>
        </form>
        <form action={setBillMatch} className="space-y-1 border-t border-line pt-2">
          <input type="hidden" name="id" value={bill.id} />
          <label className="block text-xs font-medium">What the bank calls it</label>
          <div className="flex gap-2">
            <Input name="match" defaultValue={bill.match ?? ""} placeholder={auto ?? "e.g. tower insurance"} className="!py-1 text-xs" />
            <SubmitButton variant="secondary" className="!py-1 text-xs">Save</SubmitButton>
          </div>
          <p className="text-[11px] text-muted">
            Bank payments containing these words are this bill&apos;s.{auto && !bill.match ? ` Blank = “${auto}”.` : ""} A payment can also be linked by hand on Transactions.
          </p>
        </form>
      </div>
    </details>
  );
}
