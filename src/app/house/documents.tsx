import { FileText, Upload } from "lucide-react";
import { money, shortDate, today } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { Badge, Empty, Field, Input, Select, Textarea, btn, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { CameraUpload } from "@/components/camera-upload";
import { addProjectDocument, deleteDocument, retagDocument } from "./actions";
import { AutoSelect } from "./auto-select";

export type ProjectDoc = {
  id: number; project_id: number; project_name: string; kind: string; supplier: string | null;
  date: string | null; amount_cents: number | null; file_name: string; notes: string | null; cost_id: number | null;
};

export const DOC_SELECT = `
  SELECT d.*, p.name AS project_name FROM project_documents d JOIN house_projects p ON p.id = d.project_id`;

/** The "Upload invoice / receipt" button: opens into the form. Pass projectId to lock it to one project. */
export function DocumentUpload({ projects, projectId, open }: { projects: { id: number; name: string }[]; projectId?: number; open?: boolean }) {
  if (projects.length === 0) return null;
  return (
    <details className="group rounded-xl border border-line bg-surface" open={open}>
      <summary className={cx(btn.primary, "m-3 list-none")}>
        <Upload size={16} /> Upload invoice / receipt
      </summary>
      <form action={addProjectDocument} className="space-y-3 border-t border-line p-4">
        <div className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-muted">Photo or PDF</span><CameraUpload required /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {projectId ? (
            <input type="hidden" name="project_id" value={projectId} />
          ) : (
            <Field label="Project" className="col-span-2">
              <Select name="project_id" required options={projects.map((p) => [String(p.id), p.name] as [string, string])} />
            </Field>
          )}
          <Field label="Type">
            <Select name="kind" options={[["receipt", "Receipt"], ["invoice", "Invoice"]]} />
          </Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={today()} /></Field>
          <Field label="Supplier" className={projectId ? "col-span-2" : ""}><Input name="supplier" list="suppliers" placeholder="Mitre 10, plumber…" /></Field>
          <Field label="Amount ($)"><Input name="amount" inputMode="decimal" placeholder="0.00" /></Field>
        </div>
        <datalist id="suppliers">
          {["Mitre 10", "Bunnings", "PlaceMakers", "Carters", "ITM", "Resene", "Kmart"].map((s) => <option key={s} value={s} />)}
        </datalist>
        <Field label="Notes (optional)"><Textarea name="notes" rows={2} placeholder="What it was for, warranty details…" /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="add_cost" defaultChecked /> Add the amount to the project&apos;s cost log
        </label>
        <SubmitButton>Save</SubmitButton>
      </form>
    </details>
  );
}

export function DocumentList({ docs, projects, showProject }: { docs: ProjectDoc[]; projects: { id: number; name: string }[]; showProject?: boolean }) {
  if (docs.length === 0) return <Empty>No invoices or receipts yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => {
        const url = fileUrl(d.file_name)!;
        const isPdf = d.file_name.toLowerCase().endsWith(".pdf");
        return (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <a href={url} target="_blank" rel="noreferrer" className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2" title="Open">
              {isPdf ? (
                <FileText size={20} className="text-muted" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-full w-full object-cover" />
              )}
            </a>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.supplier ?? (d.kind === "invoice" ? "Invoice" : "Receipt")}</span>
                <Badge tone={d.kind === "invoice" ? "info" : "neutral"}>{d.kind === "invoice" ? "Invoice" : "Receipt"}</Badge>
                {d.cost_id == null && d.amount_cents != null && <Badge tone="warn">not in costs</Badge>}
              </div>
              <div className="text-xs text-muted">
                {d.date ? shortDate(d.date) : "—"}{d.notes && ` · ${d.notes}`}
              </div>
              {showProject && (
                <div className="mt-1">
                  <AutoSelect
                    action={retagDocument}
                    id={d.id}
                    name="project_id"
                    value={String(d.project_id)}
                    options={projects.map((p) => [String(p.id), p.name] as [string, string])}
                    label="Project"
                  />
                </div>
              )}
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{money(d.amount_cents)}</span>
            <DeleteButton
              action={deleteDocument}
              id={d.id}
              label="×"
              confirmText={d.cost_id != null ? "Delete this file and the cost it added to the project?" : "Delete this file?"}
            />
          </li>
        );
      })}
    </ul>
  );
}
