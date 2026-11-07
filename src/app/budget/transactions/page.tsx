import { Fragment } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { all } from "@/lib/db";
import { money, niceDate, shortDate, today } from "@/lib/format";
import { allBills, matchWords } from "@/lib/bill-links";
import { categoryList } from "@/lib/category-list";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, PageHeader, Select, Table, btn, cx, td } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addTransaction, deleteTransaction, joinTransaction, setPaymentBill } from "../actions";
import { CategorySelect } from "./category-select";
import { MoneyNav } from "../money-nav";
import { unsortedCount } from "@/lib/budget";

export default async function Transactions({ searchParams }: PageProps<"/budget/transactions">) {
  await io();
  const sp = await searchParams;
  const month = typeof sp.month === "string" ? sp.month : today().slice(0, 7);
  const category = typeof sp.category === "string" ? sp.category : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const allCats = categoryList().all;
  const linkId = typeof sp.link === "string" ? Number(sp.link) : null;

  // "Where it went" on This fortnight links here with the fortnight's dates
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const range = isDate(sp.from) && isDate(sp.to) ? { from: sp.from, to: sp.to } : null;
  const where = range ? ["t.date BETWEEN ? AND ?"] : ["substr(t.date, 1, 7) = ?"];
  const params: (string | number)[] = range ? [range.from, range.to] : [month];
  if (category === "Uncategorised") where.push("t.category IS NULL");
  else if (category) { where.push("t.category = ?"); params.push(category); }
  if (q) { where.push("t.description LIKE ?"); params.push(`%${q}%`); }

  const [rows, accounts] = await Promise.all([
    all<{ id: number; date: string; description: string; amount_cents: number; category: string | null; source: string; account: string | null; same_as: number | null; bill_id: number | null }>(
      `SELECT t.id, t.date, t.description, t.amount_cents, t.category, t.source, a.name AS account, t.same_as, t.bill_id
         FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
        WHERE ${where.join(" AND ")} ORDER BY t.date DESC, t.id DESC LIMIT 500`, ...params),
    all<{ id: number; name: string }>("SELECT id, name FROM accounts ORDER BY name"),
  ]);
  // joined ones ("same money as") don't count
  const total = rows.filter((r) => !r.same_as).reduce((s, r) => s + r.amount_cents, 0);

  // which bill each payment belongs to: linked by hand, or by the bill's words
  const bills = allBills();
  const worded = bills.map((b) => ({ b, w: matchWords(b) })).filter((x) => x.w);
  const billOf = (r: { amount_cents: number; description: string; bill_id: number | null }) =>
    r.bill_id ? bills.find((b) => b.id === r.bill_id) : r.amount_cents < 0 ? worded.find((x) => r.description.toLowerCase().includes(x.w!))?.b : undefined;
  // what joined ones are joined to
  const joinedTo = new Map(
    (await all<{ id: number; date: string; description: string; amount_cents: number }>(
      `SELECT id, date, description, amount_cents FROM transactions WHERE id IN (SELECT same_as FROM transactions WHERE same_as IS NOT NULL AND id IN (${rows.map((r) => r.id).join(",") || "0"}))`)).map((t) => [t.id, t]),
  );
  // the one being linked: nearby transactions of a similar size to join it to
  const linking = linkId ? rows.find((r) => r.id === linkId) : undefined;
  const candidates = linking
    ? (await all<{ id: number; date: string; description: string; amount_cents: number; account: string | null }>(
        `SELECT t.id, t.date, t.description, t.amount_cents, a.name AS account FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
          WHERE t.id <> ? AND t.same_as IS NULL AND abs(julianday(t.date) - julianday(?)) <= 10
          ORDER BY abs(abs(t.amount_cents) - ?), abs(julianday(t.date) - julianday(?)) LIMIT 12`,
        linking.id, linking.date, Math.abs(linking.amount_cents), linking.date))
    : [];
  // keeps the month / filters when opening or closing a Link panel
  const here = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (range) { p.set("from", range.from); p.set("to", range.to); } else p.set("month", month);
    if (category) p.set("category", category);
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/budget/transactions?${p}`;
  };

  return (
    <>
      <PageHeader title="Transactions" subtitle={`${rows.length} shown · net ${money(total)}${range ? ` · ${niceDate(range.from)} → ${niceDate(range.to)}` : ""}`} />
      <MoneyNav active="/budget/transactions" unsorted={unsortedCount().recent} />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Month"><Input type="month" name="month" defaultValue={month} /></Field>
        <Field label="Category">
          <Select name="category" defaultValue={category} options={[["", "All"], "Uncategorised", ...allCats]} />
        </Field>
        <Field label="Search"><Input name="q" defaultValue={q} placeholder="e.g. countdown" /></Field>
        <button className={btn.secondary}>Filter</button>
        {(category || q) && <Link href={`/budget/transactions?month=${month}`} className={btn.ghost}>Clear</Link>}
      </form>

      <div className="mb-4">
        <AddPanel label="Add a transaction manually">
          <form action={addTransaction}>
            <FormGrid>
              <Field label="Date"><Input type="date" name="date" defaultValue={today()} required /></Field>
              <Field label="Description"><Input name="description" required /></Field>
              <Field label="Amount ($)"><Input name="amount" inputMode="decimal" required /></Field>
              <Field label="Direction"><Select name="direction" options={[["out", "Money out"], ["in", "Money in"]]} /></Field>
              <Field label="Category"><Select name="category" options={[["", "—"], ...allCats]} /></Field>
              <Field label="Account"><Select name="account_id" options={[["", "—"], ...accounts.map((a) => [String(a.id), a.name] as [string, string])]} /></Field>
            </FormGrid>
            <div className="mt-3"><SubmitButton>Add</SubmitButton></div>
          </form>
        </AddPanel>
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty>No transactions match. <Link href="/budget/import" className="text-accent underline">Import a statement</Link>.</Empty>
        ) : (
          <Table head={["Date", "Description", "Category", "Amount", ""]}>
            {rows.map((r) => {
              const bill = billOf(r);
              const joined = r.same_as ? joinedTo.get(r.same_as) : undefined;
              return (
                <Fragment key={r.id}>
                  <tr id={`tx-${r.id}`} className={cx(r.same_as != null && "opacity-60", linkId === r.id && "bg-accent-soft/40")}>
                    <td className={`${td} whitespace-nowrap text-muted`}>{niceDate(r.date)}</td>
                    <td className={td}>
                      <div>{r.description}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {r.account && <Badge>{r.account}</Badge>}
                        {r.source !== "import" && <Badge tone="info">{r.source}</Badge>}
                        {bill && <Badge tone="good">🔗 {bill.name}</Badge>}
                        {joined && <Badge tone="warn">same money as {shortDate(joined.date)} {joined.description.split(" · ")[0].slice(0, 28)} ({money(joined.amount_cents)}) – not counted</Badge>}
                      </div>
                      <Link href={linkId === r.id ? `${here({})}#tx-${r.id}` : `${here({ link: String(r.id) })}#tx-${r.id}`} scroll={false} className="mt-0.5 inline-block text-xs text-accent">
                        {linkId === r.id ? "Close" : "Link…"}
                      </Link>
                    </td>
                    <td className={td}><CategorySelect id={r.id} category={r.category} description={r.description} categories={allCats} /></td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums ${r.amount_cents > 0 ? "text-accent" : ""} ${r.same_as ? "line-through" : ""}`}>{money(r.amount_cents)}</td>
                    <td className={td}><DeleteButton action={deleteTransaction} id={r.id} label="×" confirmText="Delete this transaction?" /></td>
                  </tr>
                  {linkId === r.id && (
                    <tr className="bg-accent-soft/40">
                      <td colSpan={5} className="px-3 pb-3">
                        <div className="grid gap-3 lg:grid-cols-2">
                          <form action={joinTransaction} className="space-y-2 rounded-lg border border-line bg-surface p-3">
                            <input type="hidden" name="id" value={r.id} />
                            <div className="text-sm font-medium">Same money as… <span className="text-xs font-normal text-muted">(this one stops counting)</span></div>
                            <p className="text-xs text-muted">E.g. the mortgage interest is part of the loan repayment, or a transfer shows on both accounts. Nearby transactions of a similar size:</p>
                            <Select
                              name="same_as"
                              defaultValue={r.same_as ? String(r.same_as) : ""}
                              options={[
                                ["", "— not joined (counts on its own)"],
                                ...candidates.map((c): [string, string] => [String(c.id), `${shortDate(c.date)} · ${c.description.split(" · ")[0].slice(0, 40)} · ${money(c.amount_cents)}${c.account ? ` · ${c.account}` : ""}`]),
                              ]}
                            />
                            <SubmitButton variant="secondary">Save</SubmitButton>
                          </form>
                          <form action={setPaymentBill} className="space-y-2 rounded-lg border border-line bg-surface p-3">
                            <input type="hidden" name="id" value={r.id} />
                            <div className="text-sm font-medium">Which bill it paid</div>
                            <p className="text-xs text-muted">Links it to a bill, insurance policy or utility – its page then shows it and checks the price. Usually done for you by what the bank calls it.</p>
                            <Select
                              name="bill_id"
                              defaultValue={r.bill_id ? String(r.bill_id) : ""}
                              options={[["", bill && !r.bill_id ? `— matched automatically (${bill.name})` : "— match automatically"], ...bills.filter((b) => b.active).map((b): [string, string] => [String(b.id), `${b.name} · ${money(b.amount_cents)} ${b.frequency}`])]}
                            />
                            <SubmitButton variant="secondary">Save</SubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
