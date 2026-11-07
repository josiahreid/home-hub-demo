import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Landmark, Lock } from "lucide-react";
import { akahuState, akahuStatus } from "@/lib/akahu";
import { Card } from "@/components/ui";
import { SyncButton } from "../settings/api/akahu/forms";

/** Akahu bank feed status + Sync now, on This fortnight and Upload statements. Read-only. */
export function BankFeed() {
  const s = akahuState();
  const status = akahuStatus();
  const failing = status.errorAt && (!status.lastSync || status.errorAt > status.lastSync);
  return (
    <Card title={<span className="flex items-center gap-1"><Landmark size={14} /> Bank feed</span>}>
      {!s.connected ? (
        <p className="text-sm text-muted">
          Bring transactions straight from the bank (read-only) instead of uploading statements:{" "}
          <Link href="/settings/api/akahu" className="text-accent underline">connect Akahu</Link> in Settings → API.
        </p>
      ) : !s.ready ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Lock size={14} className="mt-0.5 shrink-0" />
          <span>Paused since Home Hub restarted. <Link href="/settings/api/akahu" className="text-accent underline">Unlock Settings → API</Link> once to switch it back on.</span>
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted">
            Last sync {status.lastSync ? formatDistanceToNow(parseISO(status.lastSync), { addSuffix: true }) : "never"}
            {s.autoSync ? " · syncs by itself every 6 hours" : ""}
          </p>
          {failing && <p className="rounded-lg bg-warn-soft p-2 text-xs text-warn">{status.error}</p>}
          <SyncButton from="budget" />
        </div>
      )}
    </Card>
  );
}
