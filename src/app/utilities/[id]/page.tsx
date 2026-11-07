import Link from "next/link";
import { BankPayments } from "@/app/budget/bank-payments";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { fileUrl } from "@/lib/uploads";
import { daysUntil, money, niceDate, perMonth, relDays, shortDate, today } from "@/lib/format";
import { AddPanel, Badge, Card, cx, Empty, Field, FormGrid, Input, PageHeader, Stat, Table, td } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { CameraUpload } from "@/components/camera-upload";
import { addBill, addOffer, deleteBill, deleteOffer, deleteUtility, updateUtility } from "../actions";
import { UtilityFields } from "../fields";
import { CONTRACT_SOON_DAYS, DEFAULT_UNIT, TIPS, UTILITY_SELECT, type UtilityRow } from "../lib";

type Bill = {
  id: number;
  period_end: string;
  amount_cents: number;
  usage: number | null;
  usage_unit: string | null;
  file_name: string | null;
};
type Offer = {
  id: number;
  provider: string;
  plan: string | null;
  monthly_cents: number;
  url: string | null;
  notes: string | null;
  checked_on: string;
};

export default async function UtilityPage({ params }: PageProps<"/utilities/[id]">) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const u = await get<UtilityRow>(`${UTILITY_SELECT} WHERE u.id = ?`, id);
  if (!u) notFound();

  const [bills, offers] = await Promise.all([
    all<Bill>("SELECT * FROM utility_bills WHERE utility_id = ? ORDER BY period_end DESC, id DESC", id),
    all<Offer>("SELECT * FROM utility_offers WHERE utility_id = ? ORDER BY monthly_cents, checked_on DESC", id),
  ]);

  const monthly = u.amount_cents != null && u.frequency ? perMonth(u.amount_cents, u.frequency) : null;
  const best = offers[0];
  const bestSaving = best && monthly != null ? monthly - best.monthly_cents : 0;

  const recent = bills.slice(0, 12).reverse();
  const avg = recent.length ? Math.round(recent.reduce((s, b) => s + b.amount_cents, 0) / recent.length) : null;
  const max = Math.max(1, ...recent.map((b) => b.amount_cents));
  const usageBills = recent.filter((b) => b.usage != null);
  const avgUsage = usageBills.length ? usageBills.reduce((s, b) => s + (b.usage ?? 0), 0) / usageBills.length : null;
  const unit = bills.find((b) => b.usage_unit)?.usage_unit ?? DEFAULT_UNIT[u.kind] ?? "";

  const contractDays = u.contract_end ? daysUntil(u.contract_end) : null;
  const tip = TIPS[u.kind] ?? TIPS.Other;

  return (
    <>
      <Link href="/utilities" className="mb-2 inline-block text-sm text-muted hover:text-ink">← All utilities</Link>
      <PageHeader
        title={`${u.kind} – ${u.provider}`}
        subtitle={[u.plan, u.account_number && `Acct ${u.account_number}`].filter(Boolean).join(" · ") || undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Current cost"
          value={monthly != null ? `${money(monthly)}/mo` : "—"}
          hint={u.amount_cents != null && u.frequency ? `${money(u.amount_cents)} ${u.frequency}` : "No payment set"}
        />
        <Stat label="Per year" value={monthly != null ? money(monthly * 12) : "—"} />
        <Stat
          label={u.kind === "Mortgage" ? "Refix date" : "Contract end"}
          value={u.contract_end ? shortDate(u.contract_end) : "—"}
          tone={contractDays == null ? undefined : contractDays < 0 ? "bad" : contractDays <= CONTRACT_SOON_DAYS ? "warn" : undefined}
          hint={u.contract_end ? relDays(u.contract_end) : "Open term"}
        />
        <Stat
          label="Best offer"
          value={best ? `${money(best.monthly_cents)}/mo` : "—"}
          tone={bestSaving > 0 ? "good" : undefined}
          hint={
            best
              ? bestSaving > 0
                ? `Save ${money(bestSaving)}/mo · ${money(bestSaving * 12)}/yr`
                : "No cheaper offer logged"
              : "Log offers below"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ── bills ── */}
          <Card
            title="Bill history"
            actions={avg != null && <span className="text-sm text-muted">Avg {money(avg)}{avgUsage != null && ` · ${fmtUsage(avgUsage)} ${unit}`}</span>}
          >
            {recent.length > 1 && (
              <div className="mb-4">
                <div className="relative flex h-40 items-end gap-1.5 border-b border-line">
                  {avg != null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-warn"
                      style={{ bottom: `${(avg / max) * 100}%` }}
                    >
                      <span className="absolute -top-4 right-0 bg-surface px-1 text-[10px] text-warn">avg {money(avg)}</span>
                    </div>
                  )}
                  {recent.map((b) => (
                    <div
                      key={b.id}
                      className={cx("flex-1 rounded-t", avg != null && b.amount_cents > avg ? "bg-warn" : "bg-accent")}
                      style={{ height: `${Math.max(2, (b.amount_cents / max) * 100)}%` }}
                      title={`${niceDate(b.period_end)}: ${money(b.amount_cents)}${b.usage != null ? ` · ${b.usage} ${b.usage_unit ?? ""}` : ""}`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex gap-1.5">
                  {recent.map((b) => (
                    <div key={b.id} className="flex-1 truncate text-center text-[10px] text-muted">{shortDate(b.period_end)}</div>
                  ))}
                </div>
              </div>
            )}

            {bills.length === 0 ? (
              <Empty>No bills yet. Log each bill to see trends and compare offers on real usage.</Empty>
            ) : (
              <Table head={["Period end", "Amount", "Usage", "Bill", ""]}>
                {bills.map((b) => {
                  const url = fileUrl(b.file_name);
                  return (
                    <tr key={b.id}>
                      <td className={cx(td, "whitespace-nowrap")}>{niceDate(b.period_end)}</td>
                      <td className={cx(td, "tabular-nums")}>
                        {money(b.amount_cents)}
                        {avg != null && bills.length > 1 && b.amount_cents > avg * 1.15 && (
                          <span className="ml-2"><Badge tone="warn">high</Badge></span>
                        )}
                      </td>
                      <td className={cx(td, "tabular-nums")}>
                        {b.usage != null ? `${fmtUsage(b.usage)} ${b.usage_unit ?? ""}` : "—"}
                      </td>
                      <td className={td}>
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline">View</a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={cx(td, "text-right")}>
                        <DeleteButton action={deleteBill} id={b.id} confirmText="Delete this bill?" />
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <div className="mt-4">
              <AddPanel label="Add bill">
                <form action={addBill} className="space-y-3">
                  <input type="hidden" name="utility_id" value={u.id} />
                  <FormGrid>
                    <Field label="Period end *">
                      <Input name="period_end" type="date" required defaultValue={today()} />
                    </Field>
                    <Field label="Amount ($) *">
                      <Input name="amount" required inputMode="decimal" />
                    </Field>
                    <Field label="Usage">
                      <div className="flex gap-2">
                        <Input name="usage" inputMode="decimal" placeholder="e.g. 520" />
                        <Input name="usage_unit" defaultValue={unit} placeholder="kWh" className="!w-20" />
                      </div>
                    </Field>
                    <div className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
                      <span className="text-xs font-medium text-muted">Bill file (PDF / photo)</span>
                      <CameraUpload />
                    </div>
                  </FormGrid>
                  <SubmitButton>Add bill</SubmitButton>
                </form>
              </AddPanel>
            </div>
          </Card>

          {/* ── offers ── */}
          <Card title="Offers comparison">
            {offers.length === 0 ? (
              <Empty>Log quotes from other providers (as an estimated monthly cost) to see what you could save.</Empty>
            ) : (
              <Table head={["Provider", "Est. monthly", "vs current", "Checked", ""]}>
                {monthly != null && (
                  <tr className="bg-surface-2">
                    <td className={td}>
                      <div className="font-medium">{u.provider} <Badge>current</Badge></div>
                      {u.plan && <div className="text-xs text-muted">{u.plan}</div>}
                    </td>
                    <td className={cx(td, "tabular-nums font-medium")}>{money(monthly)}</td>
                    <td className={td} colSpan={3} />
                  </tr>
                )}
                {offers.map((o) => {
                  const diff = monthly != null ? monthly - o.monthly_cents : null;
                  return (
                    <tr key={o.id}>
                      <td className={td}>
                        <div className="font-medium">
                          {o.url ? (
                            <a href={o.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{o.provider}</a>
                          ) : (
                            o.provider
                          )}
                        </div>
                        {o.plan && <div className="text-xs text-muted">{o.plan}</div>}
                        {o.notes && <div className="text-xs text-muted">{o.notes}</div>}
                      </td>
                      <td className={cx(td, "tabular-nums")}>{money(o.monthly_cents)}</td>
                      <td className={td}>
                        {diff == null ? (
                          "—"
                        ) : diff > 0 ? (
                          <div>
                            <Badge tone="good">Save {money(diff)}/mo</Badge>
                            <div className="mt-0.5 text-xs text-accent">{money(diff * 12)}/yr</div>
                          </div>
                        ) : diff === 0 ? (
                          <span className="text-muted">Same</span>
                        ) : (
                          <span className="text-xs text-muted">+{money(-diff)}/mo dearer</span>
                        )}
                      </td>
                      <td className={cx(td, "whitespace-nowrap text-muted")}>
                        {shortDate(o.checked_on)}
                        <div className="text-xs">{relDays(o.checked_on)}</div>
                      </td>
                      <td className={cx(td, "text-right")}>
                        <DeleteButton action={deleteOffer} id={o.id} confirmText={`Delete offer from ${o.provider}?`} />
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <div className="mt-4">
              <AddPanel label="Add offer">
                <form action={addOffer} className="space-y-3">
                  <input type="hidden" name="utility_id" value={u.id} />
                  <FormGrid>
                    <Field label="Provider *">
                      <Input name="provider" required />
                    </Field>
                    <Field label="Plan">
                      <Input name="plan" />
                    </Field>
                    <Field label="Est. monthly cost ($) *">
                      <Input name="monthly" required inputMode="decimal" placeholder={monthly != null ? (monthly / 100).toFixed(2) : ""} />
                    </Field>
                    <Field label="Link">
                      <Input name="url" type="url" placeholder="https://" />
                    </Field>
                    <Field label="Checked on">
                      <Input name="checked_on" type="date" defaultValue={today()} />
                    </Field>
                    <Field label="Notes">
                      <Input name="notes" placeholder="12 month term, $200 credit…" />
                    </Field>
                  </FormGrid>
                  <SubmitButton>Add offer</SubmitButton>
                </form>
              </AddPanel>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <BankPayments recurringId={u.recurring_id} what="bill" />
          <Card title={tip.title}>
            <ul className="space-y-2 text-sm">
              {tip.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-accent">•</span>
                  <span>
                    {p.text}
                    {p.href && (
                      <>
                        {" "}
                        <a href={p.href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {new URL(p.href).hostname.replace(/^www\./, "")} ↗
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {u.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm">{u.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6">
        <AddPanel label="Edit details">
          <form action={updateUtility} className="space-y-3">
            <input type="hidden" name="id" value={u.id} />
            <UtilityFields u={u} defaultNextDue={today()} />
            <SubmitButton>Save</SubmitButton>
          </form>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
            <span className="text-xs text-muted">Also removes its recurring payment, bills and offers.</span>
            <DeleteButton
              action={deleteUtility}
              id={u.id}
              label="Delete"
              confirmText={`Delete ${u.kind} – ${u.provider} and all its bills and offers?`}
            />
          </div>
        </AddPanel>
      </div>
    </>
  );
}

function fmtUsage(n: number) {
  return n.toLocaleString("en-NZ", { maximumFractionDigits: 1 });
}
