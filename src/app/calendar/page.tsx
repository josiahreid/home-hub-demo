import { io } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { all, get } from "@/lib/db";
import { REPEATS, centsToInput, iso, money, niceDate, today } from "@/lib/format";
import { KIND_LABEL, importedCalendars, splitPeople, upcoming, wishListHref, type Item } from "@/lib/upcoming";
import { members } from "@/lib/members";
import { PEOPLE_COOKIE } from "@/lib/calendar-people";
import { AddPanel, Card, Field, FormGrid, Input, PageHeader, Select, Textarea, btn } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addEvent, deleteEvent, planForEvent, setEventBudget, setEventWishList, updateEvent } from "./actions";
import { OCCASIONS } from "../[member]/wishlist/shared";
import { Gift } from "lucide-react";
import { ColorLegend } from "./color-legend";
import { FeedControls } from "./feed-controls";
import { hiddenFeeds, inFeedOrder } from "@/lib/calendar-view";
import { DayList, MonthGrid, PeopleFields, type Person } from "./month";
import { PeopleSwitches } from "./people";
import { DEFAULT_COLORS, calendarColors } from "@/lib/calendar-colors";

const KINDS: [string, string][] = [["general", "General"], ["party", "Party / gathering"], ["birthday", "Birthdays and Anniversaries"], ["trip", "Trip / holiday"], ["appointment", "Appointment"]];


type EventRow = {
  id: number; title: string; start_date: string; start_time: string | null; end_date: string | null; end_time: string | null;
  location: string | null; notes: string | null; kind: string; budget_cents: number | null; feed_id: number | null;
  plan_id: number | null; plan_name: string | null; saved_cents: number | null; target_cents: number | null;
  wish_list_id: number | null; wish_occasion: string | null; wish_list_name: string | null; wish_list_slug: string | null;
  repeat: string | null; repeat_until: string | null; people: string | null;
};

const REPEAT_LABEL: Record<string, string> = { daily: "every day", weekly: "every week", monthly: "every month", yearly: "every year" };

