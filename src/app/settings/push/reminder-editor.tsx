"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Send, X } from "lucide-react";
import { btn, Input } from "@/components/ui";
import { saveTodoReminder, sendTodoNow, type PushState } from "./actions";
import type { TodoReminder } from "@/lib/push";

const QUICK = ["06:00", "08:00", "10:00", "12:00", "15:00", "17:00", "19:00", "21:00"];

const nice = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

/** One person's to-do reminders: as many times a day as they like, and what to include. */
export function ReminderEditor({ person, name, reminder, devices }: { person: string; name: string; reminder: TodoReminder; devices: number }) {
  const [times, setTimes] = useState(reminder.times);
  const [scope, setScope] = useState(reminder.scope);
  const [next, setNext] = useState("");
  const [state, save, saving] = useActionState<PushState, FormData>(saveTodoReminder, {});
  const [now, setNow] = useState<PushState>({});
  const [sending, start] = useTransition();

  const add = (t: string) => t && setTimes((list) => [...new Set([...list, t])].sort());

  return (
    <form action={save} className="space-y-3 text-sm">
      <input type="hidden" name="person" value={person} />
      {times.map((t) => <input key={t} type="hidden" name="times" value={t} />)}

      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" name="on" defaultChecked={reminder.on} className="size-4" /> Send {name} to-do reminders
      </label>

      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">Times ({times.length} a day)</div>
        <div className="flex flex-wrap gap-1.5">
          {times.length === 0 && <span className="text-xs text-muted">No times yet – add some below.</span>}
          {times.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full border border-accent bg-accent-soft py-0.5 pr-1 pl-3 font-medium text-accent tabular-nums">
              {nice(t)}
              <button type="button" aria-label={`Remove ${nice(t)}`} onClick={() => setTimes(times.filter((x) => x !== t))} className="flex size-5 items-center justify-center rounded-full hover:bg-danger-soft hover:text-danger">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="time" value={next} onChange={(e) => setNext(e.target.value)} className="!w-auto !py-1" aria-label="New reminder time" />
          <button type="button" onClick={() => { add(next); setNext(""); }} disabled={!next} className={`${btn.secondary} ${btn.small}`}><Plus size={13} /> Add time</button>
          <span className="text-xs text-muted">or tap:</span>
          {QUICK.filter((q) => !times.includes(q)).map((q) => (
            <button key={q} type="button" onClick={() => add(q)} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent">+ {nice(q)}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-muted">
          Whose
          <select name="scope" value={scope} onChange={(e) => setScope(e.target.value as TodoReminder["scope"])} className="rounded-lg border border-line bg-surface px-2 py-1 text-ink">
            <option value="family">the whole family&apos;s (a section each)</option>
            <option value="mine">just {name}&apos;s</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-muted">
          Include
          <select name="category" defaultValue={reminder.category} className="rounded-lg border border-line bg-surface px-2 py-1 text-ink">
            <option value="all">all to-dos</option>
            <option value="work">work only</option>
            <option value="personal">personal only</option>
          </select>
        </label>
        {/* the whole family's already has everyone's – only a choice for "just theirs" (kept, not lost, either way) */}
        <label className={scope === "mine" ? "flex items-center gap-2 text-muted" : "hidden"}>
          <input type="checkbox" name="includeEveryone" defaultChecked={reminder.includeEveryone} /> plus ones for everyone
        </label>
        <label className="flex items-center gap-2 text-muted"><input type="checkbox" name="onlyIfAny" defaultChecked={reminder.onlyIfAny} /> skip when there&apos;s nothing to do</label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" disabled={sending || !devices} onClick={() => start(async () => setNow(await sendTodoNow(person)))} className={btn.secondary}
          title={devices ? `Sends the reminder to ${name}'s devices now` : `${name} hasn't turned notifications on on a phone yet`}>
          <Send size={14} /> {sending ? "Sending…" : "Send one now"}
        </button>
        <span className="text-xs text-muted">{devices ? `${devices} device${devices === 1 ? "" : "s"} for ${name}` : `No devices for ${name} yet`}</span>
      </div>
      {(state.message || state.error) && <p className={state.error ? "rounded-lg bg-danger-soft p-2 text-danger" : "rounded-lg bg-accent-soft p-2 text-accent"}>{state.error ?? state.message}</p>}
      {(now.message || now.error) && <p className={now.error ? "rounded-lg bg-danger-soft p-2 text-danger" : "rounded-lg bg-accent-soft p-2 text-accent"}>{now.error ?? now.message}</p>}
    </form>
  );
}
