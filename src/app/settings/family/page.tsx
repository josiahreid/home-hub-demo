import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { all } from "@/lib/db";
import { members } from "@/lib/members";
import { featuresOf, memberSubtitle } from "@/lib/family";
import { Card, Field, Input, btn, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { deleteMember, moveMember, updateMember } from "./actions";
import { AddMemberForm } from "./add-form";
import { FeaturePicker } from "./feature-picker";

export default async function FamilySettings() {
  const list = await members();
  const counts = new Map(
    (await all<{ id: number; jobs: number; lists: number; hunts: number }>(
      `SELECT m.id,
              (SELECT count(*) FROM job_cards WHERE member_id = m.id) AS jobs,
              (SELECT count(*) FROM wish_lists WHERE member_id = m.id) AS lists,
              (SELECT count(*) FROM price_hunts WHERE member_id = m.id) AS hunts
         FROM members m`,
    )).map((c) => [c.id, c]),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        {list.map((m, i) => {
          const c = counts.get(m.id);
          const stuff = [
            c?.jobs ? `${c.jobs} job card${c.jobs === 1 ? "" : "s"}` : null,
            c?.lists ? `${c.lists} wish list${c.lists === 1 ? "" : "s"}` : null,
            c?.hunts ? `${c.hunts} price card${c.hunts === 1 ? "" : "s"}` : null,
          ].filter(Boolean);
          return (
            <Card
              key={m.id}
              title={<Link href={`/${m.slug}`} className="hover:text-accent">{m.name}</Link>}
              actions={
                <div className="flex items-center">
                  <form action={moveMember}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button disabled={i === 0} aria-label="Move up in the menu" className={cx(btn.ghost, btn.small)}><ArrowUp size={14} /></button>
                  </form>
                  <form action={moveMember}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button disabled={i === list.length - 1} aria-label="Move down in the menu" className={cx(btn.ghost, btn.small)}><ArrowDown size={14} /></button>
                  </form>
                </div>
              }
            >
              <p className="mb-3 text-xs text-muted">
                Page: <Link href={`/${m.slug}`} className="text-accent underline">/{m.slug}</Link> · {memberSubtitle(m)}
              </p>
              <form action={updateMember} className="space-y-3">
                <input type="hidden" name="id" value={m.id} />
                <Field label="Name"><Input name="name" defaultValue={m.name} required /></Field>
                <FeaturePicker selected={featuresOf(m)} autoSave />
                <p className="text-xs text-muted">Switching something off only hides it – what&apos;s already there comes back if you switch it on again.</p>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </form>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
                <span>{stuff.length ? stuff.join(" · ") : "Nothing saved yet"}</span>
                <DeleteButton
                  action={deleteMember}
                  id={m.id}
                  label={`Remove ${m.name}`}
                  confirmText={`Remove ${m.name} from Home Hub?${stuff.length ? ` This also deletes their ${stuff.join(", ")} for good.` : ""}`}
                />
              </div>
            </Card>
          );
        })}
      </div>
      <div>
        <Card title="Add a family member" className="lg:sticky lg:top-6">
          <AddMemberForm />
          <p className="mt-3 text-xs text-muted">They get their own page in the menu. Church serving stays with Default Name and Default Name 2 on the Church tab.</p>
        </Card>
      </div>
    </div>
  );
}
