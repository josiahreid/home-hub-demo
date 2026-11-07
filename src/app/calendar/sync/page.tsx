import { all } from "@/lib/db";
import { Card, Empty, PageHeader } from "@/components/ui";
import { DeleteButton } from "@/components/buttons";
import { deleteFeed } from "../actions";
import { AddFeedForm, SyncButton } from "./feed-forms";

export default async function SyncPage() {
  const feeds = await all<{ id: number; name: string; url: string; last_synced: string | null; n: number }>(
    "SELECT f.*, (SELECT count(*) FROM events e WHERE e.feed_id = f.id) AS n FROM calendar_feeds f ORDER BY f.name");

  return (
    <>
      <PageHeader title="Google & Apple calendars" subtitle="Pull your existing calendars in, and take Home Hub's dates back out." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card title="Connected calendars" actions={feeds.length > 0 && <SyncButton />}>
            {feeds.length === 0 ? <Empty>None yet.</Empty> : (
              <ul className="divide-y divide-line text-sm">
                {feeds.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-muted">{f.n} events · last synced {f.last_synced ?? "never"}</div>
                    </div>
                    <DeleteButton action={deleteFeed} id={f.id} label="Remove" confirmText="Remove this calendar and its synced events?" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Connect a calendar"><AddFeedForm /></Card>
        </div>

        <div className="space-y-4">
          <Card title="Google Calendar">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>On a computer, open Google Calendar → ⚙ Settings.</li>
              <li>Under “Settings for my calendars”, pick the calendar.</li>
              <li>Scroll to <strong>Integrate calendar</strong> and copy <strong>Secret address in iCal format</strong>.</li>
              <li>Paste it here. Treat that link like a password.</li>
            </ol>
          </Card>
          <Card title="Apple / iCloud Calendar">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>In the Calendar app (or iCloud.com), tap the ⓘ next to a calendar.</li>
              <li>Turn on <strong>Public Calendar</strong> and copy the link (starts with webcal://).</li>
              <li>Paste it here.</li>
            </ol>
          </Card>
          <Card title="Getting Home Hub dates into your calendar">
            <p className="text-sm">
              This page pulls <em>other</em> calendars into Home Hub. To see Home Hub&apos;s own calendar in a calendar app,{" "}
              <a href="/calendar/subscribe" className="text-accent underline">subscribe to it</a>.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
