import { io } from "next/cache";
import Link from "next/link";
import { addDays, parseISO } from "date-fns";
import { Music2 } from "lucide-react";
import { iso, relDays, shortDate, today } from "@/lib/format";
import { AddPanel, Card, Empty, btn, cx } from "@/components/ui";
import { DateBlock } from "./components";
import { ServingForm } from "./serving-form";
import { PEOPLE, servingBetween, servingDefaults } from "./shared";

/** Both people at a glance: who serves next, an add form (Default Name / Default Name 2 / Both), and the next 12 weeks. */
export default async function ChurchOverview() {
  await io();
  const [serving, defaults] = await Promise.all([servingBetween(today(), iso(addDays(parseISO(today()), 84))), servingDefaults()]);
  const services = [...Map.groupBy(serving, (s) => s.service_id).values()];

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {PEOPLE.map((p) => {
          const s = serving.find((x) => x.person === p);
          return (
            <Link key={p} href={`/church/${p.toLowerCase()}`} className="rounded-xl border border-line bg-surface p-4 hover:bg-surface-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">{p} next serves</div>
              <div className="mt-1 text-xl font-semibold">{s ? shortDate(s.date) : "—"}</div>
              <div className="mt-1 truncate text-xs text-muted">{s ? `${s.title}${s.time ? ` · ${s.time}` : ""}` : "not rostered"}</div>
            </Link>
          );
        })}
      </div>

      <AddPanel label="Add a serving date">
        <ServingForm choosePerson values={defaults} />
      </AddPanel>

      <Card title="Next 12 weeks">
        {services.length === 0 ? <Empty>Nothing rostered yet.</Empty> : (
          <ul className="divide-y divide-line">
            {services.map((list) => {
              const s = list[0];
              return (
                <li key={s.service_id} className="flex gap-3 py-3">
                  <DateBlock date={s.date} kind={s.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{s.title}</span>
                      {s.time && <span className="text-sm text-muted">{s.time}</span>}
                      <span className="text-xs text-muted">{relDays(s.date)}</span>
                    </div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {list.map((r) => (
                        <li key={r.id} className="flex gap-2">
                          <Link href={`/church/${r.person.toLowerCase()}`} className="w-8 shrink-0 text-xs font-semibold text-muted hover:text-accent">{r.person}</Link>
                          <span className="whitespace-pre-line">{r.notes ?? <span className="text-muted">Serving</span>}</span>
                        </li>
                      ))}
                    </ul>
                    {s.spotify_url && (
                      <a href={s.spotify_url} target="_blank" rel="noreferrer" className={cx(btn.secondary, btn.small, "mt-2")}><Music2 size={13} /> Playlist</a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
