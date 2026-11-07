"use client";

import { useActionState } from "react";
import { importBudgetSheet, type SheetState } from "./actions";
import { Input, btn } from "@/components/ui";

export function SheetImport({ hasPlan }: { hasPlan: boolean }) {
  const [state, action, pending] = useActionState<SheetState, FormData>(importBudgetSheet, {});
  return (
    <form action={action} className="space-y-2">
      <Input type="file" name="file" accept=".csv,text/csv" required />
      <button disabled={pending} className={hasPlan ? btn.secondary : btn.primary}>
        {pending ? "Loading…" : hasPlan ? "Re-import spreadsheet" : "Import budget spreadsheet"}
      </button>
      {state.message && <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>}
      {state.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
