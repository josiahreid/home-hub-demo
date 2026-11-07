import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { centsToInput, money, niceDate, shortDate, today } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { AddPanel, Badge, Card, Empty, Field, Input, Progress, Select, Stat, Table, Textarea, btn, cx, td } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import {
  addCost, addQuoteAsCost, createProjectPlan, deleteCost, deleteProject, setQuoteStatus, unlinkProjectPlan, updateProject,
} from "../../actions";
import { AutoSelect } from "../../auto-select";
import { DOC_SELECT, DocumentList, DocumentUpload, type ProjectDoc } from "../../documents";
import { EMAIL_SELECT, EmailForm, EmailList, type ProjectEmail } from "../../emails";
import { ContactLinks, type Business } from "../../business";
import { PROJECT_STATUSES, QUOTE_STATUSES, quoteCostDescription, statusLabel } from "../../shared";

type Project = { id: number; name: string; status: string; budget_cents: number | null; plan_id: number | null; notes: string | null };
type Cost = { id: number; date: string; description: string; amount_cents: number };
type Quote = {
  id: number; supplier: string; description: string | null; amount_cents: number | null;
  date: string | null; valid_until: string | null; status: string; file_name: string | null;
};
type Plan = { id: number; name: string; target_cents: number; saved_cents: number; start_date: string; target_date: string; status: string };

