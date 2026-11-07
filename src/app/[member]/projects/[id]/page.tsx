import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Check, X } from "lucide-react";
import { all, get } from "@/lib/db";
import { AddPanel, Badge, btn, Card, cx, Empty, Input, Progress, Select, Stat } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { money, niceDate, relDays } from "@/lib/format";
import {
  addPart, addStep, assignPart, deleteJob, deleteStep, moveStep, setJobStatus, toggleStep, updateJob, updateStep,
} from "../actions";
import { JobFields, PartFields, PartRow } from "../components";
import { JOB_STATUSES, partTotals, priorityLabel, splitTags, type Job, type Part, type Step } from "../shared";
import { memberWith } from "../../member";

export default async function JobPage({ params }: PageProps<"/[member]/projects/[id]">) {
  const m = await memberWith(params, "projects");
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const job = await get<Job>("SELECT * FROM job_cards WHERE id = ? AND member_id = ?", id, m.id);
  if (!job) notFound();

  const [steps, parts, unassigned, types, jobs] = await Promise.all([
    all<Step>("SELECT * FROM job_steps WHERE job_id = ? ORDER BY sort, id", id),
    all<Part>("SELECT * FROM parts WHERE job_id = ? ORDER BY status = 'received', name", id),
    all<Part>("SELECT * FROM parts WHERE job_id IS NULL AND member_id = ? ORDER BY name", m.id),
    all<{ job_type: string }>("SELECT DISTINCT job_type FROM job_cards WHERE job_type IS NOT NULL AND member_id = ?", m.id),
    all<Pick<Job, "id" | "title">>("SELECT id, title FROM job_cards WHERE member_id = ? ORDER BY status = 'done', title", m.id),
  ]);

  const doneCount = steps.filter((s) => s.done).length;
  const totals = partTotals(parts);

  return (
    <div className="space-y-4">
      <Link href={`/${m.slug}/projects`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> All projects
      </Link>

      <div>
        <h2 className="text-xl font-semibold">{job.title}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
          {job.job_type && <Badge tone="info">{job.job_type}</Badge>}
          <Badge tone={job.priority === 1 ? "bad" : "neutral"}>{priorityLabel(job.priority)} priority</Badge>
          {splitTags(job.tags).map((t) => (
            <Link key={t} href={`/${m.slug}/projects?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-ink">
              #{t}
            </Link>
          ))}
          {job.due && (
            <span className="text-xs text-muted">
              Due {niceDate(job.due)} ({relDays(job.due)})
            </span>
          )}
        </div>
        {job.description && <p className="mt-3 whitespace-pre-wrap text-sm">{job.description}</p>}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:none]">
        {JOB_STATUSES.map((s) => (
          <form key={s.value} action={setJobStatus} className="flex-1">
            <input type="hidden" name="id" value={job.id} />
            <input type="hidden" name="status" value={s.value} />
            <button
              className={cx(
                "w-full shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap",
                job.status === s.value ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {s.label}
            </button>
          </form>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Steps"
          actions={steps.length > 0 && <span className="text-xs text-muted tabular-nums">{doneCount}/{steps.length} done</span>}
        >
          {steps.length > 0 && (
            <div className="mb-3">
              <Progress value={doneCount} max={steps.length} />
            </div>
          )}
          {steps.length === 0 ? (
            <Empty>No steps yet. Break the job down below.</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-2 py-2">
                  <form action={toggleStep}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      aria-label={s.done ? "Mark not done" : "Mark done"}
                      className={cx(
                        "mt-0.5 flex size-6 cursor-pointer items-center justify-center rounded-md border",
                        s.done ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent",
                      )}
                    >
                      {s.done ? <Check size={14} /> : null}
                    </button>
                  </form>
                  <details className="group min-w-0 flex-1">
                    <summary className={cx("cursor-pointer list-none pt-0.5 text-sm break-words", !!s.done && "text-muted line-through")}>
                      <span className="mr-1 text-xs text-muted tabular-nums">{i + 1}.</span>
                      {s.text}
                    </summary>
                    <form action={updateStep} className="mt-2 flex gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Input name="text" defaultValue={s.text} required />
                      <SubmitButton variant="secondary">Save</SubmitButton>
                    </form>
                  </details>
                  <div className="flex shrink-0 items-center">
                    <form action={moveStep}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button disabled={i === 0} aria-label="Move up" className={cx(btn.ghost, btn.small)}>
                        <ArrowUp size={14} />
                      </button>
                    </form>
                    <form action={moveStep}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button disabled={i === steps.length - 1} aria-label="Move down" className={cx(btn.ghost, btn.small)}>
                        <ArrowDown size={14} />
                      </button>
                    </form>
                    <form action={deleteStep}>
                      <input type="hidden" name="id" value={s.id} />
                      <button aria-label="Delete step" className={cx(btn.danger, btn.small)}>
                        <X size={14} />
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <form action={addStep} className="mt-3 flex items-start gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <textarea
              name="text"
              rows={1}
              required
              placeholder="Add a step (paste several lines to add many)"
              className="min-h-10 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>

        <Card title="Parts" actions={<Link href={`/${m.slug}/parts`} className="text-xs text-accent hover:underline">All parts</Link>}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Job total" value={<span className="text-lg">{money(totals.all)}</span>} />
            <Stat label="To buy" value={<span className="text-lg">{money(totals.wishlist)}</span>} tone={totals.wishlist ? "warn" : undefined} />
            <Stat label="Ordered" value={<span className="text-lg">{money(totals.ordered)}</span>} />
          </div>
          {totals.unpriced > 0 && <p className="mb-2 text-xs text-muted">{totals.unpriced} part(s) have no price yet.</p>}
          {parts.length === 0 ? (
            <Empty>No parts for this job yet.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {parts.map((p) => (
                <PartRow key={p.id} part={p} jobs={jobs} slug={m.slug} />
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-3">
            <AddPanel label="Add part">
              <form action={addPart} className="space-y-3">
                <PartFields jobId={job.id} memberId={m.id} />
                <SubmitButton>Add part</SubmitButton>
              </form>
            </AddPanel>
            {unassigned.length > 0 && (
              <form action={assignPart} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <Select
                  name="id"
                  required
                  className="min-w-0 flex-1"
                  options={unassigned.map((p): [string, string] => [String(p.id), `${p.name}${p.price_cents != null ? ` · ${money(p.price_cents)}` : ""}`])}
                />
                <SubmitButton variant="secondary">Attach unassigned part</SubmitButton>
              </form>
            )}
          </div>
        </Card>
      </div>

      <AddPanel label="Edit job card">
        <form action={updateJob} className="space-y-3">
          <input type="hidden" name="id" value={job.id} />
          <JobFields job={job} types={types.map((t) => t.job_type)} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SubmitButton>Save changes</SubmitButton>
          </div>
        </form>
        <div className="mt-4 flex justify-end border-t border-line pt-3">
          <DeleteButton action={deleteJob} id={job.id} label="Delete job card" confirmText={`Delete "${job.title}" and its steps? Parts will be kept but unassigned.`} />
        </div>
      </AddPanel>
    </div>
  );
}
