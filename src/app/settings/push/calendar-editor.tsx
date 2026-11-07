"use client";

import { useActionState, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { btn, Input } from "@/components/ui";
import { saveCalendarPush, saveEventPush, saveSortPush, saveWorkoutPush, sendCalendarPushNow, sendSortNow, sendWorkoutNow, type PushState } from "./actions";
import type { CalendarSummary, EventReminder, SortReminder } from "@/lib/push";
import type { WorkoutNotify } from "@/lib/workout";

const note = (s: PushState) =>
  (s.message || s.error) && <p className={s.error ? "rounded-lg bg-danger-soft p-2 text-danger" : "rounded-lg bg-accent-soft p-2 text-accent"}>{s.error ?? s.message}</p>;

/** The day's calendar on everyone's phones: today's in the morning, tomorrow's in the evening. */
export function CalendarEditor({ summary }: { summary: CalendarSummary }) {
  const [state, save, saving] = useActionState<PushState, FormData>(saveCalendarPush, {});
  const [now, setNow] = useState<PushState>({});
  const [sending, start] = useTransition();
  return (
    <form action={save} className="space-y-3 text-sm">
      {(["today", "tomorrow"] as const).map((w) => (
        <div key={w} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name={`${w}On`} defaultChecked={summary[w].on} className="size-4" /> {w === "today" ? "Today's calendar" : "Tomorrow's calendar"}
          </label>
          <label className="flex items-center gap-2 text-muted">at <Input type="time" name={`${w}Time`} defaultValue={summary[w].time} className="!w-auto !py-1" /></label>
          <button type="button" disabled={sending} onClick={() => start(async () => setNow(await sendCalendarPushNow(w)))} className={`${btn.ghost} ${btn.small}`}>
            <Send size={13} /> Send now
          </button>
        </div>
      ))}
      <button disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
      {note(state)}
      {note(now)}
    </form>
  );
}

/** A heads-up before each event that has a time. */
export function EventEditor({ reminder }: { reminder: EventReminder }) {
  const [state, save, saving] = useActionState<PushState, FormData>(saveEventPush, {});
  return (
    <form action={save} className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="on" defaultChecked={reminder.on} className="size-4" /> Remind before events</label>
        <select name="minutesBefore" defaultValue={String(reminder.minutesBefore)} className="rounded-lg border border-line bg-surface px-2 py-1">
          {[10, 15, 30, 45, 60, 120].map((m) => (
            <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`} before</option>
          ))}
        </select>
      </div>
      <button disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
      {note(state)}
    </form>
  );
}

/** Workouts: a reminder on each person's workout days (if it's not done yet), and whether they show in the daily messages. */
export function WorkoutEditor({ notify }: { notify: WorkoutNotify }) {
  const [state, save, saving] = useActionState<PushState, FormData>(saveWorkoutPush, {});
  const [now, setNow] = useState<PushState>({});
  const [sending, start] = useTransition();
  return (
    <form action={save} className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="on" defaultChecked={notify.on} className="size-4" /> Remind on workout days</label>
        <label className="flex items-center gap-2 text-muted">at <Input type="time" name="time" defaultValue={notify.time} className="!w-auto !py-1" /></label>
      </div>
      <label className="flex items-center gap-2 text-muted">
        <input type="checkbox" name="inSummaries" defaultChecked={notify.inSummaries} /> Show workouts in the daily calendar messages (Telegram and phone)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" disabled={sending} onClick={() => start(async () => setNow(await sendWorkoutNow()))} className={btn.secondary}>
          <Send size={14} /> {sending ? "Sending…" : "Send today's now"}
        </button>
      </div>
      {note(state)}
      {note(now)}
    </form>
  );
}

/** Transactions to sort: when, who, only when new ones came in, and Telegram too. */
export function SortEditor({ reminder, people }: { reminder: SortReminder; people: { slug: string; name: string }[] }) {
  const [state, save, saving] = useActionState<PushState, FormData>(saveSortPush, {});
  const [now, setNow] = useState<PushState>({});
  const [sending, start] = useTransition();
  return (
    <form action={save} className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="on" defaultChecked={reminder.on} className="size-4" /> Remind me to sort</label>
        <label className="flex items-center gap-2 text-muted">at <Input type="time" name="time" defaultValue={reminder.time} className="!w-auto !py-1" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-muted">
        <span>To</span>
        {people.map((p) => (
          <label key={p.slug} className="flex items-center gap-1.5"><input type="checkbox" name="people" value={p.slug} defaultChecked={!reminder.people || reminder.people.includes(p.slug)} /> {p.name}</label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-muted"><input type="checkbox" name="onlyNew" defaultChecked={reminder.onlyNew} /> Only when new ones have come in since the last reminder</label>
      <label className="flex items-center gap-2 text-muted"><input type="checkbox" name="telegram" defaultChecked={reminder.telegram} /> Also send it to Telegram</label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" disabled={sending} onClick={() => start(async () => setNow(await sendSortNow()))} className={btn.secondary}>
          <Send size={14} /> {sending ? "Sending…" : "Send one now"}
        </button>
      </div>
      {note(state)}
      {note(now)}
    </form>
  );
}
