import { Field, FormGrid, Input, Textarea } from "@/components/ui";
import { centsToInput } from "@/lib/format";
import type { Hunt, PriceLink } from "./shared";

/** Name, tags and goal – for adding a card and editing it. */
export function HuntFields({ hunt }: { hunt?: Hunt }) {
  return (
    <FormGrid>
      <Field label="Name" className="sm:col-span-2">
        <Input name="title" required placeholder="e.g. Cordless drill" defaultValue={hunt?.title ?? ""} />
      </Field>
      <Field label="Tags (comma separated)">
        <Input name="tags" placeholder="tools, garage" defaultValue={hunt?.tags ?? ""} />
      </Field>
      <Field label="Goal" className="sm:col-span-2 lg:col-span-3">
        <Textarea name="description" placeholder="What you're after: model, must-haves, most you'll pay…" defaultValue={hunt?.description ?? ""} />
      </Field>
    </FormGrid>
  );
}

/** One shop's link and prices. */
export function LinkFields({ link }: { link?: PriceLink }) {
  return (
    <FormGrid>
      <Field label="Link" className="sm:col-span-2">
        <Input name="url" type="url" inputMode="url" placeholder="https://…" defaultValue={link?.url ?? ""} />
      </Field>
      <Field label="Shop (optional)">
        <Input name="shop" placeholder="from the link if blank" defaultValue={link?.shop ?? ""} />
      </Field>
      <Field label="Price ($)">
        <Input name="price" inputMode="decimal" placeholder="0.00" defaultValue={centsToInput(link?.price_cents)} />
      </Field>
      <Field label="On sale now for ($)">
        <Input name="sale_price" inputMode="decimal" placeholder="blank if not on sale" defaultValue={centsToInput(link?.sale_cents)} />
      </Field>
      <Field label="Sale ends">
        <Input name="sale_ends" type="date" defaultValue={link?.sale_ends ?? ""} />
      </Field>
      <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
        <Input name="notes" placeholder="Shipping, colour, model number…" defaultValue={link?.notes ?? ""} />
      </Field>
    </FormGrid>
  );
}
