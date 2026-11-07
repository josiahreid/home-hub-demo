import { headers } from "next/headers";
import { format, parseISO } from "date-fns";
import { Check, Eraser, Undo2 } from "lucide-react";
import { all } from "@/lib/db";
import { iso, today } from "@/lib/format";
import { groceryList, groceryToken, type Grocery } from "@/lib/groceries";
import { Card, Empty, Input, btn, cx } from "@/components/ui";
import { ConfirmButton, DeleteButton, SubmitButton } from "@/components/buttons";
import { CopyButton } from "@/components/copy-button";
import { addGroceryItem, clearAllGroceries, deleteGrocery, resetGroceryLink, restoreCleared, tickGrocery, toggleGroceryUrgent, untickGrocery } from "./actions";

// The database keeps times in UTC; these turn them into NZ days ("Today", "Yesterday", "Mon 26 Oct").
const nzDay = (sqlUtc: string) => iso(parseISO(`${sqlUtc.replace(" ", "T")}Z`));
function dayLabel(day: string) {
  const t = today();
  if (day === t) return "Today";
  if (day === iso(new Date(parseISO(t).getTime() - 86_400_000))) return "Yesterday";
  return format(parseISO(day), "EEE d MMM");
}

/** "today", "yesterday", or "Sun 25 Oct" – for "added …". */
const addedLabel = (sqlUtc: string) => {
  const l = dayLabel(nzDay(sqlUtc));
  return l === "Today" || l === "Yesterday" ? l.toLowerCase() : l;
};

export default async function Groceries() {
  const { urgent, notUrgent } = groceryList();
  // the last 30 days, grouped by NZ day (newest first): ticked off one by one = Bought; "Clear all" = Cleared
  const recent = await all<Grocery>(
    "SELECT * FROM groceries WHERE done_at IS NOT NULL AND done_at >= datetime('now', '-30 days') ORDER BY done_at DESC");
  const bought = recent.filter((i) => !i.cleared);
  const cleared = recent.filter((i) => i.cleared);
  const onList = urgent.length + notUrgent.length;

  // the address this page was opened on, so the Shortcuts links work from the same place (Tailscale on the phone)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}/api/groceries?key=${groceryToken()}`;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <form action={addGroceryItem} className="flex flex-wrap gap-2" key={urgent.length + notUrgent.length}>
            <Input name="name" required placeholder="Add to the list – e.g. milk, or milk, bread, eggs" autoComplete="off" className="min-w-0 flex-1 !py-2.5 !text-base" />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm has-[:checked]:border-danger has-[:checked]:bg-danger-soft has-[:checked]:text-danger">
              <input type="checkbox" name="urgent" className="size-4 accent-[var(--danger)]" /> Urgent
            </label>
            <SubmitButton className="px-5">Add</SubmitButton>
          </form>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <ListCard title="Urgent" items={urgent} tone="urgent" empty="Nothing urgent." />
          <ListCard title="Not urgent" items={notUrgent} tone="normal" empty="Nothing else on the list." />
        </div>

        {onList > 0 && (
          <div className="flex justify-end">
            <ConfirmButton action={clearAllGroceries} confirmText={`Clear all ${onList} item${onList === 1 ? "" : "s"}? They go to the Cleared list, where you can put them back.`} className={btn.secondary}>
              <Eraser size={15} /> Clear all
            </ConfirmButton>
          </div>
        )}

        {cleared.length > 0 && (
          <Card title="Cleared" actions={<span className="text-xs text-muted">last 30 days · tap one to put it back</span>}>
            <DayGroups items={cleared} restoreAll />
          </Card>
        )}

        {bought.length > 0 && (
          <Card title="Bought" actions={<span className="text-xs text-muted">last 30 days · tap one to put it back</span>}>
            <DayGroups items={bought} />
          </Card>
        )}
      </div>

      <Card title="Apple Shortcuts">
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Add to the list from a Shortcut, Siri or an NFC tag. On the iPhone, Tailscale needs to be on. These links contain a secret key, so keep them to yourselves.
          </p>
          <ShortcutLink label="Add an item (POST)" url={base} />
          <ShortcutLink label="Read the list (GET)" url={base} />
          <details>
            <summary className="cursor-pointer font-medium text-accent">How to make the &quot;Add to groceries&quot; Shortcut</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
              <li>Shortcuts app → <strong>+</strong>. Add <strong>Ask for Input</strong> (Text, prompt &quot;What do we need?&quot;).</li>
              <li>Add <strong>Get Contents of URL</strong>, paste the <em>Add an item</em> link.</li>
              <li>Tap <strong>Show More</strong>: Method <strong>POST</strong>, Request Body <strong>JSON</strong>.</li>
              <li>Add field <code>item</code> (Text) → the <em>Provided Input</em>. For the urgent version add field <code>urgent</code> (Boolean) → <strong>True</strong>.</li>
              <li>Optional: add <strong>Show Notification</strong> with the <em>Contents of URL</em> – it says what was added.</li>
            </ol>
          </details>
          <details>
            <summary className="cursor-pointer font-medium text-accent">NFC tags (later)</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
              <li>Shortcuts → <strong>Automation</strong> → <strong>+</strong> → <strong>NFC</strong> → scan the tag (e.g. stuck on the pantry).</li>
              <li>Choose <strong>Run Immediately</strong>, then run your Add Shortcut – or for a tag that always adds the same thing, put that item name in the <code>item</code> field instead of asking.</li>
            </ol>
          </details>
          <details>
            <summary className="cursor-pointer font-medium text-accent">Reading the list out</summary>
            <p className="mt-2 text-muted">
              A Shortcut with <strong>Get Contents of URL</strong> (the <em>Read the list</em> link, method GET) then <strong>Speak Text</strong> or <strong>Show Result</strong> reads out urgent then not urgent. Add <code>&amp;format=json</code> to the link if you&apos;d rather get the two lists separately.
            </p>
          </details>
          <form action={resetGroceryLink} className="border-t border-line pt-3">
            <button className={cx(btn.ghost, btn.small)}>Make new links (the old ones stop working)</button>
          </form>
        </div>
      </Card>
    </div>
  );
}

