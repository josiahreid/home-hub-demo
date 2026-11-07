"use client";

import { useActionState } from "react";
import { useHydrated } from "@/components/hydrated";
import { RefreshCw } from "lucide-react";
import { Field, Input, btn } from "@/components/ui";
import { saveAkahuTokens, syncFromBudget, syncNow, type AkahuState } from "./actions";

function Result({ state }: { state: AkahuState }) {
  if (state.error) return <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>;
  return null;
}

export function AkahuTokenForm({ connected }: { connected: boolean }) {
  const [state, action, pending] = useActionState<AkahuState, FormData>(saveAkahuTokens, {});
  const ready = useHydrated();
  return (
    <form action={action} className="space-y-2">
      <Field label="App ID token"><Input name="app" type="password" autoComplete="off" required placeholder="app_token_…" /></Field>
      <Field label="User token"><Input name="user" type="password" autoComplete="off" required placeholder="user_token_…" /></Field>
      <button disabled={pending || !ready} className={btn.primary}>{pending ? "Checking with Akahu…" : connected ? "Replace tokens" : "Save & test"}</button>
      <Result state={state} />
    </form>
  );
}

/** `from`: the Budget page uses its own action (no API session needed, read-only). */
export function SyncButton({ from = "settings", disabled }: { from?: "settings" | "budget"; disabled?: boolean }) {
  const [state, action, pending] = useActionState<AkahuState>(from === "budget" ? syncFromBudget : syncNow, {});
  const ready = useHydrated();
  return (
    <form action={action} className="space-y-2">
      <button disabled={pending || disabled || !ready} className={btn.primary}>
        <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {pending ? "Reading from the bank…" : "Sync now"}
      </button>
      <Result state={state} />
    </form>
  );
}
