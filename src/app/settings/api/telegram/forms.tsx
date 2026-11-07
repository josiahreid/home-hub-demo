"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { saveToken, sendTest, type TgState } from "./actions";
import { Field, Input, btn } from "@/components/ui";

function Result({ state }: { state: TgState }) {
  if (state.error) return <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>;
  return null;
}

export function TokenForm({ masked }: { masked: string | null }) {
  const [state, action, pending] = useActionState<TgState, FormData>(saveToken, {});
  return (
    <form action={action} className="space-y-2">
      <Field label={masked ? `Bot token (saved: ${masked})` : "Bot token"}>
        <Input name="token" type="password" autoComplete="off" required placeholder={masked ? "Paste a new token to replace it" : "123456789:AA…"} />
      </Field>
      <button disabled={pending} className={btn.primary}>{pending ? "Checking…" : "Save & test"}</button>
      <Result state={state} />
    </form>
  );
}

export function TestButton() {
  const [state, action, pending] = useActionState<TgState>(sendTest, {});
  return (
    <form action={action} className="space-y-2">
      <button disabled={pending} className={btn.secondary}><Send size={14} /> {pending ? "Sending…" : "Send a test message"}</button>
      <Result state={state} />
    </form>
  );
}