function ListCard({ title, items, tone, empty }: { title: string; items: Grocery[]; tone: "urgent" | "normal"; empty: string }) {
  return (
    <Card
      title={<span className={cx(tone === "urgent" && "text-danger")}>{title}</span>}
      actions={<span className="text-xs text-muted tabular-nums">{items.length}</span>}
    >
      {items.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2">
              <form action={tickGrocery}>
                <input type="hidden" name="id" value={i.id} />
                <button
                  aria-label={`Tick off ${i.name}`}
                  className={cx(
                    "flex size-7 items-center justify-center rounded-full border text-transparent hover:text-accent",
                    tone === "urgent" ? "border-danger" : "border-line hover:border-accent",
                  )}
                >
                  <Check size={15} />
                </button>
              </form>
              <span className="min-w-0 flex-1 break-words">
                {i.name}
                <span className="block text-xs text-muted">added {addedLabel(i.created_at)}</span>
              </span>
              <form action={toggleGroceryUrgent}>
                <input type="hidden" name="id" value={i.id} />
                <button className={cx(btn.ghost, btn.small, "text-xs")}>{tone === "urgent" ? "Not urgent" : "Urgent"}</button>
              </form>
              <DeleteButton action={deleteGrocery} id={i.id} label="×" confirmText={`Remove ${i.name}?`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Bought or cleared items, a group for each day; tap one to put it back (or, for a Clear all, the whole day's). */
function DayGroups({ items, restoreAll }: { items: Grocery[]; restoreAll?: boolean }) {
  const byDay = Map.groupBy(items, (i) => nzDay(i.done_at!));
  return (
    <div className="space-y-4">
      {[...byDay].map(([day, list]) => (
        <section key={day}>
          <h3 className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {dayLabel(day)}
            <span className="flex items-center gap-2 font-normal normal-case tabular-nums">
              {list.length} item{list.length === 1 ? "" : "s"}
              {restoreAll && list.length > 1 && (
                <form action={restoreCleared}>
                  {list.map((i) => <input key={i.id} type="hidden" name="id" value={i.id} />)}
                  <button className="text-accent hover:underline">Put all back</button>
                </form>
              )}
            </span>
          </h3>
          <ul className="flex flex-wrap gap-2">
            {list.map((i) => (
              <li key={i.id}>
                <form action={untickGrocery}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-ink" title={`Added ${addedLabel(i.created_at)} – put back on the list`}>
                    <span className="line-through">{i.name}</span>
                    <span className="text-xs no-underline opacity-75">added {addedLabel(i.created_at)}</span>
                    <Undo2 size={13} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ShortcutLink({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <CopyButton text={url} label="Copy link" />
      </div>
      <code className="block rounded-md bg-surface-2 px-2 py-1.5 text-xs break-all">{url}</code>
    </div>
  );
}
