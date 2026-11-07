import Link from "next/link";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { billsIn, fortnightOf, pots, type Fortnight } from "@/lib/budget";
import { iso, money, today } from "@/lib/format";
import { Card, cx } from "@/components/ui";

/**
 * Payday to payday with each bill on the day it comes out, and a running total against the Bills pot –
 * so a fortnight where the bills add up to more than goes into the pot shows before it happens.
 */
export async function BillsTimeline() {
  const f = fortnightOf();
  if (!f) {
    return (
      <Card title="Bills timeline" className="mb-4">
        <p className="text-sm text-muted"><Link href="/budget/setup" className="text-accent underline">Set your payday</Link> to see this fortnight&apos;s bills laid out day by day.</p>
      </Card>
    );
  }
  return (
    <div className="mb-4 space-y-4">
      <Fortnightline f={f} title="This fortnight" />
    </div>
  );
}

async function Fortnightline({ f, title }: { f: Fortnight; title: string }) {
  const [bills, allPots] = await Promise.all([billsIn(f), pots()]);
  const billsPot = allPots.find((p) => p.categories.split(",").includes("Bills"));
  // only bills (and ones not sorted yet) come out of the Bills pot; transfers, savings and spending like fuel are listed but not counted
  const counted = bills.filter((b) => b.category === null || b.category === "Bills");
  const total = counted.reduce((s, b) => s + b.amount_cents, 0);
  const budget = billsPot?.fortnightly_cents ?? 0;
  const days = eachDayOfInterval({ start: parseISO(f.start), end: parseISO(f.end) }).map(iso);
  // each day's bills, with the running total of the ones from the Bills pot
  const perDay: { d: string; list: typeof bills; running: number }[] = [];
  for (const d of days) {
    const list = bills.filter((b) => b.date === d);
    const before = perDay.at(-1)?.running ?? 0;
    perDay.push({ d, list, running: before + list.filter((b) => counted.includes(b)).reduce((s, b) => s + b.amount_cents, 0) });
  }
  const shortOn = budget ? (perDay.find((x) => x.running > budget)?.d ?? null) : null;
  const t = today();

  return (
    <Card
      title={`${title} · ${format(parseISO(f.start), "d MMM")} → payday ${format(parseISO(f.payday), "EEE d MMM")}`}
      actions={<span className={cx("text-xs tabular-nums", budget && total > budget ? "text-danger" : "text-muted")}>{money(total)} of {budget ? money(budget) : "no Bills pot"}</span>}
    >
      {shortOn && (
        <p className="mb-3 rounded-lg bg-danger-soft p-2 text-sm text-danger">
          The bills add up to more than the {billsPot?.name ?? "Bills"} pot by {format(parseISO(shortOn), "EEE d MMM")} – {money(total - budget)} short this fortnight.
          {" "}<Link href="/budget/setup" className="underline">Change the pot</Link>
        </p>
      )}
      {/* a strip of the 14 days, payday first */}
      <div className="mb-3 grid grid-cols-7 gap-1 sm:grid-cols-14">
        {perDay.map(({ d, list }) => (
          <div key={d} className={cx("rounded-md border px-1 py-1 text-center text-[11px]", d === t ? "border-accent" : "border-line", list.length ? "bg-warn-soft" : "bg-surface")}>
            <div className="text-muted">{format(parseISO(d), "EEEEE")}</div>
            <div className="font-medium tabular-nums">{format(parseISO(d), "d")}</div>
            <div className="h-3 tabular-nums">{list.length ? `$${Math.round(list.reduce((s, b) => s + b.amount_cents, 0) / 100)}` : ""}</div>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line text-sm">
        {perDay.filter((x) => x.list.length).map(({ d, list, running }) => (
          <li key={d} className={cx("flex gap-3 py-1.5", d < t && "opacity-60")}>
            <span className="w-20 shrink-0 text-xs text-muted">{format(parseISO(d), "EEE d MMM")}</span>
            <span className="min-w-0 flex-1">
              {list.map((b, i) => (
                <span key={i} className="flex justify-between gap-2">
                  <span className={cx("truncate", !counted.includes(b) && "text-muted")}>
                    {b.name}{!counted.includes(b) && b.category ? ` (${b.category.toLowerCase()} – not from the Bills pot)` : ""}
                  </span>
                  <span className="tabular-nums">{money(b.amount_cents)}</span>
                </span>
              ))}
            </span>
            <span className={cx("w-24 shrink-0 text-right text-xs tabular-nums", budget && running > budget ? "text-danger" : "text-muted")}>{money(running)} so far</span>
          </li>
        ))}
        {bills.length === 0 && <li className="py-2 text-muted">No bills this fortnight.</li>}
      </ul>
    </Card>
  );
}
