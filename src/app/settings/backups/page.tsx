import { format } from "date-fns";
import { Download } from "lucide-react";
import { getSetting } from "@/lib/db";
import { listBackups } from "@/lib/backup";
import { Badge, Card, Empty, btn } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { onTailnet } from "@/lib/deploy";
import { setDailyBackups } from "./actions";
import { BackupNowButton } from "./backup-now";

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const KIND = { update: { label: "Before update", tone: "info" }, daily: { label: "Daily", tone: "neutral" }, manual: { label: "Made by you", tone: "good" } } as const;

/** Backups: automatic before every update and every day, plus download a full copy any time. */
export default async function Backups() {
  const list = listBackups();
  const dailyOn = getSetting("backup_daily_on") !== "0";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title="Download a full backup">
          <p className="mb-3 text-sm text-muted">
            Everything in one file: the whole database (budget, transactions, to-dos, calendar, settings…) plus every uploaded photo and PDF.
            Keep it somewhere safe, off the server – it holds your finances.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/settings/backups/download" download className={btn.primary}><Download size={16} /> Download full backup (.zip)</a>
            <BackupNowButton />
          </div>
        </Card>

        <Card title="Saved backups" actions={<span className="text-xs text-muted">{list.length} kept</span>}>
          {list.length === 0 ? <Empty>No backups yet – the first daily one is made within a minute of Home Hub starting.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {list.map((b) => (
                <li key={b.file} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <Badge tone={KIND[b.kind].tone}>{KIND[b.kind].label}</Badge>
                    {format(b.at, "EEE d MMM yyyy, h:mm a")}
                    <span className="text-xs text-muted">{size(b.size)}</span>
                  </span>
                  <a href={`/settings/backups/download?file=${encodeURIComponent(b.file)}`} className={`${btn.ghost} ${btn.small}`}><Download size={13} /> Database</a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Kept: the last 10 before-update backups, 14 daily and 10 of your own. Older ones are removed automatically.</p>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Automatic backups">
          <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li><strong className="text-ink">Before every update</strong> that changes the database – always on. If that copy can&apos;t be made, the update stops instead of carrying on without one.</li>
            <li><strong className="text-ink">Every day.</strong></li>
          </ul>
          <form action={setDailyBackups} className="flex items-center gap-2 text-sm">
            <label className="flex flex-1 items-center gap-2"><input type="checkbox" name="on" defaultChecked={dailyOn} /> Daily backup</label>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
        </Card>
        <Card title="Good to know">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>Backups are kept in Home Hub&apos;s data folder{onTailnet ? " (the home-hub-data volume on the server)" : " on this PC"}. That protects against a bad update, not against losing the {onTailnet ? "server" : "drive"} – download a full backup now and then too.</li>
            <li>To put one back, see <em>Backups</em> in DEPLOY.md (stop the stack, copy the file in as home-hub.db, start it).</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
