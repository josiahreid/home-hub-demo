import { io } from "next/cache";
import Link from "next/link";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarClock, Settings2 } from "lucide-react";
import { getSetting } from "@/lib/db";
import { billsIn, fortnightOf, incomeFor, potStatus, shiftFortnight, spendingByCategory, unsortedCount, type Fortnight, type PotStatus } from "@/lib/budget";
import { categoryList } from "@/lib/category-list";
import { bucketLines, lineActuals, type BucketLine } from "@/lib/buckets";
import { money, today } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Progress, btn, cx } from "@/components/ui";
import { BudgetGuide } from "./guide";
import { Afford } from "./afford";
import { BankFeed } from "./bank-feed";

const short = (d: string) => format(parseISO(d), "EEE d MMM");

/** This fortnight: each pot's money left until payday, what came in, bills still to come, and how last fortnight went. */
export default async function ThisFortnight({ searchParams }: PageProps<"/budget">) {
  await io();
  const now = fortnightOf();
  if (!now) {
    return (
      <>
        <PageHeader title="Budget" subtitle="Set up your pay and pots first." />
        <BudgetGuide />
        <Card className="max-w-xl">
          <p className="text-sm">Tell Home Hub when payday is, what comes in, and how it&apos;s split into pots – then this page shows what&apos;s left in each until the next payday.</p>
          <Link href="/budget/setup" className={`${btn.primary} mt-3`}><Settings2 size={16} /> Set up pay &amp; pots</Link>
        </Card>
        <div className="mt-4 max-w-xl"><BankFeed /></div>
      </>
    );
  }

  const sp = await searchParams;
  const f: Fortnight = typeof sp.f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.f) ? fortnightOf(sp.f)! : now;
  const isNow = f.start === now.start;
  const prev = shiftFortnight(f, -1);
  const [status, income, bills, spent, last] = await Promise.all([potStatus(f), incomeFor(f), billsIn(f), spendingByCategory(f.start, f.end), potStatus(prev)]);
  const unsorted = unsortedCount();
  const cats = categoryList();
  // what each bucket is made of, and what each line has actually cost so far
  const lines = bucketLines();
  const actual = lineActuals(lines, f, spent);
  const daysLeft = isNow ? Math.max(1, differenceInCalendarDays(parseISO(f.payday), parseISO(today()))) : 0;
  const totalPots = status.reduce((s, p) => s + p.fortnightly_cents, 0);
  const totalOut = [...spent.values()].reduce((s, v) => s + v, 0);
  const billsAhead = isNow ? bills.filter((b) => b.date >= today()) : [];
  const savings = status.filter((p) => p.cats.includes("Savings") || p.key === "sinking").reduce((s, p) => s + p.fortnightly_cents, 0);

  return (
    <>
      <PageHeader
        title={isNow ? "This fortnight" : `Fortnight of ${short(f.start)}`}
        subtitle={`${short(f.start)} → ${short(f.end)}${isNow ? ` · payday ${short(f.payday)} (${daysLeft} day${daysLeft === 1 ? "" : "s"})` : ""}`}
        actions={
          <>
            <Link href={`/budget?f=${prev.start}`} className={btn.secondary} aria-label="Previous fortnight">←</Link>
            {!isNow && <Link href="/budget" className={btn.secondary}>This fortnight</Link>}
            {f.start < now.start && <Link href={`/budget?f=${shiftFortnight(f, 1).start}`} className={btn.secondary} aria-label="Next fortnight">→</Link>}
            <Link href="/budget/setup" className={btn.ghost}><Settings2 size={15} /> Pay &amp; pots</Link>
          </>
        }
      />

      <BudgetGuide />

      {unsorted.recent > 0 && (
        <Link href="/budget/sort" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warn bg-warn-soft p-3 text-sm text-warn hover:brightness-95">
          <span><strong>{unsorted.recent} transaction{unsorted.recent === 1 ? "" : "s"} to sort</strong> – the pots below only count sorted spending.</span>
          <span className="font-semibold">Sort now →</span>
        </Link>
      )}

      {/* the pots: what's left in each until payday */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {status.map((p) => <PotCard key={p.id} pot={p} daysLeft={daysLeft} lines={lines.filter((l) => l.pot === p.key)} actual={actual} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Where it went" actions={<span className="text-xs text-muted tabular-nums">{money(totalOut)} spent</span>}>
            {totalOut === 0 ? <Empty>No sorted spending this fortnight yet.</Empty> : (
              <ul className="space-y-2 text-sm">
                {cats.spending.filter((c) => spent.get(c)).sort((a, b) => spent.get(b)! - spent.get(a)!).map((c) => (
                  <li key={c}>
                    <Link href={`/budget/transactions?from=${f.start}&to=${f.end}&category=${encodeURIComponent(c)}`} className="flex items-center gap-2 hover:text-accent">
                      <span className="w-6 text-center">{cats.info[c]?.icon ?? "🏷️"}</span>
                      <span className="flex-1">{c}</span>
                      <span className="tabular-nums">{money(spent.get(c)!)}</span>
                    </Link>
                    <div className="ml-8"><Progress value={spent.get(c)!} max={Math.max(totalOut, 1)} tone="info" /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {isNow && (
            <Card title="Bills still to come before payday" actions={<Link href="/budget/recurring" className="text-xs text-accent">All bills</Link>}>
              {billsAhead.length === 0 ? <Empty>No more bills before payday.</Empty> : (
                <ul className="divide-y divide-line text-sm">
                  {billsAhead.map((b, i) => (
                    <li key={`${b.id}-${i}`} className="flex items-center justify-between gap-2 py-1.5">
                      <span><span className="mr-2 text-xs text-muted">{short(b.date)}</span>{b.name}</span>
                      <span className="tabular-nums">{money(b.amount_cents)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between pt-2 font-medium"><span>Total</span><span className="tabular-nums">{money(billsAhead.reduce((s, b) => s + b.amount_cents, 0))}</span></li>
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <BankFeed />

          <Card title="Pay in">
            <div className="text-2xl font-semibold tabular-nums">{money(income.received)}</div>
            <p className="text-sm text-muted">
              {income.expected ? <>expected {money(income.expected)} a fortnight</> : <><Link href="/budget/setup" className="text-accent underline">Add your pay</Link> to compare</>}
              {totalPots > 0 && income.expected > 0 && totalPots !== income.expected && (
                <> · pots add up to {money(totalPots)} ({totalPots > income.expected ? "more" : "less"} than pay)</>
              )}
            </p>
          </Card>

          <Card title="Can we afford it?">
            {/* savings-only pots aren't for spending */}
            <Afford pots={status.filter((p) => !(p.cats.length === 1 && p.cats[0] === "Savings")).map((p) => ({ id: p.id, name: p.name, left: p.left }))} savePerFortnight={savings} />
          </Card>

          <PaydaySummary f={prev} pots={last} />

          <Link href="/budget/year" className={cx(btn.secondary, "w-full justify-center")}><CalendarClock size={15} /> Whole year</Link>
        </div>
      </div>
    </>
  );
}

function PotCard({ pot: p, daysLeft, lines, actual }: { pot: PotStatus; daysLeft: number; lines: BucketLine[]; actual: Map<number, number | null> }) {
  const over = p.left < 0;
  const isSaving = p.cats.length === 1 && p.cats[0] === "Savings";
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-muted">{p.name}</div>
          <div className={cx("text-2xl font-semibold tabular-nums", over && "text-danger")}>{isSaving ? money(p.spent) : money(Math.abs(p.left))}</div>
          <div className="text-xs text-muted">
            {isSaving ? <>moved to savings of {money(p.fortnightly_cents)}</> : <>{over ? "over" : "left"} of {money(p.fortnightly_cents)}</>}
            {!isSaving && daysLeft > 0 && p.left > 0 && <> · {money(Math.floor(p.left / daysLeft))}/day</>}
          </div>
        </div>
        {over && <Badge tone="bad">over</Badge>}
      </div>
      <div className="mt-2"><Progress value={Math.max(0, p.spent)} max={Math.max(p.fortnightly_cents, 1)} tone={over ? "bad" : p.left < p.fortnightly_cents * 0.2 ? "warn" : "good"} /></div>
      {p.cats.length === 0 && <p className="mt-1 text-xs text-muted">No spending comes out of this pot – it just holds money.</p>}
      {lines.length > 0 && (
        <details className="mt-2 border-t border-line pt-2">
          <summary className="cursor-pointer text-xs text-accent select-none">{lines.length} line{lines.length === 1 ? "" : "s"} · planned vs spent</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {lines.map((l) => {
              const a = actual.get(l.id);
              const over = a != null && a > l.budget_cents && l.budget_cents > 0;
              return (
                <li key={l.id} className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <span className={cx("tabular-nums", over ? "text-danger" : "text-muted")} title={a == null ? "Shares its category with another line, so it can't be told apart" : undefined}>
                    {a == null ? "–" : money(a)}
                  </span>
                  <span className="w-16 text-right tabular-nums">of {money(l.budget_cents)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** How the fortnight that just finished went – the same thing the payday notification says. */
function PaydaySummary({ f, pots }: { f: Fortnight; pots: PotStatus[] }) {
  const spentPots = pots.filter((p) => p.cats.length && !(p.cats.length === 1 && p.cats[0] === "Savings"));
  const spent = spentPots.reduce((s, p) => s + p.spent, 0);
  const planned = spentPots.reduce((s, p) => s + p.fortnightly_cents, 0);
  return (
    <Card title="Last fortnight" actions={<Link href={`/budget?f=${f.start}`} className="text-xs text-accent">Open</Link>}>
      <p className="text-sm">
        Spent <strong>{money(spent)}</strong> of {money(planned)} – {spent <= planned ? <span className="text-accent">{money(planned - spent)} left over</span> : <span className="text-danger">{money(spent - planned)} over</span>}.
      </p>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {spentPots.map((p) => (
          <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className={cx("tabular-nums", p.left < 0 && "text-danger")}>{p.left >= 0 ? `${money(p.left)} left` : `${money(-p.left)} over`}</span></li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">{short(f.start)} → {short(f.end)}{getSetting("payday_summary") !== "0" ? " · sent on payday" : ""}</p>
    </Card>
  );
}
