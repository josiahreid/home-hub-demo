import Link from "next/link";
import { all } from "@/lib/db";
import { members } from "@/lib/members";
import { money, shortDate, today } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { KIND_ICON, KINDS, POLICY_SELECT, peopleOf, policyTitle, type PolicyRow } from "../lib";
import { PrintButton } from "./print";

/** Everything you need to make a claim, on one page – print it for the glovebox or the fridge, or save it as a PDF on your phone. */
export default async function EmergencyCard() {
  const [policies, family] = await Promise.all([all<PolicyRow>(`${POLICY_SELECT} ORDER BY p.kind, p.covers`), members()]);
  const rows = policies.sort((a, b) => KINDS.indexOf(a.kind as (typeof KINDS)[number]) - KINDS.indexOf(b.kind as (typeof KINDS)[number]));
  const nameOf = (slug: string) => family.find((m) => m.slug === slug)?.name ?? slug;

  return (
    <>
      <Link href="/insurance" className="mb-2 inline-block text-sm text-muted hover:text-ink print:hidden">← All insurance</Link>
      <PageHeader title="Insurance emergency card" subtitle={`Policy numbers and claims lines · printed ${shortDate(today())} ${today().slice(0, 4)}`} actions={<span className="print:hidden"><PrintButton /></span>} />

      {rows.length === 0 ? (
        <Empty>No policies yet.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
          {rows.map((p) => {
            const who = peopleOf(p).map(nameOf);
            return (
              <div key={p.id} className="break-inside-avoid rounded-xl border border-line bg-surface p-4 print:rounded-none print:p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold">{KIND_ICON[p.kind] ?? KIND_ICON.Other} {policyTitle(p)}</div>
                  <div className="text-sm text-muted">{p.insurer}</div>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">Policy no.</dt>
                  <dd className="font-mono font-semibold">{p.policy_number ?? "—"}</dd>
                  <dt className="text-muted">Claims</dt>
                  <dd className="font-semibold">
                    {p.claims_phone ? <a href={`tel:${p.claims_phone.replace(/\s+/g, "")}`} className="text-accent print:text-ink">{p.claims_phone}</a> : "—"}
                  </dd>
                  {p.excess_cents != null && (<><dt className="text-muted">Excess</dt><dd>{money(p.excess_cents)}</dd></>)}
                  {who.length > 0 && (<><dt className="text-muted">Covers</dt><dd>{who.join(" & ")}</dd></>)}
                  {p.website && (<><dt className="text-muted">Online</dt><dd className="truncate">{p.website.replace(/^https?:\/\/(www\.)?/, "")}</dd></>)}
                </dl>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">In an emergency call 111 first. Take photos of any damage before cleaning up, and don&apos;t admit fault at a car accident.</p>
    </>
  );
}
