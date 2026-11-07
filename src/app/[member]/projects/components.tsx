import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge, btn, cx, Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { centsToInput, money, relDays, shortDate, today } from "@/lib/format";
import { MarkOrdered } from "./mark-ordered";
import { deletePart, setPartStatus, updatePart } from "./actions";
import { DEFAULT_JOB_TYPES, PART_STATUSES, PRIORITIES, lineTotal, type Job, type Part, type PartStatus } from "./shared";

type JobOption = Pick<Job, "id" | "title">;

const PART_TONE: Record<PartStatus, "warn" | "info" | "good"> = { wishlist: "warn", ordered: "info", received: "good" };
const NEXT_PART: Partial<Record<PartStatus, [PartStatus, string]>> = {
  wishlist: ["ordered", "Mark ordered"],
  ordered: ["received", "Mark received"],
};

export function PartStatusBadge({ status }: { status: PartStatus }) {
  return <Badge tone={PART_TONE[status]}>{PART_STATUSES.find((s) => s.value === status)?.label ?? status}</Badge>;
}

function jobOptions(jobs: JobOption[]): [string, string][] {
  return [["", "— No job —"], ...jobs.map((j): [string, string] => [String(j.id), j.title])];
}

/** Fields for adding or editing a part. */
export function PartFields({ part, jobs, jobId, memberId }: { part?: Part; jobs?: JobOption[]; jobId?: number; memberId?: number }) {
  return (
    <FormGrid>
      {memberId != null && <input type="hidden" name="member_id" value={memberId} />}
      <Field label="Link (AliExpress or other)" className="sm:col-span-2 lg:col-span-3">
        <Input name="url" type="url" inputMode="url" placeholder="https://www.aliexpress.com/item/…" defaultValue={part?.url ?? ""} />
      </Field>
      <Field label="Name" className="sm:col-span-2">
        <Input name="name" placeholder="e.g. ESP32-C3 dev board" defaultValue={part?.name ?? ""} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Price each ($)">
          <Input name="price" inputMode="decimal" placeholder="0.00" defaultValue={centsToInput(part?.price_cents)} />
        </Field>
        <Field label="Qty">
          <Input name="quantity" type="number" min={1} defaultValue={part?.quantity ?? 1} />
        </Field>
        <Field label="Shipping ($)">
          <Input name="shipping" inputMode="decimal" placeholder="0.00" defaultValue={centsToInput(part?.shipping_cents)} />
        </Field>
      </div>
      <Field label="Status">
        <Select name="status" defaultValue={part?.status ?? "wishlist"} options={PART_STATUSES.map((s): [string, string] => [s.value, s.label])} />
      </Field>
      {part && (
        <Field label="Arriving (once ordered)">
          <Input name="arrives" type="date" defaultValue={part.arrives ?? ""} />
        </Field>
      )}
      {jobs ? (
        <Field label="Job">
          <Select name="job_id" defaultValue={String(part?.job_id ?? jobId ?? "")} options={jobOptions(jobs)} />
        </Field>
      ) : (
        <input type="hidden" name="job_id" value={part?.job_id ?? jobId ?? ""} />
      )}
    </FormGrid>
  );
}

/** One part, as a compact mobile-friendly row with quick status + edit. */
export function PartRow({ part, jobs, job, slug }: { part: Part; jobs: JobOption[]; job?: JobOption | null; slug: string }) {
  const next = NEXT_PART[part.status];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium break-words">{part.name}</span>
            <PartStatusBadge status={part.status} />
          </div>
          <div className="mt-0.5 text-xs text-muted tabular-nums">
            {money(part.price_cents)} × {part.quantity}
            {part.shipping_cents ? <> + {money(part.shipping_cents)} shipping</> : null}
            {part.status === "ordered" && part.arrives && (
              <span className={cx(part.arrives < today() && "font-medium text-warn")}>
                {" · "}arrives {shortDate(part.arrives)} ({relDays(part.arrives)})
              </span>
            )}
            {job !== undefined && (
              <>
                {" · "}
                {job ? (
                  <Link href={`/${slug}/projects/${job.id}`} className="text-accent hover:underline">
                    {job.title}
                  </Link>
                ) : (
                  "No job"
                )}
              </>
            )}
          </div>
        </div>
        <div className="text-right font-semibold tabular-nums">{part.price_cents == null ? "—" : money(lineTotal(part))}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {part.url && (
          <a href={part.url} target="_blank" rel="noreferrer" className={cx(btn.secondary, btn.small)}>
            <ExternalLink size={12} /> Open
          </a>
        )}
        {next?.[0] === "ordered" && <MarkOrdered id={part.id} />}
        {next && next[0] !== "ordered" && (
          <form action={setPartStatus}>
            <input type="hidden" name="id" value={part.id} />
            <input type="hidden" name="status" value={next[0]} />
            <button className={cx(btn.secondary, btn.small)}>{next[1]}</button>
          </form>
        )}
        <details className="group [&[open]]:w-full">
          <summary className={cx(btn.ghost, btn.small, "list-none")}>Edit</summary>
          <form action={updatePart} className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
            <input type="hidden" name="id" value={part.id} />
            <PartFields part={part} jobs={jobs} />
            <div className="mt-3">
              <SubmitButton>Save part</SubmitButton>
            </div>
          </form>
        </details>
        <DeleteButton action={deletePart} id={part.id} confirmText={`Delete "${part.name}"?`} />
      </div>
    </li>
  );
}

/** Fields for creating or editing a job card. */
export function JobFields({ job, types }: { job?: Job; types: string[] }) {
  const options = [...new Set([...DEFAULT_JOB_TYPES, ...types])].sort((a, b) => a.localeCompare(b));
  return (
    <FormGrid>
      <Field label="Title" className="sm:col-span-2">
        <Input name="title" required placeholder="e.g. Garage door opener" defaultValue={job?.title ?? ""} />
      </Field>
      <Field label="Job type">
        <Input name="job_type" list="personA-job-types" placeholder="Electronics…" defaultValue={job?.job_type ?? ""} />
        <datalist id="personA-job-types">
          {options.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="Tags (comma separated)" className="sm:col-span-2">
        <Input name="tags" placeholder="esp32, garage" defaultValue={job?.tags ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select name="priority" defaultValue={String(job?.priority ?? 2)} options={PRIORITIES} />
        </Field>
        <Field label="Due">
          <Input name="due" type="date" defaultValue={job?.due ?? ""} />
        </Field>
      </div>
      <Field label="Description" className="sm:col-span-2 lg:col-span-3">
        <Textarea name="description" placeholder="What's the plan?" defaultValue={job?.description ?? ""} />
      </Field>
    </FormGrid>
  );
}
