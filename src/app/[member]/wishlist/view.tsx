import "server-only";
import Link from "next/link";
import { ExternalLink, Gift } from "lucide-react";
import { all } from "@/lib/db";
import { Badge, btn, Card, cx, Empty, Field, FormGrid, Input, Select, Stat, Textarea } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { centsToInput, money, relDays, shortDate } from "@/lib/format";
import { addWish, deleteList, deleteWish, setWishStatus, updateList, updateWish } from "./actions";
import { OCCASIONS, WISH_PRIORITIES, WISH_STATUSES, listPath, type Wish, type WishList, type WishStatus } from "./shared";
import type { Member } from "@/lib/family";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** One-tap status moves for each state. */
const MOVES: Record<WishStatus, { to: WishStatus; label: string; primary?: boolean }[]> = {
  idea: [{ to: "bought", label: "Bought it", primary: true }],
  bought: [
    { to: "given", label: "Given", primary: true },
    { to: "idea", label: "Undo" },
  ],
  given: [{ to: "bought", label: "Undo" }],
};

function PriorityPicker({ name, defaultValue }: { name: string; defaultValue: number }) {
  return (
    <div className="flex gap-1.5" role="radiogroup">
      {WISH_PRIORITIES.map((p) => (
        <label key={p.value} className="flex-1 cursor-pointer">
          <input type="radio" name={name} value={p.value} defaultChecked={p.value === defaultValue} className="peer sr-only" />
          <span className="block rounded-lg border border-line px-2 py-2 text-center text-xs font-medium whitespace-nowrap text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent-soft">
            {p.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function WishFields({ wish }: { wish?: Wish }) {
  const occasionOptions = wish?.occasion && !OCCASIONS.includes(wish.occasion) ? [...OCCASIONS, wish.occasion] : OCCASIONS;
  return (
    <FormGrid>
      <Field label="Item" className="sm:col-span-2">
        <Input name="item" required defaultValue={wish?.item ?? ""} />
      </Field>
      <Field label="Occasion">
        <Select name="occasion" defaultValue={wish?.occasion ?? "Any time"} options={occasionOptions} />
      </Field>
      <Field label="Priority" className="sm:col-span-2">
        <PriorityPicker name="priority" defaultValue={wish?.priority ?? 2} />
      </Field>
      <Field label="Price ($)">
        <Input name="price" inputMode="decimal" placeholder="0.00" defaultValue={centsToInput(wish?.price_cents)} />
      </Field>
      <Field label="Buy by (optional)">
        <Input name="buy_by" type="date" defaultValue={wish?.buy_by ?? ""} />
      </Field>
      <Field label="Link" className="sm:col-span-2 lg:col-span-3">
        <Input name="url" type="url" inputMode="url" placeholder="https://…" defaultValue={wish?.url ?? ""} />
      </Field>
      <Field label="Notes (size, colour, where it was seen…)" className="sm:col-span-2 lg:col-span-3">
        <Textarea name="notes" rows={2} defaultValue={wish?.notes ?? ""} />
      </Field>
    </FormGrid>
  );
}

export async function WishlistView({ member, list, firstId, searchParams }: { member: Member; list: WishList; firstId: number; searchParams: Props["searchParams"] }) {
  const sp = await searchParams;
  const status: WishStatus = WISH_STATUSES.some((s) => s.value === one(sp.status)) ? (one(sp.status) as WishStatus) : "idea";
  const basePath = listPath(list, firstId, member.slug);

  // filters (kept in the URL so they survive switching between To get / Bought / Given)
  const fOccasion = one(sp.occasion) ?? "";
  const fPriority = Number(one(sp.priority)) || 0;
  const fMax = Number(one(sp.max)) || 0;
  const fSearch = (one(sp.q) ?? "").trim().toLowerCase();
  const filtering = !!(fOccasion || fPriority || fMax || fSearch);
  const withFilters = (extra: Record<string, string>) => {
    const qs = new URLSearchParams();
    if (fOccasion) qs.set("occasion", fOccasion);
    if (fPriority) qs.set("priority", String(fPriority));
    if (fMax) qs.set("max", String(fMax));
    if (fSearch) qs.set("q", fSearch);
    for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
    const str = qs.toString();
    return str ? `${basePath}?${str}` : basePath;
  };
  const matches = (w: Wish) =>
    (!fOccasion || (w.occasion ?? "Any time") === fOccasion) &&
    (!fPriority || w.priority === fPriority) &&
    (!fMax || (w.price_cents ?? 0) <= fMax * 100) &&
    (!fSearch || `${w.item} ${w.notes ?? ""}`.toLowerCase().includes(fSearch));

  // calendar events linked to this list (birthdays, Christmas…)
  const linkedEvents = await all<{ id: number; title: string; start_date: string; wish_occasion: string | null }>(
    "SELECT id, title, start_date, wish_occasion FROM events WHERE wish_list_id = ? AND start_date >= date('now', 'localtime') ORDER BY start_date LIMIT 5",
    list.id);
  const isOwn = list.id === firstId;

  const wishes = await all<Wish>("SELECT * FROM wishlist WHERE list_id = ? ORDER BY priority, added_at DESC, id DESC", list.id);

  const counts = Object.fromEntries(WISH_STATUSES.map((s) => [s.value, wishes.filter((w) => w.status === s.value && matches(w)).length]));
  const toGet = wishes.filter((w) => w.status === "idea");
  const toGetCents = toGet.reduce((sum, w) => sum + (w.price_cents ?? 0), 0);
  const mustHaves = toGet.filter((w) => w.priority === 1).length;
  const boughtCents = wishes.filter((w) => w.status === "bought").reduce((sum, w) => sum + (w.price_cents ?? 0), 0);

  const shown = wishes.filter((w) => w.status === status && matches(w));
  const occasionChoices = [...new Set([...OCCASIONS, ...wishes.map((w) => w.occasion ?? "Any time")])];
  const occasionOf = (w: Wish) => w.occasion ?? "Any time";
  const extra = [...new Set(shown.map(occasionOf).filter((o) => !OCCASIONS.includes(o)))].sort();
  const groups = [...OCCASIONS, ...extra]
    .map((o) => ({ occasion: o, items: shown.filter((w) => occasionOf(w) === o) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {linkedEvents.length > 0 && (
        <div className="rounded-xl border border-accent bg-accent-soft p-3 text-sm">
          <div className="mb-1 font-medium text-accent">Coming up</div>
          <ul className="space-y-1">
            {linkedEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.title}</span>
                <span className="text-muted">{shortDate(e.start_date)} · {relDays(e.start_date)}</span>
                {e.wish_occasion && e.wish_occasion !== fOccasion && (
                  <Link href={withFilters({ occasion: e.wish_occasion })} className="text-xs text-accent underline">show {e.wish_occasion} ideas</Link>
                )}
                <Link href={`/calendar?event=${e.id}`} className="text-xs text-muted hover:text-accent">edit event</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.notes && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap text-muted">{list.notes}</p>}
      <Card title={`Quick add · ${list.name}`}>
        <form action={addWish} key={wishes.length} className="space-y-3">
          <input type="hidden" name="list_id" value={list.id} />
          <div className="flex gap-2">
            <Input name="item" required placeholder={isOwn ? `What did ${list.name} mention?` : `Gift idea for ${list.name}`} autoComplete="off" enterKeyHint="done" className="!py-2.5 !text-base" />
            <SubmitButton className="shrink-0 px-4">Add</SubmitButton>
          </div>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <Select name="occasion" defaultValue="Any time" options={OCCASIONS} aria-label="Occasion" />
            <PriorityPicker name="priority" defaultValue={2} />
          </div>
          <details className="group">
            <summary className="cursor-pointer list-none text-xs font-medium text-accent select-none">
              <span className="group-open:hidden">+ Link, price, buy-by date, notes</span>
              <span className="hidden group-open:inline">− Link, price, buy-by date, notes</span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Input name="url" type="url" inputMode="url" placeholder="Link (optional)" />
              <Input name="price" inputMode="decimal" placeholder="Price $" />
              <label className="text-xs text-muted sm:col-span-2">
                Buy by (optional – shows on {member.name}&apos;s calendar)
                <Input name="buy_by" type="date" className="mt-1" />
              </label>
              <Textarea name="notes" rows={2} placeholder="Notes: size, colour, where it was seen…" className="sm:col-span-2" />
            </div>
          </details>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Still to get" value={money(toGetCents)} hint={`${toGet.length} idea${toGet.length === 1 ? "" : "s"}`} />
        <Stat label="Must-haves" value={mustHaves} tone={mustHaves ? "bad" : undefined} hint="not bought yet" />
        <Stat label="Bought, not given" value={money(boughtCents)} hint={`${counts.bought} item${counts.bought === 1 ? "" : "s"}`} />
      </div>

      <form action={basePath} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
        {status !== "idea" && <input type="hidden" name="status" value={status} />}
        <Field label="Occasion" className="min-w-32 flex-1">
          <Select name="occasion" defaultValue={fOccasion} options={[["", "All"], ...occasionChoices]} />
        </Field>
        <Field label="Priority" className="min-w-32 flex-1">
          <Select name="priority" defaultValue={fPriority ? String(fPriority) : ""} options={[["", "Any"], ...WISH_PRIORITIES.map((p) => [String(p.value), p.label] as [string, string])]} />
        </Field>
        <Field label="Up to $" className="w-24">
          <Input name="max" inputMode="decimal" defaultValue={fMax || ""} placeholder="any" />
        </Field>
        <Field label="Search" className="min-w-40 flex-[2]">
          <Input name="q" defaultValue={fSearch} placeholder="item or notes" />
        </Field>
        <button className={cx(btn.secondary)}>Filter</button>
        {filtering && <Link href={status === "idea" ? basePath : `${basePath}?status=${status}`} className={btn.ghost}>Clear</Link>}
      </form>

      <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
        {WISH_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={withFilters({ status: s.value === "idea" ? "" : s.value })}
            className={cx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
              status === s.value ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {s.label}
            <span className="text-xs tabular-nums opacity-75">{counts[s.value]}</span>
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <Empty>
          {filtering
            ? "Nothing matches these filters."
            : status === "idea"
            ? `Nothing on ${list.name}'s list. Add ideas above as soon as you hear about them.`
            : status === "bought"
              ? "Nothing bought and waiting to be given."
              : "Nothing given yet."}
        </Empty>
      ) : (
        groups.map((g) => {
          const subtotal = g.items.reduce((sum, w) => sum + (w.price_cents ?? 0), 0);
          return (
            <Card
              key={g.occasion}
              title={g.occasion}
              actions={subtotal > 0 && <span className="text-xs text-muted tabular-nums">{money(subtotal)}</span>}
            >
              <ul className="divide-y divide-line">
                {g.items.map((w) => {
                  const pr = WISH_PRIORITIES.find((p) => p.value === w.priority) ?? WISH_PRIORITIES[1];
                  return (
                    <li key={w.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cx("font-medium break-words", w.status === "given" && "text-muted")}>{w.item}</span>
                            <Badge tone={pr.tone}>{pr.label}</Badge>
                          </div>
                          {w.notes && <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted">{w.notes}</p>}
                          <p className="mt-0.5 text-xs text-muted">Added {shortDate(w.added_at)}{w.buy_by && w.status === "idea" && <> · <span className="font-medium text-ink">buy by {shortDate(w.buy_by)}</span> ({relDays(w.buy_by)})</>}</p>
                        </div>
                        {w.price_cents != null && <span className="shrink-0 font-semibold tabular-nums">{money(w.price_cents)}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {MOVES[w.status].map((m) => (
                          <form key={m.to} action={setWishStatus}>
                            <input type="hidden" name="id" value={w.id} />
                            <input type="hidden" name="status" value={m.to} />
                            <button className={cx(m.primary ? btn.primary : btn.ghost, btn.small)}>
                              {m.to === "given" && <Gift size={12} />}
                              {m.label}
                            </button>
                          </form>
                        ))}
                        {w.url && (
                          <a href={w.url} target="_blank" rel="noreferrer" className={cx(btn.secondary, btn.small)}>
                            <ExternalLink size={12} /> Link
                          </a>
                        )}
                        <details className="group [&[open]]:w-full">
                          <summary className={cx(btn.ghost, btn.small, "list-none")}>Edit</summary>
                          <form action={updateWish} className="mt-2 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
                            <input type="hidden" name="id" value={w.id} />
                            <WishFields wish={w} />
                            <div className="flex items-center justify-between gap-2">
                              <SubmitButton>Save</SubmitButton>
                            </div>
                          </form>
                        </details>
                        <DeleteButton action={deleteWish} id={w.id} confirmText={`Delete "${w.item}"?`} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}

      <details className="pt-2">
        <summary className="cursor-pointer text-xs text-muted">List settings</summary>
        <Card className="mt-2">
          <form action={updateList} className="space-y-2">
            <input type="hidden" name="id" value={list.id} />
            <Field label="Whose list"><Input name="name" defaultValue={list.name} required /></Field>
            <Field label="Notes (sizes, favourite colours, allergies…)"><Textarea name="notes" rows={2} defaultValue={list.notes ?? ""} /></Field>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
          {!isOwn && (
            <div className="mt-3 border-t border-line pt-3">
              <DeleteButton action={deleteList} id={list.id} label={`Delete ${list.name}'s list`} confirmText={`Delete ${list.name}'s list and everything on it?`} />
            </div>
          )}
        </Card>
      </details>
    </div>
  );
}
