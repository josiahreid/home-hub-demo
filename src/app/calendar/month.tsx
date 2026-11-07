import Link from "next/link";
import { format, parseISO } from "date-fns";
import { iso, money, today } from "@/lib/format";
import { KIND_LABEL, KIND_TONE, type Item } from "@/lib/upcoming";
import { Badge, Empty, cx } from "@/components/ui";

// The month grid and day lists – shared by the main calendar and each family member's Calendar tab.

/** A month of days with what's on each – Home Hub's own calendar, and each imported calendar. */
export function MonthGrid({ days, month, byDay, selectedDay, dayHref, colors }: {
  days: Date[]; month: string; byDay: Map<string, Item[]>; selectedDay: string | null;
  dayHref: (day: string) => string; colors: Record<Item["kind"], string>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = iso(d);
          const list = byDay.get(key) ?? [];
          const inMonth = key.slice(0, 7) === month;
          return (
            <Link
              key={key}
              href={dayHref(key)}
              scroll={false}
              className={cx(
                "min-h-16 border-b border-r border-line p-1 text-left hover:bg-surface-2 sm:min-h-24 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-bg text-muted",
                selectedDay === key && "ring-2 ring-inset ring-accent",
              )}
            >
              <div className={cx("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", key === today() && "bg-accent font-semibold text-accent-ink")}>
                {format(d, "d")}
              </div>
              {/* dots on phones, titles on wider screens */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 6).map((i, n) => <span key={n} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors[i.kind] }} />)}
              </div>
              <ul className="hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((i, n) => (
                  <li key={n} className="flex items-center gap-1 truncate text-[11px] leading-tight">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colors[i.kind] }} />
                    <span className="truncate">{i.title}</span>
                  </li>
                ))}
                {list.length > 3 && <li className="text-[11px] text-muted">+{list.length - 3} more</li>}
              </ul>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function DayList({ items, showDate, colors }: { items: Item[]; showDate?: boolean; colors: Record<Item["kind"], string> }) {
  if (items.length === 0) return <Empty>Nothing on.</Empty>;
  return (
    <ul className="divide-y divide-line text-sm">
      {items.map((i, n) => (
        <li key={n} className="flex items-center gap-1 py-2">
          {i.eventId && !i.href.startsWith("/calendar") && (
            <Link href={`/calendar?event=${i.eventId}`} className="order-last shrink-0 px-1 text-xs text-muted hover:text-accent" title="Edit event">✎</Link>
          )}
          <Link href={i.href} className="flex min-w-0 flex-1 items-start justify-between gap-2 hover:underline">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[i.kind] }} />
              {showDate && <span className="mr-1 text-xs text-muted">{format(parseISO(i.date), "EEE d")}</span>}
              {i.time && <span className="mr-1 text-xs text-muted">{i.time}</span>}
              {i.title}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {i.amountCents ? <span className="text-xs tabular-nums text-muted">{money(i.amountCents)}</span> : null}
              <Badge tone={KIND_TONE[i.kind]}>{KIND_LABEL[i.kind]}</Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type Person = { slug: string; name: string };

/** Who an event is for. Nobody ticked = everyone (always on the main calendar). */
export function PeopleFields({ people, selected = [] }: { people: Person[]; selected?: string[] }) {
  if (people.length === 0) return null;
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted">Who&apos;s it for? <span className="font-normal">(none = everyone)</span></legend>
      <div className="flex flex-wrap gap-3">
        {people.map((p) => (
          <label key={p.slug} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input type="checkbox" name="people" value={p.slug} defaultChecked={selected.includes(p.slug)} className="size-4 accent-[var(--accent)]" />
            {p.name}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Shows on their Calendar tab; on this calendar only when their switch is on.</p>
    </fieldset>
  );
}
