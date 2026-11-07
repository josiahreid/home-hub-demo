import "server-only";
import { db, getSetting, run, setSetting } from "./db";
import { addDays, format, parseISO } from "date-fns";
import { iso, today } from "./format";
import { generateVapidKeys, sendPush, type VapidKeys } from "./webpush";
import { todoGroups, type TodoRow } from "./todo-groups";

/**
 * Push notifications to phones. Each phone that says yes is saved with whose it is (Default Name, Default Name 2…), so a
 * notification only goes to the person it's for. Computers are left out unless "phones only" is switched off.
 */

// identifies Home Hub to Apple/Google/Mozilla's push services (they want a contact URL or email)
const SUBJECT = "https://github.com/josiahreid/home-hub-demo";

export function vapidKeys(): VapidKeys {
  try {
    const saved = JSON.parse(getSetting("push_vapid") ?? "null") as VapidKeys | null;
    if (saved?.publicKey && saved.privateJwk) return saved;
  } catch {}
  const keys = generateVapidKeys();
  setSetting("push_vapid", JSON.stringify(keys));
  return keys;
}

// ── settings ──

export type TodoCategory = "all" | "work" | "personal";
/** `scope`: "family" = everyone's to-dos, a section per person; "mine" = just theirs (plus everyone's if ticked). */
export type TodoReminder = { on: boolean; times: string[]; scope: "family" | "mine"; includeEveryone: boolean; category: TodoCategory; onlyIfAny: boolean };
export type ChurchReminder = { on: boolean; time: string; daysBefore: number };
/** The day's calendar (every calendar, imported ones too), a section per person – to everyone's phones. */
export type CalendarSummary = { today: { on: boolean; time: string }; tomorrow: { on: boolean; time: string } };
/** A heads-up before each event that has a time – Home Hub's own and imported calendars. */
export type EventReminder = { on: boolean; minutesBefore: number };
/** "Transactions to sort": once a day at `time`, to `people` (null = everyone); `onlyNew` = only when new ones have come in. */
export type SortReminder = { on: boolean; time: string; people: string[] | null; onlyNew: boolean; telegram: boolean };
export type PushConfig = { phonesOnly: boolean; todo: Record<string, TodoReminder>; church: ChurchReminder; calendar: CalendarSummary; events: EventReminder; sort: SortReminder };

export const DEFAULT_CHURCH_REMINDER: ChurchReminder = { on: true, time: "19:00", daysBefore: 1 };
export const DEFAULT_CALENDAR_SUMMARY: CalendarSummary = { today: { on: true, time: "07:00" }, tomorrow: { on: true, time: "19:00" } };
export const DEFAULT_EVENT_REMINDER: EventReminder = { on: true, minutesBefore: 30 };
export const DEFAULT_SORT_REMINDER: SortReminder = { on: true, time: "18:00", people: null, onlyNew: true, telegram: false };

export const DEFAULT_TODO_REMINDER: TodoReminder = { on: true, times: ["07:00", "12:00", "17:00"], scope: "family", includeEveryone: true, category: "all", onlyIfAny: true };

export function pushConfig(): PushConfig {
  try {
    const saved = JSON.parse(getSetting("push_config") ?? "null") as Partial<PushConfig> | null;
    if (saved) {
      return {
        phonesOnly: saved.phonesOnly ?? true,
        todo: saved.todo ?? {},
        church: { ...DEFAULT_CHURCH_REMINDER, ...saved.church },
        calendar: {
          today: { ...DEFAULT_CALENDAR_SUMMARY.today, ...saved.calendar?.today },
          tomorrow: { ...DEFAULT_CALENDAR_SUMMARY.tomorrow, ...saved.calendar?.tomorrow },
        },
        events: { ...DEFAULT_EVENT_REMINDER, ...saved.events },
        sort: { ...DEFAULT_SORT_REMINDER, ...saved.sort },
      };
    }
  } catch {}
  return { phonesOnly: true, todo: {}, church: DEFAULT_CHURCH_REMINDER, calendar: DEFAULT_CALENDAR_SUMMARY, events: DEFAULT_EVENT_REMINDER, sort: DEFAULT_SORT_REMINDER };
}

