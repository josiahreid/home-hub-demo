import { io } from "next/cache";
import { formatDistanceToNow, parseISO } from "date-fns";
import { CheckCircle2, CircleAlert, Landmark, ShieldCheck } from "lucide-react";
import { all } from "@/lib/db";
import { akahuState, akahuStatus } from "@/lib/akahu";
import { Badge, Card, Empty, btn } from "@/components/ui";
import { DeleteButton, ReadyButton } from "@/components/buttons";
import { ApiGate } from "../gate";
import { removeAkahu, setAutoSync, stopSyncing } from "./actions";
import { AkahuTokenForm, SyncButton } from "./forms";

export default function AkahuPage() {
  return <ApiGate><AkahuSettings /></ApiGate>;
}

const ago = (iso?: string) => (iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : "never");

async function AkahuSettings() {
  await io();
  const s = akahuState();
  const status = akahuStatus();
  const accounts = await all<{ id: number; name: string; number: string | null; n: number; last: string | null }>(
    `SELECT a.id, a.name, a.number, count(t.id) AS n, max(t.date) AS last
       FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id AND t.source = 'akahu'
      WHERE a.akahu_id IS NOT NULL GROUP BY a.id ORDER BY a.name`);
  const failing = status.errorAt && (!status.lastSync || status.errorAt > status.lastSync);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title={<span className="flex items-center gap-1"><Landmark size={14} /> Bank feed</span>}>
          {!s.connected ? (
            <p className="text-sm text-muted">Not connected yet – paste the two Akahu tokens below.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                {failing ? <CircleAlert size={16} className="text-warn" /> : <CheckCircle2 size={16} className="text-accent" />}
                Connected · last sync {ago(status.lastSync)}
                {status.lastSync && <span className="text-muted">({status.lastAdded ?? 0} new)</span>}
              </p>
              {failing && <p className="rounded-lg bg-warn-soft p-2 text-xs text-warn">Last problem ({ago(status.errorAt)}): {status.error}</p>}
              <SyncButton />
              <form action={setAutoSync} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <label className="flex items-center gap-2"><input type="checkbox" name="auto" defaultChecked={s.autoSync} /> Sync by itself every 6 hours</label>
                <ReadyButton className={btn.secondary}>Save</ReadyButton>
              </form>
              <p className="text-xs text-muted">
                Automatic and Budget-page syncs work until Home Hub restarts (an update or server reboot). After that, unlock this tab once to turn the feed back on –
                the key that opens the tokens is never saved to disk.
              </p>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <form action={stopSyncing}><ReadyButton className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink">Stop syncing until the next unlock</ReadyButton></form>
                <DeleteButton action={removeAkahu} id={0} label="Disconnect Akahu" confirmText="Remove the Akahu tokens from Home Hub? Transactions already brought in stay. (Also revoke access at my.akahu.nz if you're done with it.)" />
              </div>
            </div>
          )}
        </Card>

        <Card title={s.connected ? "Replace the tokens" : "Connect Akahu"}>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
            <li>On a computer, sign in at <a href="https://my.akahu.nz" target="_blank" rel="noreferrer" className="text-accent underline">my.akahu.nz</a> (the account your bank is connected to).</li>
            <li>Open <strong>Developers</strong>, agree to the Developer Terms and set up multi-factor authentication. Your personal app and its two tokens are shown. (It sees every account on your Akahu profile; Home Hub only brings in everyday, savings, credit card and loan accounts.)</li>
            <li>Copy the <strong>App ID Token</strong> (starts <code>app_token_</code>) and the <strong>User Access Token</strong> (starts <code>user_token_</code>) and paste them here – nowhere else (not chat, email or notes).</li>
            <li>Press <strong>Save &amp; test</strong>. Home Hub reads your account list once to check them, then saves them encrypted.</li>
            <li>Press <strong>Sync now</strong>. The first sync reads the last year; days already covered by imported statements are skipped.</li>
          </ol>
          <AkahuTokenForm connected={s.connected} />
        </Card>

        <Card title="Accounts from Akahu">
          {accounts.length === 0 ? <Empty>None yet – they appear after the first sync.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    {a.number && <div className="font-mono text-xs text-muted">…{a.number.slice(-7)}</div>}
                  </div>
                  <span className="text-right text-xs text-muted">{a.n} from the feed{a.last ? <><br />latest {a.last}</> : null}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Matched to the accounts your statements created, by account number, so statements and the feed share one account.</p>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={<span className="flex items-center gap-1"><ShieldCheck size={14} /> Read only</span>}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Home Hub only <strong>reads</strong> accounts and transactions. There is no code in Home Hub that can pay, transfer or change anything at the bank.</li>
            <li>Tokens are encrypted with a key made from this tab&apos;s password, only opened in the server&apos;s memory, never shown again or sent to a browser.</li>
            <li>Every sync is written to <em>Password &amp; log</em>.</li>
            <li>If a token might have leaked: Akahu → Developers → Danger Zone → <em>Regenerate User Access Token</em> (or <em>Delete Personal App</em>), then paste the new one here.</li>
            <li>Akahu itself refreshes from the bank once a day, so today&apos;s card purchases usually appear tomorrow.</li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            <Badge tone="warn">Recommended</Badge> Lock the tokens to the server&apos;s internet address: Akahu → Developers → <strong>IP Address Ranges</strong> → Edit → add
            the address with <code>/32</code>. Then they don&apos;t work anywhere else. Full steps in AKAHU.md.
          </p>
        </Card>
        <Card title="How it fits with statements">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Each transaction is stored once (by its Akahu ID), so syncing again is always safe.</li>
            <li>Days an imported statement already covers for an account are skipped – nothing is counted twice.</li>
            <li>Money between your own accounts and home-loan entries are <em>Transfers</em>; the shop rules sort the rest. New ones show up on Budget → Sort.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
