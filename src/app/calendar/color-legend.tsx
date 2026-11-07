"use client";

import { useRef, useState, useTransition } from "react";
import { resetCalendarColors, setCalendarColor } from "./actions";

/** Calendar legend where each dot is a colour picker. Changes preview instantly and save after a short pause. */
export function ColorLegend({ kinds, colors, isDefault }: {
  kinds: { kind: string; label: string }[];
  colors: Record<string, string>;
  isDefault: boolean;
}) {
  const [local, setLocal] = useState(colors);
  const [, startTransition] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function change(kind: string, color: string) {
    setLocal((c) => ({ ...c, [kind]: color }));
    clearTimeout(timers.current[kind]);
    // the picker fires continuously while dragging, so only save once it settles
    timers.current[kind] = setTimeout(() => startTransition(() => setCalendarColor(kind, color)), 400);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {kinds.map(({ kind, label }) => (
        <label key={kind} className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-2" title={`Change the ${label} colour`}>
          <span className="relative h-3 w-3 overflow-hidden rounded-full ring-1 ring-line" style={{ backgroundColor: local[kind] }}>
            <input
              type="color"
              value={local[kind]}
              onChange={(e) => change(kind, e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label={`${label} colour`}
            />
          </span>
          {label}
        </label>
      ))}
      <span className="text-[11px]">· tap a dot to change its colour</span>
      {!isDefault && (
        <button
          type="button"
          onClick={() => startTransition(async () => { await resetCalendarColors(); location.reload(); })}
          className="text-[11px] text-accent underline"
        >
          reset colours
        </button>
      )}
    </div>
  );
}