export const todoReminderFor = (c: PushConfig, slug: string): TodoReminder => ({ ...DEFAULT_TODO_REMINDER, ...c.todo[slug] });

export function savePushConfig(c: PushConfig) {
  setSetting("push_config", JSON.stringify(c));
}

// ── devices ──

export type PushDevice = {
  id: number; endpoint: string; p256dh: string; auth: string; person: string; mobile: number; label: string | null;
  created_at: string; last_sent: string | null; last_error: string | null;
};

export function saveDevice(sub: { endpoint: string; p256dh: string; auth: string }, person: string, mobile: boolean, label: string) {
  run(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, person, mobile, label) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, person = excluded.person,
       mobile = excluded.mobile, label = excluded.label, last_error = NULL`,
    sub.endpoint, sub.p256dh, sub.auth, person, mobile ? 1 : 0, label.slice(0, 60),
  );
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Sends to the given devices; ones the push service says are gone are removed. Returns how many it reached. */
async function sendToDevices(devices: PushDevice[], msg: PushMessage) {
  const keys = vapidKeys();
  let ok = 0;
  const errors: string[] = [];
  for (const d of devices) {
    try {
      const r = await sendPush(d, msg, keys, SUBJECT);
      if (r.status === 404 || r.status === 410) {
        run("DELETE FROM push_subscriptions WHERE id = ?", d.id); // unsubscribed or the app was removed
        continue;
      }
      if (r.status >= 200 && r.status < 300) {
        ok++;
        run("UPDATE push_subscriptions SET last_sent = datetime('now'), last_error = NULL WHERE id = ?", d.id);
      } else {
        const err = `Push service said ${r.status}${r.text ? `: ${r.text}` : ""}`;
        errors.push(err);
        run("UPDATE push_subscriptions SET last_error = ? WHERE id = ?", err, d.id);
      }
    } catch (e) {
      const err = (e as Error).message;
      errors.push(err);
      run("UPDATE push_subscriptions SET last_error = ? WHERE id = ?", err, d.id);
    }
  }
  return { ok, errors };
}

/** A notification for one person: their phones (and computers too if "phones only" is off). */
export async function pushToPerson(slug: string, msg: PushMessage) {
  const { phonesOnly } = pushConfig();
  const devices = db.prepare(`SELECT * FROM push_subscriptions WHERE person = ? ${phonesOnly ? "AND mobile = 1" : ""}`).all(slug) as PushDevice[];
  return sendToDevices(devices, msg);
}

/** A test to one device, whatever kind it is. */
export async function pushToDevice(id: number, msg: PushMessage) {
  const devices = db.prepare("SELECT * FROM push_subscriptions WHERE id = ?").all(id) as PushDevice[];
  return sendToDevices(devices, msg);
}

// ── to-do reminders ──

/** The to-do reminder for one person, or null when there's nothing to remind them of (and they only want it then). */
export function todoMessage(slug: string, r: TodoReminder): PushMessage | null {
  // the whole family's (a section each), or just theirs – plus everyone's if ticked
  const family = r.scope !== "mine";
  const where = [family ? "1" : r.includeEveryone ? "(person = ? OR person IS NULL)" : "person = ?"];
  if (r.category !== "all") where.push(`category = '${r.category}'`);
  const sql = `SELECT title, person, category, important, due FROM todos WHERE done_at IS NULL AND ${where.join(" AND ")} ORDER BY sort, id`;
  const todos = (family ? db.prepare(sql).all() : db.prepare(sql).all(slug)) as TodoRow[];
  if (!todos.length && r.onlyIfAny) return null;
  const t = today();
  const members = db.prepare("SELECT slug, name FROM members ORDER BY sort, id").all() as { slug: string; name: string }[];
  // a heading for each list (Default Name – work, Default Name – personal, Default Name 2…, Everyone), up to MAX to-dos in all
  const MAX = family ? 15 : 8;
  const lines: string[] = [];
  let shown = 0;
  for (const g of todoGroups(todos, members)) {
    if (shown >= MAX) break;
    lines.push(`${lines.length ? "\n" : ""}${g.label}:`);
    for (const x of g.items.slice(0, MAX - shown)) lines.push(`${x.important ? "★ " : x.due && x.due < t ? "⚠ " : "• "}${x.title}`);
    shown += Math.min(g.items.length, MAX - shown);
  }
  if (todos.length > shown) lines.push(`…and ${todos.length - shown} more`);
  const what = r.category === "work" ? "work to-do" : r.category === "personal" ? "personal to-do" : "to-do";
  return {
    title: todos.length ? `📝 ${todos.length} ${what}${todos.length === 1 ? "" : "s"}` : "📝 Nothing to do",
    body: lines.join("\n") || "All done. 🎉",
    url: `/todos?who=${slug}`,
    tag: `todo-${slug}`, // replaces the previous reminder on the phone instead of stacking up
  };
}

// ── church reminders: only to whoever's serving ──

const nice12 = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

/**
 * One person's church reminder for a date: the services they're serving at, with the time and their notes.
 * Null when they're not serving – so nobody gets the other's.
 */
export function churchMessage(name: string, slug: string, date: string, daysBefore: number): PushMessage | null {
  const serving = db.prepare(
    `SELECT s.title, s.time, s.location, s.spotify_url, r.notes FROM church_roles r JOIN church_services s ON s.id = r.service_id
      WHERE s.date = ? AND lower(r.person) = lower(?) ORDER BY s.time`).all(date, name) as
    { title: string; time: string | null; location: string | null; spotify_url: string | null; notes: string | null }[];
  if (!serving.length) return null;

  const when = daysBefore === 0 ? "today" : daysBefore === 1 ? "tomorrow" : `on ${format(parseISO(date), "EEEE")}`;
  const title = `⛪ Serving ${when} – ${[...new Set(serving.map((r) => r.title))].join(", ")}`;
  const lines = serving.flatMap((r) => [
    `${r.title}${r.time ? ` · ${nice12(r.time)}` : ""}${r.location ? ` @ ${r.location}` : ""}`,
    r.notes ? `Notes: ${r.notes}` : "",
    r.spotify_url ? "🎵 Playlist in Home Hub" : "",
  ]).filter(Boolean);
  return { title, body: lines.join("\n"), url: `/church/${slug}`, tag: `church-${slug}-${date}` };
}

/** Sends each person serving on the reminder's day their own reminder. Returns who got one. */
export async function sendChurchReminders(c: ChurchReminder) {
  const days = Math.max(0, Math.min(7, c.daysBefore));
  const date = iso(addDays(parseISO(today()), days));
  const people = db.prepare("SELECT slug, name FROM members ORDER BY sort, id").all() as { slug: string; name: string }[];
  const sentTo: string[] = [];
  const noDevice: string[] = [];
  for (const p of people) {
    const msg = churchMessage(p.name, p.slug, date, days);
    if (!msg) continue;
    const r = await pushToPerson(p.slug, msg).catch(() => ({ ok: 0, errors: [] }));
    (r.ok ? sentTo : noDevice).push(p.name);
  }
  return { date, sentTo, noDevice };
}

/** The same notification to every family member's phones. */
async function pushToEveryone(msg: PushMessage) {
  const people = db.prepare("SELECT slug FROM members").all() as { slug: string }[];
  let ok = 0;
  for (const p of people) ok += (await pushToPerson(p.slug, msg).catch(() => ({ ok: 0 }))).ok;
  return ok;
}

/**
 * Today's or tomorrow's calendar as a notification: every calendar (Home Hub's and imported ones), a section for
 * each person, then everyone's. Null when there's nothing on that day.
 */
export async function calendarMessage(which: "today" | "tomorrow"): Promise<PushMessage | null> {
  const { calendarLines } = await import("./notify");
  const date = which === "today" ? today() : iso(addDays(parseISO(today()), 1));
  const lines = await calendarLines(date);
  if (!lines.length) return null;
  const sections = [...new Set(lines.map((l) => l.section))];
  let body = sections.map((s) => `${s}:\n${lines.filter((l) => l.section === s).map((l) => l.text).join("\n")}`).join("\n\n");
  // push services take about 4 KB once it's encrypted
  if (body.length > 2500) body = `${body.slice(0, 2480).replace(/\n[^\n]*$/, "")}\n…and more in Home Hub`;
  return {
    title: `${which === "today" ? "☀️ Today" : "🌙 Tomorrow"} – ${format(parseISO(date), "EEE d MMM")} · ${lines.length} thing${lines.length === 1 ? "" : "s"} on`,
    body,
    url: "/calendar",
    tag: `cal-${which}`,
  };
}

/** Today's workout reminder to each person with one still to do. Returns who got one (and who has nothing set up to get it). */
export async function sendWorkoutReminders() {
  const { familyToday, workoutMessage } = await import("./workout");
  const sentTo: string[] = [];
  const noDevice: string[] = [];
  for (const p of familyToday()) {
    const msg = workoutMessage(p.slug);
    if (!msg) continue;
    const r = await pushToPerson(p.slug, msg).catch(() => ({ ok: 0 }));
    (r.ok ? sentTo : noDevice).push(p.name);
  }
  return { sentTo, noDevice };
}

/** Sends one now (Settings → Push notifications → "Send one now"). Returns how many devices it reached. */
export async function sendCalendarNow(which: "today" | "tomorrow") {
  const msg = await calendarMessage(which);
  if (!msg) return { ok: 0, empty: true };
  return { ok: await pushToEveryone(msg), empty: false };
}

/**
 * "Starts in 30 minutes": for each event with a time – Home Hub's own and every imported calendar – once, to the
 * people it's tagged for (everyone when it isn't tagged). Runs with the 30-second tick.
 */
export async function eventReminders(r: EventReminder, now: Date) {
  const before = Math.max(5, Math.min(24 * 60, r.minutesBefore));
  const from = today();
  const to = iso(addDays(parseISO(from), 1));
  const { upcoming, importedCalendars } = await import("./upcoming");
  const items = (await upcoming(from, to)).filter((i) => i.kind === "event" && i.time);
  for (const cal of await importedCalendars(from, to)) items.push(...cal.items.filter((i) => i.time).map((i) => ({ ...i, title: `${i.title} (${cal.name})` })));
  if (!items.length) return;

  let sent: Record<string, string> = {};
  try {
    sent = JSON.parse(getSetting("push_event_sent") ?? "{}");
  } catch {}
  for (const k of Object.keys(sent)) if (sent[k] < from) delete sent[k]; // only today's and tomorrow's are kept

  const members = (db.prepare("SELECT slug FROM members").all() as { slug: string }[]).map((m) => m.slug);
  for (const i of items) {
    const start = new Date(`${i.date}T${i.time}:00`); // the app's clock is NZ time
    const key = `${i.eventId ?? i.title}|${i.date}|${i.time}`;
    if (sent[key] || now < new Date(start.getTime() - before * 60_000) || now >= start) continue;
    sent[key] = i.date;
    setSetting("push_event_sent", JSON.stringify(sent)); // marked first, so a failed send can't repeat every 30 seconds
    const mins = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60_000));
    const msg: PushMessage = {
      title: `⏰ ${i.title}`,
      body: `${nice12(i.time!)} – in ${mins >= 60 && mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? "" : "s"}` : `${mins} minute${mins === 1 ? "" : "s"}`}`,
      url: i.href,
      tag: `event-${key}`,
    };
    const to = i.people?.filter((p) => members.includes(p)).length ? i.people.filter((p) => members.includes(p)) : members;
    for (const p of to) await pushToPerson(p, msg).catch(() => {});
  }
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Runs every 30 seconds: sends each person's to-do reminder at each of their times (at most once per time per day). */
export async function pushTick() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let sent: Record<string, string> = {};
  try {
    sent = JSON.parse(getSetting("push_sent") ?? "{}");
  } catch {}

  // payday, 8–10am: how last fortnight went – to everyone (push), and Telegram if it's connected
  if (getSetting("payday_summary") !== "0" && sent.payday !== today() && nowMin >= 8 * 60 && nowMin < 10 * 60) {
    const { fortnightOf, paydaySummary, shiftFortnight } = await import("./budget");
    const f = fortnightOf();
    if (f && f.start === today()) {
      sent.payday = today();
      setSetting("push_sent", JSON.stringify(sent));
      const msg = await paydaySummary(shiftFortnight(f, -1));
      const people = db.prepare("SELECT slug FROM members").all() as { slug: string }[];
      for (const p of people) await pushToPerson(p.slug, { ...msg, url: "/budget", tag: "payday" }).catch(() => {});
      const tgm = await import("./telegram");
      if (tgm.telegramToken() && tgm.linkedChats().length) {
        const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        await tgm.broadcast(`<b>${esc(msg.title)}</b>\n\n${esc(msg.body)}`).catch(() => {});
      }
    }
  }

  // insurance, 9–11am: "time to get quotes" once per renewal, N days before it – everyone (push), and Telegram
  if (nowMin >= 9 * 60 && nowMin < 11 * 60) await insuranceReminders().catch(() => {});

  // transactions to sort: once a day at its time
  const sc = pushConfig().sort;
  if (sc.on && sent.sort !== today() && nowMin >= minutes(sc.time) && nowMin < minutes(sc.time) + 120) {
    sent.sort = today();
    setSetting("push_sent", JSON.stringify(sent));
    await sendSortReminder(sc, sc.onlyNew).catch(() => {});
  }

  if (!db.prepare("SELECT 1 FROM push_subscriptions LIMIT 1").get()) return;
  const c = pushConfig();

  // church: once a day at its time, each serving person gets only their own
  if (c.church.on && sent.church !== today() && nowMin >= minutes(c.church.time) && nowMin < minutes(c.church.time) + 120) {
    sent.church = today();
    setSetting("push_sent", JSON.stringify(sent));
    await sendChurchReminders(c.church).catch(() => {});
  }

  // the day's calendar: today's in the morning, tomorrow's in the evening – once a day each, to everyone
  for (const which of ["today", "tomorrow"] as const) {
    const s = c.calendar[which];
    const key = `cal-${which}`;
    if (!s.on || sent[key] === today() || nowMin < minutes(s.time) || nowMin >= minutes(s.time) + 120) continue;
    sent[key] = today();
    setSetting("push_sent", JSON.stringify(sent));
    const msg = await calendarMessage(which).catch(() => null);
    if (msg) await pushToEveryone(msg);
  }

  if (c.events.on) await eventReminders(c.events, now).catch(() => {});

  // workouts: each person, on their workout days, if it isn't done yet (off until switched on in Settings)
  const { workoutNotify } = await import("./workout");
  const wn = workoutNotify();
  if (wn.on && sent.workout !== today() && nowMin >= minutes(wn.time) && nowMin < minutes(wn.time) + 120) {
    sent.workout = today();
    setSetting("push_sent", JSON.stringify(sent));
    await sendWorkoutReminders().catch(() => {});
  }

  const people = db.prepare("SELECT slug FROM members").all() as { slug: string }[];
  for (const { slug } of people) {
    const r = todoReminderFor(c, slug);
    if (!r.on) continue;
    // every time that's come round in the last two hours and hasn't gone yet – but only one notification for all of them
    const due = r.times.filter((t) => nowMin >= minutes(t) && nowMin < minutes(t) + 120 && sent[`${slug}|${t}`] !== today());
    if (!due.length) continue;
    for (const t of due) sent[`${slug}|${t}`] = today();
    setSetting("push_sent", JSON.stringify(sent));
    const msg = todoMessage(slug, r);
    if (msg) await pushToPerson(slug, msg).catch(() => {});
  }
}

