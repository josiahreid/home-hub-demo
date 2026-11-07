"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { btn, cx } from "@/components/ui";
import { useHydrated } from "@/components/hydrated";
import { setPartStatus } from "./actions";

/**
 * "Mark ordered": opens the date picker straight away to choose when it should arrive. Picking a date saves it
 * (ordered + arrival date); "No date yet" saves it as ordered without one.
 */
export function MarkOrdered({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const ready = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const date = useRef<HTMLInputElement>(null);

  function start() {
    setOpen(true);
    // the browser's own calendar (where it can be opened from a tap); otherwise the date box shows below to tap
    try {
      date.current?.showPicker();
    } catch {
      date.current?.focus();
    }
  }

  return (
    <form ref={form} action={setPartStatus} className={cx("flex flex-wrap items-center gap-1.5", open && "w-full rounded-lg border border-line bg-surface-2 p-2")}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="ordered" />
      {!open && (
        <button type="button" onClick={start} disabled={!ready} className={cx(btn.secondary, btn.small)}>
          Mark ordered
        </button>
      )}
      {open && <span className="flex items-center gap-1 text-xs text-muted"><CalendarDays size={13} /> Arriving</span>}
      {/* always on the page (so the picker can open from the button), only visible once it's tapped */}
      <input
        ref={date}
        type="date"
        name="arrives"
        aria-label="Expected arrival date"
        onChange={(e) => e.currentTarget.value && form.current?.requestSubmit()}
        className={open ? "rounded-lg border border-line bg-surface px-2 py-1 text-sm" : "pointer-events-none absolute h-px w-px opacity-0"}
        tabIndex={open ? 0 : -1}
      />
      {open && (
        <>
          <button type="submit" className={cx(btn.ghost, btn.small)} onClick={() => date.current && (date.current.value = "")}>No date yet</button>
          <button type="button" className={cx(btn.ghost, btn.small)} onClick={() => setOpen(false)}>Cancel</button>
        </>
      )}
    </form>
  );
}