export default async function ProjectPage({ params }: PageProps<"/house/projects/[id]">) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const p = await get<Project>("SELECT id, name, status, budget_cents, plan_id, notes FROM house_projects WHERE id = ?", id);
  if (!p) notFound();

  const costs = await all<Cost>("SELECT id, date, description, amount_cents FROM project_costs WHERE project_id = ? ORDER BY date DESC, id DESC", id);
  const quotes = await all<Quote>(
    "SELECT id, supplier, description, amount_cents, date, valid_until, status, file_name FROM quotes WHERE project_id = ? ORDER BY date DESC, id DESC", id);
  const docs = await all<ProjectDoc>(`${DOC_SELECT} WHERE d.project_id = ? ORDER BY coalesce(d.date, d.uploaded_at) DESC, d.id DESC`, id);
  const docByCost = new Map(docs.filter((d) => d.cost_id != null).map((d) => [d.cost_id!, d]));
  const projectsForTag = [{ id: p.id, name: p.name }];
  const emails = await all<ProjectEmail>(`${EMAIL_SELECT} WHERE e.project_id = ? ORDER BY e.date DESC, e.id DESC`, id);
  const allBusinesses = await all<{ id: number; name: string }>("SELECT id, name FROM businesses ORDER BY name COLLATE NOCASE");
  const projectBusinesses = await all<Business>(
    `SELECT * FROM businesses WHERE id IN (
       SELECT business_id FROM quotes WHERE project_id = ? UNION SELECT business_id FROM project_emails WHERE project_id = ?)
     ORDER BY name COLLATE NOCASE`, id, id);
  const plan = p.plan_id
    ? await get<Plan>("SELECT id, name, target_cents, saved_cents, start_date, target_date, status FROM plans WHERE id = ?", p.plan_id)
    : undefined;

  const now = today();
  const spent = costs.reduce((s, c) => s + c.amount_cents, 0);
  const accepted = quotes.filter((q) => q.status === "accepted").reduce((s, q) => s + (q.amount_cents ?? 0), 0);
  const over = p.budget_cents != null && spent > p.budget_cents;
  const costKeys = new Set(costs.map((c) => `${c.description}|${c.amount_cents}`));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/house/projects" className="text-sm text-muted hover:text-ink">← Projects</Link>
        <h2 className="text-xl font-semibold">{p.name}</h2>
        <Badge tone={p.status === "done" ? "good" : p.status === "in_progress" ? "info" : "neutral"}>{statusLabel(p.status)}</Badge>
        <span className="ml-auto">
          <DeleteButton action={deleteProject} id={p.id} label="Delete project"
            confirmText={`Delete "${p.name}" and its cost log? Quotes are kept.`} />
        </span>
      </div>

      <AddPanel label="Edit project">
        <form action={updateProject} className="max-w-2xl space-y-3">
          <input type="hidden" name="id" value={p.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><Input name="name" required defaultValue={p.name} /></Field>
            <Field label="Status"><Select name="status" options={PROJECT_STATUSES} defaultValue={p.status} /></Field>
            <Field label="Budget ($)"><Input name="budget" inputMode="decimal" defaultValue={centsToInput(p.budget_cents)} /></Field>
          </div>
          <Field label="Notes"><Textarea name="notes" defaultValue={p.notes ?? ""} /></Field>
          <SubmitButton>Save</SubmitButton>
        </form>
      </AddPanel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Budget" value={money(p.budget_cents)} />
        <Stat label="Spent" value={money(spent)} tone={over ? "bad" : undefined}
          hint={p.budget_cents != null ? (over ? `${money(spent - p.budget_cents)} over` : `${money(p.budget_cents - spent)} left`) : undefined} />
        <Stat label="Accepted quotes" value={money(accepted)} tone={p.budget_cents != null && accepted > p.budget_cents ? "warn" : undefined} />
        <Stat label="Costs logged" value={costs.length} />
      </div>
      {p.budget_cents != null && (
        <Progress value={spent} max={p.budget_cents} tone={over ? "bad" : spent >= p.budget_cents * 0.9 ? "warn" : "good"} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Invoices & receipts (${docs.length})`}>
            <div className="space-y-3">
              <DocumentUpload projects={projectsForTag} projectId={p.id} />
              <DocumentList docs={docs} projects={projectsForTag} />
            </div>
          </Card>

          <Card title="Cost log">
            <div className="space-y-4">
              <form action={addCost} className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_1fr_8rem_auto] sm:items-end">
                <input type="hidden" name="project_id" value={p.id} />
                <Field label="Date"><Input type="date" name="date" defaultValue={now} required /></Field>
                <Field label="Description" className="col-span-2 sm:col-span-1 sm:order-none order-first">
                  <Input name="description" required placeholder="Tiles from Bunnings" />
                </Field>
                <Field label="Amount ($)"><Input name="amount" inputMode="decimal" required placeholder="0.00" /></Field>
                <SubmitButton className="col-span-2 sm:col-span-1">Add cost</SubmitButton>
              </form>
              {costs.length === 0 ? (
                <Empty>No costs logged yet.</Empty>
              ) : (
                <Table head={["Date", "Description", "Amount", ""]}>
                  {costs.map((c) => (
                    <tr key={c.id}>
                      <td className={cx(td, "whitespace-nowrap text-muted")}>{shortDate(c.date)}</td>
                      <td className={td}>
                        {c.description}
                        {docByCost.has(c.id) && (
                          <a href={fileUrl(docByCost.get(c.id)!.file_name)!} target="_blank" rel="noreferrer" className="ml-2 text-xs text-accent">📎 view</a>
                        )}
                      </td>
                      <td className={cx(td, "text-right tabular-nums")}>{money(c.amount_cents)}</td>
                      <td className={cx(td, "w-0")}><DeleteButton action={deleteCost} id={c.id} confirmText="Delete this cost?" /></td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className={td} colSpan={2}>Total</td>
                    <td className={cx(td, "text-right tabular-nums")}>{money(spent)}</td>
                    <td className={td} />
                  </tr>
                </Table>
              )}
            </div>
          </Card>

          <Card title="Quotes" actions={<Link href={`/house/quotes?project=${p.id}`} className="text-xs text-accent">Upload / manage →</Link>}>
            {quotes.length === 0 ? (
              <Empty>No quotes linked to this project.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {quotes.map((q) => {
                  const url = fileUrl(q.file_name);
                  const expired = q.valid_until != null && q.valid_until < now && q.status === "received";
                  const added = q.amount_cents != null && costKeys.has(`${quoteCostDescription(q.supplier, q.description)}|${q.amount_cents}`);
                  return (
                    <li key={q.id} className="flex flex-wrap items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{q.supplier} <span className="tabular-nums text-muted">· {money(q.amount_cents)}</span></div>
                        <div className="text-xs text-muted">
                          {q.description ?? ""}{q.date ? ` · ${niceDate(q.date)}` : ""}
                          {expired && <> · <Badge tone="warn">Expired {shortDate(q.valid_until)}</Badge></>}
                        </div>
                      </div>
                      {url && <a href={url} target="_blank" rel="noreferrer" className={cx(btn.ghost, btn.small)}>View file</a>}
                      <AutoSelect action={setQuoteStatus} id={q.id} name="status" value={q.status} options={QUOTE_STATUSES} label="Quote status" />
                      {q.status === "accepted" && q.amount_cents != null && (
                        added ? <Badge tone="good">In costs</Badge> : (
                          <form action={addQuoteAsCost}>
                            <input type="hidden" name="id" value={q.id} />
                            <SubmitButton variant="secondary" className="!px-2 !py-1 !text-xs">Add as cost</SubmitButton>
                          </form>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title={`Emails (${emails.length})`}>
            <div className="space-y-3">
              <EmailForm projectId={p.id} businesses={allBusinesses} />
              <EmailList emails={emails} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Businesses" actions={<Link href="/house/businesses" className="text-xs text-accent">All businesses →</Link>}>
            {projectBusinesses.length === 0 ? (
              <Empty>Businesses that quote or email about this project show here.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {projectBusinesses.map((b) => (
                  <li key={b.id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/house/businesses?q=${encodeURIComponent(b.name)}`} className="font-medium hover:text-accent">{b.name}</Link>
                      {b.trade && <Badge tone="info">{b.trade}</Badge>}
                    </div>
                    <div className="mt-1"><ContactLinks b={b} subject={p.name} /></div>
                    {!b.email && !b.phone && <p className="text-xs text-muted">No contact details yet.</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Savings goal">
            {plan ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium">{plan.name}</div>
                <div className="flex justify-between tabular-nums">
                  <span>Saved {money(plan.saved_cents)}</span>
                  <span className="text-muted">of {money(plan.target_cents)}</span>
                </div>
                <Progress value={plan.saved_cents} max={plan.target_cents} />
                <div className="text-xs text-muted">
                  Target {niceDate(plan.target_date)} · {plan.status}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Link href="/budget" className="text-xs text-accent">Open Budget →</Link>
                  <form action={unlinkProjectPlan}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className={cx(btn.ghost, btn.small)}>Unlink</button>
                  </form>
                </div>
              </div>
            ) : p.budget_cents == null ? (
              <p className="text-sm text-muted">Set a budget below to create a savings goal in Budget.</p>
            ) : (
              <form action={createProjectPlan} className="space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <p className="text-sm text-muted">Save {money(p.budget_cents)} for this project as a plan in the Budget tab.</p>
                <Field label="Save by">
                  <Input type="date" name="target_date" required min={now} />
                </Field>
                <SubmitButton>Create savings goal in Budget</SubmitButton>
              </form>
            )}
          </Card>

          {p.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm">{p.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
