import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { addDays, addMonths, differenceInCalendarDays, parseISO } from "date-fns";
import { all, getSetting, setSetting } from "./db";
import { iso, money } from "./format";
import { toIcs, type IcsItem } from "./ics";
import { KIND_LABEL, upcoming, type Item } from "./upcoming";

/**
 * Home Hub as a calendar: a private iCal feed that phones and calendar apps subscribe to.
 * The link carries a secret key; anyone with the link can read the calendar, so it can be reset.
 */

export type FeedKind = Exclude<Item["kind"], "feed" | "meal">;
export const FEED_KINDS: { kind: FeedKind; label: string; hint: string }[] = [
  { kind: "event", label: "Events", hint: "Everything you add on the calendar" },
  { kind: "church", label: "Church", hint: "Serving dates (who and what), practices and church events – reminder the day before" },
  { kind: "todo", label: "To-dos", hint: "To-dos that have a due date, with a 9am reminder" },
  { kind: "payment", label: "Bills & payments", hint: "Payday bills, subscriptions, car loan" },
  { kind: "bin", label: "Bin days", hint: "With a reminder at 7pm the night before" },
  { kind: "car", label: "Car", hint: "WOF, rego, insurance and servicing – reminder a week before" },
  { kind: "utility", label: "Contract ends", hint: "Power, internet, mortgage refix and insurance renewal dates – reminder 2 weeks before" },
  { kind: "plan", label: "Savings goals", hint: "Goal target dates" },
  { kind: "chore", label: "Chores & cleaning", hint: "Can get busy – off by default" },
];
const DEFAULT_KINDS: FeedKind[] = ["event", "church", "todo", "payment", "bin", "car", "utility", "plan"];

export function feedToken(): string {
  let token = getSetting("calendar_feed_token");
  if (!token) {
    token = randomBytes(18).toString("base64url");
    setSetting("calendar_feed_token", token);
  }
  return token;
}

export function resetFeedToken() {
  setSetting("calendar_feed_token", randomBytes(18).toString("base64url"));
}

export function tokenMatches(candidate: string) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(feedToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function feedKinds(): FeedKind[] {
  try {
    const saved = JSON.parse(getSetting("calendar_feed_kinds") ?? "null");
    if (Array.isArray(saved)) return saved.filter((k) => FEED_KINDS.some((f) => f.kind === k));
  } catch {}
  return DEFAULT_KINDS;
}

export function setFeedKinds(kinds: string[]) {
  setSetting("calendar_feed_kinds", JSON.stringify(kinds.filter((k) => FEED_KINDS.some((f) => f.kind === k))));
}

const ALARMS: Partial<Record<FeedKind, string>> = {
  bin: "-PT5H",      // all-day item starts at midnight, so this is 7pm the night before
  car: "-P7D",
  payment: "PT8H",   // 8am on the day
  todo: "PT9H",
  church: "-P1D",
  utility: "-P14D",
};

export async function buildFeed(baseUrl: string) {
  const kinds = new Set(feedKinds());
  const from = iso(addMonths(new Date(), -1));
  const to = iso(addMonths(new Date(), 12));
  const items = (await upcoming(from, to)).filter((i) => kinds.has(i.kind as FeedKind));

  // calendar events carry more detail than the summary list
  const events = new Map(
    (await all<{ id: number; start_date: string; end_date: string | null; end_time: string | null; location: string | null; notes: string | null; repeat: string | null }>(
      "SELECT id, start_date, end_date, end_time, location, notes, repeat FROM events WHERE feed_id IS NULL",
    )).map((e) => [e.id, e]),
  );

  const out: IcsItem[] = items.map((i) => {
    const eventId = i.eventId ?? null;
    const ev = eventId ? events.get(eventId) : undefined;
    const details = [i.amountCents ? `${i.kind === "event" ? "Budget" : "Amount"}: ${money(i.amountCents)}` : null, ev?.notes].filter(Boolean).join("\n");
    return {
      uid: ev ? (ev.repeat ? `event-${eventId}-${i.date}` : `event-${eventId}`) : `${i.kind}-${i.date}-${i.title}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      title: i.title,
      date: i.date,
      time: i.time,
      // a repeat keeps the same length as the first one (e.g. a weekend away)
      endDate: ev?.end_date && ev.repeat ? iso(addDays(parseISO(i.date), differenceInCalendarDays(parseISO(ev.end_date), parseISO(ev.start_date)))) : ev?.end_date,
      endTime: ev?.end_time,
      location: ev?.location,
      description: [details, `Open in Home Hub: ${new URL(i.href, baseUrl)}`].filter(Boolean).join("\n\n"),
      url: new URL(i.href, baseUrl).toString(),
      categories: KIND_LABEL[i.kind],
      alarm: ALARMS[i.kind as FeedKind],
    };
  });
  return toIcs(out, { name: "Home Hub", refreshHours: 1 });
}
