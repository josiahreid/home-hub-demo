import { centsToInput, FREQUENCIES } from "@/lib/format";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { KINDS, type UtilityRow } from "./lib";

/** Shared inputs for creating and editing a utility (and its recurring payment). */
export function UtilityFields({ u, defaultNextDue }: { u?: UtilityRow; defaultNextDue: string }) {
  return (
    <>
      <FormGrid>
        <Field label="Kind *">
          <Select name="kind" defaultValue={u?.kind ?? "Power"} options={[...KINDS]} />
        </Field>
        <Field label="Provider *">
          <Input name="provider" required defaultValue={u?.provider ?? ""} placeholder="Contact, Mercury, One NZ, ASB…" />
        </Field>
        <Field label="Plan">
          <Input name="plan" defaultValue={u?.plan ?? ""} placeholder="Fibre 300, Standard user, 2yr fixed 5.49%…" />
        </Field>
        <Field label="Account number">
          <Input name="account_number" defaultValue={u?.account_number ?? ""} />
        </Field>
        <Field label="Contract end / refix / renewal">
          <Input name="contract_end" type="date" defaultValue={u?.contract_end ?? ""} />
        </Field>
        <Field label="Amount ($) *">
          <Input name="amount" required inputMode="decimal" defaultValue={centsToInput(u?.amount_cents)} />
        </Field>
        <Field label="Frequency *">
          <Select name="frequency" defaultValue={u?.frequency ?? "monthly"} options={FREQUENCIES} />
        </Field>
        <Field label="Next due *">
          <Input name="next_due" type="date" required defaultValue={u?.next_due ?? defaultNextDue} />
        </Field>
      </FormGrid>
      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={u?.notes ?? ""} />
      </Field>
    </>
  );
}
