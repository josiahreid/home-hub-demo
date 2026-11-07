import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { all, getSetting } from "@/lib/db";
import { fortnightOf, pots, potCategories } from "@/lib/budget";
import { categoryList } from "@/lib/category-list";
import { allBills } from "@/lib/bill-links";
import { accountsWithBalances, bucketLines, gapAndRunway } from "@/lib/buckets";
import { centsToInput, money, niceDate } from "@/lib/format";
import { AddPanel, Card, Field, Input, PageHeader, Select, btn, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addIncome, deleteIncome, updateIncome } from "../plan/actions";
import {
  addBucketLine, addGapOption, addPot, deleteBucketLine, deleteGapOption, deletePot, savePayday, savePaydaySummary, saveBucketLine, savePot,
  setPayOffDebts, toggleGapOption,
} from "./actions";
import { ImportBuckets } from "./import-buckets";

type Income = { id: number; name: string; fortnightly_cents: number; included: number; ends_on: string | null };

const PER_OPTIONS: [string, string][] = [["fortnight", "fortnight"], ["week", "week"], ["month", "month"], ["year", "year"]];
const ago = (sqlUtc: string) => formatDistanceToNow(parseISO(`${sqlUtc.replace(" ", "T")}Z`), { addSuffix: true });

/** Pay & pots: when payday is, what comes in, how it's split into buckets (and what each bucket is made of), and the gap. */
export default async function BudgetSetup() {
  const [list, income] = await Promise.all([
    pots(),
    all<Income>("SELECT * FROM income_sources ORDER BY included DESC, fortnightly_cents DESC"),
  ]);
  const accounts = accountsWithBalances();
  const lines = bucketLines();
  const bills = allBills().filter((b) => b.active);
  const f = fortnightOf();
  const incomeFn = income.filter((i) => i.included).reduce((s, i) => s + i.fortnightly_cents, 0);
  const potsFn = list.reduce((s, p) => s + p.fortnightly_cents, 0);
  const accountOptions: [string, string][] = [["", "— not set —"], ...accounts.map((a): [string, string] => [String(a.id), a.name])];
  const catList = categoryList();
  const choosable = [...catList.spending, "Savings"];
  const catOptions: [string, string][] = [["", "— not tracked —"], ...catList.all.map((c): [string, string] => [c, c])];
  const billOptions: [string, string][] = [["", "— no bill —"], ...bills.map((b): [string, string] => [String(b.id), `${b.name} · ${money(b.amount_cents)} ${b.frequency}`])];
  const g = gapAndRunway(incomeFn, potsFn);

  return (
    <>
      <PageHeader title="Pay & pots" subtitle="When you get paid, what comes in, and how each payday is split into buckets – and what each bucket is made of. Set it once, change it whenever." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="1 · Payday">
            <form action={savePayday} className="space-y-2">
              <Field label="Any payday (past or next one)">
                <Input type="date" name="payday" defaultValue={getSetting("next_payday") ?? ""} required />
              </Field>
              <SubmitButton>Save</SubmitButton>
            </form>
            {f && <p className="mt-2 text-xs text-muted">This fortnight: {niceDate(f.start)} → {niceDate(f.end)}. Next payday {niceDate(f.payday)}.</p>}
          </Card>

          <Card title="2 · Pay coming in" actions={<span className="text-xs text-muted tabular-nums">{money(incomeFn)} / fortnight</span>}>
            <ul className="divide-y divide-line text-sm">
              {income.map((i) => (
                <li key={i.id} className="py-2">
                  <form action={updateIncome} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={i.id} />
                    <span className="min-w-0 flex-1 font-medium">{i.name}</span>
                    <Input name="amount" inputMode="decimal" defaultValue={centsToInput(i.fortnightly_cents)} className="!w-24 !py-1" aria-label="Per fortnight" />
                    <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="included" defaultChecked={!!i.included} /> counts</label>
                    <SubmitButton variant="secondary">Save</SubmitButton>
                    <DeleteButton action={deleteIncome} id={i.id} label="×" confirmText={`Remove ${i.name}?`} />
                  </form>
                </li>
              ))}
            </ul>
            <form action={addIncome} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="included" value="1" />
              <Input name="name" required placeholder="e.g. Default Name pay" className="min-w-0 flex-1" />
              <Input name="amount" required inputMode="decimal" placeholder="$ / fortnight" className="!w-28" />
              <SubmitButton>Add</SubmitButton>
            </form>
          </Card>

          <Card title="Load your budget spreadsheet">
            <p className="mb-2 text-xs text-muted">
              The Excel file itself (its <strong>claude</strong> tab) or a CSV. Each NEW-budget line goes into its bucket, with the ways to close
              the gap and your balances. Lines you added here are kept, and so is your pay.
            </p>
            <ImportBuckets hasLines={lines.length > 0} />
          </Card>

          <Card title="Payday summary">
            <form action={savePaydaySummary} className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="on" defaultChecked={getSetting("payday_summary") !== "0"} /> On payday at 8am, send how last fortnight went</label>
              <p className="text-xs text-muted">As a push notification to everyone&apos;s phones, and to Telegram if the bot is connected.</p>
              <SubmitButton variant="secondary">Save</SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card
            title="3 · Buckets"
            actions={
              <span className={`text-xs tabular-nums ${incomeFn && potsFn > incomeFn ? "text-danger" : "text-muted"}`}>
                {money(potsFn)} of {money(incomeFn)} split{incomeFn ? ` · ${potsFn > incomeFn ? `${money(potsFn - incomeFn)} short` : `${money(incomeFn - potsFn)} not in a bucket`}` : ""}
              </span>
            }
          >
            <p className="mb-3 text-sm text-muted">
              Each payday&apos;s money goes into these. A bucket with lines is the total of its lines; one without is the amount you type.
              Tick which spending comes out of each – a category can only come out of one bucket.
            </p>
            <div className="space-y-3">
              {list.map((p) => {
                const cats = potCategories(p);
                const mine = lines.filter((l) => l.pot === p.key);
                const account = accounts.find((a) => a.id === p.account_id);
                return (
                  <section key={p.id} className="rounded-lg border border-line p-3">
                    <form action={savePot}>
                      <input type="hidden" name="id" value={p.id} />
                      <div className="flex flex-wrap items-end gap-2">
                        <Field label="Bucket" className="min-w-36 flex-1"><Input name="name" defaultValue={p.name} required /></Field>
                        {mine.length ? (
                          <div className="w-40 text-sm">
                            <input type="hidden" name="amount" value={centsToInput(p.fortnightly_cents)} />
                            <input type="hidden" name="per" value="fortnight" />
                            <div className="text-xs font-medium text-muted">Each payday</div>
                            <div className="py-1.5 font-semibold tabular-nums">{money(p.fortnightly_cents)} <span className="text-xs font-normal text-muted">= its lines</span></div>
                          </div>
                        ) : (
                          <>
                            <Field label="Amount ($)" className="w-28"><Input name="amount" inputMode="decimal" defaultValue={centsToInput(p.fortnightly_cents)} /></Field>
                            <Field label="per" className="w-32"><Select name="per" defaultValue="fortnight" options={PER_OPTIONS} /></Field>
                          </>
                        )}
                        <Field label="Bank account" className="min-w-44 flex-1"><Select name="account_id" defaultValue={p.account_id ? String(p.account_id) : ""} options={accountOptions} /></Field>
                      </div>
                      {account && (
                        <p className="mt-1 text-xs text-muted">
                          {account.balance_cents != null
                            ? <>In the bank now: <strong className={cx("tabular-nums", account.balance_cents < 0 ? "text-danger" : "text-ink")}>{money(account.balance_cents)}</strong> · {ago(account.balance_at!)} (bank feed)</>
                            : "No balance yet – it comes from the Akahu bank feed (Settings → API) on its next sync."}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {choosable.map((c) => (
                          <label key={c} className="flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                            <input type="checkbox" name="cats" value={c} defaultChecked={cats.includes(c)} className="sr-only" /> {catList.info[c]?.icon} {c}
                          </label>
                        ))}
                      </div>
                      <div className="mt-2"><SubmitButton variant="secondary">Save {p.name}</SubmitButton></div>
                    </form>
                    {/* its own form – a form can't sit inside another */}
                    <div className="-mt-8 flex justify-end">
                      <DeleteButton action={deletePot} id={p.id} label="Remove bucket" confirmText={`Remove the ${p.name} bucket? Its categories won't come out of any bucket until you tick them on another.`} />
                    </div>

                    {/* what the bucket is made of */}
                    <div className="mt-3 border-t border-line pt-2">
                      {mine.length > 0 && (
                        <ul className="divide-y divide-line text-sm">
                          {mine.map((l) => (
                            <li key={l.id} className="py-1.5">
                              <details>
                                <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                                  {l.category && <span className="hidden text-xs text-muted sm:inline">{catList.info[l.category]?.icon} {l.category}</span>}
                                  {l.recurring_id && <span className="text-xs text-muted" title="Paid by a bill">🔗</span>}
                                  <span className={cx("w-20 text-right tabular-nums", !l.budget_cents && "text-muted")}>{money(l.budget_cents)}</span>
                                </summary>
                                <form action={saveBucketLine} className="mt-2 grid gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-2">
                                  <input type="hidden" name="id" value={l.id} />
                                  <Field label="Name"><Input name="name" defaultValue={l.name} required /></Field>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field label="Amount ($)"><Input name="amount" inputMode="decimal" defaultValue={centsToInput(l.budget_cents)} /></Field>
                                    <Field label="per"><Select name="per" defaultValue="fortnight" options={PER_OPTIONS} /></Field>
                                  </div>
                                  <Field label="Tracked as (for what's spent)"><Select name="category" defaultValue={l.category ?? ""} options={catOptions} /></Field>
                                  <Field label="Paid by bill"><Select name="recurring_id" defaultValue={l.recurring_id ? String(l.recurring_id) : ""} options={billOptions} /></Field>
                                  <Field label="Move to bucket"><Select name="pot" defaultValue={l.pot} options={list.map((x): [string, string] => [x.key, x.name])} /></Field>
                                  <Field label="Notes"><Input name="notes" defaultValue={l.notes ?? ""} /></Field>
                                  <div className="flex items-center justify-between gap-2 sm:col-span-2">
                                    <SubmitButton variant="secondary">Save line</SubmitButton>
                                  </div>
                                </form>
                                <div className="mt-1 flex justify-end"><DeleteButton action={deleteBucketLine} id={l.id} label="Delete line" confirmText={`Delete "${l.name}" from ${p.name}?`} /></div>
                              </details>
                            </li>
                          ))}
                        </ul>
                      )}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-accent select-none">+ Add a line to {p.name}</summary>
                        <form action={addBucketLine} className="mt-2 grid gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-2">
                          <input type="hidden" name="pot" value={p.key} />
                          <Field label="Name"><Input name="name" required placeholder="e.g. Netflix, Petrol, Kids' sport" /></Field>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Amount ($)"><Input name="amount" inputMode="decimal" placeholder="0.00" /></Field>
                            <Field label="per"><Select name="per" defaultValue="fortnight" options={PER_OPTIONS} /></Field>
                          </div>
                          <Field label="Tracked as"><Select name="category" defaultValue="" options={catOptions} /></Field>
                          <Field label="Paid by bill"><Select name="recurring_id" defaultValue="" options={billOptions} /></Field>
                          <div className="sm:col-span-2"><SubmitButton>Add line</SubmitButton></div>
                        </form>
                      </details>
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="mt-3">
              <AddPanel label="Add a bucket">
                <form action={addPot} className="flex gap-2">
                  <Input name="name" required placeholder="e.g. Kids" />
                  <SubmitButton>Add</SubmitButton>
                </form>
              </AddPanel>
            </div>
          </Card>

          <GapCard g={g} incomeFn={incomeFn} potsFn={potsFn} />

          <p className="text-xs text-muted">
            The old detailed spreadsheet plan is still at <Link href="/budget/plan" className="underline">Fortnight plan (old)</Link> and the
            whole-year breakdown at <Link href="/budget/year" className="underline">Year view</Link>.
          </p>
          <Link href="/budget" className={btn.primary}>Done – back to this fortnight</Link>
        </div>
      </div>
    </>
  );
}

/** Pay minus buckets, the ways to close the gap (switch each on or off), and how long savings last. */
function GapCard({ g, incomeFn, potsFn }: { g: ReturnType<typeof gapAndRunway>; incomeFn: number; potsFn: number }) {
  const months = g.fortnights != null ? (g.fortnights * 14) / 30.4 : null;
  return (
    <Card title="4 · Gap, options & runway">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Pay − buckets" value={g.gap} hint={`${money(incomeFn)} − ${money(potsFn)}`} />
        <Figure label="Options switched on" value={g.chosen} hint={`${g.options.filter((o) => o.used).length} of ${g.options.length}`} />
        <Figure label="Each fortnight after options" value={g.after} hint={g.after >= 0 ? "not running down savings" : "comes out of savings"} />
      </div>

      <h3 className="mt-4 mb-1 text-sm font-semibold">Ways to close the gap</h3>
      <p className="mb-2 text-xs text-muted">Tap one to switch it on or off. A negative amount costs money (e.g. keeping a life cover).</p>
      <ul className="divide-y divide-line text-sm">
        {g.options.map((o) => (
          <li key={o.id} className="flex items-center gap-2 py-1.5">
            <form action={toggleGapOption}>
              <input type="hidden" name="id" value={o.id} />
              <button aria-label={o.used ? "Switch off" : "Switch on"} className={cx("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", o.used ? "bg-accent" : "bg-line")}>
                <span className={cx("size-4 rounded-full bg-surface shadow transition-transform", !!o.used && "translate-x-4")} />
              </button>
            </form>
            <span className="min-w-0 flex-1">
              <span className={cx(!o.used && "text-muted")}>{o.name}</span>
              {o.notes && <span className="block truncate text-xs text-muted">{o.notes}</span>}
            </span>
            <span className={cx("shrink-0 tabular-nums", (o.saves_cents ?? 0) < 0 ? "text-danger" : "text-accent", !o.used && "opacity-60")}>
              {(o.saves_cents ?? 0) < 0 ? "−" : "+"}{money(Math.abs(o.saves_cents ?? 0))}
            </span>
            <DeleteButton action={deleteGapOption} id={o.id} label="×" confirmText={`Remove "${o.name}"?`} />
          </li>
        ))}
        {g.options.length === 0 && <li className="py-2 text-xs text-muted">None yet – load the spreadsheet, or add one below.</li>}
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-accent select-none">+ Add an option</summary>
        <form action={addGapOption} className="mt-2 grid gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-[1fr_7rem_7rem_8rem]">
          <Input name="name" required placeholder="e.g. Keep Default Name's life cover (AIA)" aria-label="Option" />
          <Input name="amount" inputMode="decimal" placeholder="$ e.g. 18.90" aria-label="Amount" />
          <Select name="per" defaultValue="fortnight" options={PER_OPTIONS} aria-label="Per" />
          <Select name="kind" defaultValue="saves" options={[["saves", "saves"], ["costs", "costs"]]} aria-label="Saves or costs" />
          <Input name="notes" placeholder="Notes (optional)" className="sm:col-span-3" aria-label="Notes" />
          <SubmitButton>Add</SubmitButton>
        </form>
      </details>

      <h3 className="mt-4 mb-1 text-sm font-semibold">Savings runway</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Savings to draw on" value={g.starting} hint={`${money(g.cash)} cash${g.payOffDebts && g.debt ? ` − ${money(g.debt)} card owing` : ""}`} plain />
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs font-medium text-muted uppercase">Lasts</div>
          <div className={cx("text-xl font-semibold tabular-nums", g.fortnights != null && g.fortnights < 6 ? "text-danger" : g.fortnights != null ? "text-warn" : "text-accent")}>
            {g.fortnights == null ? "Not running down" : `${g.fortnights.toFixed(1)} fortnights`}
          </div>
          {months != null && <div className="text-xs text-muted">about {months.toFixed(1)} months</div>}
        </div>
        <form action={setPayOffDebts} className="rounded-lg border border-line p-3 text-xs text-muted">
          <label className="flex items-start gap-2"><input type="checkbox" name="on" defaultChecked={g.payOffDebts} className="mt-0.5" /> Pay off what&apos;s owing on cards from savings first</label>
          <SubmitButton variant="secondary" className="mt-2 !px-2 !py-1 text-xs">Save</SubmitButton>
        </form>
      </div>
      {g.fortnights != null && g.starting > 0 && <Runway starting={g.starting} perFn={g.after} />}
      <p className="mt-2 text-xs text-muted">
        {g.source === "bank"
          ? `Savings are the real balances of your everyday and savings accounts from the bank feed (${g.live} accounts${g.asOf ? `, ${ago(g.asOf)}` : ""}).`
          : `Savings are the balances from your spreadsheet${g.asOf ? ` (${niceDate(g.asOf)})` : ""} – they switch to the real ones once the bank feed has synced.`}
        {" "}Savings also need to cover anything unexpected (car, doctor), so the real runway is shorter.
      </p>
    </Card>
  );
}

function Figure({ label, value, hint, plain }: { label: string; value: number; hint?: string; plain?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs font-medium text-muted uppercase">{label}</div>
      <div className={cx("text-xl font-semibold tabular-nums", !plain && (value < 0 ? "text-danger" : "text-accent"))}>{value < 0 ? "−" : ""}{money(Math.abs(value))}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Savings left at the end of each fortnight for the next six months, as bars (a red stub once they've run out). */
function Runway({ starting, perFn }: { starting: number; perFn: number }) {
  const points = Array.from({ length: 13 }, (_, i) => starting + perFn * (i + 1));
  return (
    <div className="mt-3 flex h-20 items-end gap-1 overflow-hidden" role="img" aria-label="Savings left each fortnight">
      {points.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-0.5">
          <div className={cx("w-full rounded-t", v > 0 ? "bg-accent" : "bg-danger")} style={{ height: `${v > 0 ? Math.max(2, Math.min(64, (v / starting) * 64)) : 3}px` }} title={`Fortnight ${i + 1}: ${v > 0 ? money(v) : "run out"}`} />
          <span className="text-[9px] text-muted">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
