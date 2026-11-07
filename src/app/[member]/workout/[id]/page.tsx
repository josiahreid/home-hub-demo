import Link from "next/link";
import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { niceDate } from "@/lib/format";
import { sessionSets, type Session } from "@/lib/workout";
import { Card, Field, Textarea } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { memberWith } from "../../member";
import { deleteSession, finishSession } from "../actions";
import { SessionRunner } from "./session-runner";

/** One workout being done (or looked back on): its sets to tick, then Finish. */
export default async function SessionPage({ params }: PageProps<"/[member]/workout/[id]">) {
  const m = await memberWith(params, "workout");
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await get<Session>("SELECT * FROM workout_sessions WHERE id = ? AND member_id = ?", id, m.id) : undefined;
  if (!s) notFound();
  const sets = sessionSets(s.id);
  const finished = !!s.finished_at;

  return (
    // room at the bottom for the rest timer bar while it's going
    <div className={finished ? "mx-auto max-w-3xl" : "mx-auto max-w-3xl pb-24"}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/${m.slug}/workout`} className="text-sm text-muted hover:text-ink">← Workout</Link>
        <h2 className="text-xl font-semibold">{s.name}</h2>
        <span className="text-sm text-muted">{niceDate(s.date)}{finished ? " · done ✓" : ""}</span>
      </div>

      {sets.length === 0 ? (
        <Card><p className="text-sm text-muted">This workout has no exercises yet – add some to it in the routine.</p></Card>
      ) : (
        <SessionRunner sessionId={s.id} sets={sets} finished={finished} />
      )}

      <Card className="mt-4">
        <form action={finishSession} className="space-y-3">
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="slug" value={m.slug} />
          <Field label="Notes (optional)"><Textarea name="notes" rows={2} defaultValue={s.notes ?? ""} placeholder="How it felt, what to change next time…" /></Field>
          <SubmitButton className="w-full !py-3 !text-base">{finished ? "Save notes" : "Finish workout"}</SubmitButton>
        </form>
        <div className="mt-3 flex justify-end">
          <DeleteButton action={deleteSession} id={s.id} label={finished ? "Delete this workout" : "Cancel – don't save it"}
            confirmText={finished ? "Delete this workout from the history?" : "Throw this workout away?"} />
        </div>
      </Card>
    </div>
  );
}
