"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Minus, Plus, Timer, X } from "lucide-react";
import { btn, cx } from "@/components/ui";
import { addSet, removeSet, saveSet } from "../actions";
import type { SetRow } from "@/lib/workout";

type Values = Pick<SetRow, "reps" | "weight" | "seconds" | "distance"> & { done: boolean };

/**
 * Doing a workout: each exercise's sets, filled in from last time – tick each one as it's done, or change a
 * number first. Every change saves straight away. A rest timer sits at the bottom, and the screen stays on.
 */
export function SessionRunner({ sessionId, sets: initial, finished }: { sessionId: number; sets: SetRow[]; finished: boolean }) {
  const [sets, setSets] = useState(initial);
  const [, start] = useTransition();
  useWakeLock(!finished);

  const byExercise = [...Map.groupBy(sets, (s) => s.exercise)];

  function change(id: number, patch: Partial<Values>) {
    setSets((list) => list.map((s) => (s.id === id ? { ...s, ...patch, done: patch.done === undefined ? s.done : patch.done ? 1 : 0 } : s)));
    start(() => saveSet(id, patch));
  }

  return (
    <div className="space-y-4">
      {byExercise.map(([name, list]) => {
        const kind = list[0].kind;
        const allDone = list.every((s) => s.done);
        return (
          <section key={name} className={cx("rounded-xl border bg-surface p-4", allDone ? "border-accent" : "border-line")}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-semibold">{name}</h2>
              {allDone && <span className="flex items-center gap-1 text-xs font-medium text-accent"><Check size={14} /> Done</span>}
            </div>
            <ul className="space-y-2">
              {list.map((s) => (
                <li key={s.id} className={cx("flex items-center gap-2 rounded-lg p-1.5", s.done ? "bg-accent-soft" : "bg-surface-2")}>
                  <span className="w-10 shrink-0 text-center text-xs text-muted">{kind === "distance" ? "" : `Set ${s.set_no}`}</span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    {(kind === "weights" || kind === "bodyweight") && <NumberBox label="reps" value={s.reps} step={1} onChange={(v) => change(s.id, { reps: v })} />}
                    {kind === "weights" && <NumberBox label="kg" value={s.weight} step={2.5} decimal onChange={(v) => change(s.id, { weight: v })} />}
                    {kind === "time" && <NumberBox label="sec" value={s.seconds} step={5} onChange={(v) => change(s.id, { seconds: v })} />}
                    {kind === "distance" && <NumberBox label="km" value={s.distance} step={0.5} decimal onChange={(v) => change(s.id, { distance: v })} />}
                    {kind === "distance" && <NumberBox label="min" value={s.seconds != null ? Math.round(s.seconds / 60) : null} step={1} onChange={(v) => change(s.id, { seconds: v == null ? null : v * 60 })} />}
                  </div>
                  <button
                    type="button"
                    onClick={() => change(s.id, { done: !s.done })}
                    aria-label={s.done ? "Not done" : "Done"}
                    className={cx("flex size-11 shrink-0 items-center justify-center rounded-full border-2", s.done ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent")}
                  >
                    <Check size={20} />
                  </button>
                </li>
              ))}
            </ul>
            {kind !== "distance" && (
              <div className="mt-2 flex gap-3 text-xs">
                <button type="button" className="text-accent" onClick={() => start(async () => {
                  const row = await addSet(sessionId, name);
                  if (row) setSets((l) => [...l, row].sort((a, b) => a.id - b.id));
                })}>+ Add a set</button>
                {list.length > 1 && (
                  <button type="button" className="text-muted hover:text-danger" onClick={() => {
                    const last = list.at(-1)!;
                    setSets((l) => l.filter((x) => x.id !== last.id));
                    start(() => removeSet(last.id));
                  }}>Remove last set</button>
                )}
              </div>
            )}
          </section>
        );
      })}
      {!finished && <RestTimer />}
    </div>
  );
}

/** A number with − and + either side (big enough for a thumb), and typing in the middle. */
function NumberBox({ label, value, step, decimal, onChange }: { label: string; value: number | null; step: number; decimal?: boolean; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const bump = (d: number) => {
    const v = Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100);
    setText(String(v));
    onChange(v);
  };
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => bump(-step)} aria-label={`Less ${label}`} className="flex size-8 items-center justify-center rounded-lg border border-line text-muted"><Minus size={14} /></button>
      <input
        value={text}
        inputMode={decimal ? "decimal" : "numeric"}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text.replace(",", "."));
          onChange(text.trim() === "" || !Number.isFinite(n) ? null : n);
        }}
        className="w-14 rounded-lg border border-line bg-surface px-1 py-1 text-center tabular-nums"
      />
      <button type="button" onClick={() => bump(step)} aria-label={`More ${label}`} className="flex size-8 items-center justify-center rounded-lg border border-line text-muted"><Plus size={14} /></button>
      <span className="text-xs text-muted">{label}</span>
    </span>
  );
}

/** Rest between sets: tap a time, it counts down, and the phone buzzes at the end (where phones allow it). */
function RestTimer() {
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function begin(seconds: number) {
    if (timer.current) clearInterval(timer.current);
    setLeft(seconds);
    timer.current = countdown(seconds, (s) => {
      setLeft(s);
      if (s === 0) {
        clearInterval(timer.current!);
        timer.current = null;
        navigator.vibrate?.([200, 100, 200]);
      }
    });
  }
  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLeft(null);
  }
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:left-56">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Timer size={18} className="shrink-0 text-muted" />
        {left == null ? (
          <>
            <span className="text-sm text-muted">Rest</span>
            {[60, 90, 120, 180].map((s) => (
              <button key={s} type="button" onClick={() => begin(s)} className={cx(btn.secondary, btn.small)}>{s < 120 ? `${s}s` : `${s / 60} min`}</button>
            ))}
          </>
        ) : (
          <>
            <span className={cx("text-2xl font-semibold tabular-nums", left === 0 && "text-accent")}>{left === 0 ? "Go!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
            <button type="button" onClick={() => begin(left + 15)} className={cx(btn.secondary, btn.small)}>+15s</button>
            <button type="button" onClick={stop} aria-label="Stop the timer" className={cx(btn.ghost, btn.small, "ml-auto")}><X size={16} /></button>
          </>
        )}
      </div>
    </div>
  );
}

/** Calls `tick` with the seconds left, four times a second, from `seconds` down to 0 (by the clock, so it stays right in the background). */
function countdown(seconds: number, tick: (left: number) => void) {
  const end = Date.now() + seconds * 1000;
  return setInterval(() => tick(Math.max(0, Math.round((end - Date.now()) / 1000))), 250);
}

/** Keeps the phone's screen on while a workout is going (where the browser allows it). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = () => navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    void get();
    // the lock is dropped when the app goes to the background; take it again on return
    const again = () => document.visibilityState === "visible" && void get();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}
