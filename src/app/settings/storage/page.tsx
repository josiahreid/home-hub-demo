import { io } from "next/cache";
import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { today } from "@/lib/format";
import { Card, Empty, Progress, Stat } from "@/components/ui";
import { bytes, diskSpace, recordStorage, storageHistory, storageUsage, uploadsByType, type Snapshot } from "@/lib/storage";

/** Storage: how much room Home Hub takes up, what's using it, how fast it's growing and how much disk is left. */
export default async function Storage() {
  await io();
  const now = storageUsage();
  // make sure today is in the history (the worker also does this once a day)
  if (storageHistory().at(-1)?.date !== today()) recordStorage();
  const history = storageHistory();
  const disk = diskSpace();
  const types = uploadsByType();

  // growth: compared with the snapshot closest to 30 days ago (or the oldest one there is)
  const monthAgo = format(subDays(parseISO(today()), 30), "yyyy-MM-dd");
  const base = history.find((s) => s.date >= monthAgo) ?? history[0];
  const days = base ? Math.max(1, differenceInCalendarDays(parseISO(today()), parseISO(base.date))) : 0;
  const perMonth = base && days >= 1 && base.date !== history.at(-1)?.date ? ((now.total - base.total) / days) * 30 : null;
  const monthsLeft = disk && perMonth && perMonth > 0 ? disk.free / perMonth : null;

  const parts = [
    { label: "Database", hint: "budget, transactions, to-dos, calendar, settings", value: now.database },
    { label: "Uploaded files", hint: `${now.files} file${now.files === 1 ? "" : "s"} – photos, PDFs, songs…`, value: now.uploads },
    { label: "Backups", hint: "Home Hub's own copies (Settings → Backups)", value: now.backups },
    { label: "Other", hint: "anything else in the data folder", value: now.other },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Home Hub uses" value={bytes(now.total)} />
          <Stat
            label="Growing by"
            value={perMonth == null ? "—" : `${perMonth < 0 ? "−" : ""}${bytes(Math.abs(Math.round(perMonth)))}`}
            hint={perMonth == null ? "shows after a day or two" : `a month (over the last ${days} day${days === 1 ? "" : "s"})`}
          />
          <Stat
            label="Disk space left"
            value={disk ? bytes(disk.free) : "—"}
            hint={disk ? `of ${bytes(disk.size)}${monthsLeft != null ? ` · ${monthsLeft > 120 ? "10+ years" : monthsLeft > 24 ? `about ${Math.round(monthsLeft / 12)} years` : `about ${Math.round(monthsLeft)} months`} at this rate` : ""}` : "couldn't be read"}
            tone={disk && disk.free < disk.size * 0.1 ? "bad" : undefined}
          />
        </div>

        <Card title="What's using it">
          <ul className="space-y-3 text-sm">
            {parts.map((p) => (
              <li key={p.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span><span className="font-medium">{p.label}</span> <span className="text-xs text-muted">· {p.hint}</span></span>
                  <span className="tabular-nums">{bytes(p.value)}</span>
                </div>
                <Progress value={p.value} max={Math.max(now.total, 1)} tone="info" />
              </li>
            ))}
          </ul>
          {disk && (
            <div className="mt-4 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Whole disk used (everything on it, not just Home Hub)</span><span className="tabular-nums">{bytes(disk.size - disk.free)} of {bytes(disk.size)}</span></div>
              <Progress value={disk.size - disk.free} max={disk.size} tone={disk.free < disk.size * 0.1 ? "bad" : disk.free < disk.size * 0.25 ? "warn" : "good"} />
            </div>
          )}
        </Card>

        <Card title="Over time" actions={<span className="text-xs text-muted">a snapshot each day</span>}>
          {history.length < 2 ? (
            <Empty>Tracking started today – come back in a few days to see how it&apos;s growing.</Empty>
          ) : (
            <>
              <Chart history={history} />
              <MonthTable history={history} />
            </>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Uploaded files by type">
          {types.length === 0 ? <Empty>No uploaded files yet.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {types.map((t) => (
                <li key={t.label} className="flex justify-between gap-2 py-1.5">
                  <span>{t.label} <span className="text-xs text-muted">· {t.files}</span></span>
                  <span className="tabular-nums">{bytes(t.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Good to know">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>Songs, photos and PDFs are what make Home Hub grow – the database stays small.</li>
            <li>Backups are trimmed by themselves (the last 10 before-update, 14 daily and 10 you made).</li>
            <li>On the server, &quot;disk space left&quot; is the host&apos;s disk – tell the host if it&apos;s getting low.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Total size over time, as a simple line. */
function Chart({ history }: { history: Snapshot[] }) {
  const pts = history.slice(-365);
  const max = Math.max(...pts.map((p) => p.total), 1);
  const W = 600;
  const H = 120;
  const x = (i: number) => (pts.length === 1 ? 0 : (i / (pts.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 10);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  return (
    <div className="mb-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={`Storage from ${bytes(pts[0].total)} to ${bytes(pts.at(-1)!.total)}`}>
        <path d={`${line} L${W},${H} L0,${H} Z`} className="fill-accent-soft" />
        <path d={line} className="fill-none stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>{format(parseISO(pts[0].date), "d MMM yyyy")} · {bytes(pts[0].total)}</span>
        <span>{bytes(pts.at(-1)!.total)} · today</span>
      </div>
    </div>
  );
}

/** The last snapshot of each month, and how much it grew. */
function MonthTable({ history }: { history: Snapshot[] }) {
  const byMonth = new Map<string, Snapshot>();
  for (const s of history) byMonth.set(s.date.slice(0, 7), s); // later ones win, so it's the month's last
  const months = [...byMonth.values()];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="py-1 font-medium">Month</th>
          <th className="py-1 text-right font-medium">Database</th>
          <th className="py-1 text-right font-medium">Files</th>
          <th className="py-1 text-right font-medium">Total</th>
          <th className="py-1 text-right font-medium">Change</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {months.map((s, i) => {
          const change = i ? s.total - months[i - 1].total : null;
          return (
            <tr key={s.date}>
              <td className="py-1.5">{format(parseISO(s.date), "MMM yyyy")}</td>
              <td className="py-1.5 text-right tabular-nums">{bytes(s.database)}</td>
              <td className="py-1.5 text-right tabular-nums">{bytes(s.uploads)}</td>
              <td className="py-1.5 text-right tabular-nums">{bytes(s.total)}</td>
              <td className="py-1.5 text-right text-muted tabular-nums">{change == null ? "—" : `${change < 0 ? "−" : "+"}${bytes(Math.abs(change))}`}</td>
            </tr>
          );
        }).reverse()}
      </tbody>
    </table>
  );
}