/** "Repeats" + an optional last date, for adding and editing events. */
function RepeatFields({ repeat, until }: { repeat?: string | null; until?: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Repeats"><Select name="repeat" defaultValue={repeat ?? ""} options={REPEATS} /></Field>
      <Field label="Until (optional)"><Input type="date" name="repeat_until" defaultValue={until ?? ""} /></Field>
    </div>
  );
}
type WishListOpt = { id: number; name: string; slug: string };
/** Pick a wish list for the event; clicking the event then opens that list. */
function WishListFields({ lists, listId, occasion }: { lists: WishListOpt[]; listId?: number | null; occasion?: string | null }) {
  if (lists.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Wish list">
        <Select name="wish_list_id" defaultValue={listId ? String(listId) : ""} options={[["", "— none —"], ...lists.map((l) => [String(l.id), `${l.name}'s`] as [string, string])]} />
      </Field>
      <Field label="Show occasion">
        <Select name="wish_occasion" defaultValue={occasion ?? ""} options={[["", "All"], ...OCCASIONS]} />
      </Field>
    </div>
  );
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  await io();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today().slice(0, 7);
  const ref = parseISO(`${month}-01`);
  const gridStart = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(ref), { weekStartsOn: 1 });
  // whose personal things to show as well – the switches above the grid, remembered on this device
  const people: Person[] = (await members()).map((m) => ({ slug: m.slug, name: m.name }));
  // everyone until this device switches someone off (no cookie yet = all on)
  const saved = (await cookies()).get(PEOPLE_COOKIE)?.value;
  const showing = saved === undefined ? people.map((p) => p.slug) : splitPeople(saved).filter((s) => people.some((p) => p.slug === s));
  const [items, imported] = await Promise.all([
    upcoming(iso(gridStart), iso(gridEnd), { people: showing }),
    importedCalendars(iso(gridStart), iso(gridEnd)),
  ]);
  const byDay = Map.groupBy(items, (i) => i.date);
  const selectedCal = typeof sp.cal === "string" ? Number(sp.cal) : null;
  const selectedDay = typeof sp.day === "string" ? sp.day : null;
  const eventId = typeof sp.event === "string" ? Number(sp.event) : null;
  const event = eventId
    ? await get<EventRow>(
        `SELECT e.*, p.id AS plan_id, p.name AS plan_name, p.saved_cents, p.target_cents, w.name AS wish_list_name, wm.slug AS wish_list_slug
           FROM events e LEFT JOIN plans p ON p.event_id = e.id LEFT JOIN wish_lists w ON w.id = e.wish_list_id
           LEFT JOIN members wm ON wm.id = w.member_id WHERE e.id = ?`, eventId)
    : undefined;
  const wishLists = await all<WishListOpt>("SELECT l.id, l.name, m.slug FROM wish_lists l JOIN members m ON m.id = l.member_id ORDER BY m.sort, l.sort, l.id");
  const q = (extra: string) => `/calendar?month=${month}${extra}`;
  const colors = calendarColors();
  const hidden_ = hiddenFeeds();
  const colorsAreDefault = Object.entries(colors).every(([k, c]) => DEFAULT_COLORS[k as Item["kind"]] === c);

  return (
    <>
      <PageHeader
        title={format(ref, "MMMM yyyy")}
        actions={
          <>
            <Link href={`/calendar?month=${format(addMonths(ref, -1), "yyyy-MM")}`} className={btn.secondary}>←</Link>
            <Link href="/calendar" className={btn.secondary}>Today</Link>
            <Link href={`/calendar?month=${format(addMonths(ref, 1), "yyyy-MM")}`} className={btn.secondary}>→</Link>
            <a href="/calendar/export" className={btn.ghost}>Download .ics</a>
          </>
        }
      />

      {/* at the top, so it's the first thing on a phone */}
      <div className="mb-4">
        <AddPanel label="Add event" open={sp.add === "1"}>
          <form action={addEvent} className="max-w-2xl space-y-3">
            <Field label="Title"><Input name="title" required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date"><Input type="date" name="start_date" required defaultValue={selectedDay ?? today()} /></Field>
              <Field label="Time (optional)"><Input type="time" name="start_time" /></Field>
              <Field label="Ends"><Input type="date" name="end_date" /></Field>
              <Field label="End time"><Input type="time" name="end_time" /></Field>
            </div>
            <RepeatFields />
            <Field label="Type"><Select name="kind" options={KINDS} /></Field>
            <Field label="Expected cost ($)"><Input name="budget" inputMode="decimal" placeholder="links it to the budget" /></Field>
            <WishListFields lists={wishLists} />
            <PeopleFields people={people} />
            <Field label="Location"><Input name="location" /></Field>
            <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
            <SubmitButton>Add event</SubmitButton>
          </form>
        </AddPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PeopleSwitches people={people} on={showing} />
          <MonthGrid
            days={eachDayOfInterval({ start: gridStart, end: gridEnd })}
            month={month}
            byDay={byDay}
            selectedDay={selectedCal ? null : selectedDay}
            dayHref={(key) => q(`&day=${key}`)}
            colors={colors}
          />
          <ColorLegend
            kinds={(["event", "church", "todo", "payment", "bin", "car", "chore", "plan", "utility"] as const).map((k) => ({ kind: k, label: KIND_LABEL[k] }))}
            colors={colors}
            isDefault={colorsAreDefault}
          />
        </div>

        <div className="space-y-4">
          {event && !event.feed_id ? (
            <EventPanel event={event} back={q(selectedDay ? `&day=${selectedDay}` : "")} lists={wishLists} people={people} />
          ) : selectedDay && !selectedCal ? (
            <Card title={niceDate(selectedDay)} actions={<Link href={q(`&day=${selectedDay}&add=1`)} className="text-xs text-accent">+ Add event this day</Link>}>
              <DayList items={byDay.get(selectedDay) ?? []} colors={colors} />
            </Card>
          ) : (
            <Card title="This month">
              <DayList items={items.filter((i) => i.date.slice(0, 7) === month && i.date >= today())} showDate colors={colors} />
            </Card>
          )}

        </div>
      </div>

      {/* Imported (Google / Apple) calendars: each one on its own, under Home Hub's – never mixed in */}
      {inFeedOrder(imported).map((cal, n, list) => {
        const hidden = hidden_.has(cal.id);
        const calByDay = Map.groupBy(cal.items, (i) => i.date);
        const calDay = selectedCal === cal.id ? selectedDay : null;
        const calEvent = event && event.feed_id === cal.id ? event : null;
        const cq = (extra: string) => q(`&cal=${cal.id}${extra}#cal-${cal.id}`);
        return (
          <section key={cal.id} id={`cal-${cal.id}`} className="mt-10 scroll-mt-6 border-t border-line pt-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{cal.name}</h2>
                <p className="text-sm text-muted">
                  Imported calendar · {format(ref, "MMMM yyyy")} · last synced {cal.last_synced ? niceDate(cal.last_synced.slice(0, 10)) : "never"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <FeedControls id={cal.id} name={cal.name} hidden={hidden} first={n === 0} last={n === list.length - 1} />
                <Link href="/calendar/sync" className="text-xs text-accent">Manage imported calendars</Link>
              </div>
            </div>
            {hidden ? (
              <p className="text-sm text-muted">Hidden on this page – its events still sync. Press <strong>Show</strong> to see it again.</p>
            ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <MonthGrid
                  days={eachDayOfInterval({ start: gridStart, end: gridEnd })}
                  month={month}
                  byDay={calByDay}
                  selectedDay={calDay}
                  dayHref={(key) => cq(`&day=${key}`)}
                  colors={colors}
                />
              </div>
              <div className="space-y-4">
                {calEvent ? (
                  <EventPanel event={calEvent} back={cq(calDay ? `&day=${calDay}` : "")} lists={wishLists} people={people} />
                ) : calDay ? (
                  <Card title={niceDate(calDay)}><DayList items={calByDay.get(calDay) ?? []} colors={colors} /></Card>
                ) : (
                  <Card title="This month">
                    <DayList items={cal.items.filter((i) => i.date.slice(0, 7) === month && i.date >= today())} showDate colors={colors} />
                  </Card>
                )}
              </div>
            </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function EventPanel({ event: e, back, lists, people }: { event: EventRow; back: string; lists: WishListOpt[]; people: Person[] }) {
  const synced = e.feed_id != null;
  const forWho = splitPeople(e.people).map((s) => people.find((p) => p.slug === s)?.name ?? s);
  return (
    <Card title={synced ? "Synced event" : "Event"} actions={<Link href={back} className="text-xs text-accent">Close</Link>}>
      <h3 className="text-lg font-semibold">{e.title}</h3>
      <p className="text-sm text-muted">
        {niceDate(e.start_date)}{e.start_time && ` · ${e.start_time}`}
        {e.end_date && e.end_date !== e.start_date && ` → ${niceDate(e.end_date)}`}
        {e.repeat && <><br />Repeats {REPEAT_LABEL[e.repeat]}{e.repeat_until ? ` until ${niceDate(e.repeat_until)}` : ""}</>}
        {e.location && <><br />{e.location}</>}
        {forWho.length > 0 && <><br />For {forWho.join(" & ")}</>}
      </p>
      {e.notes && synced && <p className="mt-2 text-sm whitespace-pre-wrap">{e.notes}</p>}
      {e.wish_list_id && e.wish_list_slug && (
        <Link href={wishListHref(e.wish_list_id, e.wish_list_slug, e.wish_occasion)} className={`${btn.primary} mt-3`}>
          <Gift size={16} /> Open {e.wish_list_name}&apos;s wish list{e.wish_occasion ? ` · ${e.wish_occasion}` : ""}
        </Link>
      )}
      {synced && lists.length > 0 && (
        <form action={setEventWishList} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={e.id} />
          <WishListFields lists={lists} listId={e.wish_list_id} occasion={e.wish_occasion} />
          <button className={`${btn.secondary} ${btn.small}`}>Link wish list</button>
        </form>
      )}

      <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
        <div className="mb-2 font-medium">Budget</div>
        {e.plan_id ? (
          <p>
            Saving via goal <Link href="/budget/plans" className="text-accent underline">{e.plan_name}</Link>:{" "}
            {money(e.saved_cents)} of {money(e.target_cents)}
          </p>
        ) : e.budget_cents ? (
          <>
            <p className="mb-2">Expected cost {money(e.budget_cents)}. It counts toward your weekly savings needs.</p>
            <form action={planForEvent}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="title" value={e.title} />
              <input type="hidden" name="budget" value={centsToInput(e.budget_cents)} />
              <input type="hidden" name="start_date" value={e.start_date} />
              <button className={`${btn.secondary} ${btn.small}`}>Turn into a savings goal</button>
            </form>
          </>
        ) : (
          <p className="text-muted">No cost set. Add one to plan savings for it.</p>
        )}
        {synced && (
          <form action={setEventBudget} className="mt-2 flex gap-1">
            <input type="hidden" name="id" value={e.id} />
            <Input name="budget" inputMode="decimal" defaultValue={centsToInput(e.budget_cents)} placeholder="Expected cost $" className="!py-1" />
            <button className={`${btn.secondary} ${btn.small}`}>Set</button>
          </form>
        )}
      </div>

      {synced ? (
        <p className="mt-3 text-xs text-muted">Edit this in Google/Apple Calendar; changes come through on the next sync.</p>
      ) : (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-accent">Edit</summary>
          <form action={updateEvent} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={e.id} />
            <Field label="Title"><Input name="title" defaultValue={e.title} required /></Field>
            <FormGrid>
              <Field label="Date"><Input type="date" name="start_date" defaultValue={e.start_date} required /></Field>
              <Field label="Time"><Input type="time" name="start_time" defaultValue={e.start_time ?? ""} /></Field>
              <Field label="Ends"><Input type="date" name="end_date" defaultValue={e.end_date ?? ""} /></Field>
              <Field label="End time"><Input type="time" name="end_time" defaultValue={e.end_time ?? ""} /></Field>
            </FormGrid>
            <RepeatFields repeat={e.repeat} until={e.repeat_until} />
            <Field label="Type"><Select name="kind" options={KINDS} defaultValue={e.kind} /></Field>
            <Field label="Expected cost ($)"><Input name="budget" inputMode="decimal" defaultValue={centsToInput(e.budget_cents)} /></Field>
            <WishListFields lists={lists} listId={e.wish_list_id} occasion={e.wish_occasion} />
            <PeopleFields people={people} selected={splitPeople(e.people)} />
            <Field label="Location"><Input name="location" defaultValue={e.location ?? ""} /></Field>
            <Field label="Notes"><Textarea name="notes" defaultValue={e.notes ?? ""} /></Field>
            <div className="flex justify-between">
              <SubmitButton>Save</SubmitButton>
            </div>
          </form>
          <div className="mt-2"><DeleteButton action={deleteEvent} id={e.id} confirmText={e.repeat ? "Delete this event and all its repeats?" : "Delete this event?"} /></div>
        </details>
      )}
    </Card>
  );
}
