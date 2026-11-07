import { Suspense } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { all } from "@/lib/db";
import { money, PER_YEAR, shortDate, type Frequency } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SubTabs } from "@/components/nav";

const TABS = [
  { href: "/house/chores", label: "Chores" },
  { href: "/house/cleaning", label: "Cleaning" },
  { href: "/house/projects", label: "Projects" },
  { href: "/house/quotes", label: "Quotes" },
  { href: "/house/businesses", label: "Businesses" },
];

export default function HouseLayout({ children }: LayoutProps<"/house">) {
  return (
    <div>
      <PageHeader title="House" subtitle="Chores, cleaning, renovation projects, quotes and the businesses you deal with" />
      {/* reads the database, so it streams in and never holds up the page */}
      <Suspense fallback={null}>
        <HouseInsurance />
      </Suspense>
      <SubTabs tabs={TABS} />
      {children}
    </div>
  );
}

/** The house and contents policies from the Insurance tab, one line each. */
async function HouseInsurance() {
  const policies = await all<{ id: number; kind: string; insurer: string; renewal_date: string | null; amount_cents: number | null; frequency: Frequency | null }>(
    `SELECT p.id, p.kind, p.insurer, p.renewal_date, r.amount_cents, r.frequency
       FROM insurance_policies p LEFT JOIN recurring_payments r ON r.id = p.recurring_id
      WHERE p.kind IN ('House', 'Contents') ORDER BY p.kind`,
  );
  return (
    <div className="-mt-2 mb-4 flex flex-wrap gap-2 text-xs">
      {policies.length === 0 ? (
        <Link href="/insurance" className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-muted hover:text-ink">
          <Shield size={13} /> Add house &amp; contents insurance
        </Link>
      ) : (
        policies.map((p) => (
          <Link key={p.id} href={`/insurance/${p.id}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 hover:bg-surface-2">
            <Shield size={13} className="text-accent" />
            <span className="font-medium">{p.kind}</span> · {p.insurer}
            {p.amount_cents != null && p.frequency && <> · {money(p.amount_cents * PER_YEAR[p.frequency])}/yr</>}
            {p.renewal_date && <span className="text-muted"> · renews {shortDate(p.renewal_date)}</span>}
          </Link>
        ))
      )}
    </div>
  );
}
