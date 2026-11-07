import { io } from "next/cache";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Bot, CheckCircle2, CircleAlert } from "lucide-react";
import { COMMANDS, linkedChats, seenChats, telegramPrefs, telegramStatus, telegramToken } from "@/lib/telegram";
import { Badge, Card, Empty, Input } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { linkChat, removeToken, saveCommands, unlinkChat } from "./actions";
import { TestButton, TokenForm } from "./forms";
import { MessageEditor } from "./message-editor";
import { notifyConfig, previewData } from "@/lib/notify";
import { MESSAGE_INFO, type NotifyKind, slotLabel } from "@/lib/notify-format";
import { ApiGate } from "../gate";

export default function TelegramPage() {
  return <ApiGate><TelegramSettings /></ApiGate>;
}

async function TelegramSettings() {
  await io();
  const token = telegramToken();
  const masked = token ? `••••${token.slice(-4)}` : null;
  const status = telegramStatus();
  const chats = linkedChats();
  const seen = seenChats();
  const prefs = telegramPrefs();
  const config = notifyConfig();
  const kinds: NotifyKind[] = ["today", "tomorrow", "groceries", "church"];
  const previews = await Promise.all(kinds.map((k) => previewData(k)));
  const canSend = !!token && chats.length > 0;
  const ago = (iso?: string) => (iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : "never");
  const healthy = token && status.lastPoll && (!status.errorAt || status.errorAt < status.lastPoll);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title="1 · Connect your bot">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
            <li>In Telegram, open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-accent underline">@BotFather</a> and send <code className="rounded bg-surface-2 px-1">/newbot</code>.</li>
            <li>Give it a name (e.g. <em>Home Hub</em>) and a username ending in <em>bot</em>.</li>
            <li>BotFather replies with a <strong>token</strong>. Copy it and paste it below. Keep it private, like a password.</li>
          </ol>
          <TokenForm masked={masked} />
          {token && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
              <span className="flex items-center gap-2">
                {healthy ? <CheckCircle2 size={16} className="text-accent" /> : <CircleAlert size={16} className="text-warn" />}
                {status.bot ? <>Bot <a href={`https://t.me/${status.bot}`} target="_blank" rel="noreferrer" className="font-medium text-accent">@{status.bot}</a></> : "Bot saved"}
                <span className="text-xs text-muted">· last checked in {ago(status.lastPoll)}</span>
              </span>
              <DeleteButton action={removeToken} id={0} label="Disconnect" confirmText="Remove the bot token? Messages stop until you add it again." />
            </div>
          )}
          {status.error && status.errorAt && (!status.lastPoll || status.errorAt > status.lastPoll) && (
            <p className="mt-2 rounded-lg bg-warn-soft p-2 text-xs text-warn">Last problem ({ago(status.errorAt)}): {status.error}</p>
          )}
        </Card>

        <Card title="2 · Link your chats">
          <p className="mb-3 text-sm text-muted">
            On each phone (Default Name, Default Name 2), open {status.bot ? <a href={`https://t.me/${status.bot}`} target="_blank" rel="noreferrer" className="text-accent">@{status.bot}</a> : "your bot"} and
            press <strong>Start</strong>. You can also add the bot to a family group. It then shows up below; press <strong>Link</strong>. Only linked chats get messages or can use commands.
          </p>
          {seen.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Waiting to be linked</div>
              {seen.map((c) => (
                <form key={c.id} action={linkChat} className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft p-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Input name="name" defaultValue={c.name} className="!w-48 !py-1" aria-label="Name for this chat" />
                  <span className="text-xs text-muted">said hi {ago(c.at)}</span>
                  <SubmitButton className="ml-auto">Link</SubmitButton>
                </form>
              ))}
            </div>
          )}
          {chats.length === 0 ? (
            <Empty>{token ? "No chats linked yet. Send /start to the bot, then refresh this page." : "Connect the bot first."}</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {chats.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2"><Bot size={16} className="text-accent" /> {c.name}</span>
                  <DeleteButton action={unlinkChat} id={c.id} label="Unlink" confirmText={`Stop sending to ${c.name}?`} />
                </li>
              ))}
            </ul>
          )}
          {chats.length > 0 && <div className="mt-3"><TestButton /></div>}
        </Card>

        <div>
          <h2 className="mb-1 text-lg font-semibold">3 · Scheduled messages</h2>
          <p className="mb-3 text-sm text-muted">
            Choose when each one goes out and write what it says. The preview shows how it&apos;ll look in Telegram with today&apos;s real data.
            Each is sent once a day at each of its times, up to two hours late if Home Hub was off. Church reminders can have as many times as you like.
          </p>
          <div className="space-y-4">
            {kinds.map((k, i) => (
              <Card key={k} title={MESSAGE_INFO[k].title} actions={<span className="text-xs text-muted">{!config[k].on ? "off" : k === "church" ? config.church.slots.map(slotLabel).join(" · ") : config[k].time}</span>}>
                <p className="mb-3 text-sm text-muted">{MESSAGE_INFO[k].hint}</p>
                <MessageEditor kind={k} config={config[k]} values={previews[i].values} lines={previews[i].lines} canSend={canSend} />
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Card title="Commands">
          <ul className="space-y-1.5 text-sm">
            {COMMANDS.map(([c, d]) => (
              <li key={c}><code className="rounded bg-surface-2 px-1">/{c}</code> <span className="text-muted">– {d}</span></li>
            ))}
          </ul>
          <form action={saveCommands} className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="commands" defaultChecked={prefs.commands} /> Linked chats can use these</label>
            <SubmitButton variant="secondary" className="ml-auto">Save</SubmitButton>
          </form>
          {!prefs.commands && <p className="mt-2"><Badge tone="warn">Commands are switched off</Badge></p>}
          <p className="mt-3 text-xs text-muted">Tip: send these to BotFather with <code>/setcommands</code> so they appear in the bot&apos;s menu.</p>
        </Card>
        <Card title="Privacy">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>The token is stored only in Home Hub&apos;s database (not encrypted – the bot has to keep running after a restart without anyone typing the API password).</li>
            <li>Home Hub talks out to Telegram; nothing is opened to the internet.</li>
            <li>Messages you get pass through Telegram&apos;s servers, like any Telegram chat.</li>
            <li>Chats that aren&apos;t linked only get a &quot;link me in settings&quot; reply.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
