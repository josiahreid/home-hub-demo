import { CATEGORIES } from "@/lib/categories";
import { FREQUENCIES, centsToInput } from "@/lib/format";
import { POTS } from "@/lib/budget-sheet";
import type { Line } from "@/lib/budget-plan";
import { Field, FormGrid, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";

export const GROUPS_LIST = "budget-groups";

/** Add or edit one budget line. Amounts can be typed per week, month, year… and are saved per fortnight. */
export function LineForm({ action, line, potAccounts, submit }: {
  action: (fd: FormData) => Promise<void>;
  line?: Line;
  potAccounts: Map<string, string>;
  submit: string;
}) {
  const pots = Object.entries(POTS).map(([key, p]): [string, string] => [key, potAccounts.get(key) ? `${p.label} – ${potAccounts.get(key)}` : p.label]);
  return (
    <form action={action}>
      {line && <input type="hidden" name="id" value={line.id} />}
      <FormGrid>
        <Field label="Name"><Input name="name" required defaultValue={line?.name} placeholder="Netflix" /></Field>
        <Field label="Group"><Input name="grp" required list={GROUPS_LIST} defaultValue={line?.grp} placeholder="Subscriptions" /></Field>
        <Field label="Goes into"><Select name="pot" defaultValue={line?.pot ?? "bills"} options={pots} /></Field>
        <Field label="Amount ($)"><Input name="amount" inputMode="decimal" required defaultValue={line ? centsToInput(line.budget_cents) : undefined} /></Field>
        <Field label="Per"><Select name="frequency" defaultValue="fortnightly" options={FREQUENCIES.map((f) => [f, FREQ_LABEL[f]])} /></Field>
        <Field label="Track spending as"><Select name="category" defaultValue={line?.category ?? ""} options={[["", line ? "— (not tracked)" : "— (guess from the name)"], ...CATEGORIES]} /></Field>
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><Input name="notes" defaultValue={line?.notes ?? ""} /></Field>
      </FormGrid>
      <p className="mt-2 text-xs text-muted">Enter the amount however you know it (e.g. $120 per year for rego). It&apos;s saved as the per-fortnight equivalent.</p>
      <div className="mt-3"><SubmitButton>{submit}</SubmitButton></div>
    </form>
  );
}

const FREQ_LABEL: Record<(typeof FREQUENCIES)[number], string> = {
  weekly: "week", fortnightly: "fortnight", monthly: "month", quarterly: "quarter", yearly: "year",
};
