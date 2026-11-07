import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { all, get } from "@/lib/db";
import { AddPanel, Badge, btn, Card, cx, Empty, Stat } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { money, relDays, shortDate, today } from "@/lib/format";
import { addLink, deleteHunt, deleteLink, setHuntStatus, updateHunt, updateLink } from "../actions";
import { HuntFields, LinkFields } from "../components";
import { HUNT_STATUSES, byPrice, priceNow, saleOn, shopName, splitTags, type Hunt, type PriceLink } from "../shared";
import { memberWith } from "../../member";

export default async function HuntPage({ params }: PageProps<"/[member]/prices/[id]">) {
  const m = await memberWith(params, "prices");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const hunt = await get<Hunt>("SELECT * FROM price_hunts WHERE id = ? AND member_id = ?", id, m.id);
  if (!hunt) notFound();

  const now = today();
  const links = byPrice(await all<PriceLink>("SELECT * FROM price_links WHERE hunt_id = ? ORDER BY id", id), now);
  const priced = links.filter((l) => priceNow(l, now) != null);
  const cheapest = priced[0];
  const dearest = priced.at(-1);
  const bestPrice = cheapest ? priceNow(cheapest, now)! : null;
  const spread = cheapest && dearest ? priceNow(dearest, now)! - bestPrice! : 0;
  const base = `/${m.slug}/prices`;

  return (
    <div className="space-y-4">
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> All price cards
      </Link>

      <div>
        <h2 className="text-xl font-semibold">{hunt.title}</h2>
        {splitTags(hunt.tags).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {splitTags(hunt.tags).map((t) => (
              <Link key={t} href={`${base}?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-ink">
                #{t}
              </Link>
            ))}
          </div>
        )}
        {hunt.description && <p className="mt-3 whitespace-pre-wrap text-sm">{hunt.description}</p>}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:none]">
        {HUNT_STATUSES.map((s) => (
          <form key={s.value} action={setHuntStatus} className="flex-1">
            <input type="hidden" name="id" value={hunt.id} />
            <input type="hidden" name="status" value={s.value} />
            <button
              className={cx(
                "w-full shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap",
                hunt.status === s.value ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {s.label}
            </button>
          </form>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Cheapest now" value={money(bestPrice)} hint={cheapest ? shopName(cheapest) : "add a price below"} tone={cheapest ? "good" : undefined} />
        <Stat label="Saving vs dearest" value={money(spread)} hint={priced.length > 1 ? `across ${priced.length} shops` : "needs two prices"} />
        <Stat label="Shops checked" value={links.length} />
      </div>

      <Card title="Prices" actions={<span className="text-xs text-muted">cheapest first · sale prices count until they end</span>}>
        {links.length === 0 ? (
          <Empty>No shops yet. Paste a link and its price below.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {links.map((l) => {
              const now$ = priceNow(l, now);
              const onSale = saleOn(l, now);
              const saleEnded = l.sale_cents != null && !onSale;
              const isBest = cheapest && l.id === cheapest.id && priced.length > 1;
              return (
                <li key={l.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium break-words">{shopName(l)}</span>
                        {isBest && <Badge tone="good">Cheapest</Badge>}
                        {onSale && (
                          <Badge tone="warn">
                            On sale{l.sale_ends ? ` · ends ${shortDate(l.sale_ends)} (${relDays(l.sale_ends)})` : ""}
                          </Badge>
                        )}
                        {saleEnded && <Badge>Sale ended {shortDate(l.sale_ends)}</Badge>}
                      </div>
                      {l.notes && <p className="mt-0.5 text-sm text-muted">{l.notes}</p>}
                      <p className="mt-0.5 text-xs text-muted">Checked {shortDate(l.checked_on)}</p>
                    </div>
                    <div className="text-right">
                      <div className={cx("text-lg font-semibold tabular-nums", isBest && "text-accent")}>{money(now$)}</div>
                      {onSale && l.price_cents != null && <div className="text-xs text-muted line-through tabular-nums">{money(l.price_cents)}</div>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {l.url && (
                      <a href={l.url} target="_blank" rel="noreferrer" className={cx(btn.secondary, btn.small)}>
                        <ExternalLink size={12} /> Open
                      </a>
                    )}
                    <details className="group [&[open]]:w-full">
                      <summary className={cx(btn.ghost, btn.small, "list-none")}>Edit</summary>
                      <form action={updateLink} className="mt-2 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
                        <input type="hidden" name="id" value={l.id} />
                        <LinkFields link={l} />
                        <SubmitButton>Save</SubmitButton>
                      </form>
                    </details>
                    <DeleteButton action={deleteLink} id={l.id} confirmText={`Remove ${shopName(l)}?`} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <AddPanel label="Add a shop" open={links.length === 0}>
            <form action={addLink} className="space-y-3" key={links.length}>
              <input type="hidden" name="hunt_id" value={hunt.id} />
              <LinkFields />
              <SubmitButton>Add</SubmitButton>
            </form>
          </AddPanel>
        </div>
      </Card>

      <AddPanel label="Edit card">
        <form action={updateHunt} className="space-y-3">
          <input type="hidden" name="id" value={hunt.id} />
          <HuntFields hunt={hunt} />
          <SubmitButton>Save changes</SubmitButton>
        </form>
        <div className="mt-4 flex justify-end border-t border-line pt-3">
          <DeleteButton action={deleteHunt} id={hunt.id} label="Delete card" confirmText={`Delete "${hunt.title}" and all its prices?`} />
        </div>
      </AddPanel>
    </div>
  );
}
