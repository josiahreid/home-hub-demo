import Link from "next/link";
import { io } from "next/cache";
import { all } from "@/lib/db";
import { money } from "@/lib/format";
import { AddPanel, Badge, Card, Empty, Input, btn } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addBusiness, deleteBusiness, updateBusiness } from "../actions";
import { BusinessFields, ContactLinks, type Business } from "../business";

type Row = Business & { quotes: number; quoted: number; accepted: number; emails: number; projects: string | null };

export default async function Businesses({ searchParams }: PageProps<"/house/businesses">) {
  await io();
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";
  const rows = await all<Row>(
    `SELECT b.*,
            (SELECT count(*) FROM quotes WHERE business_id = b.id) AS quotes,
            (SELECT coalesce(sum(amount_cents), 0) FROM quotes WHERE business_id = b.id) AS quoted,
            (SELECT coalesce(sum(amount_cents), 0) FROM quotes WHERE business_id = b.id AND status = 'accepted') AS accepted,
            (SELECT count(*) FROM project_emails WHERE business_id = b.id) AS emails,
            (SELECT group_concat(p.id || ':' || p.name, char(30)) FROM house_projects p
              WHERE p.id IN (SELECT project_id FROM quotes WHERE business_id = b.id UNION SELECT project_id FROM project_emails WHERE business_id = b.id)) AS projects
       FROM businesses b
      ${search ? "WHERE b.name LIKE ? OR b.trade LIKE ? OR b.contact_name LIKE ? OR b.email LIKE ?" : ""}
      ORDER BY b.name COLLATE NOCASE`,
    ...(search ? Array(4).fill(`%${search}%`) : []));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <form className="flex flex-1 gap-2">
          <Input name="q" defaultValue={search} placeholder="Search name, trade, contact, email" />
          <button className={btn.secondary}>Search</button>
        </form>
      </div>

      <AddPanel label="Add a business">
        <form action={addBusiness} className="space-y-3">
          <BusinessFields />
          <SubmitButton>Add business</SubmitButton>
        </form>
      </AddPanel>

      {rows.length === 0 ? (
        <Empty>{search ? "No businesses match." : "No businesses yet. They're added automatically when you log a quote, or add one above."}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{b.name}</h3>
                    {b.trade && <Badge tone="info">{b.trade}</Badge>}
                  </div>
                  <div className="mt-1"><ContactLinks b={b} /></div>
                  {!b.email && !b.phone && <p className="mt-1 text-xs text-warn">No contact details yet – add them under Edit.</p>}
                </div>
                {b.gst_number && <span className="shrink-0 text-xs text-muted">GST {b.gst_number}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{b.quotes} quote{b.quotes === 1 ? "" : "s"}{b.quoted ? ` · ${money(b.quoted)}` : ""}</span>
                {b.accepted > 0 && <span className="text-accent">accepted {money(b.accepted)}</span>}
                {b.emails > 0 && <span>{b.emails} email{b.emails === 1 ? "" : "s"}</span>}
              </div>
              {b.projects && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {b.projects.split("\u001e").map((pr) => {
                    const [id, ...name] = pr.split(":");
                    return <Link key={id} href={`/house/projects/${id}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs hover:text-accent">{name.join(":")}</Link>;
                  })}
                </div>
              )}
              {b.notes && <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{b.notes}</p>}

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-accent">Edit</summary>
                <form action={updateBusiness} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={b.id} />
                  <BusinessFields b={b} />
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </form>
                <div className="mt-3 border-t border-line pt-3">
                  <DeleteButton action={deleteBusiness} id={b.id} label="Delete business" confirmText={`Delete ${b.name}? Its quotes and emails stay, just unlinked.`} />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
