import { io } from "next/cache";
import { format, parseISO } from "date-fns";
import { all } from "@/lib/db";
import { PASSWORD_RULE } from "@/lib/api-lock";
import { Badge, Card, Empty } from "@/components/ui";
import { ApiGate } from "../gate";
import { ChangePasswordForm } from "../lock-forms";

export default function SecurityPage() {
  return <ApiGate><Security /></ApiGate>;
}

async function Security() {
  await io();
  const log = await all<{ id: number; at: string; event: string; ok: number; note: string | null }>("SELECT * FROM api_log ORDER BY id DESC LIMIT 50");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Log" className="lg:col-span-2">
        {log.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-2 py-1.5">
                <span className="w-32 shrink-0 text-xs text-muted tabular-nums">{format(parseISO(`${l.at.replace(" ", "T")}Z`), "d MMM, h:mm a")}</span>
                <Badge tone={l.ok ? "neutral" : "bad"}>{l.event}</Badge>
                <span className="min-w-0 flex-1 text-muted">{l.note}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Unlocks (and wrong passwords), password changes, Akahu connects and every sync. Tokens are never written here.</p>
      </Card>
      <Card title="Change the password">
        <ChangePasswordForm rule={PASSWORD_RULE} />
        <p className="mt-2 text-xs text-muted">The Akahu tokens are re-encrypted with the new password; nothing needs pasting again.</p>
      </Card>
    </div>
  );
}
