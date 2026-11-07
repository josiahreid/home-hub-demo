import Link from "next/link";
import { io } from "next/cache";
import { Briefcase, Home, Star, Undo2 } from "lucide-react";
import { all } from "@/lib/db";
import { members } from "@/lib/members";
import { currentUser } from "@/lib/current-user";
import { niceDate, relDays, shortDate, today } from "@/lib/format";
import { Badge, Card, Empty, Input, PageHeader, Select, Textarea, btn, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { SortableList } from "@/components/sortable-list";
import { addTodo, clearDone, deleteTodo, reopenTodo, reorderTodos, toggleImportant, toggleTodo, updateTodo } from "./actions";

type Todo = { id: number; title: string; notes: string | null; due: string | null; important: number; done_at: string | null; person: string | null; category: string | null };
type Cat = "work" | "personal";
const CAT_LABEL: Record<Cat, string> = { work: "Work", personal: "Personal" };

export default async function Todos({ searchParams }: PageProps<"/todos">) {
  await io();
  const { add, show, who, cat } = await searchParams;
  const people = await members();
  const me = await currentUser();
  const category: Cat | null = cat === "work" || cat === "personal" ? cat : null;
  const nameOf = new Map(people.map((m) => [m.slug, m.name]));
  // a tab per family member (Default Name, Default Name 2…); "Everyone" shows the lot
  const tab = typeof who === "string" && nameOf.has(who) ? who : null;
  const onlyImportant = show === "important";

  const todos = await all<Todo>("SELECT * FROM todos ORDER BY sort, id");
  const mine = tab ? todos.filter((t) => t.person === tab) : todos;
  const open = mine.filter((t) => !t.done_at);
  const list = open.filter((t) => (!onlyImportant || t.important) && (!category || t.category === category));
  const finished = mine.filter((t) => t.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!));

  const href = (w: string | null, imp = onlyImportant, c: Cat | null = category) => {
    const q = new URLSearchParams();
    if (w) q.set("who", w);
    if (imp) q.set("show", "important");
    if (c) q.set("cat", c);
    const s = q.toString();
    return s ? `/todos?${s}` : "/todos";
  };
  const openCount = (slug: string | null) => todos.filter((t) => !t.done_at && (!slug || t.person === slug)).length;
  const personOptions: [string, string][] = [["", "Everyone"], ...people.map((m): [string, string] => [m.slug, m.name])];

  return (
    <>
      <PageHeader
        title="To do"
        subtitle={`${open.length} to do · ${open.filter((t) => t.important).length} important`}
        actions={
          <>
            <Link href={href(tab, !onlyImportant)} className={cx(btn.secondary, onlyImportant && "!border-warn !text-warn")}>
              <Star size={14} fill={onlyImportant ? "currentColor" : "none"} /> Important only
            </Link>
            <Link href={href(tab, onlyImportant, category === "work" ? null : "work")} className={cx(btn.secondary, category === "work" && "!border-info !text-info")}>
              <Briefcase size={14} /> Work only
            </Link>
            <Link href={href(tab, onlyImportant, category === "personal" ? null : "personal")} className={cx(btn.secondary, category === "personal" && "!border-accent !text-accent")}>
              <Home size={14} /> Personal only
            </Link>
          </>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]">
        {[{ slug: null as string | null, name: "Everyone" }, ...people].map((p) => (
          <Link
            key={p.slug ?? "all"}
            href={href(p.slug)}
            className={cx(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
              tab === p.slug ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {p.name}
            <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums">{openCount(p.slug)}</span>
          </Link>
        ))}
      </div>

      <Card className="mb-6">
        {/* key resets the form after each add */}
        <form action={addTodo} key={open.length} className="space-y-3">
          <div className="flex gap-2">
            <Input
              name="title" required autoFocus={add === "1"} className="!py-3 !text-base" aria-label="To do"
              placeholder={tab ? `What does ${nameOf.get(tab)} need to do?` : "What needs doing?"}
            />
          </div>
          {/* the button pressed tags it as work or personal */}
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button name="category" value="work" className={cx(btn.primary, "sm:px-5")}><Briefcase size={15} /> Add work</button>
            <button name="category" value="personal" className={cx(btn.primary, "sm:px-5")}><Home size={15} /> Add personal</button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {tab ? <input type="hidden" name="person" value={tab} /> : (
              <label className="flex items-center gap-2 text-muted">
                For <Select name="person" options={personOptions} defaultValue={me?.slug ?? ""} className="!w-auto !py-1" />
              </label>
            )}
            <label className="flex items-center gap-2 font-medium text-warn">
              <input type="checkbox" name="important" defaultChecked={add === "1" || onlyImportant} /> <Star size={14} /> Important
            </label>
            <label className="flex items-center gap-2 text-muted">
              Due <Input type="date" name="due" className="!w-auto !py-1" />
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-accent">+ Notes</summary>
            <Textarea name="notes" rows={2} className="mt-2" placeholder="Phone numbers, details…" />
          </details>
        </form>
      </Card>

      {list.length === 0 ? (
        <Empty>{onlyImportant || category ? "Nothing matches – try turning the filter off." : tab ? `Nothing on ${nameOf.get(tab)}'s list.` : "Nothing to do. Add something above."}</Empty>
      ) : (
        <Card title="To do" actions={<span className="text-xs text-muted">drag ⋮⋮ to reorder</span>}>
          <SortableList
            items={list.map((t) => ({ id: t.id, row: <TodoRow todo={t} who={!tab && t.person ? nameOf.get(t.person) : undefined} personOptions={personOptions} /> }))}
            onReorder={reorderTodos}
          />
        </Card>
      )}

      {finished.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted">Done ({finished.length})</summary>
          <Card className="mt-2">
            <ul className="divide-y divide-line">
              {finished.slice(0, 50).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent text-xs text-accent-ink">✓</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-muted line-through">{t.title}</div>
                    <div className="text-xs text-muted">
                      done {niceDate(t.done_at)}{!tab && t.person ? ` · ${nameOf.get(t.person) ?? t.person}` : ""}
                    </div>
                  </div>
                  <form action={reopenTodo}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className={cx(btn.secondary, btn.small)}><Undo2 size={13} /> Back to list</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={clearDone} className="mt-3">
              <button className={cx(btn.ghost, btn.small)}>Clear done list</button>
            </form>
          </Card>
        </details>
      )}
    </>
  );
}

function TodoRow({ todo: t, who, personOptions }: { todo: Todo; who?: string; personOptions: [string, string][] }) {
  const overdue = t.due && t.due < today();
  return (
    <div className="py-2">
      <div className="flex items-start gap-3">
        <form action={toggleTodo}>
          <input type="hidden" name="id" value={t.id} />
          <button
            aria-label="Mark done"
            className={cx(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs",
              t.important ? "border-warn hover:bg-warn-soft" : "border-line hover:bg-surface-2",
            )}
          />
        </form>
        <div className="min-w-0 flex-1">
          <div className="font-medium break-words">{t.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {who && <Badge tone="info">{who}</Badge>}
            {t.category === "work" && <Badge tone="info"><Briefcase size={11} /> {CAT_LABEL.work}</Badge>}
            {t.category === "personal" && <Badge tone="good"><Home size={11} /> {CAT_LABEL.personal}</Badge>}
            {t.due && <Badge tone={overdue ? "bad" : t.due === today() ? "warn" : "neutral"}>{shortDate(t.due)} · {relDays(t.due)}</Badge>}
            {t.notes && <span className="text-xs whitespace-pre-wrap text-muted">{t.notes}</span>}
          </div>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-accent">Edit</summary>
            <form action={updateTodo} className="mt-2 space-y-2">
              <input type="hidden" name="id" value={t.id} />
              <Input name="title" defaultValue={t.title} required />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Select name="person" options={personOptions} defaultValue={t.person ?? ""} className="!w-auto !py-1" aria-label="For" />
                <Select name="category" options={[["", "No tag"], ["work", "Work"], ["personal", "Personal"]]} defaultValue={t.category ?? ""} className="!w-auto !py-1" aria-label="Work or personal" />
                <label className="flex items-center gap-2 text-muted">
                  Due <Input type="date" name="due" defaultValue={t.due ?? ""} className="!w-auto !py-1" aria-label="Due date" />
                </label>
                <label className="flex items-center gap-2"><input type="checkbox" name="important" defaultChecked={!!t.important} /> Important</label>
              </div>
              <Textarea name="notes" rows={2} defaultValue={t.notes ?? ""} />
              <SubmitButton variant="secondary">Save</SubmitButton>
            </form>
            <div className="mt-2"><DeleteButton action={deleteTodo} id={t.id} confirmText="Delete this to-do?" /></div>
          </details>
        </div>
        <form action={toggleImportant}>
          <input type="hidden" name="id" value={t.id} />
          <button aria-label={t.important ? "Not important" : "Mark important"} className={cx("p-1", t.important ? "text-warn" : "text-line hover:text-muted")}>
            <Star size={18} fill={t.important ? "currentColor" : "none"} />
          </button>
        </form>
      </div>
    </div>
  );
}
