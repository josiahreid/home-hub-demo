import { io } from "next/cache";
import Link from "next/link";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import { all } from "@/lib/db";
import { PER_YEAR, iso, money, type Frequency } from "@/lib/format";
import { POTS } from "@/lib/budget-sheet";
import { loadPlan } from "@/lib/budget-plan";
import { Badge, Card, Empty, PageHeader, Stat, Table, cx, td } from "@/components/ui";

const num = `${td} text-right tabular-nums`;

export default async function YearView() {
  await io();
  const p = await loadPlan();

  // the last 12 months of statements, but only from the first month there's anything imported
  const months = Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), 11 - i), "yyyy-MM"));
  const [spent, firstTx, unplanned] = await Promise.all([
    all<{ category: string | null; month: string; spent: number }>(
      `SELECT category, substr(date, 1, 7) AS month, -SUM(amount_cents) AS spent FROM transactions
        WHERE amount_cents < 0 AND same_as IS NULL AND date >= ? AND coalesce(category, '') NOT IN ('Transfers', 'Savings', 'Investing')
        GROUP BY category, month`, iso(startOfMonth(parseISO(`${months[0]}-01`)))),
    all<{ month: string | null }>("SELECT substr(min(date), 1, 7) AS month FROM transactions WHERE amount_cents < 0"),
    // repeat payments that don't come from a plan line (e.g. a yearly rego) – easy to forget in a fortnightly budget
    all<{ id: number; name: string; amount_cents: number; frequency: Frequency; category: string | null }>(
      `SELECT id, name, amount_cents, frequency, category FROM recurring_payments
        WHERE active = 1 AND same_as IS NULL AND id NOT IN (SELECT recurring_id FROM budget_lines WHERE recurring_id IS NOT NULL)
        ORDER BY amount_cents * CASE frequency WHEN 'weekly' THEN 52 WHEN 'fortnightly' THEN 26 WHEN 'monthly' THEN 12 WHEN 'quarterly' THEN 4 ELSE 1 END DESC`),
  ]);
  const shownMonths = firstTx[0]?.month ? months.filter((m) => m >= firstTx[0].month!) : [];

  const yearly = (fn: number) => fn * 26;
  const incomeYr = yearly(p.incomeFn);
  const outgoingYr = yearly(p.outgoingFn);
  const unplannedYr = unplanned.reduce((s, r) => s + r.amount_cents * PER_YEAR[r.frequency], 0);

  // actual spending per category per month, next to what the plan allows for that category over a year
  const byCat = new Map<string, Map<string, number>>();
  for (const r of spent) {
    const c = r.category ?? "Uncategorised";
    if (!byCat.has(c)) byCat.set(c, new Map());
    byCat.get(c)!.set(r.month, r.spent);
  }
  const plannedByCat = new Map<string, number>();
  for (const l of p.lines) if (l.category) plannedByCat.set(l.category, (plannedByCat.get(l.category) ?? 0) + yearly(l.budget_cents));
  const catRows = [...byCat]
    .map(([category, m]) => ({ category, m, total: shownMonths.reduce((s, mo) => s + (m.get(mo) ?? 0), 0) }))
    .sort((a, b) => b.total - a.total);
  const spentTotal = catRows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHeader title="Year view" subtitle="Every outgoing in the fortnight plan, worked out per week, fortnight, month and year (26 paydays)." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income / year" value={money(incomeYr)} />
        <Stat label="Planned outgoings / year" value={money(outgoingYr)} hint={`${money(Math.round(outgoingYr / 12))} a month`} />
        <Stat label="Left over / year" value={money(incomeYr - outgoingYr)} tone={incomeYr - outgoingYr >= 0 ? "good" : "bad"} hint="before ways to close the gap" />
        <Stat
          label="Repeat payments not in plan"
          value={money(unplannedYr)}
          tone={unplannedYr > 0 ? "warn" : "neutral"}
          hint={unplanned.length ? `${unplanned.length} payment${unplanned.length === 1 ? "" : "s"} a year` : "everything is in the plan"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Planned outgoings over the year" className="xl:col-span-2" actions={<Link href="/budget/plan" className="text-xs text-accent">Edit in Fortnight plan</Link>}>
          {p.lines.length === 0 ? (
            <Empty>No budget lines yet. <Link href="/budget/plan" className="text-accent underline">Build the fortnight plan</Link> first.</Empty>
          ) : (
            <Table head={["", "Week", "Fortnight", "Month", "Year", "Share"]}>
              {p.groups.map((g) => (
                <GroupYear key={g.name} name={g.name} items={g.items} total={p.outgoingFn} />
              ))}
              <tr className="font-semibold">
                <td className={td}>Total</td>
                <td className={num}>{money(Math.round(p.outgoingFn / 2))}</td>
                <td className={num}>{money(p.outgoingFn)}</td>
                <td className={num}>{money(Math.round(outgoingYr / 12))}</td>
                <td className={num}>{money(outgoingYr)}</td>
                <td className={num}>100%</td>
              </tr>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted">Week = fortnight ÷ 2 · Month = year ÷ 12 · Year = fortnight × 26.</p>
        </Card>

        <div className="space-y-4">
          <Card title="Each account over the year">
            <ul className="divide-y divide-line text-sm">
              {Object.entries(POTS).map(([key, pot]) => {
                const fn = (p.pots.get(key) ?? []).reduce((s, l) => s + l.budget_cents, 0);
                return (
                  <li key={key} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{pot.label}</div>
                      <div className="text-xs text-muted">{p.potAccounts.get(key) || `${money(fn)} each payday`}</div>
                    </div>
                    <span className="tabular-nums">{money(yearly(fn))}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-medium">
              <span>Left over (not allocated)</span>
              <span className={cx("tabular-nums", p.remaining < 0 && "text-danger")}>{money(yearly(p.remaining))}</span>
            </div>
          </Card>

          <Card title="Repeat payments not in the plan" actions={<Link href="/budget/recurring" className="text-xs text-accent">All</Link>}>
            {unplanned.length === 0 ? <Empty>None. Every repeat payment comes from a plan line.</Empty> : (
              <>
                <ul className="divide-y divide-line text-sm">
                  {unplanned.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted">{money(r.amount_cents)} {r.frequency}{r.category ? ` · ${r.category}` : ""}</div>
                      </div>
                      <span className="tabular-nums">{money(r.amount_cents * PER_YEAR[r.frequency])}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  These aren&apos;t counted in the fortnight plan. If one should be, add it as a line (you can enter it per year) so it&apos;s saved for each payday.
                </p>
              </>
            )}
          </Card>
        </div>
      </div>

      <Card title="Actual spending by month" className="mt-4">
        {shownMonths.length === 0 ? (
          <Empty>No spending imported yet. <Link href="/budget/import" className="text-accent underline">Import a bank statement</Link> to see it month by month.</Empty>
        ) : (
          <>
            <Table head={["Category", ...shownMonths.map((m) => format(parseISO(`${m}-01`), "MMM yy")), "Total", "Plan / year"]}>
              {catRows.map((r) => {
                const planned = plannedByCat.get(r.category);
                return (
                  <tr key={r.category}>
                    <td className={td}>
                      <Link href={`/budget/transactions?category=${encodeURIComponent(r.category)}`} className={cx("hover:underline", r.category === "Uncategorised" && "text-warn")}>{r.category}</Link>
                    </td>
                    {shownMonths.map((m) => (
                      <td key={m} className={`${num} text-muted`}>
                        {r.m.get(m) ? <Link href={`/budget/transactions?category=${encodeURIComponent(r.category)}&month=${m}`} className="hover:underline">{money(r.m.get(m))}</Link> : "—"}
                      </td>
                    ))}
                    <td className={`${num} font-medium`}>{money(r.total)}</td>
                    <td className={num}>{planned ? money(planned) : <Badge>not in plan</Badge>}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className={td}>Total</td>
                {shownMonths.map((m) => (
                  <td key={m} className={num}>{money(catRows.reduce((s, r) => s + (r.m.get(m) ?? 0), 0))}</td>
                ))}
                <td className={num}>{money(spentTotal)}</td>
                <td className={num}>{money(outgoingYr)}</td>
              </tr>
            </Table>
            <p className="mt-3 text-xs text-muted">
              From imported statements and transactions added by hand, {format(parseISO(`${shownMonths[0]}-01`), "MMMM yyyy")} onwards. Transfers and savings aren&apos;t counted as spending.
              {shownMonths.length < 12 && " Import older statements to fill in the rest of the year."}
            </p>
          </>
        )}
      </Card>
    </>
  );
}

function GroupYear({ name, items, total }: { name: string; items: Awaited<ReturnType<typeof loadPlan>>["lines"]; total: number }) {
  const fn = items.reduce((s, l) => s + l.budget_cents, 0);
  const share = (c: number) => (total > 0 ? `${((c / total) * 100).toFixed(1)}%` : "—");
  return (
    <>
      <tr className="bg-surface-2/60 font-medium">
        <td className={td}>{name}</td>
        <td className={num}>{money(Math.round(fn / 2))}</td>
        <td className={num}>{money(fn)}</td>
        <td className={num}>{money(Math.round((fn * 26) / 12))}</td>
        <td className={num}>{money(fn * 26)}</td>
        <td className={num}>{share(fn)}</td>
      </tr>
      {items.map((l) => (
        <tr key={l.id}>
          <td className={`${td} pl-6`}>
            {l.name}
            <div className="text-xs text-muted">{POTS[l.pot]?.label ?? l.pot}</div>
          </td>
          <td className={`${num} text-muted`}>{money(Math.round(l.budget_cents / 2))}</td>
          <td className={`${num} text-muted`}>{money(l.budget_cents)}</td>
          <td className={`${num} text-muted`}>{money(Math.round((l.budget_cents * 26) / 12))}</td>
          <td className={num}>{money(l.budget_cents * 26)}</td>
          <td className={`${num} text-muted`}>{share(l.budget_cents)}</td>
        </tr>
      ))}
    </>
  );
}
