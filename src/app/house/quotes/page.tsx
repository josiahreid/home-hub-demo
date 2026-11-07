import Link from "next/link";
import { all } from "@/lib/db";
import { centsToInput, money, niceDate, shortDate, today } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, Select, Textarea, btn, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { CameraUpload } from "@/components/camera-upload";
import { addQuote, addQuoteAsCost, deleteQuote, setQuoteStatus, updateQuote } from "../actions";
import { AutoSelect } from "../auto-select";
import { ContactLinks } from "../business";
import { QUOTE_STATUSES, quoteCostDescription } from "../shared";

type Quote = {
  id: number; project_id: number | null; project_name: string | null; supplier: string; description: string | null;
  amount_cents: number | null; date: string | null; valid_until: string | null; status: string; file_name: string | null;
  in_costs: number;
  business_id: number | null; email: string | null; phone: string | null; website: string | null; address: string | null; contact_name: string | null;
};

export default async function QuotesPage({ searchParams }: PageProps<"/house/quotes">) {
  const { project } = await searchParams;
  const filter = typeof project === "string" ? project : "";
  const projects = await all<{ id: number; name: string }>("SELECT id, name FROM house_projects ORDER BY name");

  const where = filter === "none" ? "WHERE q.project_id IS NULL" : /^\d+$/.test(filter) ? "WHERE q.project_id = ?" : "";
  const params = /^\d+$/.test(filter) ? [Number(filter)] : [];
  const rows = await all<Omit<Quote, "in_costs">>(
    `SELECT q.id, q.project_id, p.name AS project_name, q.supplier, q.description, q.amount_cents, q.date, q.valid_until, q.status, q.file_name,
            q.business_id, b.email, b.phone, b.website, b.address, b.contact_name
     FROM quotes q LEFT JOIN house_projects p ON p.id = q.project_id LEFT JOIN businesses b ON b.id = q.business_id
     ${where}
     ORDER BY CASE q.status WHEN 'received' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, q.date DESC, q.id DESC`,
    ...params,
  );
  // which accepted quotes have already been copied into their project's costs
  const costs = await all<{ project_id: number; description: string; amount_cents: number }>(
    "SELECT project_id, description, amount_cents FROM project_costs WHERE description LIKE 'Quote: %'");
  const costKeys = new Set(costs.map((c) => `${c.project_id}|${c.description}|${c.amount_cents}`));
  const quotes: Quote[] = rows.map((q) => ({
    ...q,
    in_costs: q.project_id != null && costKeys.has(`${q.project_id}|${quoteCostDescription(q.supplier, q.description)}|${q.amount_cents}`) ? 1 : 0,
  }));

  const businessNames = await all<{ name: string }>("SELECT name FROM businesses ORDER BY name COLLATE NOCASE");
  const now = today();
  const projectOptions: [string, string][] = [["", "— No project —"], ...projects.map((p) => [String(p.id), p.name] as [string, string])];
  const filters: [string, string][] = [["", "All"], ...projects.map((p) => [String(p.id), p.name] as [string, string]), ["none", "No project"]];

  return (
    <div className="space-y-6">
      <datalist id="business-names">{businessNames.map((b) => <option key={b.name} value={b.name} />)}</datalist>
      <AddPanel label="Upload quote">
        <form action={addQuote} className="space-y-3">
          <FormGrid>
            <Field label="Supplier"><Input name="supplier" required placeholder="Smith Plumbing" list="business-names" /></Field>
            <Field label="Amount ($)"><Input name="amount" inputMode="decimal" placeholder="0.00" /></Field>
            <Field label="Project">
              <Select name="project_id" options={projectOptions} defaultValue={/^\d+$/.test(filter) ? filter : ""} />
            </Field>
            <Field label="Quote date"><Input type="date" name="date" defaultValue={now} /></Field>
            <Field label="Valid until"><Input type="date" name="valid_until" /></Field>
            <div className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="text-xs font-medium text-muted">File (photo or PDF)</span><CameraUpload /></div>
          </FormGrid>
          <Field label="Description"><Textarea name="description" rows={2} placeholder="What the quote covers" /></Field>
          <SubmitButton>Save quote</SubmitButton>
        </form>
      </AddPanel>

      {projects.length > 0 && (
        <div className="flex gap-1 overflow-x-auto text-sm">
          {filters.map(([v, label]) => (
            <Link
              key={v || "all"}
              href={v ? `/house/quotes?project=${v}` : "/house/quotes"}
              className={cx("shrink-0 rounded-full px-3 py-1", filter === v ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2")}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      {quotes.length === 0 ? (
        <Empty>{filter ? "No quotes for this filter." : "No quotes yet. Upload one to keep it safe for later."}</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {quotes.map((q) => <QuoteRow key={q.id} q={q} now={now} projectOptions={projectOptions} />)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function QuoteRow({ q, now, projectOptions }: { q: Quote; now: string; projectOptions: [string, string][] }) {
  const url = fileUrl(q.file_name);
  const expired = q.valid_until != null && q.valid_until < now;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {q.business_id ? (
              <Link href={`/house/businesses?q=${encodeURIComponent(q.supplier)}`} className="font-medium hover:text-accent">{q.supplier}</Link>
            ) : <span className="font-medium">{q.supplier}</span>}
            <span className="tabular-nums">{money(q.amount_cents)}</span>
          </div>
          {q.description && <p className="mt-0.5 text-sm text-muted">{q.description}</p>}
          <div className="mt-1"><ContactLinks b={q} subject={`Quote${q.project_name ? ` – ${q.project_name}` : ""}`} /></div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {q.project_id ? (
              <Link href={`/house/projects/${q.project_id}`} className="text-accent">{q.project_name}</Link>
            ) : <span>No project</span>}
            {q.date && <span>· {niceDate(q.date)}</span>}
            {q.valid_until && (
              expired && q.status === "received"
                ? <Badge tone="warn">Expired {shortDate(q.valid_until)}</Badge>
                : <span>· valid until {shortDate(q.valid_until)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className={cx(btn.secondary, btn.small)}>View file</a>
          ) : <span className="text-xs text-muted">No file</span>}
          <AutoSelect action={setQuoteStatus} id={q.id} name="status" value={q.status} options={QUOTE_STATUSES} label="Quote status" />
          {q.status === "accepted" && q.project_id != null && q.amount_cents != null && (
            q.in_costs ? <Badge tone="good">In costs</Badge> : (
              <form action={addQuoteAsCost}>
                <input type="hidden" name="id" value={q.id} />
                <SubmitButton variant="secondary" className="!px-2 !py-1 !text-xs">Add as cost</SubmitButton>
              </form>
            )
          )}
        </div>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-muted select-none hover:text-ink">Edit</summary>
        <div className="mt-2 rounded-lg bg-surface-2 p-3">
          <form action={updateQuote} className="space-y-3">
            <input type="hidden" name="id" value={q.id} />
            <FormGrid>
              <Field label="Supplier"><Input name="supplier" required defaultValue={q.supplier} list="business-names" /></Field>
              <Field label="Amount ($)"><Input name="amount" inputMode="decimal" defaultValue={centsToInput(q.amount_cents)} /></Field>
              <Field label="Project"><Select name="project_id" options={projectOptions} defaultValue={q.project_id ? String(q.project_id) : ""} /></Field>
              <Field label="Quote date"><Input type="date" name="date" defaultValue={q.date ?? ""} /></Field>
              <Field label="Valid until"><Input type="date" name="valid_until" defaultValue={q.valid_until ?? ""} /></Field>
              <div className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="text-xs font-medium text-muted">{q.file_name ? "Replace file" : "Attach file"}</span><CameraUpload /></div>
            </FormGrid>
            <Field label="Description"><Textarea name="description" rows={2} defaultValue={q.description ?? ""} /></Field>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
          <div className="mt-2 flex justify-end">
            <DeleteButton action={deleteQuote} id={q.id} confirmText={`Delete quote from ${q.supplier}${q.file_name ? " and its file" : ""}?`} />
          </div>
        </div>
      </details>
    </li>
  );
}