// ── transactions to sort ──

/**
 * "📥 12 new transactions to sort": how many have come in (bank feed or statements) since the last reminder, and how
 * many are waiting in Budget → Sort (last 3 months). Null when there's nothing to sort – or, with `onlyNew`, nothing new.
 */
export function sortMessage(onlyNew: boolean): PushMessage | null {
  const since = getSetting("sort_notified_at") ?? "1970-01-01 00:00:00";
  const pile = (db.prepare("SELECT count(*) AS n FROM transactions WHERE category IS NULL AND amount_cents != 0 AND same_as IS NULL AND date >= date('now', '-90 days')").get() as { n: number }).n;
  const fresh = (db.prepare("SELECT count(*) AS n FROM transactions WHERE category IS NULL AND amount_cents != 0 AND same_as IS NULL AND date >= date('now', '-90 days') AND created_at > ?").get(since) as { n: number }).n;
  if (!pile || (onlyNew && !fresh)) return null;
  // the shops with the most waiting, so it's clear what it's about
  const top = db.prepare(
    "SELECT description FROM transactions WHERE category IS NULL AND amount_cents != 0 AND same_as IS NULL AND date >= date('now', '-90 days') ORDER BY date DESC LIMIT 40",
  ).all() as { description: string }[];
  const shops = [...new Set(top.map((t) => t.description.split(" · ")[0].replace(/\s+\d.*$/, "").trim()).filter(Boolean))].slice(0, 3);
  return {
    title: fresh ? `📥 ${fresh} new transaction${fresh === 1 ? "" : "s"} to sort` : `📥 ${pile} transaction${pile === 1 ? "" : "s"} to sort`,
    body: `${pile} waiting in Budget → Sort${shops.length ? ` – ${shops.join(", ")}…` : ""}`,
    url: "/budget/sort",
    tag: "sort",
  };
}

