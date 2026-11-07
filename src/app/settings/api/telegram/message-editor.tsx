"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Bot, Plus, RotateCcw, Send, X } from "lucide-react";
import { btn, Input } from "@/components/ui";
import {
  CAL_CATS, DEFAULT_NOTIFY, MESSAGE_INFO, renderCalendar, renderTemplate,
  slotLabel, type CalCat, type CalLine, type CalMessage, type ChurchMessage, type ChurchSlot, type NotifyConfig, type NotifyKind,
} from "@/lib/notify-format";
import { saveNotify, testNotify, type TgState } from "./actions";

type Props = {
  kind: NotifyKind;
  config: NotifyConfig[NotifyKind];
  values: Record<string, string>;            // today's real data, already Telegram HTML
  lines: CalLine[];                          // calendar messages: the day's lines, a section for each person
  canSend: boolean;
};

/** One scheduled message: when it goes, what's in it, its wording – with a live preview of how it'll look in Telegram. */
export function MessageEditor({ kind, config, values, lines, canSend }: Props) {
  const info = MESSAGE_INFO[kind];
  const isCal = kind === "today" || kind === "tomorrow";
  const [template, setTemplate] = useState(config.template);
  const [cats, setCats] = useState<CalCat[]>(isCal ? (config as CalMessage).cats : []);
  const [state, save, saving] = useActionState<TgState, FormData>(saveNotify, {});
  const [test, setTest] = useState<TgState>({});
  const [testing, startTest] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  // the preview follows what's ticked and typed, before saving
  const shown = { ...values };
  if (isCal) {
    const usesBins = kind === "tomorrow" && template.includes("{bins}");
    const cal = renderCalendar(lines, cats.filter((c) => !(usesBins && c === "bin")));
    const binsShown = kind === "tomorrow" && cats.includes("bin") ? values.bins : "";
    shown.calendar = cal || (binsShown ? "" : kind === "today" ? "Nothing on today." : "Nothing on tomorrow.");
    if (kind === "tomorrow") shown.bins = binsShown;
    if (kind === "today" && !cats.includes("todo")) shown.overdue = "";
  }
  const preview = renderTemplate(template, shown);
  const nothingToSend =
    (kind === "groceries" && values.count === "0") || (kind === "church" && !values.serving && !values.practices);

  function insert(ph: string) {
    const el = box.current;
    const text = `{${ph}}`;
    if (!el) return setTemplate((t) => t + text);
    const [a, b] = [el.selectionStart, el.selectionEnd];
    setTemplate(template.slice(0, a) + text + template.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + text.length, a + text.length);
    });
  }

  return (
    <form action={save} className="grid gap-4 lg:grid-cols-2">
      <input type="hidden" name="kind" value={kind} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="on" defaultChecked={config.on} className="size-4" /> Send it
          </label>
          {kind !== "church" && (
            <label className="flex items-center gap-2 text-sm text-muted">
              at <Input type="time" name="time" defaultValue={config.time} className="!w-auto !py-1" />
            </label>
          )}
        </div>
        {kind === "church" && <ChurchSlots initial={(config as ChurchMessage).slots} />}

        {isCal && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted">Categories (each gets its own heading)</legend>
            <div className="flex flex-wrap gap-1.5">
              {CAL_CATS.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                  <input
                    type="checkbox" name="cats" value={c.value} className="sr-only" checked={cats.includes(c.value)}
                    onChange={(e) => setCats(e.target.checked ? [...cats, c.value] : cats.filter((x) => x !== c.value))}
                  />
                  {c.icon} {c.label}
                </label>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="skipEmpty" defaultChecked={(config as CalMessage).skipEmpty} /> Don&apos;t send when there&apos;s nothing on
            </label>
          </fieldset>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">What it says</span>
            <button type="button" onClick={() => setTemplate(DEFAULT_NOTIFY[kind].template)} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
              <RotateCcw size={12} /> Default wording
            </button>
          </div>
          <textarea
            ref={box}
            name="template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Insert:</span>
            {info.placeholders.map(([ph, what]) => (
              <button key={ph} type="button" title={what} onClick={() => insert(ph)} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono hover:border-accent hover:text-accent">
                {`{${ph}}`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Write <code>**bold**</code> or <code>_italic_</code>. Emojis work. Each <code>{"{…}"}</code> is filled in when it&apos;s sent; empty ones disappear.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
          <button
            type="button"
            disabled={testing || !canSend}
            title={canSend ? "Sends the saved version now" : "Connect the bot and link a chat first"}
            onClick={() => startTest(async () => setTest(await testNotify(kind)))}
            className={btn.secondary}
          >
            <Send size={14} /> {testing ? "Sending…" : "Send a test"}
          </button>
        </div>
        {(state.message || state.error) && <Result state={state} />}
        {(test.message || test.error) && <Result state={test} />}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-muted">Preview – with today&apos;s real data</div>
        <div className="rounded-xl bg-[#17212b] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-[#8b9bab]">
            <span className="flex size-6 items-center justify-center rounded-full bg-[#5288c1] text-white"><Bot size={14} /></span>
            Home Hub bot
          </div>
          <div
            className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#182533] px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap break-words text-[#f5f5f5] [&_b]:font-semibold [&_i]:italic"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
          {nothingToSend && (
            <p className="mt-2 text-xs text-[#8b9bab]">
              {kind === "groceries" ? "The list is empty right now, so this wouldn't be sent today." : "No church that day, so this wouldn't be sent."}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

function Result({ state }: { state: TgState }) {
  return state.error
    ? <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>
    : <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>;
}

const DAYS: [number, string][] = [[0, "on the day"], [1, "the day before"], [2, "2 days before"], [3, "3 days before"], [7, "a week before"]];

/** Church reminders: as many times as you like, each a time and how far ahead (like the to-do push reminders). */
function ChurchSlots({ initial }: { initial: ChurchSlot[] }) {
  const [slots, setSlots] = useState(initial);
  const [time, setTime] = useState("07:00");
  const [days, setDays] = useState(0);
  const key = (x: ChurchSlot) => `${x.time}|${x.daysBefore}`;
  const add = () => {
    if (!time || slots.some((x) => key(x) === key({ time, daysBefore: days }))) return;
    setSlots([...slots, { time, daysBefore: days }].sort((a, b) => b.daysBefore - a.daysBefore || a.time.localeCompare(b.time)));
  };
  return (
    <div className="text-sm">
      {slots.map((x) => (
        <span key={key(x)}>
          <input type="hidden" name="slot_time" value={x.time} />
          <input type="hidden" name="slot_days" value={x.daysBefore} />
        </span>
      ))}
      <div className="mb-1.5 text-xs font-medium text-muted">Send at ({slots.length} reminder{slots.length === 1 ? "" : "s"} per serving date)</div>
      <div className="flex flex-wrap gap-1.5">
        {slots.length === 0 && <span className="text-xs text-muted">No times yet – add one below.</span>}
        {slots.map((x) => (
          <span key={key(x)} className="flex items-center gap-1 rounded-full border border-accent bg-accent-soft py-0.5 pr-1 pl-3 font-medium text-accent">
            {slotLabel(x)}
            <button type="button" aria-label={`Remove ${slotLabel(x)}`} onClick={() => setSlots(slots.filter((y) => key(y) !== key(x)))} className="flex size-5 items-center justify-center rounded-full hover:bg-danger-soft hover:text-danger">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="!w-auto !py-1" aria-label="New reminder time" />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="How far ahead" className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink">
          {DAYS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button type="button" onClick={add} disabled={!time} className={`${btn.secondary} ${btn.small}`}><Plus size={13} /> Add time</button>
      </div>
      <p className="mt-1 text-xs text-muted">Remember to press Save below.</p>
    </div>
  );
}
