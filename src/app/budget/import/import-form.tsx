"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileText, FolderOpen, Files, Loader2, MinusCircle } from "lucide-react";
import { importStatementFile, type FileResult } from "../actions";
import { Badge, Field, Input, Select, btn, cx } from "@/components/ui";

type Picked = { file: File; path: string };
const READABLE = /\.(pdf|csv)$/i;

export function ImportForm({ accounts }: { accounts: { id: number; name: string }[] }) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [results, setResults] = useState<FileResult[]>([]);
  const [running, setRunning] = useState<number | null>(null);

  // folder picking isn't a standard React prop
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  function choose(list: FileList | null) {
    if (!list) return;
    const all = Array.from(list).map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }));
    const readable = all.filter((p) => READABLE.test(p.file.name));
    // oldest statements first, so accounts and dates build up in order
    readable.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    setPicked(readable);
    setIgnored(all.length - readable.length);
    setResults([]);
  }

  const csvCount = picked.filter((p) => /\.csv$/i.test(p.file.name)).length;

  async function run() {
    setResults([]);
    const out: FileResult[] = [];
    for (let i = 0; i < picked.length; i++) {
      setRunning(i);
      const fd = new FormData();
      fd.append("file", picked[i].file);
      fd.append("path", picked[i].path);
      if (accountId) fd.append("account_id", accountId);
      else if (newAccount) fd.append("new_account", newAccount); // created by the first CSV, reused by the rest
      let r: FileResult;
      try {
        r = await importStatementFile(fd);
      } catch (e) {
        r = { file: picked[i].path, status: "error", note: (e as Error).message };
      }
      out.push(r);
      setResults([...out]);
    }
    setRunning(null);
  }

  const added = results.reduce((s, r) => s + (r.added ?? 0), 0);
  const dups = results.reduce((s, r) => s + (r.duplicates ?? 0), 0);
  const notAddingUp = results.filter((r) => r.check && !r.check.ok).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => filesInput.current?.click()} className={btn.primary}>
          <Files size={16} /> Choose files
        </button>
        <button type="button" onClick={() => folderInput.current?.click()} className={btn.secondary}>
          <FolderOpen size={16} /> Choose a folder
        </button>
        <input ref={filesInput} type="file" multiple accept=".pdf,.csv,application/pdf,text/csv" className="hidden" onChange={(e) => choose(e.target.files)} />
        <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => choose(e.target.files)} />
      </div>
      <p className="text-xs text-muted">
        Hold <strong>Ctrl</strong> (or <strong>Shift</strong>) to pick several files, or choose a whole folder – e.g. one in iCloud Drive with a year of statements.
        Westpac and Q Card PDFs are read automatically and go to the right account. Anything already imported is skipped.
      </p>

      {picked.length > 0 && (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <strong>{picked.length} file{picked.length === 1 ? "" : "s"} ready</strong>
            <Badge>{picked.length - csvCount} PDF</Badge>
            {csvCount > 0 && <Badge>{csvCount} CSV</Badge>}
            {ignored > 0 && <span className="text-xs text-muted">({ignored} other file{ignored === 1 ? "" : "s"} ignored)</span>}
          </div>

          {csvCount > 0 && (
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <Field label="Account for CSV files (PDFs and PayPal find their own)">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  options={[["", accounts.length ? "Choose…" : "— add one →"], ...accounts.map((a) => [String(a.id), a.name] as [string, string])]} />
              </Field>
              <Field label="…or a new account name">
                <Input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="e.g. ANZ Everyday" disabled={!!accountId} />
              </Field>
            </div>
          )}

          <ul className="max-h-60 space-y-0.5 overflow-auto text-xs">
            {picked.map((p, i) => {
              const r = results[i];
              return (
                <li key={p.path} className="flex items-start gap-2 py-0.5">
                  <span className="mt-0.5 shrink-0">
                    {running === i ? <Loader2 size={13} className="animate-spin text-accent" />
                      : !r ? <FileText size={13} className="text-muted" />
                      : r.status === "imported" && (!r.check || r.check.ok) ? <CheckCircle2 size={13} className="text-accent" />
                      : r.status === "imported" ? <CircleAlert size={13} className="text-warn" />
                      : r.status === "skipped" ? <MinusCircle size={13} className="text-muted" />
                      : <CircleAlert size={13} className="text-danger" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="break-all">{p.path}</span>
                    {r && (
                      <span className={cx("block", r.status === "error" ? "text-danger" : "text-muted")}>
                        {r.status === "imported"
                          ? `${r.account} · ${r.added} new${r.duplicates ? `, ${r.duplicates} already had` : ""}${r.period ? ` · ${r.period}` : ""}${r.check ? ` · ${r.check.note}` : ""}${r.note ? ` · ${r.note}` : ""}`
                          : r.note}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={run} disabled={running !== null} className={btn.primary}>
              {running !== null ? `Importing ${running + 1} of ${picked.length}…` : results.length ? "Import again" : `Import ${picked.length} file${picked.length === 1 ? "" : "s"}`}
            </button>
            {results.length === picked.length && running === null && (
              <span className={cx("text-sm", notAddingUp ? "text-warn" : "text-accent")}>
                Done: {added} new transaction{added === 1 ? "" : "s"}{dups ? `, ${dups} already imported` : ""}.
                {notAddingUp ? ` ${notAddingUp} statement${notAddingUp === 1 ? "" : "s"} didn't add up – check those.` : ""}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
