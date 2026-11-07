import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { all } from "@/lib/db";
import { AddPanel, Badge, btn, cx, Empty, Field, Progress, Select } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { money, relDays, shortDate, today } from "@/lib/format";
import { createJob, setJobStatus } from "./actions";
import { JobFields } from "./components";
import { JOB_STATUSES, priorityLabel, splitTags, type Job } from "./shared";
import { memberWith } from "../member";

type BoardJob = Job & { steps_total: number; steps_done: number; parts_cents: number; parts_count: number };


const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function href(slug: string, type?: string, tag?: string) {
  const q = new URLSearchParams();
  if (type) q.set("type", type);
  if (tag) q.set("tag", tag);
  const s = q.toString();
  return s ? `/${slug}/projects?${s}` : `/${slug}/projects`;
}

function Chip({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={to}
      className={cx(
        "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
        active ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

export default async function ProjectsPage({ params, searchParams }: PageProps<"/[member]/projects">) {
  const m = await memberWith(params, "projects");
  const sp = await searchParams;
  const type = one(sp.type);
  const tag = one(sp.tag);

  const jobs = await all<BoardJob>(`
    SELECT j.*,
      (SELECT COUNT(*) FROM job_steps s WHERE s.job_id = j.id) AS steps_total,
      (SELECT COUNT(*) FROM job_steps s WHERE s.job_id = j.id AND s.done = 1) AS steps_done,
      (SELECT COALESCE(SUM(COALESCE(p.price_cents, 0) * p.quantity), 0) FROM parts p WHERE p.job_id = j.id) AS parts_cents,
      (SELECT COUNT(*) FROM parts p WHERE p.job_id = j.id) AS parts_count
    FROM job_cards j
    WHERE j.member_id = ?
    ORDER BY j.priority, j.due IS NULL, j.due, j.created_at DESC
  `, m.id);

  const types = [...new Set(jobs.map((j) => j.job_type).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b));
  const tags = [...new Set(jobs.flatMap((j) => splitTags(j.tags)))].sort((a, b) => a.localeCompare(b));

  const shown = jobs.filter((j) => (!type || j.job_type === type) && (!tag || splitTags(j.tags).includes(tag)));
  const now = today();

  return (
    <div className="space-y-4">
      <AddPanel label="Add job card">
        <form action={createJob} className="space-y-3">
          <input type="hidden" name="member_id" value={m.id} />
          <JobFields types={types} />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Status" className="w-40">
              <Select name="status" defaultValue="idea" options={JOB_STATUSES.map((s): [string, string] => [s.value, s.label])} />
            </Field>
            <SubmitButton>Create job card</SubmitButton>
          </div>
        </form>
      </AddPanel>

      {(types.length > 0 || tags.length > 0) && (
        <div className="space-y-2">
          {types.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              <span className="shrink-0 pr-1 text-xs font-medium text-muted">Type</span>
              <Chip to={href(m.slug, undefined, tag)} active={!type}>All</Chip>
              {types.map((t) => (
                <Chip key={t} to={href(m.slug, t, tag)} active={type === t}>{t}</Chip>
              ))}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              <span className="shrink-0 pr-1 text-xs font-medium text-muted">Tag</span>
              <Chip to={href(m.slug, type, undefined)} active={!tag}>All</Chip>
              {tags.map((t) => (
                <Chip key={t} to={href(m.slug, type, t)} active={tag === t}>#{t}</Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {jobs.length === 0 ? (
        <Empty>No job cards yet. Add your first project above.</Empty>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {JOB_STATUSES.map((col, ci) => {
            const items = shown.filter((j) => j.status === col.value);
            return (
              <section key={col.value} className="flex w-[80vw] max-w-72 shrink-0 snap-start flex-col rounded-xl bg-surface-2 p-2 sm:w-64 lg:w-auto lg:min-w-52 lg:flex-1">
                <h2 className="flex items-center justify-between px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {col.label}
                  <span className="tabular-nums">{items.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Nothing here</p>}
                  {items.map((j) => {
                    const prev = JOB_STATUSES[ci - 1];
                    const next = JOB_STATUSES[ci + 1];
                    const overdue = j.due && j.due < now && j.status !== "done";
                    return (
                      <article key={j.id} className="rounded-lg border border-line bg-surface p-3 shadow-sm">
                        <Link href={`/${m.slug}/projects/${j.id}`} className="block font-medium leading-snug hover:text-accent">
                          {j.title}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {j.job_type && <Badge tone="info">{j.job_type}</Badge>}
                          {j.priority === 1 && <Badge tone="bad">High</Badge>}
                          {j.priority === 3 && <Badge>{priorityLabel(3)}</Badge>}
                          {splitTags(j.tags).map((t) => (
                            <Link key={t} href={href(m.slug, type, t)} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-ink">
                              #{t}
                            </Link>
                          ))}
                        </div>
                        {j.steps_total > 0 && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                            <Progress value={j.steps_done} max={j.steps_total} />
                            <span className="shrink-0 tabular-nums">
                              {j.steps_done}/{j.steps_total}
                            </span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                          <span className="tabular-nums">{j.parts_count > 0 ? `${money(j.parts_cents)} parts` : "No parts"}</span>
                          {j.due && (
                            <span className={cx(overdue && "font-medium text-danger")} title={relDays(j.due)}>
                              Due {shortDate(j.due)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex justify-between border-t border-line pt-2">
                          {prev ? (
                            <form action={setJobStatus}>
                              <input type="hidden" name="id" value={j.id} />
                              <input type="hidden" name="status" value={prev.value} />
                              <button className={cx(btn.ghost, btn.small)} title={`Move to ${prev.label}`}>
                                <ChevronLeft size={14} /> {prev.label}
                              </button>
                            </form>
                          ) : (
                            <span />
                          )}
                          {next && (
                            <form action={setJobStatus}>
                              <input type="hidden" name="id" value={j.id} />
                              <input type="hidden" name="status" value={next.value} />
                              <button className={cx(btn.ghost, btn.small)} title={`Move to ${next.label}`}>
                                {next.label} <ChevronRight size={14} />
                              </button>
                            </form>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
