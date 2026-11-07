import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { all, getSetting, setSetting } from "./db";
import { iso, money, today } from "./format";
import { groceryList } from "./groceries";
import { todoGroups, type TodoRow } from "./todo-groups";
import { importedCalendars, upcoming, type Item } from "./upcoming";
import { CAL_CATS, renderCalendar, renderTemplate, withDefaults, type CalCat, type CalLine, type NotifyConfig, type NotifyKind } from "./notify-format";

/**
 * The scheduled messages (daily calendar, next day's calendar, grocery list, church reminders): what's in them
 * and their wording. Sent by Telegram today; the same messages could go out another way later.
 */

export function notifyConfig(): NotifyConfig {
  try {
    const saved = JSON.parse(getSetting("notify_config") ?? "null");
    if (saved) return withDefaults(saved);
  } catch {}
  // carry over the times from the old morning/evening settings
  try {
    const old = JSON.parse(getSetting("telegram_prefs") ?? "null") as { morning?: boolean; morningTime?: string; evening?: boolean; eveningTime?: string } | null;
    if (old) {
      const c = withDefaults(null);
      return {
        ...c,
        today: { ...c.today, on: old.morning ?? c.today.on, time: old.morningTime ?? c.today.time },
        tomorrow: { ...c.tomorrow, on: old.evening ?? c.tomorrow.on, time: old.eveningTime ?? c.tomorrow.time },
      };
    }
  } catch {}
  return withDefaults(null);
}

