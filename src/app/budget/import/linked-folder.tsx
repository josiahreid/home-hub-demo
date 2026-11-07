"use client";

import { useActionState } from "react";
import { CheckCircle2, CircleAlert, FolderSync, MinusCircle, RefreshCw } from "lucide-react";
import { linkStatementsFolder, refreshStatements, unlinkStatementsFolder, type FolderState } from "../actions";
import { Field, Input, btn, cx } from "@/components/ui";

export function LinkedFolder({ folder, read, imported, lastRead, suggestion }: {
  folder: string | null; read: number; imported: number; lastRead: string | null; suggestion: string;
}) {
  const [linkState, linkAction, linking] = useActionState<FolderState, FormData>(linkStatementsFolder, {});
  const [state, refresh, refreshing] = useActionState<FolderState>(refreshStatements, {});

  if (!folder) {
    return (
      <form action={linkAction} className="space-y-2">
        <p className="text-sm text-muted">
          Link the folder you save statements into (e.g. in iCloud Drive). Then whenever you add a new statement, press
          <strong> Refresh statements</strong> and Home Hub reads just the new ones.
        </p>
        <Field label="Folder location (copy it from File Explorer's address bar)">
          <Input name="folder" defaultValue={suggestion} placeholder="C:\Users\you\iCloudDrive\Statements" required />
        </Field>
        <button disabled={linking} className={btn.primary}><FolderSync size={16} /> {linking ? "Checking…" : "Link folder"}</button>
        {linkState.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{linkState.error}</p>}
      </form>
    );
  }

  const results = state.results ?? [];
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-surface-2 p-3 text-sm">
        <div className="font-mono text-xs break-all">{folder}</div>
        <div className="mt-1 text-xs text-muted">
          {read} file{read === 1 ? "" : "s"} read so far ({imported} statement{imported === 1 ? "" : "s"})
          {lastRead && ` · last refreshed ${new Date(lastRead.replace(" ", "T") + "Z").toLocaleString("en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" })}`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={refresh}>
          <button disabled={refreshing} className={btn.primary}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Reading new statements…" : "Refresh statements"}
          </button>
        </form>
        <form action={unlinkStatementsFolder}>
          <button className={cx(btn.ghost, btn.small)}>Change folder</button>
        </form>
      </div>
      {refreshing && read === 0 && <p className="text-xs text-muted">The first refresh reads everything in the folder – this can take a minute.</p>}
      {state.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>}
      {state.message && <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>}
      {results.length > 0 && (
        <ul className="max-h-72 space-y-0.5 overflow-auto rounded-lg border border-line p-2 text-xs">
          {results.map((r) => (
            <li key={r.file} className="flex items-start gap-2 py-0.5">
              <span className="mt-0.5 shrink-0">
                {r.status === "imported" && (!r.check || r.check.ok) ? <CheckCircle2 size={13} className="text-accent" />
                  : r.status === "imported" ? <CircleAlert size={13} className="text-warn" />
                  : r.status === "skipped" ? <MinusCircle size={13} className="text-muted" />
                  : <CircleAlert size={13} className="text-danger" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="break-all">{r.file}</span>
                <span className={cx("block", r.status === "error" ? "text-danger" : "text-muted")}>
                  {r.status === "imported"
                    ? `${r.account} · ${r.added} new${r.duplicates ? `, ${r.duplicates} already had` : ""}${r.period ? ` · ${r.period}` : ""}${r.check ? ` · ${r.check.note}` : ""}${r.note ? ` · ${r.note}` : ""}`
                    : r.note}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
