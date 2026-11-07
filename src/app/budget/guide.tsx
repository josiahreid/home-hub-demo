import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { all } from "@/lib/db";
import { niceDate } from "@/lib/format";
import { detectRepeats } from "@/lib/repeats";
import { fortnightOf, unsortedCount } from "@/lib/budget";
import { cx } from "@/components/ui";

type Step = { title: string; how: ReactNode; status: string; done: boolean };

const A = ({ href, children }: { href: string; children: ReactNode }) => <Link href={href} className="font-medium text-accent underline">{children}</Link>;

/** The order to use the Budget in, with where each step is up to. Open until the setup steps are done. */
export async function BudgetGuide() {
  const [[tx], [pots], [income], [tracked], suggestions] = await Promise.all([
    all<{ n: number; last: string | null }>("SELECT count(*) AS n, max(date) AS last FROM transactions"),
    all<{ n: number }>("SELECT count(*) AS n FROM pots WHERE fortnightly_cents > 0"),
    all<{ n: number }>("SELECT count(*) AS n FROM income_sources WHERE included = 1"),
    all<{ n: number }>("SELECT count(*) AS n FROM recurring_payments"),
    detectRepeats(),
  ]);
  const unsorted = unsortedCount().recent;
  const payday = !!fortnightOf();

  const setup: Step[] = [
    {
      title: "Set up pay & pots",
      how: <>On <A href="/budget/setup">Pay &amp; pots</A>: your payday, what comes in, and how much goes into each pot (Bills, Food &amp; fuel, Spending…).</>,
      status: payday && pots.n && income.n ? `${pots.n} pots set` : [!payday && "no payday", !income.n && "no pay", !pots.n && "no pot amounts"].filter(Boolean).join(" · "),
      done: payday && pots.n > 0 && income.n > 0,
    },
    {
      title: "Upload your statements",
      how: <>On <A href="/budget/import">Upload statements</A>, press <strong>Choose a folder</strong> and pick your statements folder. Upload the same folder again any time – only new ones are added.</>,
      status: tx.n ? `${tx.n.toLocaleString()} transactions, up to ${niceDate(tx.last)}` : "Nothing uploaded yet",
      done: tx.n > 0,
    },
    {
      title: "Sort them",
      how: <><A href="/budget/sort">Sort</A> shows one transaction at a time – tap a category. &ldquo;Do all from this shop and remember&rdquo; sorts the rest from that shop and every future statement.</>,
      status: !tx.n ? "Upload statements first" : unsorted ? `${unsorted} to sort` : "All sorted",
      done: tx.n > 0 && unsorted === 0,
    },
    {
      title: "Check your bills",
      how: <>On <A href="/budget/recurring">Bills</A>, go through <strong>Spotted in your statements</strong>: <strong>Track it</strong> for real bills, <strong>Not a repeat</strong> for the rest.</>,
      status: `${tracked.n} tracked${suggestions.length ? ` · ${suggestions.length} to check` : ""}`,
      done: tracked.n > 0 && suggestions.length === 0,
    },
  ];
  const setupDone = setup.every((s) => s.done);

  return (
    <details open={!setupDone} className="group mb-4 rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 select-none">
        <span className="font-semibold">How to use the Budget</span>
        <span className="text-xs text-muted">
          {setupDone ? "Set up ✓ · " : `${setup.filter((s) => s.done).length} of ${setup.length} set up · `}
          <span className="group-open:hidden">show</span><span className="hidden group-open:inline">hide</span>
        </span>
      </summary>
      <div className="grid gap-6 border-t border-line p-4 lg:grid-cols-[3fr_2fr]">
        <div>
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">Setting up (once)</h3>
          <ol className="space-y-3">
            {setup.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className={cx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.done ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted")}>
                  {s.done ? <Check size={14} /> : i + 1}
                </span>
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{s.title}</div>
                  <p className="text-muted">{s.how}</p>
                  <p className={cx("mt-0.5 text-xs", s.done ? "text-accent" : "text-warn")}>{s.status}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">Every payday</h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
            <li><span className="text-ink">Upload the new statements</span> on <A href="/budget/import">Upload statements</A>.</li>
            <li><span className="text-ink">Sort the new ones</span> – a minute or two on <A href="/budget/sort">Sort</A>.</li>
            <li><span className="text-ink">Look at This fortnight</span> – what&apos;s left in each pot, and how last fortnight went (also sent to your phone on payday).</li>
            <li><span className="text-ink">Before buying something big</span>, try <strong>Can we afford it?</strong> on This fortnight.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">Saving for something? Add it on <A href="/budget/plans">Goals</A>.</p>
        </div>
      </div>
    </details>
  );
}
