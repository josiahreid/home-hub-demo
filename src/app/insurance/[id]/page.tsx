import type { ReactNode } from "react";
import Link from "next/link";
import { BankPayments } from "@/app/budget/bank-payments";
import { notFound } from "next/navigation";
import { addYears } from "date-fns";
import { FileText, Phone } from "lucide-react";
import { all, get } from "@/lib/db";
import { members } from "@/lib/members";
import { fileUrl } from "@/lib/uploads";
import { centsToInput, daysUntil, FREQUENCIES, iso, money, parseISO, relDays, shortDate, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, PageHeader, Select, Stat, Table, Textarea, cx, td } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { CameraUpload } from "@/components/camera-upload";
import {
  addClaim, addDocument, addQuote, deleteClaim, deleteDocument, deletePolicy, deleteQuote, markRenewed, updateClaim, updatePolicy,
} from "../actions";
import { fieldOptions, PolicyFields } from "../fields";
import {
  CLAIM_STATUSES, CLAIM_TONE, DOC_KINDS, KIND_ICON, POLICY_SELECT, RENEWAL_SOON_DAYS, TIPS, peopleOf, policyTitle, yearly,
  type Claim, type PolicyDoc, type PolicyRow, type Price, type Quote,
} from "../lib";

export default async function PolicyPage({ params, searchParams }: PageProps<"/insurance/[id]">) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const p = await get<PolicyRow>(`${POLICY_SELECT} WHERE p.id = ?`, id);
  if (!p) notFound();
  const sp = await searchParams;
  const editClaim = Number(sp.editClaim) || null;
  const [docs, claims, quotes, prices, family, options, vehicle] = await Promise.all([
    all<PolicyDoc>("SELECT * FROM insurance_docs WHERE policy_id = ? ORDER BY added_on DESC, id DESC", id),
    all<Claim>("SELECT * FROM insurance_claims WHERE policy_id = ? ORDER BY date DESC, id DESC", id),
    all<Quote>("SELECT * FROM insurance_quotes WHERE policy_id = ? ORDER BY checked_on DESC, id DESC", id),
    all<Price>("SELECT * FROM insurance_prices WHERE policy_id = ? ORDER BY date, id", id),
    members(),
    fieldOptions(),
    p.vehicle_id ? get<{ id: number; name: string }>("SELECT id, name FROM vehicles WHERE id = ?", p.vehicle_id) : null,
  ]);

  const perYear = yearly(p.amount_cents, p.frequency);
  const days = p.renewal_date ? daysUntil(p.renewal_date) : null;
  const nextRenewal = p.renewal_date ? iso(addYears(parseISO(p.renewal_date), 1)) : iso(addYears(new Date(), 1));
  const covered = peopleOf(p).map((s) => family.find((m) => m.slug === s)?.name ?? s);
  const policyDocs = docs.filter((d) => d.claim_id == null || !claims.some((c) => c.id === d.claim_id));

  // quotes compared on a yearly basis, cheapest first
  const compared = quotes
    .map((q) => ({ ...q, perYear: yearly(q.amount_cents, q.frequency)! }))
    .sort((a, b) => a.perYear - b.perYear);
  const best = compared[0];
  const saving = best && perYear != null ? perYear - best.perYear : 0;

  // price history, oldest first, with the change from the one before
  const history = prices.map((pr, i) => {
    const y = yearly(pr.amount_cents, pr.frequency)!;
    const prev = i > 0 ? yearly(prices[i - 1].amount_cents, prices[i - 1].frequency)! : null;
    return { ...pr, perYear: y, change: prev ? (y - prev) / prev : null };
  });
  const firstYear = history[0]?.perYear;
  const lastYear = history.at(-1)?.perYear;

  return (
    <>
      <Link href="/insurance" className="mb-2 inline-block text-sm text-muted hover:text-ink">← All insurance</Link>
      <PageHeader
        title={`${KIND_ICON[p.kind] ?? KIND_ICON.Other} ${policyTitle(p)}`}
        subtitle={[p.insurer, p.policy_number && `Policy ${p.policy_number}`, covered.length ? `Covers ${covered.join(" & ")}` : null].filter(Boolean).join(" · ")}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Cost"
          value={p.amount_cents != null ? money(p.amount_cents) : "—"}
          hint={p.frequency ? `${p.frequency}${p.next_due ? ` · next ${shortDate(p.next_due)}` : ""}` : "No payment set"}
        />
        <Stat label="Per year" value={perYear != null ? money(perYear) : "—"} />
        <Stat
          label="Renews"
          value={p.renewal_date ? shortDate(p.renewal_date) : "—"}
          tone={days == null ? undefined : days < 0 ? "bad" : days <= RENEWAL_SOON_DAYS ? "warn" : undefined}
          hint={p.renewal_date ? `${p.renewal_date.slice(0, 4)} · ${relDays(p.renewal_date)}` : "Add the renewal date"}
        />
        <Stat
          label="Best quote"
          value={best ? `${money(best.perYear)}/yr` : "—"}
          tone={saving > 0 ? "good" : undefined}
          hint={best ? (saving > 0 ? `${best.insurer} – save ${money(saving)} a year` : "You're already on the cheapest") : "Add quotes below"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ── documents ── */}
          <Card title="Documents" actions={<span className="text-xs text-muted">{policyDocs.length} saved</span>}>
            {policyDocs.length === 0 ? (
              <Empty>No documents yet. Start with the policy schedule – the page with your cover, excess and sum insured.</Empty>
            ) : (
              <DocList docs={policyDocs} />
            )}
            <div className="mt-4">
              <AddPanel label="Upload document" open={docs.length === 0}>
                <UploadForm policyId={p.id} defaultKind={docs.length === 0 ? "Policy schedule" : "Other"} />
              </AddPanel>
            </div>
          </Card>

          {/* ── quotes ── */}
          <Card title="Quotes from other insurers" actions={perYear != null && <span className="text-xs text-muted">You pay {money(perYear)}/yr</span>}>
            {compared.length === 0 ? (
              <Empty>Before it renews, get a few quotes and log them here to see what you&apos;d save.</Empty>
            ) : (
              <Table head={["Insurer", "Price", "Per year", "vs now", "Checked", ""]}>
                {compared.map((q) => {
                  const diff = perYear != null ? perYear - q.perYear : null;
                  return (
                    <tr key={q.id}>
                      <td className={td}>
                        <div className="font-medium">
                          {q.url ? <a href={q.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{q.insurer}</a> : q.insurer}
                        </div>
                        <div className="text-xs text-muted">
                          {[q.excess_cents != null && `excess ${money(q.excess_cents)}`, q.notes].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className={cx(td, "whitespace-nowrap tabular-nums")}>{money(q.amount_cents)} <span className="text-xs text-muted">{q.frequency}</span></td>
                      <td className={cx(td, "tabular-nums")}>{money(q.perYear)}</td>
                      <td className={td}>
                        {diff == null ? "—" : diff > 0 ? <Badge tone="good">save {money(diff)}</Badge> : diff === 0 ? <span className="text-muted">same</span> : <span className="text-xs text-muted">{money(-diff)} dearer</span>}
                      </td>
                      <td className={cx(td, "whitespace-nowrap text-muted")}>{shortDate(q.checked_on)}</td>
                      <td className={cx(td, "text-right")}>
                        <DeleteButton action={deleteQuote} id={q.id} confirmText={`Delete the ${q.insurer} quote?`} />
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
            {p.excess_cents != null && compared.some((q) => q.excess_cents != null && q.excess_cents !== p.excess_cents) && (
              <p className="mt-2 text-xs text-muted">Your excess now is {money(p.excess_cents)} – compare like with like.</p>
            )}
            <div className="mt-4">
              <AddPanel label="Add quote">
                <form action={addQuote} className="space-y-3">
                  <input type="hidden" name="policy_id" value={p.id} />
                  <FormGrid>
                    <Field label="Insurer *"><Input name="insurer" required /></Field>
                    <Field label="Price ($) *"><Input name="amount" required inputMode="decimal" /></Field>
                    <Field label="Paid">
                      <Select name="frequency" defaultValue={p.frequency ?? "yearly"} options={FREQUENCIES} />
                    </Field>
                    <Field label="Excess ($)"><Input name="excess" inputMode="decimal" defaultValue={centsToInput(p.excess_cents)} /></Field>
                    <Field label="Link"><Input name="url" type="url" placeholder="https://" /></Field>
                    <Field label="Checked on"><Input name="checked_on" type="date" defaultValue={today()} /></Field>
                  </FormGrid>
                  <Field label="Notes"><Input name="notes" placeholder="Agreed value, roadside assist, multi-policy discount…" /></Field>
                  <SubmitButton>Add quote</SubmitButton>
                </form>
              </AddPanel>
            </div>
          </Card>

          {/* ── claims ── */}
          <Card title="Claims" actions={claims.length > 0 && <span className="text-xs text-muted">{claims.length} logged</span>}>
            {claims.length === 0 ? (
              <Empty>No claims. If you ever claim, log it here with its claim number, photos and letters.</Empty>
            ) : (
              <ul className="space-y-3">
                {claims.map((c) => {
                  const cDocs = docs.filter((d) => d.claim_id === c.id);
                  return (
                    <li key={c.id} className="rounded-lg border border-line p-3">
                      {editClaim === c.id ? (
                        <form action={updateClaim} className="space-y-3">
                          <input type="hidden" name="id" value={c.id} />
                          <ClaimFields c={c} />
                          <div className="flex gap-2">
                            <SubmitButton>Save</SubmitButton>
                            <Link href={`/insurance/${p.id}`} className="text-sm text-muted hover:text-ink">Cancel</Link>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{c.what}</div>
                              <div className="text-xs text-muted">
                                {shortDate(c.date)} {c.date.slice(0, 4)}{c.claim_number && ` · claim ${c.claim_number}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge tone={CLAIM_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                              <Link href={`/insurance/${p.id}?editClaim=${c.id}`} className="text-xs text-accent hover:underline">Edit</Link>
                              <DeleteButton action={deleteClaim} id={c.id} confirmText="Delete this claim? Its documents stay with the policy." />
                            </div>
                          </div>
                          {(c.excess_cents != null || c.payout_cents != null) && (
                            <div className="mt-2 flex gap-4 text-sm">
                              {c.excess_cents != null && <span><span className="text-muted">Excess paid </span>{money(c.excess_cents)}</span>}
                              {c.payout_cents != null && <span><span className="text-muted">Paid out </span>{money(c.payout_cents)}</span>}
                            </div>
                          )}
                          {c.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{c.notes}</p>}
                          {cDocs.length > 0 && <div className="mt-2"><DocList docs={cDocs} /></div>}
                          <div className="mt-2">
                            <AddPanel label="Add photo / letter">
                              <UploadForm policyId={p.id} claimId={c.id} defaultKind="Claim" />
                            </AddPanel>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4">
              <AddPanel label="Log a claim">
                <form action={addClaim} className="space-y-3">
                  <input type="hidden" name="policy_id" value={p.id} />
                  <ClaimFields excess={p.excess_cents} />
                  <SubmitButton>Log claim</SubmitButton>
                </form>
              </AddPanel>
            </div>
          </Card>

          <BankPayments recurringId={p.recurring_id} what="policy" />

          {/* ── renewal ── */}
          <Card title="Renewed?">
            <p className="mb-3 text-sm text-muted">When it renews, set the new date and price – the budget, calendar and price history follow.</p>
            <form action={markRenewed} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Next renewal">
                <Input name="renewal_date" type="date" required defaultValue={nextRenewal} />
              </Field>
              <Field label={`New cost ($${p.frequency ? `, ${p.frequency}` : ""})`}>
                <Input name="amount" inputMode="decimal" defaultValue={centsToInput(p.amount_cents)} />
              </Field>
              <SubmitButton>Save renewal</SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="If you need to claim">
            <dl className="space-y-1.5 text-sm">
              <Row label="Insurer">{p.insurer}</Row>
              <Row label="Policy number">{p.policy_number ? <span className="font-mono">{p.policy_number}</span> : "—"}</Row>
              <Row label="Claims phone">
                {p.claims_phone ? (
                  <a href={`tel:${p.claims_phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 text-accent hover:underline"><Phone size={13} />{p.claims_phone}</a>
                ) : "—"}
              </Row>
              <Row label="Website">
                {p.website ? <a href={p.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">{hostOf(p.website)} ↗</a> : "—"}
              </Row>
              <Row label="Excess">{p.excess_cents != null ? money(p.excess_cents) : "—"}</Row>
              {p.sum_insured_cents != null && <Row label="Cover">{money(p.sum_insured_cents)}</Row>}
              {vehicle && <Row label="Car"><Link href={`/car/${vehicle.id}`} className="text-accent hover:underline">{vehicle.name}</Link></Row>}
            </dl>
          </Card>

          <Card title="Price history">
            {history.length === 0 ? (
              <Empty>Starts with the next price change.</Empty>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm">
                  {[...history].reverse().map((h) => (
                    <li key={h.id} className="flex items-baseline justify-between gap-2">
                      <span className="text-muted">{shortDate(h.date)} {h.date.slice(0, 4)}</span>
                      <span className="tabular-nums">
                        {money(h.perYear)}/yr
                        {h.change != null && (
                          <span className={cx("ml-2 text-xs", h.change > 0 ? "text-danger" : "text-accent")}>
                            {h.change > 0 ? "▲" : "▼"} {Math.abs(Math.round(h.change * 100))}%
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {history.length > 1 && firstYear && lastYear && (
                  <p className="mt-3 text-xs text-muted">
                    {lastYear > firstYear ? "Up" : "Down"} {money(Math.abs(lastYear - firstYear))} a year ({Math.round(Math.abs(lastYear - firstYear) / firstYear * 100)}%) since {shortDate(history[0].date)} {history[0].date.slice(0, 4)}.
                  </p>
                )}
              </>
            )}
          </Card>

          {p.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm">{p.notes}</p>
            </Card>
          )}

          <Card title="Saving on insurance">
            <ul className="space-y-2 text-sm">
              {TIPS.map((t) => (
                <li key={t} className="flex gap-2"><span className="text-accent">•</span><span>{t}</span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <AddPanel label="Edit details">
          <form action={updatePolicy} className="space-y-3">
            <input type="hidden" name="id" value={p.id} />
            <PolicyFields p={p} defaultNextDue={today()} options={options} />
            <SubmitButton>Save</SubmitButton>
          </form>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
            <span className="text-xs text-muted">Also removes its payment from the budget and deletes its documents, claims and quotes.</span>
            <DeleteButton action={deletePolicy} id={p.id} label="Delete" confirmText={`Delete ${policyTitle(p)} (${p.insurer}) and all its documents, claims and quotes?`} />
          </div>
        </AddPanel>
      </div>
    </>
  );
}

function DocList({ docs }: { docs: PolicyDoc[] }) {
  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => {
        const url = fileUrl(d.file_name)!;
        const isPdf = d.file_name.toLowerCase().endsWith(".pdf");
        return (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <a href={url} target="_blank" rel="noreferrer" title="Open" className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
              {isPdf ? (
                <FileText size={20} className="text-muted" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-full w-full object-cover" />
              )}
            </a>
            <div className="min-w-0 flex-1">
              <a href={url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-accent">{d.title}</a>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone={d.kind === "Policy schedule" ? "info" : "neutral"}>{d.kind}</Badge>
                {shortDate(d.added_on)}
              </div>
            </div>
            <DeleteButton action={deleteDocument} id={d.id} confirmText={`Delete "${d.title}"? The file is removed too.`} />
          </li>
        );
      })}
    </ul>
  );
}

function UploadForm({ policyId, claimId, defaultKind }: { policyId: number; claimId?: number; defaultKind: string }) {
  return (
    <form action={addDocument} className="space-y-3">
      <input type="hidden" name="policy_id" value={policyId} />
      {claimId && <input type="hidden" name="claim_id" value={claimId} />}
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted">PDF or photo *</span>
        <CameraUpload required />
      </div>
      <FormGrid>
        <Field label="Type">
          <Select name="kind" defaultValue={defaultKind} options={[...DOC_KINDS]} />
        </Field>
        <Field label="Name (optional)">
          <Input name="title" placeholder={claimId ? "e.g. Damage photo" : "e.g. 2026–27 schedule"} />
        </Field>
        <Field label="Date">
          <Input name="added_on" type="date" defaultValue={today()} />
        </Field>
      </FormGrid>
      <SubmitButton>Upload</SubmitButton>
    </form>
  );
}

function ClaimFields({ c, excess }: { c?: Claim; excess?: number | null }) {
  return (
    <>
      <FormGrid>
        <Field label="What happened *"><Input name="what" required defaultValue={c?.what ?? ""} placeholder="Windscreen chip, burst pipe…" /></Field>
        <Field label="Date"><Input name="date" type="date" defaultValue={c?.date ?? today()} /></Field>
        <Field label="Claim number"><Input name="claim_number" defaultValue={c?.claim_number ?? ""} /></Field>
        <Field label="Status">
          <Select name="status" defaultValue={c?.status ?? "open"} options={CLAIM_STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)] as [string, string])} />
        </Field>
        <Field label="Excess paid ($)"><Input name="excess" inputMode="decimal" defaultValue={centsToInput(c ? c.excess_cents : excess)} /></Field>
        <Field label="Paid out ($)"><Input name="payout" inputMode="decimal" defaultValue={centsToInput(c?.payout_cents)} /></Field>
      </FormGrid>
      <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={c?.notes ?? ""} placeholder="Who you spoke to, assessor visit, what's next…" /></Field>
    </>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
