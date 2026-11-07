"use client";

import { useActionState } from "react";
import { saveMealPlannerLink, type LinkState } from "./actions";
import { Field, Input, btn } from "@/components/ui";

export function LinkForm() {
  const [state, action, pending] = useActionState<LinkState, FormData>(saveMealPlannerLink, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Your Meal Planner link">
        <Input name="url" type="url" required placeholder="https://…" autoComplete="off" />
      </Field>
      <button disabled={pending} className={btn.primary}>{pending ? "Saving…" : "Show Meal Planner here"}</button>
      {state.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