export function saveNotifyConfig(c: NotifyConfig) {
  setSetting("notify_config", JSON.stringify(c));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const longDate = (d: string) => format(parseISO(d), "EEEE d MMMM");

const ICON = Object.fromEntries(CAL_CATS.map((c) => [c.value, c.icon])) as Record<CalCat, string>;

/** "9:30am" from "09:30". */
export function nice12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/**
 * Everything on one day – Home Hub's own calendar and every imported calendar (hidden ones too) – as lines under a
 * heading for each person: their tagged events, to-dos and chores; things for two or more of them together; then
 * the household's things and the imported calendars under "Everyone". Each line starts with its category's icon.
 */
export async function calendarLines(date: string): Promise<CalLine[]> {
  const members = await all<{ slug: string; name: string }>("SELECT slug, name FROM members ORDER BY sort, id");
  const nameOf = new Map(members.map((m) => [m.slug, m.name]));
  const { workoutNotify } = await import("./workout");
  const withWorkouts = workoutNotify().inSummaries;
  const items = (await upcoming(date, date)).filter((i) => withWorkouts || !i.workout);
  for (const cal of await importedCalendars(date, date)) items.push(...cal.items.map((i) => ({ ...i, title: `${i.title} (${cal.name})` })));

  const sectionOf = (i: Item) => {
    const who = (i.people?.length ? i.people : i.owner ? [i.owner] : []).filter((p) => nameOf.has(p));
    return who.length ? who.map((p) => nameOf.get(p)!).join(" & ") : "Everyone";
  };
  // members in their menu order, then pairs, then everyone's
  const rank = (section: string) => {
    if (section === "Everyone") return 1000;
    const i = members.findIndex((m) => m.name === section);
    return i === -1 ? 500 : i;
  };
  const lines = items
    .filter((i) => i.kind in ICON)
    .map((i) => {
      const kind = i.kind as CalCat;
      const when = i.time ? nice12(i.time) : "";
      const amount = i.amountCents ? ` – ${money(i.amountCents)}` : "";
      return {
        section: sectionOf(i),
        kind,
        html: `${ICON[kind]} ${when ? `<b>${when}</b> ` : ""}${esc(i.title)}${amount}`,
        text: `${ICON[kind]} ${when ? `${when} ` : ""}${i.title}${amount}`,
        time: i.time ?? "",
      };
    });
  // by section, then all-day things first and the rest by time
  return lines
    .sort((a, b) => rank(a.section) - rank(b.section) || a.section.localeCompare(b.section) || a.time.localeCompare(b.time))
    .map((l) => ({ section: l.section, kind: l.kind, html: l.html, text: l.text }));
}

/** One day of the calendar for a Telegram message: a heading per person, only the ticked categories. */
async function calendarFor(date: string, cats: CalCat[], skip: CalCat[] = []) {
  const want = cats.filter((c) => !skip.includes(c));
  const lines = (await calendarLines(date)).filter((l) => want.includes(l.kind));
  return { text: renderCalendar(lines, want), count: lines.length };
}

/**
 * What the settings page needs for a live preview: the filled-in values, plus every line of the day's calendar
 * (with its category) so ticking a category on or off can be previewed without saving.
 */
export async function previewData(kind: NotifyKind): Promise<{ values: Record<string, string>; lines: CalLine[] }> {
  const c = notifyConfig();
  const allCats = CAL_CATS.map((x) => x.value);
  if (kind === "today" || kind === "tomorrow") {
    const wide = { ...c, [kind]: { ...c[kind], cats: allCats } } as NotifyConfig;
    const { values } = await messageValues(kind, wide);
    const date = kind === "today" ? today() : iso(addDays(parseISO(today()), 1));
    return { values, lines: await calendarLines(date) };
  }
  return { values: (await messageValues(kind, c)).values, lines: [] };
}

/** The values each message's {placeholders} are filled with, for a given day. `empty` = nothing worth sending. */
export async function messageValues(kind: NotifyKind, c = notifyConfig(), daysBefore?: number): Promise<{ values: Record<string, string>; empty: boolean }> {
  const t = today();

  if (kind === "today") {
    const cal = await calendarFor(t, c.today.cats);
    const overdue = c.today.cats.includes("todo")
      ? await all<TodoRow>("SELECT title, person, category, important, due FROM todos WHERE done_at IS NULL AND due < ? ORDER BY due", t)
      : [];
    const members = overdue.length ? await all<{ slug: string; name: string }>("SELECT slug, name FROM members ORDER BY sort, id") : [];
    return {
      values: {
        date: longDate(t),
        calendar: cal.text || "Nothing on today.",
        // split by whose they are, like the to-do list
        overdue: overdue.length
          ? `<b>⚠️ Overdue to-dos</b>\n${todoGroups(overdue, members).map((g) => `<i>${esc(g.label)}</i>\n${g.items.map((o) => `• ${esc(o.title)}`).join("\n")}`).join("\n")}`
          : "",
        count: String(cal.count),
      },
      empty: cal.count === 0 && overdue.length === 0,
    };
  }

  if (kind === "tomorrow") {
    const d = iso(addDays(parseISO(t), 1));
    const usesBins = c.tomorrow.template.includes("{bins}");
    const cal = await calendarFor(d, c.tomorrow.cats, usesBins ? ["bin"] : []);
    const bins = c.tomorrow.cats.includes("bin") ? (await upcoming(d, d)).filter((i) => i.kind === "bin") : [];
    return {
      values: {
        date: longDate(d),
        calendar: cal.text || (bins.length ? "" : "Nothing on tomorrow."),
        bins: bins.length ? `<b>🗑 Bins out tonight:</b> ${bins.map((b) => esc(b.title.replace(/ bin out$/, ""))).join(", ")}` : "",
        count: String(cal.count + (usesBins ? bins.length : 0)),
      },
      empty: cal.count === 0 && bins.length === 0,
    };
  }

  if (kind === "groceries") {
    const { urgent, notUrgent } = groceryList();
    const block = (title: string, list: { name: string }[]) => (list.length ? `<b>${title}</b>\n${list.map((i) => `• ${esc(i.name)}`).join("\n")}` : "");
    return {
      values: { urgent: block("🔴 Urgent", urgent), not_urgent: block("⚪ Not urgent", notUrgent), count: String(urgent.length + notUrgent.length) },
      empty: urgent.length + notUrgent.length === 0,
    };
  }

  // church: the day that's `daysBefore` away (one of the reminder's time slots; the first one by default)
  const days = Math.max(0, Math.min(7, daysBefore ?? c.church.slots[0]?.daysBefore ?? c.church.daysBefore));
  const d = iso(addDays(parseISO(t), days));
  const services = await all<{ id: number; title: string; time: string | null; location: string | null; spotify_url: string | null }>(
    "SELECT id, title, time, location, spotify_url FROM church_services WHERE date = ? ORDER BY time", d);
  const roles = await all<{ service_id: number; person: string; notes: string | null }>(
    `SELECT service_id, person, notes FROM church_roles WHERE service_id IN (SELECT id FROM church_services WHERE date = ?) ORDER BY person`, d);
  const serving = services
    .map((s) => {
      const who = roles.filter((r) => r.service_id === s.id);
      if (!who.length) return "";
      return [
        `<b>${esc(s.title)}</b>${s.time ? ` · ${s.time}` : ""}${s.location ? ` @ ${esc(s.location)}` : ""}`,
        ...who.map((r) => `• ${esc(r.person)}${r.notes ? ` – ${esc(r.notes)}` : " serving"}`),
        s.spotify_url ? `🎵 ${esc(s.spotify_url)}` : "",
      ].filter(Boolean).join("\n");
    })
    .filter(Boolean);
  return {
    values: {
      when: days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${format(parseISO(d), "EEEE")}`,
      date: longDate(d),
      serving: serving.join("\n\n"),
      practices: "", // practices were removed; an older saved wording may still mention {practices}
    },
    empty: serving.length === 0,
  };
}

/**
 * A message ready to send, or null when there's nothing to say: an empty grocery list, no church that day,
 * or an empty calendar when "skip if nothing on" is ticked. `force` builds it anyway (tests, /today).
 */
export async function buildMessage(kind: NotifyKind, opts: { force?: boolean; config?: NotifyConfig; daysBefore?: number } = {}) {
  const c = opts.config ?? notifyConfig();
  const { values, empty } = await messageValues(kind, c, opts.daysBefore);
  const skip = kind === "groceries" || kind === "church" ? empty : (kind === "today" || kind === "tomorrow") && c[kind].skipEmpty && empty;
  if (skip && !opts.force) return null;
  return renderTemplate(c[kind].template, values);
}
