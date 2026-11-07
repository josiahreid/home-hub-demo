import { all } from "@/lib/db";
import { members } from "@/lib/members";
import { centsToInput, FREQUENCIES } from "@/lib/format";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { KINDS, peopleOf, type PolicyRow } from "./lib";

export type FieldOptions = { people: { slug: string; name: string }[]; vehicles: { id: number; name: string }[] };

export async function fieldOptions(): Promise<FieldOptions> {
  const [people, vehicles] = await Promise.all([members(), all<{ id: number; name: string }>("SELECT id, name FROM vehicles ORDER BY name")]);
  return { people, vehicles };
}

/** Shared inputs for adding and editing a policy (and the payment it owns). */
export function PolicyFields({ p, defaultNextDue, options }: { p?: PolicyRow; defaultNextDue: string; options: FieldOptions }) {
  const covered = p ? peopleOf(p) : [];
  return (
    <>
      <FormGrid>
        <Field label="Type *">
          <Select name="kind" defaultValue={p?.kind ?? "Car"} options={[...KINDS]} />
        </Field>
        <Field label="Insurer *">
          <Input name="insurer" required defaultValue={p?.insurer ?? ""} placeholder="AA, AMI, State, Tower, Southern Cross…" />
        </Field>
        <Field label="What / who it covers">
          <Input name="covers" defaultValue={p?.covers ?? ""} placeholder="Corolla, our house, Default Name…" />
        </Field>
        <Field label="Cost ($) *">
          <Input name="amount" required inputMode="decimal" defaultValue={centsToInput(p?.amount_cents)} />
        </Field>
        <Field label="Paid *">
          <Select name="frequency" defaultValue={p?.frequency ?? "monthly"} options={FREQUENCIES} />
        </Field>
        <Field label="Next payment *">
          <Input name="next_due" type="date" required defaultValue={p?.next_due ?? defaultNextDue} />
        </Field>
        <Field label="Renewal date">
          <Input name="renewal_date" type="date" defaultValue={p?.renewal_date ?? ""} />
        </Field>
        <Field label="Policy number">
          <Input name="policy_number" defaultValue={p?.policy_number ?? ""} />
        </Field>
        <Field label="Excess ($)">
          <Input name="excess" inputMode="decimal" defaultValue={centsToInput(p?.excess_cents)} />
        </Field>
        <Field label="Sum insured / cover ($)">
          <Input name="sum_insured" inputMode="decimal" defaultValue={centsToInput(p?.sum_insured_cents)} />
        </Field>
        <Field label="Claims phone">
          <Input name="claims_phone" type="tel" defaultValue={p?.claims_phone ?? ""} placeholder="0800…" />
        </Field>
        <Field label="Website / login page">
          <Input name="website" type="url" defaultValue={p?.website ?? ""} placeholder="https://" />
        </Field>
        {options.vehicles.length > 0 && (
          <Field label="Car (for car insurance)">
            <Select
              name="vehicle_id"
              defaultValue={p?.vehicle_id ? String(p.vehicle_id) : ""}
              options={[["", "—"], ...options.vehicles.map((v) => [String(v.id), v.name] as [string, string])]}
            />
          </Field>
        )}
      </FormGrid>
      {options.people.length > 0 && (
        <fieldset className="text-sm">
          <legend className="mb-1 text-xs font-medium text-muted">Who it covers (none ticked = the whole household)</legend>
          <div className="flex flex-wrap gap-4">
            {options.people.map((m) => (
              <label key={m.slug} className="flex items-center gap-2">
                <input type="checkbox" name="people" value={m.slug} defaultChecked={covered.includes(m.slug)} /> {m.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} placeholder="What's covered or not, agreed value, roadside assist…" />
      </Field>
    </>
  );
}
