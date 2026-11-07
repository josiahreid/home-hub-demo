import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import Loading from "./loading";
import { format } from "date-fns";
import { Camera, Gift, ListTodo, PlusCircle, Star, Upload } from "lucide-react";
import { all } from "@/lib/db";
import { addDays, iso, money, relDays, today } from "@/lib/format";
import { KIND_LABEL, KIND_TONE, upcoming } from "@/lib/upcoming";
import { familyToday } from "@/lib/workout";
import { findClashes, savingsNeeds, weeklyCapacity } from "@/lib/plans";
import { loadPlan } from "@/lib/budget-plan";
import { hasSampleData } from "@/lib/sample";
import { DEMO } from "@/lib/demo";
import { DeleteButton } from "@/components/buttons";
import { clearSampleData } from "./actions";
import { QuickGrocery } from "./quick-grocery";
import { toggleTodo } from "./todos/actions";
import { Badge, Card, Empty, Stat, btn } from "@/components/ui";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await io();
  const now = new Date();
  // workouts have their own line below, so they're not in the lists too
  const items = (await upcoming(today(), iso(addDays(now, 7)))).filter((i) => !i.workout);
  const workoutsToday = familyToday().filter((p) => p.planned.length || p.extra.length);
  const todays = items.filter((i) => i.date === today());
  const tomorrowBins = items.filter((i) => i.kind === "bin" && i.date === iso(addDays(now, 1)));
  // a chore repeats on the calendar; here just its next time is enough
  const later = items.filter((i, n) => i.date > today() && !(i.kind === "chore" && items.findIndex((x) => x.kind === "chore" && x.title === i.title) < n));

  const month = today().slice(0, 7);
  const [spend, overBudget] = await Promise.all([
    all<{ spent: number }>(
      `SELECT coalesce(-SUM(amount_cents), 0) AS spent FROM transactions
        WHERE amount_cents < 0 AND same_as IS NULL AND substr(date, 1, 7) = ? AND coalesce(category, '') NOT IN ('Transfers', 'Savings')`, month),
    all<{ category: string; spent: number; monthly_limit_cents: number }>(
      `SELECT b.category, -SUM(t.amount_cents) AS spent, b.monthly_limit_cents
         FROM budgets b JOIN transactions t ON t.category = b.category AND substr(t.date, 1, 7) = ? AND t.amount_cents < 0 AND t.same_as IS NULL
        GROUP BY b.category HAVING spent > b.monthly_limit_cents`, month),
  ]);
  const { needs } = await savingsNeeds();
  const { clashes } = findClashes(needs, weeklyCapacity());
  const plan = await loadPlan();
  // the public demo is all sample data – no "remove it" notice there
  const sample = !DEMO && (await hasSampleData());
  const todos = await all<{ id: number; title: string; due: string | null }>(
    "SELECT id, title, due FROM todos WHERE done_at IS NULL AND important = 1 ORDER BY due IS NULL, due, created_at DESC LIMIT 6");
  const giftHref = (await all<{ slug: string }>("SELECT slug FROM members WHERE (',' || features || ',') LIKE '%,wishlists,%' ORDER BY sort, id LIMIT 1"))
    .map((m) => `/${m.slug}/wishlist`)[0] ?? "/settings/family";
  const billsThisWeek = items.filter((i) => i.kind === "payment").reduce((s, i) => s + (i.amountCents ?? 0), 0);

  return (
    <>
      <header className="mb-6">
        <p className="text-sm text-muted">{format(now, "EEEE d MMMM")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting(now)}</h1>
      </header>

      {sample && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-info bg-info-soft p-3 text-sm text-info">
          <span>Sample data is showing in the tabs, alongside your real budget.</span>
          <DeleteButton action={clearSampleData} id={0} label="Remove sample data" confirmText="Remove all sample data? Your real budget, bills and payday stay." />
        </div>
      )}

      {tomorrowBins.length > 0 && (
        <div className="mb-4 rounded-xl border border-accent bg-accent-soft p-4 text-sm font-medium text-accent">
          🗑 Bins out tonight: {tomorrowBins.map((b) => b.title.replace(" bin out", "")).join(", ")}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Link href="/todos?add=1" className={`${btn.primary} col-span-2 sm:col-span-1`}><ListTodo size={16} /> To do</Link>
        <Link href="/budget/receipts" className={btn.secondary}><Camera size={16} /> Snap receipt</Link>
        <Link href="/calendar?add=1" className={btn.secondary}><PlusCircle size={16} /> Add event</Link>
        <Link href={giftHref} className={btn.secondary}><Gift size={16} /> Gift idea</Link>
        <Link href="/budget/import" className={btn.secondary}><Upload size={16} /> Import statement</Link>
      </div>

      <QuickGrocery />

      {workoutsToday.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="font-medium">💪 Today</span>
          {workoutsToday.map((p) => (
            <Link key={p.slug} href={`/${p.slug}/workout`} className="hover:text-accent">
              <span className="text-muted">{p.name}:</span>{" "}
              {[...p.planned.map((w) => `${w.name}${w.done ? " ✓" : ""}`), ...p.extra.map((n) => `${n} ✓`)].join(", ")}
              {p.planned.some((w) => !w.done) && <span className="text-xs text-muted"> (to do)</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spent this month" value={money(spend[0].spent)} />
        <Stat label="Bills next 7 days" value={money(billsThisWeek)} />
        <Link href="/budget/plan">
          <Stat
            label="Left each fortnight"
            value={plan.lines.length ? money(plan.afterOptions) : "—"}
            tone={plan.lines.length ? (plan.afterOptions >= 0 ? "good" : "bad") : "neutral"}
            hint={overBudget.length ? `Over budget: ${overBudget.map((o) => o.category).join(", ")}` : plan.lines.length ? "per the fortnight plan" : "load your budget"}
          />
        </Link>
        <Link href="/budget/plan">
          <Stat
            label="Savings runway"
            value={!plan.lines.length ? "—" : plan.runwayFortnights == null ? "OK" : `${plan.runwayFortnights.toFixed(1)} fn`}
            tone={plan.runwayFortnights == null ? "good" : plan.runwayFortnights < 6 ? "bad" : "warn"}
            hint={clashes.length ? `${clashes.length} savings goal clash${clashes.length === 1 ? "" : "es"}` : plan.runwayFortnights != null ? `≈ ${(plan.runwayFortnights * 14 / 30.4).toFixed(1)} months of savings left` : "not running down savings"}
          />
        </Link>
      </div>

      {todos.length > 0 && (
        <Card
          title={<span className="flex items-center gap-1"><Star size={14} className="text-warn" /> Important to-dos</span>}
          actions={<Link href="/todos" className="text-xs text-accent">All to-dos</Link>}
          className="mb-4"
        >
          <ul className="divide-y divide-line text-sm">
            {todos.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <form action={toggleTodo}>
                  <input type="hidden" name="id" value={t.id} />
                  <button aria-label="Mark done" className="h-5 w-5 rounded-full border-2 border-warn hover:bg-warn-soft" />
                </form>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.due && <Badge tone={t.due < today() ? "bad" : t.due === today() ? "warn" : "neutral"}>{relDays(t.due)}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Today">
          {todays.length === 0 ? <Empty>Nothing scheduled today.</Empty> : <ItemList items={todays} />}
        </Card>
        <Card title="Next 7 days" actions={<Link href="/calendar" className="text-xs text-accent">Calendar</Link>}>
          {later.length === 0 ? <Empty>A quiet week.</Empty> : <ItemList items={later} showDate />}
        </Card>
      </div>
    </>
  );
}

function ItemList({ items, showDate }: { items: Awaited<ReturnType<typeof upcoming>>; showDate?: boolean }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {items.map((i, n) => (
        <li key={n}>
          <Link href={i.href} className="flex items-center justify-between gap-2 py-2 hover:underline">
            <span className="min-w-0 truncate">
              {showDate && <span className="mr-2 inline-block w-14 text-xs text-muted">{format(new Date(i.date + "T00:00"), "EEE d")}</span>}
              {i.time && <span className="mr-1 text-xs text-muted">{i.time}</span>}
              {i.title}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {i.amountCents ? <span className="text-xs tabular-nums text-muted">{money(i.amountCents)}</span> : null}
              <Badge tone={KIND_TONE[i.kind]}>{KIND_LABEL[i.kind]}</Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
