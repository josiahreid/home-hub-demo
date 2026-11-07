"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Input, btn, cx } from "@/components/ui";
import { quickAddGrocery } from "./food/groceries/actions";

/** "Add to groceries" straight from the Home page – stays on Home and says what went on. */
export function QuickGrocery() {
  const [state, add, adding] = useActionState(quickAddGrocery, {});
  return (
    <form action={add} className="mb-6 rounded-xl border border-line bg-surface p-3">
      {/* key: a fresh, empty box after each add */}
      <div className="flex flex-wrap items-center gap-2" key={state.message}>
        <ShoppingCart size={18} className="shrink-0 text-accent" aria-hidden />
        <Input name="name" required placeholder="Add groceries" autoComplete="off" className="min-w-0 flex-1 !py-2 !text-base" aria-label="Add to groceries" />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-sm has-[:checked]:border-danger has-[:checked]:bg-danger-soft has-[:checked]:text-danger">
          <input type="checkbox" name="urgent" className="size-4 accent-[var(--danger)]" /> Urgent
        </label>
        <button disabled={adding} className={cx(btn.primary, "px-4")}>{adding ? "Adding…" : "Add"}</button>
      </div>
      {state.message && (
        <p className="mt-2 text-sm text-accent">
          {state.message} <Link href="/food/groceries" className="underline">See the list</Link>
        </p>
      )}
    </form>
  );
}
