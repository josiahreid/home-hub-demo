"use client";

import { useActionState, useTransition } from "react";
import { Field, Input, Textarea, btn, cx } from "@/components/ui";
import { useHydrated } from "@/components/hydrated";
import { saveServing, type ServingState } from "./actions";

type Values = { date: string; title: string; time: string; spotify_url?: string; notes?: string };

/**
 * Add or edit a serving date: date, service name, time, Spotify link and notes, then Save.
 * `person` is who it's for (the tab you're on); `choosePerson` shows Default Name / Default Name 2 / Both instead (the Overview).
 */
export function ServingForm({ id, person, choosePerson, values, saveLabel = "Save" }: {
  id?: number;
  person?: string;
  choosePerson?: boolean;
  values: Values;
  saveLabel?: string;
}) {
  const [state, save, saving] = useActionState<ServingState, FormData>(saveServing, {});
  const [, start] = useTransition();
  // before the page is ready the form would post the old-fashioned way and lose the "Saved" message
  const ready = useHydrated();
  // Saved with onSubmit rather than a form action: React empties a form after every action – even one that
  // failed – which lost what had been typed. This way it only starts fresh (new key) after a new date is saved.
  const formKey = id ? `edit-${id}` : `new-${state.savedAt ?? 0}`;

  return (
    <form
      key={formKey}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(() => save(fd));
      }}
      className="space-y-3"
    >
      {id && <input type="hidden" name="id" value={id} />}
      {!choosePerson && <input type="hidden" name="person" value={person} />}
      {choosePerson && (
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-muted">Who&apos;s serving</legend>
          <div className="flex gap-2">
            {[["Default Name", "Default Name"], ["Default Name 2", "Default Name 2"], ["Both", "Default Name & Default Name 2"]].map(([v, label], i) => (
              <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                <input type="radio" name="person" value={v} defaultChecked={i === 0} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Date"><Input type="date" name="date" required defaultValue={values.date} /></Field>
        <Field label="Service name"><Input name="title" defaultValue={values.title} placeholder="Sunday service" /></Field>
        <Field label="Time"><Input type="time" name="time" defaultValue={values.time} /></Field>
      </div>
      <Field label="Spotify link (optional)">
        <Input name="spotify_url" type="url" inputMode="url" defaultValue={values.spotify_url ?? ""} placeholder="https://open.spotify.com/playlist/…" />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={values.notes ?? ""} placeholder="e.g. leading 2 songs, bring capo, soundcheck 8:30" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ready || saving} className={cx(btn.primary, "min-w-28")}>{saving ? "Saving…" : saveLabel}</button>
        {(state.message || state.error) && (
          <p role="status" className={cx("rounded-lg px-3 py-1.5 text-sm", state.error ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent")}>
            {state.error ?? state.message}
          </p>
        )}
      </div>
    </form>
  );
}
