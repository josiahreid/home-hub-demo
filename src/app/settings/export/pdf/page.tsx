import Link from "next/link";
import { io } from "next/cache";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { budgetExport } from "@/lib/budget-export";
import { POTS } from "@/lib/budget-sheet";
import { money, niceDate, shortDate } from "@/lib/format";
import { btn, cx } from "@/components/ui";
import { PrintButton } from "./print-button";

const th = "border-b border-line px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
const tdc = "border-b border-line px-2 py-1 align-top";
const num = "text-right tabular-nums whitespace-nowrap";

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="print-break-avoid mb-6">
      <h2 className="mb-2 border-b-2 border-accent pb-1 text-base font-semibold">{title}</h2>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}
      {children}
    </section>
  );
}

export default async function BudgetReport() {
  await io();
  const d = await budgetExport();
  const p = d.plan;

  return (
    <div className="mx-auto max-w-4xl text-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <PrintButton />
        <Link href="/settings/export" className={btn.ghost}>← Back</Link>
        <span className="text-xs text-muted">In the print window, choose <strong>Save as PDF</strong>.</span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Household budget</h1>
        <p className="text-muted">
          Home Hub · {format(d.generated, "EEEE d MMMM yyyy")} · all figures per fortnight unless marked
          {d.nextPayday && ` · next payday ${niceDate(d.nextPayday)}`}
        </p>
      </header>

      <Section title="Summary">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Income", money(p.incomeFn)],
            ["Planned outgoings", money(p.outgoingFn)],
            ["Left each fortnight", money(p.afterOptions)],
            ["Savings runway", p.runwayFortnights == null ? "Not running down" : `${p.runwayFortnights.toFixed(1)} fortnights`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line p-2">
              <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
              <div className={cx("text-lg font-semibold tabular-nums", k === "Left each fortnight" && p.afterOptions < 0 && "text-danger")}>{v}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Fortnight plan">
        <table className="w-full">
          <thead><tr><th className={th}></th><th className={cx(th, "text-right")}>Old</th><th className={cx(th, "text-right")}>Actual</th><th className={cx(th, "text-right")}>Plan</th><th className={th}>Notes</th></tr></thead>
          <tbody>
            {p.groups.map((g) => [
              <tr key={g.name} className="bg-surface-2 font-semibold">
                <td className={tdc}>{g.name}</td><td className={cx(tdc, num)}>{money(g.old)}</td><td className={cx(tdc, num)}>{money(g.actual)}</td><td className={cx(tdc, num)}>{money(g.budget)}</td><td className={tdc}></td>
              </tr>,
              ...g.items.map((l) => (
                <tr key={l.id}>
                  <td className={cx(tdc, "pl-5")}>{l.name}</td>
                  <td className={cx(tdc, num, "text-muted")}>{money(l.old_cents)}</td>
                  <td className={cx(tdc, num, "text-muted")}>{money(l.actual_cents)}</td>
                  <td className={cx(tdc, num)}>{money(l.budget_cents)}</td>
                  <td className={cx(tdc, "text-xs text-muted")}>{l.notes}</td>
                </tr>
              )),
            ])}
            <tr className="font-semibold"><td className={tdc}>Total outgoing</td><td className={tdc} /><td className={tdc} /><td className={cx(tdc, num)}>{money(p.outgoingFn)}</td><td className={tdc} /></tr>
            <tr className="font-semibold"><td className={tdc}>Income</td><td className={tdc} /><td className={tdc} /><td className={cx(tdc, num)}>{money(p.incomeFn)}</td><td className={tdc} /></tr>
            <tr className="font-semibold"><td className={tdc}>Left each fortnight</td><td className={tdc} /><td className={tdc} /><td className={cx(tdc, num, p.remaining < 0 && "text-danger")}>{money(p.remaining)}</td><td className={tdc} /></tr>
          </tbody>
        </table>
      </Section>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <Section title="Income">
          <table className="w-full"><tbody>
            {p.income.map((i) => (
              <tr key={i.id}>
                <td className={tdc}>{i.name}{!i.included && <span className="text-xs text-muted"> (not counted)</span>}{i.ends_on && <span className="text-xs text-muted"> · ends {shortDate(i.ends_on)}</span>}</td>
                <td className={cx(tdc, num)}>{money(i.fortnightly_cents)}</td>
              </tr>
            ))}
          </tbody></table>
        </Section>

        <Section title="Payday split">
          <table className="w-full"><tbody>
            {Object.entries(POTS).map(([key, pot]) => (
              <tr key={key}><td className={tdc}>{pot.label}</td><td className={cx(tdc, num)}>{money((p.pots.get(key) ?? []).reduce((s, l) => s + l.budget_cents, 0))}</td></tr>
            ))}
          </tbody></table>
        </Section>
      </div>

      <Section title="Ways to close the gap" note={`Chosen options save ${money(p.chosen)} a fortnight, leaving ${money(p.afterOptions)}.`}>
        <table className="w-full"><tbody>
          {p.options.map((o) => (
            <tr key={o.id}>
              <td className={cx(tdc, "w-6")}>{o.used ? "☑" : "☐"}</td>
              <td className={tdc}>{o.name}{o.notes && <div className="text-xs text-muted">{o.notes}</div>}</td>
              <td className={cx(tdc, num)}>{o.saves_cents ? money(o.saves_cents) : "—"}</td>
            </tr>
          ))}
        </tbody></table>
      </Section>

      <Section title="Savings runway" note={`Starting savings ${money(p.startingSavings)}${p.payOffDebts ? " (after paying off debts)" : ""} · ${money(p.afterOptions)} each fortnight${p.runwayFortnights != null ? ` · runs out in about ${p.runwayFortnights.toFixed(1)} fortnights` : ""}.`}>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <table className="w-full"><tbody>
            {p.balances.map((b) => (
              <tr key={b.id}><td className={cx(tdc, b.kind === "debt" && "text-danger")}>{b.name}</td><td className={cx(tdc, num)}>{money(b.amount_cents)}</td></tr>
            ))}
          </tbody></table>
          <div className="grid grid-cols-6 gap-1 text-center text-[11px]">
            {p.projection.map((v, i) => (
              <div key={i} className={cx("rounded border border-line p-1", v < 0 && "text-danger")}>
                <div className="text-muted">{i + 1}</div><div className="tabular-nums">{Math.round(v / 100).toLocaleString("en-NZ")}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Repeat payments">
        <table className="w-full">
          <thead><tr><th className={th}>Payment</th><th className={th}>How often</th><th className={th}>Next due</th><th className={cx(th, "text-right")}>Amount</th><th className={cx(th, "text-right")}>Per month</th></tr></thead>
          <tbody>
            {d.recurring.map((r, i) => (
              <tr key={i} className={r.active ? "" : "text-muted"}>
                <td className={tdc}>{r.name}{!r.active && " (paused)"}</td><td className={tdc}>{r.frequency}</td><td className={tdc}>{shortDate(r.next_due)}</td>
                <td className={cx(tdc, num)}>{money(r.amount_cents)}</td><td className={cx(tdc, num)}>{money(r.monthly_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {d.goals.length > 0 && (
        <Section title="Goals">
          <table className="w-full"><tbody>
            {d.goals.map((g, i) => (
              <tr key={i}><td className={tdc}>{g.name}</td><td className={tdc}>by {niceDate(g.target_date)}</td><td className={cx(tdc, num)}>{money(g.saved_cents)} of {money(g.target_cents)}</td><td className={tdc}>{g.status}</td></tr>
            ))}
          </tbody></table>
        </Section>
      )}

      {d.limits.length > 0 && (
        <Section title="Monthly category limits">
          <div className="columns-2 gap-6 sm:columns-3">
            {d.limits.map((l) => (
              <div key={l.category} className="flex justify-between border-b border-line py-0.5"><span>{l.category}</span><span className="tabular-nums">{money(l.monthly_limit_cents)}</span></div>
            ))}
          </div>
        </Section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 border-b-2 border-accent pb-1 text-base font-semibold">Transactions ({d.transactions.length})</h2>
        {d.transactions.length === 0 ? <p className="text-muted">None imported yet.</p> : (
          <table className="w-full text-xs">
            <thead><tr><th className={th}>Date</th><th className={th}>Description</th><th className={th}>Category</th><th className={cx(th, "text-right")}>Amount</th></tr></thead>
            <tbody>
              {d.transactions.map((t, i) => (
                <tr key={i} className="break-inside-avoid">
                  <td className={cx(tdc, "whitespace-nowrap")}>{shortDate(t.date)} {t.date.slice(0, 4)}</td>
                  <td className={tdc}>{t.description}</td>
                  <td className={cx(tdc, !t.category && "text-muted")}>{t.category ?? "Uncategorised"}</td>
                  <td className={cx(tdc, num, t.amount_cents > 0 && "text-accent")}>{money(t.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {d.receipts.length > 0 && (
        <Section title={`Receipts (${d.receipts.length})`}>
          <table className="w-full text-xs"><tbody>
            {d.receipts.map((r, i) => (
              <tr key={i}><td className={tdc}>{r.date ? niceDate(r.date) : "—"}</td><td className={tdc}>{r.store ?? "—"}{r.is_meal_prep ? " · meal prep" : ""}</td><td className={cx(tdc, num)}>{money(r.total_cents)}</td></tr>
            ))}
          </tbody></table>
        </Section>
      )}
    </div>
  );
}
