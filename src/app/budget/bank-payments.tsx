import Link from "next/link";
import { addDays, parseISO } from "date-fns";
import { iso, money, shortDate, today } from "@/lib/format";
import { allBills, groupPayments, matchWords, priceCheck } from "@/lib/bill-links";
import { Card, Empty, Input } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { setBillMatch } from "./actions";

/**
 * On an insurance policy or a utility: the bank payments that paid it (matched by what the bank calls it, or by the
 * bank's bill being "same money as" this one on Bills), and a check of the price you entered against what was paid.
 */
export function BankPayments({ recurringId, what }: { recurringId: number | null; what: string }) {
  const bills = allBills();
  const bill = recurringId ? bills.find((b) => b.id === recurringId) : undefined;
  if (!bill) return null;
  const now = today();
  const since = iso(addDays(parseISO(now), -91));
  const { payments, covering, ids } = groupPayments(bill, bills, since);
  const check = payments.length ? priceCheck(ids, bills, payments, since, now) : null;
  const together = check?.priced.filter((b) => b.id !== bill.id) ?? [];

  return (
    <Card title="Bank payments" actions={<Link href="/budget/recurring" className="text-xs text-accent">Bills</Link>}>
      {check ? (
        <div className={`mb-3 rounded-lg p-2 text-sm ${check.ok ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>
          Last 3 months the bank paid <strong>{money(check.paid)}</strong>; {together.length ? `this ${what} and ${together.map((b) => b.name).join(", ")} come to` : `your price comes to`} <strong>{money(check.expected)}</strong>{" "}
          {check.ok ? "✓" : `– ${check.diff > 0 ? "the bank took" : "the bank took"} ${money(Math.abs(check.diff))} ${check.diff > 0 ? "more" : "less"}. Check the price here is right.`}
        </div>
      ) : (
        <Empty>No bank payments found for this {what} in the last 3 months.</Empty>
      )}
      {covering.length > 0 && <p className="mb-2 text-xs text-muted">Paid at the bank as &ldquo;{covering.map((c) => c.name).join("”, “")}&rdquo;.</p>}
      {payments.length > 0 && (
        <ul className="mb-3 divide-y divide-line text-sm">
          {payments.slice(0, 8).map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate"><span className="text-muted">{shortDate(p.date)}</span> {p.description.split(" · ")[0]}</span>
              <span className="shrink-0 tabular-nums">{money(-p.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
      <form action={setBillMatch} className="space-y-1 border-t border-line pt-3">
        <input type="hidden" name="id" value={bill.id} />
        <label className="block text-xs font-medium">What the bank calls it</label>
        <div className="flex gap-2">
          <Input name="match" defaultValue={bill.match ?? ""} placeholder={matchWords({ ...bill, match: null, linked_type: null }) ?? "e.g. tower insurance"} className="!py-1.5 text-sm" />
          <SubmitButton variant="secondary">Save</SubmitButton>
        </div>
        <p className="text-[11px] text-muted">
          Bank payments with these words count as this {what}&apos;s. If one bank payment pays several (Tower pays all your Trade Me policies),
          go to <Link href="/budget/recurring" className="text-accent underline">Bills</Link> → that payment → <em>Link…</em> and tick them all instead.
        </p>
      </form>
    </Card>
  );
}
