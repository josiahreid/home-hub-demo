import { Mail, Paperclip, Send } from "lucide-react";
import { niceDate, today } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { AddPanel, Badge, Empty, Field, FormGrid, Input, Select, Textarea } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addProjectEmail, deleteProjectEmail } from "./actions";

export type ProjectEmail = {
  id: number; business_id: number | null; business_name: string | null; direction: string; from_addr: string | null;
  subject: string | null; date: string | null; body: string | null; file_name: string | null;
};

export const EMAIL_SELECT = `
  SELECT e.*, b.name AS business_name FROM project_emails e LEFT JOIN businesses b ON b.id = e.business_id`;

export function EmailForm({ projectId, businesses }: { projectId: number; businesses: { id: number; name: string }[] }) {
  return (
    <AddPanel label="Add an email">
      <form action={addProjectEmail} className="space-y-3">
        <input type="hidden" name="project_id" value={projectId} />
        <p className="text-xs text-muted">
          Copy and paste the email in, or attach it: in Gmail use ⋮ → <em>Download message</em> (.eml), in Outlook <em>Save as</em>,
          or print it to PDF. A .eml file fills in the details below by itself.
        </p>
        <FormGrid>
          <Field label="Business">
            <Select name="business_id" options={[["", "—"], ...businesses.map((b) => [String(b.id), b.name] as [string, string])]} />
          </Field>
          <Field label="…or a new business"><Input name="new_business" placeholder="Business name" /></Field>
          <Field label="Direction"><Select name="direction" options={[["received", "Received from them"], ["sent", "Sent by us"]]} /></Field>
          <Field label="From"><Input name="from_addr" placeholder="jobs@smithplumbing.co.nz" /></Field>
          <Field label="Subject"><Input name="subject" /></Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={today()} /></Field>
        </FormGrid>
        <Field label="Message"><Textarea name="body" rows={5} placeholder="Paste the email here…" /></Field>
        <Field label="Email file (optional)"><Input type="file" name="file" accept=".eml,.msg,.pdf,.txt,image/*" /></Field>
        <SubmitButton>Save email</SubmitButton>
      </form>
    </AddPanel>
  );
}

export function EmailList({ emails }: { emails: ProjectEmail[] }) {
  if (emails.length === 0) return <Empty>No emails saved for this project yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {emails.map((e) => (
        <li key={e.id} className="py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-muted">{e.direction === "sent" ? <Send size={16} /> : <Mail size={16} />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.subject ?? "(no subject)"}</span>
                {e.business_name && <Badge tone="info">{e.business_name}</Badge>}
                <Badge>{e.direction === "sent" ? "Sent" : "Received"}</Badge>
              </div>
              <div className="text-xs text-muted">
                {niceDate(e.date)}{e.from_addr && ` · ${e.from_addr}`}
              </div>
              {e.body && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-accent">Show message</summary>
                  <p className="mt-2 max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{e.body}</p>
                </details>
              )}
              {e.file_name && (
                <a href={fileUrl(e.file_name)!} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent">
                  <Paperclip size={12} /> Saved email file
                </a>
              )}
            </div>
            <DeleteButton action={deleteProjectEmail} id={e.id} label="×" confirmText="Delete this saved email?" />
          </div>
        </li>
      ))}
    </ul>
  );
}
