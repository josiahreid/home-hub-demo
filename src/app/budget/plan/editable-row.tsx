"use client";

import { useState, type ReactNode } from "react";
import { btn, cx, td } from "@/components/ui";

/** A table row with a ✎ button that opens its edit form in a full-width row underneath. */
export function EditableRow({ cells, editor, columns, label }: { cells: ReactNode; editor: ReactNode; columns: number; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={open ? "bg-surface-2/40" : ""}>
        {cells}
        <td className={`${td} w-8 text-right`}>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Edit ${label}`} className={cx(btn.ghost, btn.small)}>
            {open ? "✕" : "✎"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-2/40">
          {/* close once a save or delete goes through (a cancelled delete prevents the submit) */}
          <td colSpan={columns} className={td} onSubmit={(e) => { if (!e.defaultPrevented) setOpen(false); }}>
            {editor}
          </td>
        </tr>
      )}
    </>
  );
}
