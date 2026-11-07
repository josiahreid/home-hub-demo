"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cx } from "./ui";

/**
 * A list you can reorder by dragging the ⋮⋮ handle – with a mouse or a finger. Rows are rendered on the server
 * and passed in; when one is dropped, `onReorder` gets the ids in their new order.
 */
export function SortableList({ items, onReorder, className }: {
  items: { id: number; row: ReactNode }[];
  onReorder: (ids: number[]) => Promise<void>;
  className?: string;
}) {
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [dragging, setDragging] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  const startOrder = useRef<number[]>([]);

  // the server's order wins whenever the list itself changes (an item added, ticked or deleted)
  const ids = items.map((i) => i.id);
  const same = ids.length === order.length && ids.every((id) => order.includes(id));
  const shown = same ? order : ids;
  if (!same) setOrder(ids);
  const byId = new Map(items.map((i) => [i.id, i.row]));

  function onPointerDown(e: React.PointerEvent, id: number) {
    e.preventDefault();
    // keep getting moves while the finger leaves the handle (not possible for every pointer, so it's optional)
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    startOrder.current = shown;
    setDragging(id);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging == null || !listRef.current) return;
    // the dragged row goes after every other row whose middle the pointer has passed
    const others = ([...listRef.current.children] as HTMLElement[]).filter((el) => Number(el.dataset.id) !== dragging);
    const idx = others.filter((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY > r.top + r.height / 2;
    }).length;
    const without = shown.filter((x) => x !== dragging);
    const next = [...without.slice(0, idx), dragging, ...without.slice(idx)];
    if (next.join() !== shown.join()) setOrder(next);
  }

  function onPointerUp() {
    if (dragging == null) return;
    setDragging(null);
    if (shown.join() !== startOrder.current.join()) startTransition(() => onReorder(shown));
  }

  return (
    <ul ref={listRef} className={cx("divide-y divide-line", className)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {shown.map((id) => (
        <li key={id} data-id={id} className={cx("flex items-start gap-1", dragging === id && "relative z-10 rounded-lg bg-surface-2 shadow-md")}>
          <button
            type="button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            onPointerDown={(e) => onPointerDown(e, id)}
            className="mt-2.5 cursor-grab touch-none p-1 text-muted hover:text-ink active:cursor-grabbing"
          >
            <GripVertical size={16} />
          </button>
          <div className="min-w-0 flex-1">{byId.get(id)}</div>
        </li>
      ))}
    </ul>
  );
}
