import type { ReactNode } from "react";
import Link from "next/link";
import { all } from "@/lib/db";
import { AddPanel, Card, cx, Empty, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { money } from "@/lib/format";
import { addPart } from "../projects/actions";
import { PartFields, PartRow } from "../projects/components";
import { PART_STATUSES, partTotals, type Job, type Part } from "../projects/shared";
import { memberWith } from "../member";

type JobOption = Pick<Job, "id" | "title" | "status">;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function href(slug: string, status?: string, job?: string) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (job) q.set("job", job);
  const s = q.toString();
  return s ? `/${slug}/parts?${s}` : `/${slug}/parts`;
}

function Chip({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={to}
      className={cx(
        "shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
        active ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

export default async function PartsPage({ params, searchParams }: PageProps<"/[member]/parts">) {
  const m = await memberWith(params, "projects");
  const sp = await searchParams;
  const status = PART_STATUSES.some((s) => s.value === one(sp.status)) ? one(sp.status) : undefined;
  const jobFilter = one(sp.job); // undefined = all, "none" = unassigned, else job id

  const [parts, jobs] = await Promise.all([
    all<Part>("SELECT * FROM parts WHERE member_id = ? ORDER BY CASE status WHEN 'wishlist' THEN 0 WHEN 'ordered' THEN 1 ELSE 2 END, name", m.id),
    all<JobOption>("SELECT id, title, status FROM job_cards WHERE member_id = ? ORDER BY status = 'done', title", m.id),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const totals = partTotals(parts);

  const shown = parts.filter(
    (p) =>
      (!status || p.status === status) &&
      (!jobFilter || (jobFilter === "none" ? p.job_id == null : String(p.job_id) === jobFilter)),
  );

  // Group by job: jobs in board order, unassigned last.
  const groups = new Map<number | null, Part[]>();
  for (const p of shown) {
    const key = p.job_id != null && jobById.has(p.job_id) ? p.job_id : null;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const groupKeys = [...jobs.map((j) => j.id).filter((id) => groups.has(id)), ...(groups.has(null) ? [null] : [])];
  const jobsWithParts = jobs.filter((j) => parts.some((p) => p.job_id === j.id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wishlist" value={money(totals.wishlist)} tone="warn" hint="to buy everything" />
        <Stat label="Ordered" value={money(totals.ordered)} tone="info" />
        <Stat label="Received" value={money(totals.received)} tone="good" />
        <Stat label="All parts" value={money(totals.all)} hint={`${parts.length} item${parts.length === 1 ? "" : "s"}`} />
      </div>

      <AddPanel label="Add part">
        <form action={addPart} className="space-y-3">
          <PartFields jobs={jobs} memberId={m.id} jobId={jobFilter && jobFilter !== "none" ? Number(jobFilter) : undefined} />
          <SubmitButton>Add part</SubmitButton>
        </form>
        <p className="mt-3 text-xs text-muted">
          AliExpress has no public wishlist API, so add items by pasting the product link with its name and price. A bulk
          import could be added later.
        </p>
      </AddPanel>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <span className="shrink-0 pr-1 text-xs font-medium text-muted">Status</span>
          <Chip to={href(m.slug, undefined, jobFilter)} active={!status}>All</Chip>
          {PART_STATUSES.map((s) => (
            <Chip key={s.value} to={href(m.slug, s.value, jobFilter)} active={status === s.value}>{s.label}</Chip>
          ))}
        </div>
        {jobsWithParts.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            <span className="shrink-0 pr-1 text-xs font-medium text-muted">Job</span>
            <Chip to={href(m.slug, status, undefined)} active={!jobFilter}>All</Chip>
            {jobsWithParts.map((j) => (
              <Chip key={j.id} to={href(m.slug, status, String(j.id))} active={jobFilter === String(j.id)}>{j.title}</Chip>
            ))}
            <Chip to={href(m.slug, status, "none")} active={jobFilter === "none"}>No job</Chip>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty>{parts.length === 0 ? "No parts yet. Paste an AliExpress link above to start tracking." : "No parts match this filter."}</Empty>
      ) : (
        groupKeys.map((key) => {
          const items = groups.get(key)!;
          const job = key != null ? jobById.get(key) : null;
          const t = partTotals(items);
          return (
            <Card
              key={key ?? "none"}
              title={
                job ? (
                  <Link href={`/${m.slug}/projects/${job.id}`} className="hover:text-accent">{job.title}</Link>
                ) : (
                  "No job"
                )
              }
              actions={
                <span className="text-xs text-muted tabular-nums">
                  {money(t.all)}
                  {t.wishlist > 0 && <span className="text-warn"> · {money(t.wishlist)} to buy</span>}
                </span>
              }
            >
              <ul className="divide-y divide-line">
                {items.map((p) => (
                  <PartRow key={p.id} part={p} jobs={jobs} slug={m.slug} />
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
