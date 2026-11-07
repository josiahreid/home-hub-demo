import "server-only";
import { addMonths, getISODay, parseISO } from "date-fns";
import { all } from "./db";
import { addDays, asRepeat, iso, occurrences, repeatDates, type Frequency } from "./format";
import { cardioIcon, cardioLabel } from "./workout";

/**
 * Everything with a date, from every tab, flattened into one list.
 * The calendar and home page read from here, so nothing has to be copied
 * into the events table to show up on the calendar.
 */
export type Item = {
  date: string;
  time?: string | null;
  title: string;
  kind: "event" | "church" | "todo" | "payment" | "bin" | "car" | "chore" | "plan" | "utility" | "meal" | "feed";
  amountCents?: number | null;
  href: string;
  eventId?: number;   // calendar events only, so they can still be edited when href points elsewhere
  people?: string[];  // member slugs it's for (tagged events, projects, wish lists); none = everyone
  owner?: string;     // whose it is, for messages only (a to-do's person, a chore's "Who") – never hides anything
  workout?: boolean;  // a planned (or done) workout – left out of the daily messages unless that's switched on
};

/** "default-name,personB" → ["default-name", "default-name-2"] */
export const splitPeople = (s: string | null | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Where a linked wish list lives on its member's page, filtered to the event's occasion. */
export function wishListHref(listId: number, slug: string, occasion: string | null) {
  const base = `/${slug}/wishlist/${listId}`; // a member's own list redirects to /<member>/wishlist
  return occasion ? `${base}?occasion=${encodeURIComponent(occasion)}` : base;
}

/**
 * `people`: whose personal things to include as well – tagged events, project due dates and wish list "buy by" dates.
 * Left out, it's everyone – so the Home page, Telegram messages and the calendar feed always include every family
 * member's events. The main calendar passes its switches; a member's Calendar tab passes just them.
 */
export async function upcoming(from: string, to: string, opts: { people?: string[] } = {}): Promise<Item[]> {
  const people = opts.people ?? (await all<{ slug: string }>("SELECT slug FROM members")).map((m) => m.slug);
  const items: Item[] = [];

  // Home Hub's own events only – imported (Google/Apple) calendars are shown separately, see importedCalendars()
  const events = await all<{
    id: number; title: string; start_date: string; start_time: string | null; budget_cents: number | null;
    wish_list_id: number | null; wish_occasion: string | null; list_slug: string | null; repeat: string | null; repeat_until: string | null;
    people: string | null;
  }>(
    `SELECT e.id, e.title, e.start_date, e.start_time, e.budget_cents, e.wish_list_id, e.wish_occasion, m.slug AS list_slug, e.repeat, e.repeat_until, e.people
       FROM events e LEFT JOIN wish_lists l ON l.id = e.wish_list_id LEFT JOIN members m ON m.id = l.member_id
      WHERE e.feed_id IS NULL AND e.start_date <= ?
        AND (e.start_date >= ? OR (e.repeat IS NOT NULL AND (e.repeat_until IS NULL OR e.repeat_until >= ?)))`, to, from, from);
  for (const e of events) {
    // an event linked to a wish list opens the list (filtered to its occasion) when clicked
    const href = e.wish_list_id && e.list_slug ? wishListHref(e.wish_list_id, e.list_slug, e.wish_occasion) : `/calendar?event=${e.id}`;
    const repeat = asRepeat(e.repeat);
    const dates = repeat ? repeatDates(e.start_date, repeat, from, to, e.repeat_until) : [e.start_date];
    for (const date of dates) {
      items.push({
        date, time: e.start_time, title: e.wish_list_id ? `🎁 ${e.title}` : e.title,
        kind: "event", amountCents: e.budget_cents, href, eventId: e.id, people: splitPeople(e.people),
      });
    }
  }

  // church: one entry per service someone is serving at (or any church event)
  const church = await all<{ id: number; date: string; time: string | null; title: string; kind: string; who: string | null }>(
    `SELECT s.id, s.date, s.time, s.title, s.kind, group_concat(r.person, ' & ') AS who
       FROM church_services s LEFT JOIN church_roles r ON r.service_id = s.id
      WHERE s.date BETWEEN ? AND ? GROUP BY s.id`, from, to);
  for (const s of church) {
    if (!s.who && s.kind === "sunday") continue; // a plain Sunday nobody is serving at
    const one = s.who && !s.who.includes("&") ? `/church/${s.who.toLowerCase()}` : "/church";
    items.push({ date: s.date, time: s.time, title: s.who ? `${s.title}: ${s.who} serving` : s.title, kind: "church", href: one });
  }

  // open to-dos with a due date; overdue ones stay on today so they don't drop off the radar
  const todos = await all<{ title: string; due: string; important: number; person: string | null }>(
    "SELECT title, due, important, person FROM todos WHERE done_at IS NULL AND due IS NOT NULL AND due <= ?", to);
  for (const t of todos) {
    const date = t.due < from && from <= iso(new Date()) ? iso(new Date()) : t.due;
    if (date >= from && date <= to) items.push({ date, title: `${t.important ? "★ " : ""}${t.title}`, kind: "todo", href: "/todos", owner: t.person ?? undefined });
  }

  const recurring = await all<{ id: number; name: string; amount_cents: number; frequency: Frequency; next_due: string }>(
    "SELECT id, name, amount_cents, frequency, next_due FROM recurring_payments WHERE active = 1 AND same_as IS NULL");
  for (const r of recurring) {
    for (const d of occurrences(r.next_due, r.frequency, from, to)) {
      items.push({ date: d, title: r.name, kind: "payment", amountCents: r.amount_cents, href: "/budget/recurring" });
    }
  }

  const bins = await all<{ bin: string; anchor_date: string; interval_weeks: number }>("SELECT bin, anchor_date, interval_weeks FROM bin_schedules");
  for (const b of bins) {
    // walk back from the anchor so a schedule entered with a future date still fills earlier weeks
    let start = parseISO(b.anchor_date);
    while (iso(start) > from) start = addDays(start, -7 * b.interval_weeks);
    for (let d = start; iso(d) <= to; d = addDays(d, 7 * b.interval_weeks)) {
      if (iso(d) >= from) items.push({ date: iso(d), title: `${b.bin} bin out`, kind: "bin", href: "/calendar/bins" });
    }
  }

  const vehicles = await all<{ id: number; name: string; wof_due: string | null; rego_due: string | null; insurance_due: string | null; odometer_km: number | null }>(
    `SELECT id, name, wof_due, rego_due, odometer_km,
            CASE WHEN EXISTS (SELECT 1 FROM insurance_policies p WHERE p.vehicle_id = vehicles.id AND p.renewal_date IS NOT NULL)
                 THEN NULL ELSE insurance_due END AS insurance_due
       FROM vehicles`);
  for (const v of vehicles) {
    for (const [label, date] of [["WOF", v.wof_due], ["Rego", v.rego_due], ["Insurance", v.insurance_due]] as const) {
      if (date && date >= from && date <= to) items.push({ date, title: `${v.name}: ${label} due`, kind: "car", href: `/car/${v.id}` });
    }
  }

  const services = await all<{ vehicle_id: number; vehicle: string; task: string; interval_months: number | null; last_done_date: string | null; est_cost_cents: number | null }>(
    `SELECT s.vehicle_id, v.name AS vehicle, s.task, s.interval_months, s.last_done_date, s.est_cost_cents
       FROM vehicle_services s JOIN vehicles v ON v.id = s.vehicle_id
      WHERE s.interval_months IS NOT NULL AND s.last_done_date IS NOT NULL`);
  for (const s of services) {
    const due = iso(addMonths(parseISO(s.last_done_date!), s.interval_months!));
    if (due >= from && due <= to) items.push({ date: due, title: `${s.vehicle}: ${s.task}`, kind: "car", amountCents: s.est_cost_cents, href: `/car/${s.vehicle_id}` });
  }

  const chores = await all<{ name: string; kind: string; every_days: number; last_done: string | null; assignee: string | null }>(
    "SELECT name, kind, every_days, last_done, assignee FROM chores");
  // a chore's "Who" is free text; when it's a family member's name (or page name) it's theirs
  const family = await all<{ slug: string; name: string }>("SELECT slug, name FROM members");
  const ownerOf = (who: string | null) => {
    const w = who?.trim().toLowerCase();
    return w ? family.find((m) => m.name.toLowerCase() === w || m.slug === w)?.slug : undefined;
  };
  // every repeat in the range, not just the next one; an overdue (or never done) chore is due today, then repeats from there
  const todayIso = iso(new Date());
  for (const c of chores) {
    const every = Math.max(1, c.every_days);
    const href = c.kind === "cleaning" ? "/house/cleaning" : "/house/chores";
    const title = c.kind === "cleaning" ? `🧽 ${c.name}` : c.name;
    let d = c.last_done ? addDays(parseISO(c.last_done), every) : parseISO(todayIso);
    if (iso(d) < todayIso) d = parseISO(todayIso);
    while (iso(d) < from) d = addDays(d, every);
    for (; iso(d) <= to; d = addDays(d, every)) items.push({ date: iso(d), title, kind: "chore", href, owner: ownerOf(c.assignee) });
  }

  const plans = await all<{ name: string; target_date: string; target_cents: number }>(
    "SELECT name, target_date, target_cents FROM plans WHERE status = 'active' AND target_date BETWEEN ? AND ?", from, to);
  for (const p of plans) items.push({ date: p.target_date, title: `Goal: ${p.name}`, kind: "plan", amountCents: p.target_cents, href: "/budget/plans" });

  const contracts = await all<{ id: number; kind: string; provider: string; contract_end: string }>(
    "SELECT id, kind, provider, contract_end FROM utilities WHERE contract_end BETWEEN ? AND ?", from, to);
  for (const u of contracts) items.push({ date: u.contract_end, title: `${u.kind} contract ends (${u.provider})`, kind: "utility", href: `/utilities/${u.id}` });

  const renewals = await all<{ id: number; kind: string; covers: string | null; insurer: string; renewal_date: string }>(
    "SELECT id, kind, covers, insurer, renewal_date FROM insurance_policies WHERE renewal_date BETWEEN ? AND ?", from, to);
  for (const p of renewals) {
    items.push({ date: p.renewal_date, title: `🛡️ ${p.covers ? `${p.kind} insurance (${p.covers})` : `${p.kind} insurance`} renews – ${p.insurer}`, kind: "utility", href: `/insurance/${p.id}` });
  }

  // personal: project due dates and wish list "buy by" dates, on their owner's calendar
  if (people.length) {
    const marks = people.map(() => "?").join(", ");
    const jobs = await all<{ id: number; title: string; due: string; slug: string }>(
      `SELECT j.id, j.title, j.due, m.slug FROM job_cards j JOIN members m ON m.id = j.member_id
        WHERE j.status != 'done' AND j.due BETWEEN ? AND ? AND m.slug IN (${marks})`, from, to, ...people);
    for (const j of jobs) items.push({ date: j.due, title: `🛠️ ${j.title} (project due)`, kind: "todo", href: `/${j.slug}/projects/${j.id}`, people: [j.slug] });
    const wishes = await all<{ item: string; buy_by: string; list_id: number; slug: string }>(
      `SELECT w.item, w.buy_by, w.list_id, m.slug FROM wishlist w JOIN wish_lists l ON l.id = w.list_id JOIN members m ON m.id = l.member_id
        WHERE w.status = 'idea' AND w.buy_by BETWEEN ? AND ? AND m.slug IN (${marks})`, from, to, ...people);
    for (const w of wishes) items.push({ date: w.buy_by, title: `🎁 Buy by: ${w.item}`, kind: "event", href: wishListHref(w.list_id, w.slug, null), people: [w.slug] });
    // ordered project parts, on the day they should arrive
    const parts = await all<{ name: string; arrives: string; slug: string }>(
      `SELECT p.name, p.arrives, m.slug FROM parts p JOIN members m ON m.id = p.member_id
        WHERE p.status = 'ordered' AND p.arrives BETWEEN ? AND ? AND m.slug IN (${marks})`, from, to, ...people);
    for (const p of parts) items.push({ date: p.arrives, title: `📦 ${p.name} arriving`, kind: "event", href: `/${p.slug}/parts`, people: [p.slug] });

    // workouts: each on its days of the week (✓ once done that day), plus any done off the plan
    const plans = await all<{ id: number; name: string; days: string; slug: string }>(
      `SELECT w.id, w.name, w.days, m.slug FROM workouts w JOIN members m ON m.id = w.member_id
        WHERE m.slug IN (${marks}) AND (',' || m.features || ',') LIKE '%,workout,%'`, ...people);
    const doneW = await all<{ workout_id: number | null; name: string; date: string; slug: string }>(
      `SELECT x.workout_id, x.name, x.date, m.slug FROM workout_sessions x JOIN members m ON m.id = x.member_id
        WHERE x.finished_at IS NOT NULL AND x.date BETWEEN ? AND ? AND m.slug IN (${marks})`, from, to, ...people);
    const onDay = (days: string, date: string) => days.split(",").map(Number).includes(getISODay(parseISO(date)));
    for (let d = parseISO(from); iso(d) <= to; d = addDays(d, 1)) {
      const day = iso(d);
      for (const w of plans.filter((x) => onDay(x.days, day))) {
        const done = doneW.some((s) => s.workout_id === w.id && s.date === day);
        items.push({ date: day, title: `💪 ${w.name}${done ? " ✓" : ""}`, kind: "event", href: `/${w.slug}/workout`, people: [w.slug], workout: true });
      }
    }
    for (const s of doneW) {
      const plan = plans.find((w) => w.id === s.workout_id);
      if (!plan || !onDay(plan.days, s.date)) items.push({ date: s.date, title: `💪 ${s.name} ✓`, kind: "event", href: `/${s.slug}/workout`, people: [s.slug], workout: true });
    }
    // cardio that's been logged
    const cardio = await all<{ date: string; activity: string; minutes: number | null; distance: number | null; slug: string }>(
      `SELECT c.date, c.activity, c.minutes, c.distance, m.slug FROM cardio_log c JOIN members m ON m.id = c.member_id
        WHERE c.date BETWEEN ? AND ? AND m.slug IN (${marks})`, from, to, ...people);
    for (const c of cardio) {
      const label = cardioLabel(c);
      items.push({ date: c.date, title: `${cardioIcon(c.activity)} ${c.activity}${label ? ` ${label}` : ""} ✓`, kind: "event", href: `/${c.slug}/workout`, people: [c.slug], workout: true });
    }
  }

  // something tagged to people only shows when one of them was asked for
  const wanted = new Set(people);
  return items
    .filter((i) => !i.people?.length || i.people.some((p) => wanted.has(p)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

/** Each imported (Google/Apple) calendar with its events in the range – shown under Home Hub's own calendar, never mixed in. */
export async function importedCalendars(from: string, to: string) {
  const feeds = await all<{ id: number; name: string; last_synced: string | null }>("SELECT id, name, last_synced FROM calendar_feeds ORDER BY name");
  const events = await all<{ id: number; feed_id: number; title: string; start_date: string; start_time: string | null; end_date: string | null }>(
    `SELECT id, feed_id, title, start_date, start_time, end_date FROM events
      WHERE feed_id IS NOT NULL AND start_date <= ? AND coalesce(end_date, start_date) >= ? ORDER BY start_date, start_time`, to, from);
  return feeds.map((f) => {
    const items: Item[] = [];
    for (const e of events.filter((x) => x.feed_id === f.id)) {
      // a multi-day event (a holiday, a trip) shows on each of its days
      let d = e.start_date < from ? from : e.start_date;
      const end = e.end_date && e.end_date > e.start_date ? (e.end_date > to ? to : e.end_date) : d;
      for (let i = 0; d <= end && i < 62; i++, d = iso(addDays(parseISO(d), 1))) {
        items.push({ date: d, time: d === e.start_date ? e.start_time : null, title: e.title, kind: "feed", href: `/calendar?event=${e.id}`, eventId: e.id });
      }
    }
    return { ...f, items };
  });
}

export const KIND_LABEL: Record<Item["kind"], string> = {
  event: "Event", church: "Church", todo: "To do", feed: "Calendar", payment: "Payment", bin: "Bins", car: "Car",
  chore: "Chore", plan: "Goal", utility: "Utility", meal: "Meals",
};

export const KIND_TONE: Record<Item["kind"], "neutral" | "good" | "warn" | "bad" | "info"> = {
  event: "info", church: "info", todo: "warn", feed: "info", payment: "warn", bin: "good", car: "bad",
  chore: "neutral", plan: "good", utility: "warn", meal: "good",
};
