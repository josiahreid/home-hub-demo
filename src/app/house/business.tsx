import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { Field, FormGrid, Input, Textarea } from "@/components/ui";

export type Business = {
  id: number; name: string; trade: string | null; contact_name: string | null; email: string | null; phone: string | null;
  website: string | null; address: string | null; gst_number: string | null; notes: string | null;
};

export const TRADES = [
  "Builder", "Plumber", "Electrician", "Painter", "Tiler", "Roofer", "Landscaper", "Joiner / kitchens",
  "Flooring", "Glazier", "Drainlayer", "Heat pumps", "Insulation", "Supplier", "Other",
];

const webHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

/** Tap-to-email / call / open links for a business; shows nothing for details not filled in. */
export function ContactLinks({ b, subject }: { b: Pick<Business, "email" | "phone" | "website" | "address" | "contact_name">; subject?: string }) {
  const link = "inline-flex items-center gap-1 text-accent hover:underline";
  const mail = b.email ? `mailto:${b.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}` : null;
  if (!b.email && !b.phone && !b.website && !b.address && !b.contact_name) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {b.contact_name && <span className="text-muted">{b.contact_name}</span>}
      {mail && <a href={mail} className={link}><Mail size={12} />{b.email}</a>}
      {b.phone && <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className={link}><Phone size={12} />{b.phone}</a>}
      {b.website && <a href={webHref(b.website)} target="_blank" rel="noreferrer" className={link}><Globe size={12} />{b.website.replace(/^https?:\/\//, "")}</a>}
      {b.address && (
        <a href={`https://maps.google.com/?q=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" className={link}>
          <MapPin size={12} />{b.address}
        </a>
      )}
    </div>
  );
}

export function BusinessFields({ b }: { b?: Business }) {
  return (
    <>
      <FormGrid>
        <Field label="Business name"><Input name="name" required defaultValue={b?.name ?? ""} placeholder="Smith Plumbing Ltd" /></Field>
        <Field label="Trade"><Input name="trade" list="trades" defaultValue={b?.trade ?? ""} /></Field>
        <Field label="Contact person"><Input name="contact_name" defaultValue={b?.contact_name ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={b?.email ?? ""} placeholder="jobs@smithplumbing.co.nz" /></Field>
        <Field label="Phone"><Input name="phone" type="tel" defaultValue={b?.phone ?? ""} placeholder="021 123 4567" /></Field>
        <Field label="Website"><Input name="website" defaultValue={b?.website ?? ""} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={b?.address ?? ""} /></Field>
        <Field label="GST number"><Input name="gst_number" defaultValue={b?.gst_number ?? ""} /></Field>
      </FormGrid>
      <Field label="Notes" className="mt-3"><Textarea name="notes" rows={2} defaultValue={b?.notes ?? ""} placeholder="Licence number, how you found them, how they were to deal with…" /></Field>
      <datalist id="trades">{TRADES.map((t) => <option key={t} value={t} />)}</datalist>
    </>
  );
}
