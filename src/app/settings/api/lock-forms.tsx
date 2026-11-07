"use client";

import { useActionState } from "react";
import { useHydrated } from "@/components/hydrated";
import { Lock } from "lucide-react";
import { Field, Input, btn } from "@/components/ui";
import { changePassword, setupPassword, unlock, type LockState } from "./actions";

function Result({ state }: { state: LockState }) {
  if (state.error) return <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>;
  return null;
}

export function SetupForm({ rule }: { rule: string }) {
  const [state, action, pending] = useActionState<LockState, FormData>(setupPassword, {});
  const ready = useHydrated();
  return (
    <form action={action} className="space-y-3">
      <Field label="New password"><Input name="password" type="password" autoComplete="new-password" required minLength={12} /></Field>
      <Field label="Type it again"><Input name="confirm" type="password" autoComplete="new-password" required minLength={12} /></Field>
      <p className="text-xs text-muted">{rule}</p>
      <button disabled={pending || !ready} className={btn.primary}><Lock size={14} /> {pending ? "Saving…" : "Set password"}</button>
      <Result state={state} />
    </form>
  );
}

export function UnlockForm() {
  const [state, action, pending] = useActionState<LockState, FormData>(unlock, {});
  const ready = useHydrated();
  return (
    <form action={action} className="space-y-3">
      <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required autoFocus /></Field>
      <button disabled={pending || !ready} className={btn.primary}><Lock size={14} /> {pending ? "Checking…" : "Unlock"}</button>
      <Result state={state} />
    </form>
  );
}

export function ChangePasswordForm({ rule }: { rule: string }) {
  const [state, action, pending] = useActionState<LockState, FormData>(changePassword, {});
  const ready = useHydrated();
  return (
    <form action={action} className="space-y-2">
      <Field label="Current password"><Input name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password"><Input name="next" type="password" autoComplete="new-password" required minLength={12} /></Field>
      <Field label="Type the new one again"><Input name="confirm" type="password" autoComplete="new-password" required minLength={12} /></Field>
      <p className="text-xs text-muted">{rule}</p>
      <button disabled={pending || !ready} className={btn.secondary}>{pending ? "Saving…" : "Change password"}</button>
      <Result state={state} />
    </form>
  );
}
