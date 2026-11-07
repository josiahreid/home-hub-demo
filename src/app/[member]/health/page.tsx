import { all } from "@/lib/db";
import { niceDate, relDays, today } from "@/lib/format";
import { Card, Empty, Field, Input, Textarea, btn } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addHealthNote, deleteHealthNote, updateHealthNote } from "./actions";
import { memberWith } from "../member";

type HealthNote = { id: number; title: string; date: string; notes: string | null };

/** A family member's health notes: what happened, when, and notes underneath – newest first. */
export default async function HealthPage({ params }: PageProps<"/[member]/health">) {
  const m = await memberWith(params, "health");
  const notes = await all<HealthNote>("SELECT id, title, date, notes FROM health_notes WHERE member_id = ? ORDER BY date DESC, id DESC", m.id);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:order-last">
        <Card title="Add a health note">
          <form action={addHealthNote} key={notes.length} className="space-y-3">
            <input type="hidden" name="member_id" value={m.id} />
            <Field label="Event"><Input name="title" required placeholder="GP visit, flu jab, sore back…" autoComplete="off" /></Field>
            <Field label="Date"><Input type="date" name="date" required defaultValue={today()} /></Field>
            <Field label="Notes"><Textarea name="notes" rows={4} placeholder="What happened, what the doctor said, medicine and doses…" /></Field>
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>
      </div>

      <div className="space-y-3 lg:col-span-2">
        {notes.length === 0 ? (
          <Card><Empty>No health notes for {m.name} yet.</Empty></Card>
        ) : (
          notes.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{n.title}</h3>
                <span className="text-xs text-muted">{niceDate(n.date)} · {relDays(n.date)}</span>
              </div>
              {n.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{n.notes}</p>}
              <details className="mt-2">
                <summary className={`${btn.ghost} ${btn.small} list-none`}>Edit</summary>
                <form action={updateHealthNote} className="mt-2 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
                  <input type="hidden" name="id" value={n.id} />
                  <Field label="Event"><Input name="title" required defaultValue={n.title} /></Field>
                  <Field label="Date"><Input type="date" name="date" required defaultValue={n.date} /></Field>
                  <Field label="Notes"><Textarea name="notes" rows={4} defaultValue={n.notes ?? ""} /></Field>
                  <SubmitButton>Save</SubmitButton>
                </form>
                <div className="mt-2"><DeleteButton action={deleteHealthNote} id={n.id} confirmText={`Delete "${n.title}"?`} /></div>
              </details>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
