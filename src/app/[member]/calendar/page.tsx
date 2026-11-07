import Link from "next/link";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { iso, niceDate, today } from "@/lib/format";
import { upcoming } from "@/lib/upcoming";
import { members } from "@/lib/members";
import { calendarColors } from "@/lib/calendar-colors";
import { AddPanel, Card, Field, Input, Textarea, btn } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { addEvent } from "../../calendar/actions";
import { DayList, MonthGrid, PeopleFields } from "../../calendar/month";
import { memberWith } from "../member";

/**
 * A family member's own calendar: only what's tagged for them – events, their project due dates and their wish
 * lists' buy-by dates. None of it is on the main calendar unless their switch is on there.
 */
export default async function MemberCalendar({ params, searchParams }: PageProps<"/[member]/calendar">) {
  const m = await memberWith(params, "calendar");
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today().slice(0, 7);
  const ref = parseISO(`${month}-01`);
  const gridStart = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(ref), { weekStartsOn: 1 });
  // only things tagged for this person (household-wide events stay on the main calendar)
  const items = (await upcoming(iso(gridStart), iso(gridEnd), { people: [m.slug] })).filter((i) => i.people?.includes(m.slug));
  const byDay = Map.groupBy(items, (i) => i.date);
  const selectedDay = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const base = `/${m.slug}/calendar`;
  const q = (extra: string) => `${base}?month=${month}${extra}`;
  const people = (await members()).map((x) => ({ slug: x.slug, name: x.name }));
  const colors = calendarColors();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{format(ref, "MMMM yyyy")}</h2>
        <div className="flex gap-1.5">
          <Link href={`${base}?month=${format(addMonths(ref, -1), "yyyy-MM")}`} className={btn.secondary} aria-label="Previous month">←</Link>
          <Link href={base} className={btn.secondary}>Today</Link>
          <Link href={`${base}?month=${format(addMonths(ref, 1), "yyyy-MM")}`} className={btn.secondary} aria-label="Next month">→</Link>
          <Link href="/calendar" className={btn.ghost}>Main calendar</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MonthGrid
            days={eachDayOfInterval({ start: gridStart, end: gridEnd })}
            month={month}
            byDay={byDay}
            selectedDay={selectedDay}
            dayHref={(key) => q(`&day=${key}`)}
            colors={colors}
          />
          <p className="mt-2 text-xs text-muted">
            Events tagged for {m.name}, project due dates and wish list buy-by dates. They only show on the main calendar
            when the <strong>{m.name}</strong> switch is on there.
          </p>
        </div>

        <div className="space-y-4">
          {selectedDay ? (
            <Card title={niceDate(selectedDay)} actions={<Link href={q("")} className="text-xs text-accent">Close</Link>}>
              <DayList items={byDay.get(selectedDay) ?? []} colors={colors} />
            </Card>
          ) : (
            <Card title="This month">
              <DayList items={items.filter((i) => i.date.slice(0, 7) === month && i.date >= today())} showDate colors={colors} />
            </Card>
          )}

          <AddPanel label={`New event for ${m.name}`} open={!!selectedDay}>
            <form action={addEvent} className="space-y-3">
              <input type="hidden" name="back" value={q("")} />
              <Field label="Title"><Input name="title" required /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date"><Input type="date" name="start_date" required defaultValue={selectedDay ?? today()} /></Field>
                <Field label="Time (optional)"><Input type="time" name="start_time" /></Field>
              </div>
              <PeopleFields people={people} selected={[m.slug]} />
              <Field label="Location"><Input name="location" /></Field>
              <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
              <SubmitButton>Add event</SubmitButton>
              <p className="text-xs text-muted">Repeats, costs and wish lists: add or edit it on the main calendar.</p>
            </form>
          </AddPanel>
        </div>
      </div>
    </>
  );
}
