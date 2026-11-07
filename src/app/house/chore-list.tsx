import Link from "next/link";
import { all } from "@/lib/db";
import { addDays, daysUntil, iso, parseISO, shortDate, today } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, Select, Stat, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addChore, addStarterCleaning, deleteChore, markChoreDone, updateChore } from "./actions";
import { AREAS, freqLabel, freqOptions } from "./shared";

type Kind = "chore" | "cleaning";
type Chore = {
  id: number;
  name: string;
  area: string | null;
  every_days: number;
  assignee: string | null;
  last_done: string | null;
};
type Row = Chore & { due: string; days: number };

const AREA_OPTIONS: [string, string][] = [["", "—"], ...AREAS.map((a) => [a, a] as [string, string])];

function dueBadge(days: number) {
  if (days < 0) return <Badge tone="bad">{-days === 1 ? "1 day overdue" : `${-days} days overdue`}</Badge>;
  if (days === 0) return <Badge tone="warn">Due today</Badge>;
  if (days === 1) return <Badge tone="info">Due tomorrow</Badge>;
  return <Badge>Due in {days} days</Badge>;
}

export async function ChoreList({ kind, view }: { kind: Kind; view: "due" | "area" }) {
  const chores = await all<Chore>(
    "SELECT id, name, area, every_days, assignee, last_done FROM chores WHERE kind = ? ORDER BY name",
    kind,
  );
  const now = today();
  const rows: Row[] = chores
    .map((c) => {
      const due = c.last_done ? iso(addDays(parseISO(c.last_done), c.every_days)) : now;
      return { ...c, due, days: daysUntil(due) };
    })
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));

  const overdue = rows.filter((r) => r.days < 0).length;
  const dueToday = rows.filter((r) => r.days === 0).length;
  const thisWeek = rows.filter((r) => r.days > 0 && r.days <= 7).length;
  const noun = kind === "cleaning" ? "cleaning task" : "chore";
  const base = kind === "cleaning" ? "/house/cleaning" : "/house/chores";

  let groups: [string | null, Row[]][];
  if (view === "area") {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.area ?? "Other";
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    const order = [...AREAS, "Other"];
    groups = [...map.entries()].sort(
      (a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) || a[0].localeCompare(b[0]),
    );
  } else {
    groups = [[null, rows]];
  }

  return (
    <div className="space-y-6">
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Overdue" value={overdue} tone={overdue ? "bad" : "good"} />
          <Stat label="Due today" value={dueToday} tone={dueToday ? "warn" : undefined} />
          <Stat label="Next 7 days" value={thisWeek} />
        </div>
      )}

      <AddPanel label={`Add ${noun}`}>
        <form action={addChore} className="space-y-3">
          <input type="hidden" name="kind" value={kind} />
          <FormGrid>
            <Field label="Name">
              <Input name="name" required placeholder={kind === "cleaning" ? "Clean shower" : "Mow lawns"} />
            </Field>
            <Field label="Area">
              <Select name="area" options={AREA_OPTIONS} defaultValue="" />
            </Field>
            <Field label="How often">
              <Select name="every_days" options={freqOptions()} defaultValue="7" />
            </Field>
            <Field label="Who">
              <Input name="assignee" placeholder="Anyone" />
            </Field>
            <Field label="Last done (blank = due now)">
              <Input type="date" name="last_done" />
            </Field>
          </FormGrid>
          <SubmitButton>Add</SubmitButton>
        </form>
      </AddPanel>

      {rows.length === 0 ? (
        <div className="space-y-3">
          <Empty>No {noun}s yet.</Empty>
          {kind === "cleaning" && (
            <form action={addStarterCleaning} className="text-center">
              <SubmitButton variant="secondary">Add a starter cleaning routine</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-1 text-sm">
            <span className="py-1 pr-2 text-muted">Sort:</span>
            {(["due", "area"] as const).map((v) => (
              <Link
                key={v}
                href={v === "due" ? base : `${base}?view=area`}
                className={cx(
                  "rounded-full px-3 py-1",
                  view === v ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2",
                )}
              >
                {v === "due" ? "By due date" : "By area"}
              </Link>
            ))}
          </div>
          {groups.map(([title, list]) => (
            <Card key={title ?? "all"} title={title ?? undefined}>
              <ul className="divide-y divide-line">
                {list.map((c) => (
                  <ChoreRow key={c.id} c={c} />
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function ChoreRow({ c }: { c: Row }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{c.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {dueBadge(c.days)}
            {c.area && <span>{c.area}</span>}
            <span>· {freqLabel(c.every_days)}</span>
            {c.assignee && <span>· {c.assignee}</span>}
            <span>· last done {c.last_done ? shortDate(c.last_done) : "never"}</span>
          </div>
        </div>
        <form action={markChoreDone}>
          <input type="hidden" name="id" value={c.id} />
          <SubmitButton variant={c.days <= 0 ? "primary" : "secondary"} className="!px-3 !py-1.5">
            ✓ Done
          </SubmitButton>
        </form>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-muted select-none hover:text-ink">Edit</summary>
        <div className="mt-2 rounded-lg bg-surface-2 p-3">
          <form action={updateChore} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <FormGrid>
              <Field label="Name">
                <Input name="name" required defaultValue={c.name} />
              </Field>
              <Field label="Area">
                <Select name="area" options={AREA_OPTIONS} defaultValue={c.area ?? ""} />
              </Field>
              <Field label="How often">
                <Select name="every_days" options={freqOptions(c.every_days)} defaultValue={String(c.every_days)} />
              </Field>
              <Field label="Who">
                <Input name="assignee" defaultValue={c.assignee ?? ""} />
              </Field>
              <Field label="Last done">
                <Input type="date" name="last_done" defaultValue={c.last_done ?? ""} />
              </Field>
            </FormGrid>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
          <div className="mt-2 flex justify-end">
            <DeleteButton action={deleteChore} id={c.id} confirmText={`Delete "${c.name}"?`} />
          </div>
        </div>
      </details>
    </li>
  );
}
