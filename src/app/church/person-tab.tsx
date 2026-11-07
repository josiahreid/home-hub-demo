import { Music2 } from "lucide-react";
import { niceDate, relDays, shortDate, today } from "@/lib/format";
import { AddPanel, Card, Empty, Stat, btn, cx } from "@/components/ui";
import { DeleteButton } from "@/components/buttons";
import { deleteRole } from "./actions";
import { DateBlock } from "./components";
import { ServingForm } from "./serving-form";
import { servingDefaults, servingFor, type Person, type Serving } from "./shared";

/** One person's church tab: add a serving date (it's theirs automatically), what's coming up, and the past folded away. */
export async function PersonTab({ person }: { person: Person }) {
  const [upcoming, past, defaults] = await Promise.all([servingFor(person, "upcoming"), servingFor(person, "past"), servingDefaults()]);
  const next = upcoming[0];
  const year = today().slice(0, 4);
  const thisYear = upcoming.filter((s) => s.date.startsWith(year)).length + past.filter((s) => s.date.startsWith(year)).length;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Next serving" value={next ? shortDate(next.date) : "—"} hint={next ? `${next.title}${next.time ? ` · ${next.time}` : ""} · ${relDays(next.date)}` : "nothing rostered"} />
        <Stat label="Coming up" value={upcoming.length} />
        <Stat label={`Serving in ${year}`} value={thisYear} />
      </div>

      <div className="max-w-3xl space-y-4">
        <AddPanel label={`Add a serving date for ${person}`}>
          <ServingForm person={person} values={defaults} />
        </AddPanel>

        <Card title="Coming up">
          {upcoming.length === 0 ? <Empty>{person} isn&apos;t rostered on yet.</Empty> : (
            <ul className="divide-y divide-line">
              {upcoming.map((s) => <ServingRow key={s.id} s={s} person={person} />)}
            </ul>
          )}
        </Card>

        {past.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-muted">Past ({past.length} most recent)</summary>
            <Card className="mt-2">
              <ul className="divide-y divide-line text-sm">
                {past.map((s) => (
                  <li key={s.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
                    <span className="w-28 shrink-0 text-muted">{niceDate(s.date)}</span>
                    <span>{s.title}</span>
                    {s.notes && <span className="w-full whitespace-pre-line text-xs text-muted sm:w-auto">{s.notes}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          </details>
        )}
      </div>
    </>
  );
}

function ServingRow({ s, person }: { s: Serving; person: Person }) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <DateBlock date={s.date} kind={s.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{s.title}</span>
            {s.time && <span className="text-sm text-muted">{s.time}</span>}
            <span className="text-xs text-muted">{relDays(s.date)}</span>
          </div>
          {s.notes && <p className="mt-1 text-sm whitespace-pre-line">{s.notes}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {s.spotify_url && (
              <a href={s.spotify_url} target="_blank" rel="noreferrer" className={cx(btn.secondary, btn.small)}><Music2 size={13} /> Playlist</a>
            )}
            <details className="group w-full sm:w-auto [&[open]]:w-full">
              <summary className={cx(btn.ghost, btn.small, "list-none")}>Edit</summary>
              <div className="mt-2 rounded-xl border border-line p-3">
                <ServingForm
                  id={s.id}
                  person={person}
                  values={{ date: s.date, title: s.title, time: s.time ?? "", spotify_url: s.spotify_url ?? "", notes: s.notes ?? "" }}
                />
              </div>
            </details>
          </div>
        </div>
        <DeleteButton action={deleteRole} id={s.id} label="Delete" confirmText={`Remove ${person} from ${s.title} on ${shortDate(s.date)}?`} />
      </div>
    </li>
  );
}
