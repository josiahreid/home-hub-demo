import Link from "next/link";
import { all } from "@/lib/db";
import { centsToInput, money } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Field, FormGrid, Input, Progress, Select, Stat, Textarea } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addProject, deleteProject, setProjectStatus, updateProject } from "../actions";
import { AutoSelect } from "../auto-select";
import { PROJECT_STATUSES } from "../shared";
import { DOC_SELECT, DocumentList, DocumentUpload, type ProjectDoc } from "../documents";

type ProjectSummary = {
  id: number;
  name: string;
  status: string;
  budget_cents: number | null;
  notes: string | null;
  plan_id: number | null;
  spent: number;
  accepted: number;
  quote_count: number;
  doc_count: number;
};

export default async function ProjectsPage() {
  const projects = await all<ProjectSummary>(`
    SELECT p.id, p.name, p.status, p.budget_cents, p.notes, p.plan_id,
      COALESCE((SELECT SUM(amount_cents) FROM project_costs WHERE project_id = p.id), 0) AS spent,
      COALESCE((SELECT SUM(amount_cents) FROM quotes WHERE project_id = p.id AND status = 'accepted'), 0) AS accepted,
      (SELECT COUNT(*) FROM quotes WHERE project_id = p.id) AS quote_count,
      (SELECT COUNT(*) FROM project_documents WHERE project_id = p.id) AS doc_count
    FROM house_projects p
    ORDER BY p.name`);

  const docs = await all<ProjectDoc>(`${DOC_SELECT} ORDER BY coalesce(d.date, d.uploaded_at) DESC, d.id DESC LIMIT 20`);
  const active = projects.filter((p) => p.status !== "done");
  const totalBudget = active.reduce((s, p) => s + (p.budget_cents ?? 0), 0);
  const totalSpent = active.reduce((s, p) => s + p.spent, 0);

  return (
    <div className="space-y-6">
      {projects.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Active projects" value={active.length} />
          <Stat label="Active budgets" value={money(totalBudget)} />
          <Stat
            label="Spent so far"
            value={money(totalSpent)}
            tone={totalBudget > 0 && totalSpent > totalBudget ? "bad" : undefined}
          />
        </div>
      )}

      <DocumentUpload projects={projects} />

      <AddPanel label="Add project">
        <form action={addProject} className="space-y-3">
          <FormGrid>
            <Field label="Name">
              <Input name="name" required placeholder="Bathroom renovation" />
            </Field>
            <Field label="Status">
              <Select name="status" options={PROJECT_STATUSES} defaultValue="idea" />
            </Field>
            <Field label="Budget ($)">
              <Input name="budget" inputMode="decimal" placeholder="15000" />
            </Field>
          </FormGrid>
          <Field label="Notes">
            <Textarea name="notes" />
          </Field>
          <SubmitButton>Add project</SubmitButton>
        </form>
      </AddPanel>

      {projects.length === 0 ? (
        <Empty>No projects yet. Add a renovation or repair to start tracking its costs.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {PROJECT_STATUSES.map(([status, label]) => {
            const list = projects.filter((p) => p.status === status);
            return (
              <Card
                key={status}
                title={label}
                actions={<span className="text-xs text-muted">{list.length}</span>}
                className="!p-3"
              >
                {list.length === 0 ? (
                  <p className="text-xs text-muted">Nothing here.</p>
                ) : (
                  <ul className="space-y-3">
                    {list.map((p) => (
                      <ProjectCard key={p.id} p={p} />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {projects.length > 0 && (
        <Card title="Invoices & receipts" actions={<span className="text-xs text-muted">change the project to re-tag one</span>}>
          <DocumentList docs={docs} projects={projects} showProject />
        </Card>
      )}
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const over = p.budget_cents != null && p.spent > p.budget_cents;
  const near = !over && p.budget_cents != null && p.budget_cents > 0 && p.spent >= p.budget_cents * 0.9;
  return (
    <li className="rounded-lg border border-line bg-bg p-3">
      <Link href={`/house/projects/${p.id}`} className="font-medium hover:text-accent">
        {p.name}
      </Link>
      <div className="mt-2 space-y-1 text-xs">
        {p.budget_cents != null ? (
          <>
            <div className="flex justify-between tabular-nums">
              <span className="text-muted">Spent {money(p.spent)}</span>
              <span className="text-muted">of {money(p.budget_cents)}</span>
            </div>
            <Progress value={p.spent} max={p.budget_cents} tone={over ? "bad" : near ? "warn" : "good"} />
          </>
        ) : (
          <div className="text-muted">Spent {money(p.spent)} · no budget set</div>
        )}
        {over && <Badge tone="bad">Over budget by {money(p.spent - (p.budget_cents ?? 0))}</Badge>}
        {p.accepted > 0 && (
          <div className="text-muted">
            Accepted quotes {money(p.accepted)}
            {p.budget_cents != null && p.accepted > p.budget_cents && (
              <span className="text-warn"> (exceeds budget)</span>
            )}
          </div>
        )}
        {p.doc_count > 0 && (
          <Link href={`/house/projects/${p.id}`} className="block text-accent">
            📎 {p.doc_count} invoice{p.doc_count === 1 ? "" : "s"} / receipt{p.doc_count === 1 ? "" : "s"}
          </Link>
        )}
        {p.quote_count > 0 && (
          <Link href={`/house/quotes?project=${p.id}`} className="block text-accent">
            {p.quote_count} quote{p.quote_count === 1 ? "" : "s"}
          </Link>
        )}
      </div>
      <div className="mt-2">
        <AutoSelect action={setProjectStatus} id={p.id} name="status" value={p.status} options={PROJECT_STATUSES} label="Status" />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-accent select-none">Edit or delete</summary>
        <form action={updateProject} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="status" value={p.status} />
          <Field label="Name"><Input name="name" required defaultValue={p.name} /></Field>
          <Field label="Budget ($)"><Input name="budget" inputMode="decimal" defaultValue={centsToInput(p.budget_cents)} /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={p.notes ?? ""} /></Field>
          <SubmitButton variant="secondary">Save</SubmitButton>
        </form>
        <div className="mt-2 border-t border-line pt-2">
          <DeleteButton action={deleteProject} id={p.id} label="Delete project" confirmText={`Delete "${p.name}" and its cost log? Quotes are kept.`} />
        </div>
      </details>
    </li>
  );
}
