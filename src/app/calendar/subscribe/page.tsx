import { headers } from "next/headers";
import { CalendarPlus, Download, Info } from "lucide-react";
import { FEED_KINDS, feedKinds, feedToken } from "@/lib/calendar-feed";
import { Card, PageHeader, btn } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { CopyButton } from "@/components/copy-button";
import { onTailnet } from "@/lib/deploy";
import { resetFeedLink, saveFeedKinds } from "../actions";

export default async function Subscribe() {
  const h = await headers();
  // On the PC the link only works for calendar apps on that PC; on Tailscale it works on any of your devices
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const https = (h.get("x-forwarded-proto") ?? "http") === "https";
  const path = `/feed/${feedToken()}.ics`;
  const httpUrl = `${https ? "https" : "http"}://${host}${path}`;
  const webcalUrl = `${https ? "webcals" : "webcal"}://${host}${path}`;
  const kinds = new Set(feedKinds());

  return (
    <>
      <PageHeader
        title="Subscribe to Home Hub"
        subtitle={onTailnet
          ? "Home Hub is its own calendar. Subscribe from your phone, iPad, Mac or Outlook (with Tailscale on) and everything here shows up there, updated automatically."
          : "Home Hub is its own calendar. Subscribe from a calendar app on this PC (e.g. Outlook) and everything here shows up there, updated automatically."}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Your private calendar link">
            <div className="rounded-lg bg-surface-2 p-3 font-mono text-xs break-all">{webcalUrl}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={webcalUrl} className={btn.primary}><CalendarPlus size={16} /> Subscribe on this device</a>
              <CopyButton text={webcalUrl} label="Copy link" />
              <CopyButton text={httpUrl} label={https ? "Copy https:// link" : "Copy http:// link"} />
              <a href="/calendar/export" className={btn.ghost}><Download size={16} /> Download .ics once</a>
            </div>
            <p className="mt-3 text-xs text-muted">
              Anyone with this link can see the calendar (not change it). If it gets shared by mistake, reset it below and re-subscribe.
            </p>
          </Card>

          <Card title="What's in the calendar">
            <form action={saveFeedKinds} className="space-y-2">
              {FEED_KINDS.map((k) => (
                <label key={k.kind} className="flex items-start gap-3 rounded-lg p-2 hover:bg-surface-2">
                  <input type="checkbox" name="kind" value={k.kind} defaultChecked={kinds.has(k.kind)} className="mt-1" />
                  <span>
                    <span className="block text-sm font-medium">{k.label}</span>
                    <span className="block text-xs text-muted">{k.hint}</span>
                  </span>
                </label>
              ))}
              <SubmitButton variant="secondary">Save</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-muted">Changes show on your devices at their next refresh (about hourly).</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Outlook (Windows)">
            <p className="text-sm">Add calendar → Subscribe from web → paste the link.</p>
          </Card>
          {onTailnet ? (
            <>
              <Card title="iPhone / iPad / Mac">
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Make sure Tailscale is on (connected) on the device.</li>
                  <li>Open Home Hub there, go to Calendar → Subscribe and tap <strong>Subscribe on this device</strong>.</li>
                  <li>Or: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, and paste the link.</li>
                </ol>
              </Card>
              <Card title="Google Calendar">
                <p className="text-sm">
                  Not available: Google fetches calendars from its own servers, which aren&apos;t on your Tailscale network. Use the phone&apos;s own
                  calendar app instead, or the <a href="/settings/api/telegram" className="text-accent underline">Telegram bot</a> for reminders.
                </p>
              </Card>
            </>
          ) : (
            <Card title="Phones, Google Calendar">
              <p className="text-sm">
                Not available. Home Hub only runs on the PC the drive is plugged into and can&apos;t be reached from other devices or the internet.
                For reminders on your phone, use the <a href="/settings/api/telegram" className="text-accent underline">Telegram bot</a>, or
                <em> Download .ics once</em> and send the file to yourself (a one-off copy that won&apos;t update).
              </p>
            </Card>
          )}
          <Card title={<span className="flex items-center gap-1"><Info size={14} /> Good to know</span>}>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>The calendar only refreshes while Home Hub is running{onTailnet ? " and the device has Tailscale on" : ""}. Otherwise it keeps showing the last copy.</li>
              <li>The subscribed calendar is read-only. Add and change things in Home Hub.</li>
            </ul>
          </Card>
          <Card title="Reset link">
            <p className="mb-2 text-sm text-muted">Stops the old link working. Devices using it will need to subscribe again.</p>
            <DeleteButton action={resetFeedLink} id={0} label="Reset calendar link" confirmText="Reset the link? Every subscribed device stops updating until you subscribe again." />
          </Card>
        </div>
      </div>
    </>
  );
}
