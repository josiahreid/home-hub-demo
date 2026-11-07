import type { ReactNode } from "react";
import Link from "next/link";
import { all } from "@/lib/db";
import { daysUntil, money, perMonth, relDays, shortDate, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { addUtility } from "./actions";
import { UtilityFields } from "./fields";
import { CONTRACT_SOON_DAYS, UTILITY_SELECT, type UtilityRow } from "./lib";

export default async function UtilitiesPage() {
  const utilities = await all<UtilityRow>(`${UTILITY_SELECT} ORDER BY u.kind, u.provider`);
  const lastBills = await all<{ utility_id: number; period_end: string; amount_cents: number; usage: number | null; usage_unit: string | null }>(
    `SELECT b.utility_id, b.period_end, b.amount_cents, b.usage, b.usage_unit FROM utility_bills b
      WHERE b.id = (SELECT id FROM utility_bills WHERE utility_id = b.utility_id ORDER BY period_end DESC, id DESC LIMIT 1)`,
  );
  const cheapest = await all<{ utility_id: number; provider: string; plan: string | null; monthly_cents: number }>(
    `SELECT o.utility_id, o.provider, o.plan, o.monthly_cents FROM utility_offers o
      WHERE o.id = (SELECT id FROM utility_offers WHERE utility_id = o.utility_id ORDER BY monthly_cents, checked_on DESC LIMIT 1)`,
  );

  const rows = utilities.map((u) => {
    const monthly = u.amount_cents != null && u.frequency ? perMonth(u.amount_cents, u.frequency) : 0;
    const offer = cheapest.find((o) => o.utility_id === u.id);
    const saving = offer ? monthly - offer.monthly_cents : 0;
    return { ...u, monthly, offer, saving, lastBill: lastBills.find((b) => b.utility_id === u.id) };
  });

  const totalMonthly = rows.reduce((s, r) => s + r.monthly, 0);
  const biggest = rows.reduce<(typeof rows)[number] | undefined>((a, r) => (!a || r.monthly > a.monthly ? r : a), undefined);
  const potential = rows.reduce((s, r) => s + Math.max(0, r.saving), 0);

  return (
    <>
      <PageHeader title="Utilities" subtitle="Household running costs, bills and cheaper offers" />

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Per month" value={money(totalMonthly)} hint={`${rows.length} account${rows.length === 1 ? "" : "s"}`} />
          <Stat label="Per year" value={money(totalMonthly * 12)} />
          <Stat
            label="Biggest cost"
            value={biggest ? money(biggest.monthly) : "—"}
            hint={biggest ? `${biggest.kind} – ${biggest.provider}` : undefined}
          />
          <Stat
            label="Possible saving"
            value={potential > 0 ? `${money(potential)}/mo` : "—"}
            tone={potential > 0 ? "good" : undefined}
            hint={potential > 0 ? `${money(potential * 12)} a year from logged offers` : "Log offers to compare"}
          />
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3">
            <Empty>No utilities yet. Add power, internet, mortgage, rates and the like below.</Empty>
          </div>
        )}
        {rows.map((u) => {
          const contractDays = u.contract_end ? daysUntil(u.contract_end) : null;
          const share = totalMonthly > 0 ? Math.round((u.monthly / totalMonthly) * 100) : 0;
          return (
            <Link key={u.id} href={`/utilities/${u.id}`} className="block rounded-xl transition-shadow hover:shadow-md">
              <Card className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted">{u.kind}</div>
                    <div className="truncate text-lg font-semibold">{u.provider}</div>
                    {u.plan && <div className="truncate text-sm text-muted">{u.plan}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold tabular-nums">{money(u.monthly)}</div>
                    <div className="text-xs text-muted">/month · {share}%</div>
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 text-sm">
                  {u.amount_cents != null && u.frequency && u.frequency !== "monthly" && (
                    <Row label="Billed">
                      {money(u.amount_cents)} {u.frequency}
                    </Row>
                  )}
                  {u.amount_cents == null && (
                    <Row label="Payment">
                      <Badge tone="warn">Missing – edit to set amount</Badge>
                    </Row>
                  )}
                  {u.contract_end && (
                    <Row label={u.kind === "Mortgage" ? "Refix" : "Contract end"}>
                      {shortDate(u.contract_end)}{" "}
                      {contractDays != null && contractDays < 0 ? (
                        <Badge tone="bad">ended {relDays(u.contract_end)}</Badge>
                      ) : contractDays != null && contractDays <= CONTRACT_SOON_DAYS ? (
                        <Badge tone="warn">{relDays(u.contract_end)}</Badge>
                      ) : (
                        <span className="text-muted">({relDays(u.contract_end)})</span>
                      )}
                    </Row>
                  )}
                  <Row label="Last bill">
                    {u.lastBill ? (
                      <>
                        {money(u.lastBill.amount_cents)} <span className="text-muted">· {shortDate(u.lastBill.period_end)}</span>
                        {u.lastBill.usage != null && (
                          <span className="text-muted">
                            {" "}
                            · {u.lastBill.usage.toLocaleString("en-NZ")} {u.lastBill.usage_unit}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Row>
                </dl>

                <div className="mt-4">
                  {u.offer ? (
                    u.saving > 0 ? (
                      <div className="rounded-lg bg-accent-soft p-3 text-sm text-accent">
                        <div className="font-semibold">
                          Save {money(u.saving)}/mo · {money(u.saving * 12)}/yr
                        </div>
                        <div className="text-xs">
                          {u.offer.provider}
                          {u.offer.plan ? ` ${u.offer.plan}` : ""} at {money(u.offer.monthly_cents)}/mo
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
                        Cheapest logged offer {money(u.offer.monthly_cents)}/mo ({u.offer.provider}) — you&rsquo;re already on a good deal.
                      </div>
                    )
                  ) : (
                    <div className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">No offers logged yet</div>
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <AddPanel label="Add utility" open={rows.length === 0}>
        <form action={addUtility} className="space-y-3">
          <UtilityFields defaultNextDue={today()} />
          <p className="text-xs text-muted">Also adds a recurring payment to the budget and calendar.</p>
          <SubmitButton>Add utility</SubmitButton>
        </form>
      </AddPanel>
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
