import "server-only";
import ICAL from "ical.js";
import { addMonths } from "date-fns";
import { db, run } from "./db";
import { iso } from "./format";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Pulls an iCal feed (Google secret address / iCloud public link) into the events table.
 *  Recurring events are expanded from 1 month back to 12 months ahead. */
export async function syncFeed(feedId: number) {
  const feed = db.prepare("SELECT url FROM calendar_feeds WHERE id = ?").get(feedId) as { url: string } | undefined;
  if (!feed) throw new Error("Feed not found");

  const url = feed.url.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Calendar returned ${res.status}`);
  const root = new ICAL.Component(ICAL.parse(await res.text()));
  // TZID times only convert correctly once the feed's VTIMEZONE definitions are registered.
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  const windowStart = ICAL.Time.fromJSDate(addMonths(new Date(), -1));
  const windowEnd = ICAL.Time.fromJSDate(addMonths(new Date(), 12));
  const rows: { uid: string; title: string; start: Date; end: Date | null; allDay: boolean; location: string | null; notes: string | null }[] = [];

  const vevents = root.getAllSubcomponents("vevent");
  // Modified single instances of a recurring event are separate VEVENTs with RECURRENCE-ID.
  const overrides = new Set(vevents.filter((v) => v.hasProperty("recurrence-id")).map((v) => `${v.getFirstPropertyValue("uid")}|${v.getFirstPropertyValue("recurrence-id")}`));

  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (!ev.startDate) continue;
    const base = { title: ev.summary || "(untitled)", location: ev.location || null, notes: ev.description || null, allDay: ev.startDate.isDate };

    if (ev.isRecurring() && !ev.isRecurrenceException()) {
      const it = ev.iterator();
      for (let t = it.next(), i = 0; t && t.compare(windowEnd) < 0 && i < 1000; t = it.next(), i++) {
        if (t.compare(windowStart) < 0) continue;
        if (overrides.has(`${ev.uid}|${t.toString()}`)) continue;
        const occ = ev.getOccurrenceDetails(t);
        rows.push({ ...base, uid: `${ev.uid}|${t.toString()}`, start: occ.startDate.toJSDate(), end: occ.endDate?.toJSDate() ?? null });
      }
    } else {
      if (ev.startDate.compare(windowStart) < 0 || ev.startDate.compare(windowEnd) > 0) continue;
      const uid = ev.isRecurrenceException() ? `${ev.uid}|${v.getFirstPropertyValue("recurrence-id")}` : ev.uid;
      rows.push({ ...base, uid, start: ev.startDate.toJSDate(), end: ev.endDate?.toJSDate() ?? null });
    }
  }

  const upsert = db.prepare(
    `INSERT INTO events (title, start_date, start_time, end_date, end_time, location, notes, feed_id, external_uid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(feed_id, external_uid) DO UPDATE SET
       title = excluded.title, start_date = excluded.start_date, start_time = excluded.start_time,
       end_date = excluded.end_date, end_time = excluded.end_time, location = excluded.location, notes = excluded.notes`,
  );
  db.exec("BEGIN");
  try {
    db.exec("CREATE TEMP TABLE IF NOT EXISTS seen (uid TEXT PRIMARY KEY)");
    db.exec("DELETE FROM seen");
    const seen = db.prepare("INSERT OR IGNORE INTO seen (uid) VALUES (?)");
    for (const r of rows) {
      // All-day DTEND is exclusive, so the last day is the day before.
      const end = r.end && r.allDay ? new Date(r.end.getTime() - 86_400_000) : r.end;
      upsert.run(r.title, iso(r.start), r.allDay ? null : hhmm(r.start), end ? iso(end) : null,
        end && !r.allDay ? hhmm(end) : null, r.location, r.notes, feedId, r.uid);
      seen.run(r.uid);
    }
    // Drop events that were deleted in the source calendar.
    run("DELETE FROM events WHERE feed_id = ? AND external_uid NOT IN (SELECT uid FROM seen)", feedId);
    run("UPDATE calendar_feeds SET last_synced = datetime('now') WHERE id = ?", feedId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return rows.length;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

/** RFC 5545 lines are folded at 75 octets, continuation lines start with a space. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split a UTF-8 character
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const ymd = (isoDate: string) => isoDate.replace(/-/g, "");
const nextDay = (isoDate: string) => iso(new Date(new Date(`${isoDate}T00:00`).getTime() + 36 * 3600_000));

export type IcsItem = {
  uid: string;
  title: string;
  date: string;               // YYYY-MM-DD, NZ local
  time?: string | null;       // HH:MM; omitted = all day
  endDate?: string | null;
  endTime?: string | null;
  description?: string;
  location?: string | null;
  url?: string;
  categories?: string;
  alarm?: string;             // trigger duration relative to the start, e.g. "-PT5H"
};

/** Builds an iCalendar file that Apple Calendar, Google Calendar and Outlook can import or subscribe to.
 *  Timed entries are written in UTC (converted from NZ time) so every device shows the right time. */
export function toIcs(items: IcsItem[], opts: { name?: string; refreshHours?: number } = {}) {
  const stamp = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Home Hub//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.name ?? "Home Hub")}`, "X-WR-TIMEZONE:Pacific/Auckland",
  ];
  if (opts.refreshHours) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${opts.refreshHours}H`, `X-PUBLISHED-TTL:PT${opts.refreshHours}H`);

  for (const it of items) {
    lines.push("BEGIN:VEVENT", `UID:${it.uid}@home-hub`, `DTSTAMP:${stamp}`);
    if (it.time) {
      // the server runs in Pacific/Auckland, so this parses as NZ local time
      const start = new Date(`${it.date}T${it.time}`);
      const end = it.endTime ? new Date(`${it.endDate ?? it.date}T${it.endTime}`) : new Date(start.getTime() + 3600_000);
      lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end > start ? end : new Date(start.getTime() + 3600_000))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(it.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(it.endDate && it.endDate > it.date ? it.endDate : it.date))}`);
      lines.push("TRANSP:TRANSPARENT"); // all-day reminders shouldn't show as busy
    }
    lines.push(`SUMMARY:${esc(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    if (it.location) lines.push(`LOCATION:${esc(it.location)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    if (it.categories) lines.push(`CATEGORIES:${esc(it.categories)}`);
    if (it.alarm) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(it.title)}`, `TRIGGER:${it.alarm}`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
