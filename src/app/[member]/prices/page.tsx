import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { all } from "@/lib/db";
import { AddPanel, Badge, btn, cx, Empty, Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { money, shortDate, today } from "@/lib/format";
import { createHunt, setHuntStatus } from "./actions";
import { HUNT_STATUSES, byPrice, priceNow, saleOn, shopName, splitTags, type Hunt, type PriceLink } from "./shared";
import { HuntFields } from "./components";
import { memberWith } from "../member";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function Chip({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={to}
      className={cx("shrink-0 rounded-full px-3 py-1 text-xs font-medium", active ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink")}
    >
      {children}
    </Link>
  );
}

export default async function PricesPage({ params, searchParams }: PageProps<"/[member]/prices">) {
  const m = await memberWith(params, "prices");
  const tag = one((await searchParams).tag);
  const now = today();
  const base = `/${m.slug}/prices`;

  const [hunts, links] = await Promise.all([
    all<Hunt>("SELECT * FROM price_hunts WHERE member_id = ? ORDER BY created_at DESC, id DESC", m.id),
    all<PriceLink>("SELECT l.* FROM price_links l JOIN price_hunts h ON h.id = l.hunt_id WHERE h.member_id = ?", m.id),
  ]);
  const linksOf = Map.groupBy(links, (l) => l.hunt_id);
  const tags = [...new Set(hunts.flatMap((h) => splitTags(h.tags)))].sort((a, b) => a.localeCompare(b));
  const shown = hunts.filter((h) => !tag || splitTags(h.tags).includes(tag));

  return (
    <div className="space-y-4">
      <AddPanel label="Add price card">
        <form action={createHunt} className="space-y-3">
          <input type="hidden" name="member_id" value={m.id} />
          <HuntFields />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Status" className="w-40">
              <Select name="status" defaultValue="idea" options={HUNT_STATUSES.map((s): [string, string] => [s.value, s.label])} />
            </Field>
            <SubmitButton>Create card</SubmitButton>
          </div>
        </form>
      </AddPanel>

      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <span className="shrink-0 pr-1 text-xs font-medium text-muted">Tag</span>
          <Chip to={base} active={!tag}>All</Chip>
          {tags.map((t) => (
            <Chip key={t} to={`${base}?tag=${encodeURIComponent(t)}`} active={tag === t}>#{t}</Chip>
          ))}
        </div>
      )}

      {hunts.length === 0 ? (
        <Empty>No price cards yet. Add one for anything you&apos;re hunting the cheapest price for, then add a link and price for each shop.</Empty>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {HUNT_STATUSES.map((col, ci) => {
            const items = shown.filter((h) => h.status === col.value);
            return (
              <section key={col.value} className="flex w-[80vw] max-w-72 shrink-0 snap-start flex-col rounded-xl bg-surface-2 p-2 sm:w-64 lg:w-auto lg:min-w-52 lg:flex-1">
                <h2 className="flex items-center justify-between px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {col.label}
                  <span className="tabular-nums">{items.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Nothing here</p>}
                  {items.map((h) => {
                    const hl = linksOf.get(h.id) ?? [];
                    const best = byPrice(hl, now)[0];
                    const bestPrice = best ? priceNow(best, now) : null;
                    const sales = hl.filter((l) => saleOn(l, now));
                    const prev = HUNT_STATUSES[ci - 1];
                    const next = HUNT_STATUSES[ci + 1];
                    return (
                      <article key={h.id} className="rounded-lg border border-line bg-surface p-3 shadow-sm">
                        <Link href={`${base}/${h.id}`} className="block font-medium leading-snug hover:text-accent">
                          {h.title}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {sales.length > 0 && <Badge tone="good">On sale</Badge>}
                          {splitTags(h.tags).map((t) => (
                            <Link key={t} href={`${base}?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-ink">
                              #{t}
                            </Link>
                          ))}
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-2 text-xs text-muted">
                          {bestPrice != null ? (
                            <span>
                              <span className="text-base font-semibold text-ink tabular-nums">{money(bestPrice)}</span> at {shopName(best)}
                            </span>
                          ) : (
                            <span>No prices yet</span>
                          )}
                          <span className="shrink-0 tabular-nums">{hl.length} shop{hl.length === 1 ? "" : "s"}</span>
                        </div>
                        {sales.some((l) => l.sale_ends) && (
                          <p className="mt-1 text-xs text-muted">
                            Sale ends {shortDate(sales.map((l) => l.sale_ends).filter((d): d is string => !!d).sort()[0])}
                          </p>
                        )}
                        <div className="mt-2 flex justify-between border-t border-line pt-2">
                          {prev ? (
                            <form action={setHuntStatus}>
                              <input type="hidden" name="id" value={h.id} />
                              <input type="hidden" name="status" value={prev.value} />
                              <button className={cx(btn.ghost, btn.small)} title={`Move to ${prev.label}`}>
                                <ChevronLeft size={14} /> {prev.label}
                              </button>
                            </form>
                          ) : (
                            <span />
                          )}
                          {next && (
                            <form action={setHuntStatus}>
                              <input type="hidden" name="id" value={h.id} />
                              <input type="hidden" name="status" value={next.value} />
                              <button className={cx(btn.ghost, btn.small)} title={`Move to ${next.label}`}>
                                {next.label} <ChevronRight size={14} />
                              </button>
                            </form>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
