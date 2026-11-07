import Link from "next/link";
import { get } from "@/lib/db";
import { merchantKey, unsortedCount } from "@/lib/budget";
import { categoryList } from "@/lib/category-list";
import { money, niceDate } from "@/lib/format";
import { Card, Empty, PageHeader, btn, cx } from "@/components/ui";
import { DeleteButton } from "@/components/buttons";
import { loadStarterRules, sortOldAsOther, sortTransaction } from "../actions";
import { SortKeys } from "./sort-keys";
import { MoneyNav } from "../money-nav";

type Tx = { id: number; date: string; description: string; amount_cents: number; account: string | null };

/** New transactions one card at a time: tap a category, optionally for every one from the same shop. */
export default async function SortPage({ searchParams }: PageProps<"/budget/sort">) {
  const sp = await searchParams;
  // "Skip" moves past a card without sorting it (kept in the address, so it resets when you leave)
  const skipped = (typeof sp.skip === "string" ? sp.skip.split(",") : []).map(Number).filter(Number.isInteger);
  const notIn = skipped.length ? `AND t.id NOT IN (${skipped.join(",")})` : "";
  const { recent, older } = unsortedCount();
  const rules = (await get<{ n: number }>("SELECT count(*) AS n FROM category_rules"))!.n;

  const tx = await get<Tx>(
    `SELECT t.id, t.date, t.description, t.amount_cents, a.name AS account FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.category IS NULL AND t.amount_cents != 0 AND t.date >= date('now', '-90 days') ${notIn}
      ORDER BY t.date DESC, t.id DESC LIMIT 1`);
  const key = tx ? merchantKey(tx.description) : "";
  const like = tx && key.length >= 3
    ? (await get<{ n: number }>("SELECT count(*) AS n FROM transactions WHERE category IS NULL AND instr(lower(description), ?) > 0", key))!.n
    : 1;
  // money coming in is usually pay, a refund or a transfer – show those first; your own categories come after their kind
  const cats = categoryList();
  const first = tx && tx.amount_cents > 0 ? ["Income", "Transfers", ...cats.spending, "Savings"] : [...cats.spending, "Transfers", "Savings", "Income"];
  const order = [...first, ...cats.notSpending.filter((c) => !first.includes(c))];

  return (
    <>
      <PageHeader title="Sort transactions" subtitle={`${recent} to sort from the last 3 months${skipped.length ? ` · ${skipped.length} skipped` : ""}`} />
      <MoneyNav active="/budget/sort" unsorted={recent} />
      {rules < 10 && recent > 0 && (
        <Card className="mx-auto mb-4 max-w-xl">
          <form action={loadStarterRules} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>Start with NZ shop rules (Countdown, Z, Spark, Mitre 10…) so the common ones sort themselves.</span>
            <button className={btn.primary}>Add starter rules</button>
          </form>
        </Card>
      )}
      {!tx ? (
        <Card className="mx-auto max-w-xl">
          <Empty>
            {skipped.length ? <>All done except the ones you skipped. <Link href="/budget/sort" className="text-accent underline">Go through those</Link>.</> : "All sorted. 🎉"}
          </Empty>
          <div className="mt-4 text-center"><Link href="/budget" className={btn.primary}>Back to this fortnight</Link></div>
        </Card>
      ) : (
        <Card className="mx-auto max-w-xl">
          <div className="text-center">
            <div className="text-sm text-muted">{niceDate(tx.date)}{tx.account ? ` · ${tx.account}` : ""}</div>
            <div className="mt-2 text-xl font-semibold break-words">{tx.description}</div>
            <div className={cx("mt-1 text-3xl font-semibold tabular-nums", tx.amount_cents > 0 ? "text-accent" : "")}>
              {tx.amount_cents > 0 ? "+" : ""}{money(tx.amount_cents)}
            </div>
          </div>

          <form action={sortTransaction} className="mt-5 space-y-4">
            <input type="hidden" name="id" value={tx.id} />
            {like > 1 ? (
              <label className="flex items-center justify-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
                <input type="checkbox" name="all" value="1" defaultChecked className="size-4" />
                Do all {like} from <strong className="break-all">&ldquo;{key}&rdquo;</strong> and remember it
              </label>
            ) : (
              <label className="flex items-center justify-center gap-2 text-sm text-muted">
                <input type="checkbox" name="all" value="1" defaultChecked className="size-4" /> Remember this shop for next time
              </label>
            )}
            <Link
              href={`/budget/sort?skip=${[...skipped, tx.id].join(",")}`}
              data-skip
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted hover:border-accent hover:text-ink"
            >
              Skip for now (S) →
            </Link>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {order.filter((c) => cats.all.includes(c)).map((c, i) => (
                <button
                  key={c}
                  name="category"
                  value={c}
                  data-key={i < 9 ? i + 1 : undefined}
                  title={cats.info[c]?.hint}
                  className="flex flex-col items-center gap-0.5 rounded-xl border border-line bg-surface px-2 py-3 text-sm font-medium hover:border-accent hover:bg-accent-soft hover:text-accent"
                >
                  <span className="text-2xl">{cats.info[c]?.icon ?? "🏷️"}</span>
                  <span className="break-words text-center">{c}</span>
                  <span className="text-[10px] text-muted">{i < 9 ? i + 1 : "\u00a0"}</span>
                </button>
              ))}
              {/* + : make your own category, and put this one in it */}
              <details className="group open:col-span-2 sm:open:col-span-3">
                <summary className="flex h-full cursor-pointer list-none flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line px-2 py-3 text-sm font-medium text-muted select-none hover:border-accent hover:text-accent group-open:hidden [&::-webkit-details-marker]:hidden">
                  <span className="text-2xl leading-none">+</span>
                  New category
                </summary>
                <div className="space-y-3 rounded-xl border border-accent bg-accent-soft/40 p-3">
                  <div className="text-sm font-medium">New category</div>
                  <div className="grid grid-cols-[4.5rem_1fr] gap-2">
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Emoji
                      <input name="new_icon" maxLength={8} placeholder="🎁" autoComplete="off" className="rounded-lg border border-line bg-surface px-2 py-2 text-center text-lg text-ink" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Name
                      <input name="new_name" maxLength={40} placeholder="e.g. Pets, Gifts, Kids" autoComplete="off" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="new_spending" value="1" defaultChecked className="size-4" /> It&apos;s spending (comes out of a pot – starts in the same pot as Other)
                  </label>
                  <button name="category" value="__new__" className={cx(btn.primary, "w-full")}>Add it and sort this into it</button>
                </div>
              </details>
            </div>
          </form>
          <p className="mt-4 text-center text-xs text-muted">Keys 1–9 pick a category · S skips</p>
          <SortKeys />
        </Card>
      )}

      {older > 0 && (
        <Card title="Older than 3 months" className="mx-auto mt-4 max-w-xl">
          <p className="text-sm text-muted">
            {older} older transaction{older === 1 ? " isn't" : "s aren't"} sorted. They don&apos;t affect this fortnight. You can sort them on <Link href="/budget/transactions?category=Uncategorised" className="text-accent underline">Transactions</Link>,
            or put them all in <strong>Other</strong> (money out) and stop counting old money in.
          </p>
          <div className="mt-3">
            <DeleteButton action={sortOldAsOther} id={0} label={`Put all ${older} in Other`} confirmText={`Put all ${older} older unsorted transactions in "Other" (money in stops counting)? You can still change any of them on Transactions.`} />
          </div>
        </Card>
      )}
    </>
  );
}
