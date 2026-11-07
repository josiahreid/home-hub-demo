"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { btn, cx } from "./ui";
import { useHydrated } from "./hydrated";

export function SubmitButton({ children, variant = "primary", className }: { children: ReactNode; variant?: keyof typeof btn; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(btn[variant], className)}>
      {pending ? "Saving…" : children}
    </button>
  );
}

/** A submit button for plain server forms, disabled until the page is ready (see useHydrated). */
export function ReadyButton({ children, className }: { children: ReactNode; className?: string }) {
  const ready = useHydrated();
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!ready || pending} className={className}>{children}</button>;
}

/** A one-button form that asks "are you sure?" first – disabled until the page is ready, so the question always shows. */
export function ConfirmButton({ action, confirmText, className, children }: {
  action: () => Promise<void>;
  confirmText: string;
  className?: string;
  children: ReactNode;
}) {
  const ready = useHydrated();
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button type="submit" disabled={!ready} className={className}>{children}</button>
    </form>
  );
}

/** Small form that posts `id` to a server action after a confirm() prompt. */
export function DeleteButton({ action, id, label = "Delete", confirmText = "Delete this?" }: {
  action: (fd: FormData) => Promise<void>;
  id: number;
  label?: string;
  confirmText?: string;
}) {
  // until the page is ready the confirm() can't run, so don't allow the tap at all
  const ready = useHydrated();
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={!ready} className={cx(btn.danger, btn.small)}>{label}</button>
    </form>
  );
}
