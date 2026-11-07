import { formatDistanceToNow, parseISO } from "date-fns";
import { Monitor, Smartphone } from "lucide-react";
import { all } from "@/lib/db";
import { members } from "@/lib/members";
import { currentUser } from "@/lib/current-user";
import { pushConfig, todoReminderFor, vapidKeys, type PushDevice } from "@/lib/push";
import { Badge, Card, Empty } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { forgetDevice, setPhonesOnly } from "./actions";
import { ThisDevice } from "./this-device";
import { ReminderEditor } from "./reminder-editor";
import { ChurchEditor } from "./church-editor";
import { CalendarEditor, EventEditor, SortEditor, WorkoutEditor } from "./calendar-editor";
import { workoutNotify } from "@/lib/workout";

const ago = (sqlTime: string | null) => (sqlTime ? formatDistanceToNow(parseISO(`${sqlTime.replace(" ", "T")}Z`), { addSuffix: true }) : "never");

export default async function PushSettings() {
  const me = await currentUser();
  const people = await members();
  const config = pushConfig();
  const devices = await all<PushDevice>("SELECT * FROM push_subscriptions ORDER BY person, created_at");
  const name = (slug: string) => people.find((p) => p.slug === slug)?.name ?? slug;
  // the person using this device first
  const ordered = [...people].sort((a, b) => Number(b.slug === me?.slug) - Number(a.slug === me?.slug));
  const reaches = (d: PushDevice) => !!d.mobile || !config.phonesOnly;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title="This device">
          {me && <ThisDevice me={me.name} publicKey={vapidKeys().publicKey} phonesOnly={config.phonesOnly} />}
        </Card>

        <div>
          <h2 className="mb-1 text-lg font-semibold">To-do reminders</h2>
          <p className="mb-3 text-sm text-muted">
            At the times each person chooses (as many as you like): the whole family&apos;s to-dos with a section for each person,
            or just their own. Each reminder replaces the last one on the phone, so they don&apos;t pile up.
          </p>
          <div className="space-y-4">
            {ordered.map((p) => (
              <Card key={p.slug} title={p.name} actions={p.slug === me?.slug ? <Badge tone="info">you</Badge> : null}>
                <ReminderEditor
                  person={p.slug}
                  name={p.name}
                  reminder={todoReminderFor(config, p.slug)}
                  devices={devices.filter((d) => d.person === p.slug && reaches(d)).length}
                />
              </Card>
            ))}
          </div>
        </div>

        <Card title="Calendar">
          <p className="mb-3 text-sm text-muted">
            The day&apos;s calendar on everyone&apos;s phones – every calendar, imported ones included – with a section for each person
            (their events, to-dos and chores), then everyone&apos;s. Nothing on means nothing is sent.
          </p>
          <CalendarEditor summary={config.calendar} />
        </Card>

        <Card title="Before each event">
          <p className="mb-3 text-sm text-muted">
            A reminder before every event that has a time, from Home Hub and imported calendars – to whoever it&apos;s for
            (everyone, if it isn&apos;t for anyone in particular).
          </p>
          <EventEditor reminder={config.events} />
        </Card>

        <Card title="Transactions to sort">
          <p className="mb-3 text-sm text-muted">
            Once a day, when the bank feed or a statement has brought in transactions that aren&apos;t sorted yet – how many are new
            and how many are waiting. Tapping it opens Budget → Sort.
          </p>
          <SortEditor reminder={config.sort} people={people.map((p) => ({ slug: p.slug, name: p.name }))} />
        </Card>

        <Card title="Workouts">
          <p className="mb-3 text-sm text-muted">
            A reminder on each person&apos;s workout days (from their Workout tab) – only if it isn&apos;t done yet. Both are off
            until you tick them.
          </p>
          <WorkoutEditor notify={workoutNotify()} />
        </Card>

        <Card title="Church reminders">
          <p className="mb-3 text-sm text-muted">
            Only whoever&apos;s serving gets one – with their own role and instruments, the service time and their practices.
            Nobody serving that day means nothing is sent. (The Telegram church message still goes to every linked chat –
            switch it off under Telegram bot if you only want these.)
          </p>
          <ChurchEditor reminder={config.church} />
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Devices">
          {devices.length === 0 ? <Empty>No devices yet. Turn notifications on from each phone.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {devices.map((d) => (
                <li key={d.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {d.mobile ? <Smartphone size={15} className="text-accent" /> : <Monitor size={15} className="text-muted" />}
                      <span><strong>{name(d.person)}</strong> · {d.label ?? "Device"}</span>
                    </span>
                    <DeleteButton action={forgetDevice} id={d.id} label="×" confirmText={`Stop notifications to ${name(d.person)}'s ${d.label ?? "device"}?`} />
                  </div>
                  <div className="mt-0.5 pl-6 text-xs text-muted">
                    {!reaches(d) && <><Badge>computer – skipped</Badge>{" "}</>}
                    last sent {ago(d.last_sent)}
                    {d.last_error && <span className="text-danger"> · {d.last_error}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form action={setPhonesOnly} className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
            <label className="flex flex-1 items-center gap-2"><input type="checkbox" name="phonesOnly" defaultChecked={config.phonesOnly} /> Phones only (computers don&apos;t get them)</label>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
        </Card>
        <Card title="How it works">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>On each phone: open Home Hub, pick who you are, then turn notifications on here.</li>
            <li>iPhone: add Home Hub to the Home Screen first (Share → Add to Home Screen) and open it from there – Apple only allows notifications for apps on the Home Screen.</li>
            <li>The phone needs the <strong>https</strong> Home Hub address, so HTTPS Certificates must be on in Tailscale.</li>
            <li>Notifications are encrypted for each phone and pass through Apple&apos;s or Google&apos;s push service, which can&apos;t read them.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
