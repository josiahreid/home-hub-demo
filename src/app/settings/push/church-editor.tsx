"use client";

import { useActionState, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { btn, Input } from "@/components/ui";
import { saveChurchReminder, sendChurchNow, type PushState } from "./actions";
import type { ChurchReminder } from "@/lib/push";

/** Church reminders: when they go, and how far ahead – each serving person only gets their own. */
export function ChurchEditor({ reminder }: { reminder: ChurchReminder }) {
  const [state, save, saving] = useActionState<PushState, FormData>(saveChurchReminder, {});
  const [now, setNow] = useState<PushState>({});
  const [sending, start] = useTransition();
  return (
    <form action={save} className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="on" defaultChecked={reminder.on} className="size-4" /> Send church reminders</label>
        <label className="flex items-center gap-2 text-muted">at <Input type="time" name="time" defaultValue={reminder.time} className="!w-auto !py-1" /></label>
        <select name="daysBefore" defaultValue={String(reminder.daysBefore)} className="rounded-lg border border-line bg-surface px-2 py-1">
          <option value="0">on the day</option>
          <option value="1">the day before</option>
          <option value="2">2 days before</option>
          <option value="3">3 days before</option>
          <option value="7">a week before</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" disabled={sending} onClick={() => start(async () => setNow(await sendChurchNow()))} className={btn.secondary}>
          <Send size={14} /> {sending ? "Sending…" : "Send now"}
        </button>
      </div>
      {(state.message || state.error) && <p className={state.error ? "rounded-lg bg-danger-soft p-2 text-danger" : "rounded-lg bg-accent-soft p-2 text-accent"}>{state.error ?? state.message}</p>}
      {(now.message || now.error) && <p className={now.error ? "rounded-lg bg-danger-soft p-2 text-danger" : "rounded-lg bg-accent-soft p-2 text-accent"}>{now.error ?? now.message}</p>}
    </form>
  );
}
