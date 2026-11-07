"use client";

import { useActionState } from "react";
import { Input, btn } from "@/components/ui";
import { importBuckets, type ImportState } from "./actions";

/** Load the budget spreadsheet (.xlsx or .csv) into the buckets. */
export function ImportBuckets({ hasLines }: { hasLines: boolean }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importBuckets, {});
  return (
    <form action={action} className="space-y-2">
      <Input type="file" name="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
      <button disabled={pending} className={hasLines ? btn.secondary : btn.primary}>
        {pending ? "Loading…" : hasLines ? "Load it again (replaces the spreadsheet's lines)" : "Load into the buckets"}
      </button>
      {state.message && <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>}
      {state.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
