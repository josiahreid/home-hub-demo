"use client";

import { useActionState } from "react";
import { DatabaseBackup } from "lucide-react";
import { btn } from "@/components/ui";
import { backupNow, type BackupState } from "./actions";

export function BackupNowButton() {
  const [state, action, pending] = useActionState<BackupState>(backupNow, {});
  return (
    <form action={action} className="space-y-2">
      <button disabled={pending} className={btn.secondary}><DatabaseBackup size={16} /> {pending ? "Backing up…" : "Make a backup now"}</button>
      {state.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>}
      {state.message && <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>}
    </form>
  );
}
