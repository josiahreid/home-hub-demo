"use client";

import { useActionState } from "react";
import { addMember, type MemberState } from "./actions";
import { Field, Input, btn } from "@/components/ui";
import { FeaturePicker } from "./feature-picker";

export function AddMemberForm() {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMember, {});
  return (
    <form action={action} key={state.message} className="space-y-3">
      <Field label="Name">
        <Input name="name" required placeholder="e.g. Ava" autoComplete="off" />
      </Field>
      <FeaturePicker selected={[]} />
      <button disabled={pending} className={btn.primary}>{pending ? "Adding…" : "Add family member"}</button>
      {state.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>}
      {state.message && <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>}
    </form>
  );
}