/** Sends the reminder to the chosen people (and Telegram if ticked). Returns who got it, or why nothing went. */
export async function sendSortReminder(r: SortReminder, onlyNew: boolean) {
  const msg = sortMessage(onlyNew);
  if (!msg) return { sent: 0, empty: true };
  const people = (db.prepare("SELECT slug FROM members").all() as { slug: string }[]).map((m) => m.slug).filter((s) => !r.people || r.people.includes(s));
  let sent = 0;
  for (const p of people) sent += (await pushToPerson(p, msg).catch(() => ({ ok: 0 }))).ok;
  if (r.telegram) {
    const tgm = await import("./telegram");
    if (tgm.telegramToken() && tgm.linkedChats().length) {
      const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await tgm.broadcast(`<b>${esc(msg.title)}</b>\n${esc(msg.body)}\nBudget → Sort`).catch(() => {});
    }
  }
  // the next reminder's "new" counts from here
  setSetting("sort_notified_at", (db.prepare("SELECT datetime('now') AS t").get() as { t: string }).t);
  return { sent, empty: false };
}

/** "Time to get quotes": once for each policy's renewal, from `insurance_remind_days` before it (default 42, 0 = off). */
export async function insuranceReminders() {
  const days = Number(getSetting("insurance_remind_days") ?? 42);
  if (!(days > 0)) return;
  const due = db.prepare(
    `SELECT p.id, p.kind, p.covers, p.insurer, p.renewal_date, r.amount_cents, r.frequency
       FROM insurance_policies p LEFT JOIN recurring_payments r ON r.id = p.recurring_id
      WHERE p.renewal_date BETWEEN ? AND ? AND (p.reminded_for IS NULL OR p.reminded_for <> p.renewal_date)`,
  ).all(today(), iso(addDays(new Date(), days))) as { id: number; kind: string; covers: string | null; insurer: string; renewal_date: string }[];
  if (!due.length) return;

  const people = db.prepare("SELECT slug FROM members").all() as { slug: string }[];
  const tgm = await import("./telegram");
  const telegram = !!(tgm.telegramToken() && tgm.linkedChats().length);
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const p of due) {
    // marked first, so a failed send can't turn into a reminder every 30 seconds
    run("UPDATE insurance_policies SET reminded_for = ? WHERE id = ?", p.renewal_date, p.id);
    const what = p.covers ? `${p.kind} insurance (${p.covers})` : `${p.kind} insurance`;
    const msg: PushMessage = {
      title: `${what} renews ${format(parseISO(p.renewal_date), "d MMM")}`,
      body: `${p.insurer} – time to get a couple of quotes and log them in Home Hub.`,
      url: `/insurance/${p.id}`,
      tag: `insurance-${p.id}`,
    };
    for (const m of people) await pushToPerson(m.slug, msg).catch(() => {});
    if (telegram) await tgm.broadcast(`🛡️ <b>${esc(msg.title)}</b>\n${esc(msg.body)}`).catch(() => {});
  }
}
