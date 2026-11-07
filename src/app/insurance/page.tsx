import type { ReactNode } from "react";
import Link from "next/link";
import { BellRing, Siren } from "lucide-react";
import { all, getSetting } from "@/lib/db";
import { members } from "@/lib/members";
import { daysUntil, money, perMonth, relDays, shortDate, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, Input, PageHeader, Stat, btn, cx } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { addPolicy, setRemindDays } from "./actions";
import { fieldOptions, PolicyFields } from "./fields";
import { DEFAULT_REMIND_DAYS, KIND_ICON, KINDS, POLICY_SELECT, RENEWAL_SOON_DAYS, peopleOf, policyTitle, yearly, type PolicyRow } from "./lib";

export default async function InsurancePage({ searchParams }: PageProps<"/insurance">) {
  const sp = await searchParams;
  const [policies, docCounts, openClaims, family, options] = await Promise.all([
    all<PolicyRow>(`${POLICY_SELECT} ORDER BY p.kind, p.covers, p.insurer`),
    all<{ policy_id: number; n: number }>("SELECT policy_id, count(*) AS n FROM insurance_docs GROUP BY policy_id"),
    all<{ policy_id: number; n: number }>("SELECT policy_id, count(*) AS n FROM insurance_claims WHERE status IN ('open', 'approved') GROUP BY policy_id"),
    members(),
    fieldOptions(),
  ]);
  const who = typeof sp.who === "string" && family.some((m) => m.slug === sp.who) ? sp.who : null;
  const nameOf = (slug: string) => family.find((m) => m.slug === slug)?.name ?? slug;
  const remindDays = Number(getSetting("insurance_remind_days") ?? DEFAULT_REMIND_DAYS);

  const all_ = policies
    .map((p) => ({
      ...p,
      yearly: yearly(p.amount_cents, p.frequency) ?? 0,
      docs: docCounts.find((d) => d.policy_id === p.id)?.n ?? 0,
      claims: openClaims.find((c) => c.policy_id === p.id)?.n ?? 0,
      covered: peopleOf(p),
    }))
    .sort((a, b) => KINDS.indexOf(a.kind as (typeof KINDS)[number]) - KINDS.indexOf(b.kind as (typeof KINDS)[number]));
  // a person's view: their own policies plus the household ones
  const rows = who ? all_.filter((p) => p.covered.length === 0 || p.covered.includes(who)) : all_;

  const totalYear = rows.reduce((s, r) => s + r.yearly, 0);
  const totalMonth = rows.reduce((s, r) => s + (r.amount_cents != null && r.frequency ? perMonth(r.amount_cents, r.frequency) : 0), 0);
  const nextRenewal = rows.filter((r) => r.renewal_date && r.renewal_date >= today()).sort((a, b) => a.renewal_date!.localeCompare(b.renewal_date!))[0];
  const noDocs = rows.filter((r) => r.docs === 0).length;

  return (
    <>
      <PageHeader
        title="Insurance"
        subtitle="Every policy: what it costs, when it renews, and its documents"
        actions={all_.length > 0 && <Link href="/insurance/card" className={btn.secondary}><Siren size={15} /> Emergency card</Link>}
      />

      {all_.length > 0 && family.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {[{ slug: null, name: "Everyone" }, ...family].map((m) => (
            <Link
              key={m.slug ?? "all"}
              href={m.slug ? `/insurance?who=${m.slug}` : "/insurance"}
              className={cx("rounded-full border px-3 py-1", who === m.slug ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2")}
            >
              {m.name}
            </Link>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Per year" value={money(totalYear)} hint={`${rows.length} polic${rows.length === 1 ? "y" : "ies"}${who ? ` for ${nameOf(who)} (incl. household)` : ""}`} />
          <Stat label="Per month" value={money(totalMonth)} hint={`about ${money(Math.round(totalYear / 26))} a fortnight`} />
          <Stat
            label="Next renewal"
            value={nextRenewal ? shortDate(nextRenewal.renewal_date) : "—"}
            tone={nextRenewal && daysUntil(nextRenewal.renewal_date!) <= RENEWAL_SOON_DAYS ? "warn" : undefined}
            hint={nextRenewal ? `${policyTitle(nextRenewal)} · ${relDays(nextRenewal.renewal_date)}` : "Add renewal dates"}
          />
          <Stat
            label="Documents"
            value={noDocs ? `${noDocs} missing` : "All saved"}
            tone={noDocs ? "warn" : "good"}
            hint={noDocs ? "Policies with no documents yet" : "Every policy has a document"}
          />
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3">
            <Empty>{all_.length ? "No policies for this person yet." : "No policies yet. Add car, house, contents, life, health and the rest below."}</Empty>
          </div>
        )}
        {rows.map((p) => {
          const days = p.renewal_date ? daysUntil(p.renewal_date) : null;
          return (
            <Link key={p.id} href={`/insurance/${p.id}`} className="block rounded-xl transition-shadow hover:shadow-md">
              <Card className="h-full">
                {/* the cost first */}
                <div className="flex items-baseline justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <span className="text-2xl font-semibold tabular-nums">{p.amount_cents != null ? money(p.amount_cents) : "—"}</span>
                    <span className="text-sm text-muted"> {p.frequency ?? ""}</span>
                  </div>
                  <span className="text-sm text-muted tabular-nums">{money(p.yearly)}/yr</span>
                </div>

                <div className="mt-3 flex items-start gap-2">
                  <span className="text-2xl leading-none">{KIND_ICON[p.kind] ?? KIND_ICON.Other}</span>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{policyTitle(p)}</div>
                    <div className="truncate text-sm text-muted">{p.insurer}{p.policy_number && ` · ${p.policy_number}`}</div>
                  </div>
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="Covers">{p.covered.length ? p.covered.map(nameOf).join(" & ") : <span className="text-muted">Household</span>}</Row>
                  <Row label="Renews">
                    {p.renewal_date ? (
                      <>
                        {shortDate(p.renewal_date)}{" "}
                        {days! < 0 ? <Badge tone="bad">{relDays(p.renewal_date)}</Badge>
                          : days! <= RENEWAL_SOON_DAYS ? <Badge tone="warn">{relDays(p.renewal_date)}</Badge>
                          : <span className="text-muted">({relDays(p.renewal_date)})</span>}
                      </>
                    ) : <span className="text-muted">—</span>}
                  </Row>
                  {p.excess_cents != null && <Row label="Excess">{money(p.excess_cents)}</Row>}
                  {p.sum_insured_cents != null && <Row label="Cover">{money(p.sum_insured_cents)}</Row>}
                  <Row label="Documents">{p.docs ? p.docs : <Badge tone="warn">none yet</Badge>}</Row>
                  {p.claims > 0 && <Row label="Claims"><Badge tone="warn">{p.claims} open</Badge></Row>}
                </dl>
              </Card>
            </Link>
          );
        })}
      </div>

      <AddPanel label="Add policy" open={all_.length === 0}>
        <form action={addPolicy} className="space-y-3">
          <PolicyFields defaultNextDue={today()} options={options} />
          <p className="text-xs text-muted">The cost is also added to the budget&apos;s bills and the calendar. Upload documents on the next page.</p>
          <SubmitButton>Add policy</SubmitButton>
        </form>
      </AddPanel>

      {all_.length > 0 && (
        <Card className="mt-6 max-w-xl" title={<span className="inline-flex items-center gap-2"><BellRing size={15} /> Renewal reminders</span>}>
          <p className="mb-3 text-sm text-muted">
            {remindDays > 0
              ? <>A push notification (and Telegram, if it&apos;s connected) goes to everyone <strong>{remindDays} days</strong> before each renewal – time to get quotes. Set 0 to turn it off.</>
              : <>Reminders are off. Set how many days before each renewal to get a &ldquo;time to get quotes&rdquo; push notification (and Telegram).</>}
          </p>
          <form action={setRemindDays} className="flex items-end gap-2">
            <Field label="Days before renewal">
              <Input name="days" type="number" min={0} max={120} defaultValue={remindDays} className="!w-28" />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </form>
        </Card>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
