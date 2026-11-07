import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, Check, Dumbbell, Flame, HeartPulse, Play, Trophy } from "lucide-react";
import { all, get } from "@/lib/db";
import { addDays, iso, niceDate, relDays, today } from "@/lib/format";
import {
  CARDIO, DAY_NAMES, STARTERS, cardioBests, cardioBetween, cardioGoal, cardioIcon, cardioLabel, daysLabel, newBests, pace, personalBests,
  plannedOn, routine, sessionsBetween, streak, target, weekStart, weightProgress, type Cardio, type RoutineWorkout, type Session,
} from "@/lib/workout";
import { AddPanel, Badge, Card, Empty, Field, Input, Progress, Select, cx } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { memberWith } from "../member";
import { ExerciseFields } from "./exercise-fields";
import {
  addCardio, addExercise, addStarter, addWorkout, deleteCardio, deleteExercise, deleteWorkout, moveExercise, saveCardioGoal, startWorkout,
  updateCardio, updateExercise, updateWorkout,
} from "./actions";

/** A family member's Workout tab: today's workout, this week, the routine, personal bests, progress and history. */
export default async function WorkoutPage({ params, searchParams }: PageProps<"/[member]/workout">) {
  const m = await memberWith(params, "workout");
  const sp = await searchParams;
  const workouts = routine(m.id);
  const now = today();
  const monday = weekStart(now);
  const week = sessionsBetween(m.id, monday, iso(addDays(parseISO(monday), 6)));
  const todays = plannedOn(workouts, now);
  const todaySessions = week.filter((s) => s.date === now);
  const st = streak(m.id, workouts);
  const bests = personalBests(m.id);
  const weekCardio = cardioBetween(m.id, monday, iso(addDays(parseISO(monday), 6)));
  const recentCardio = cardioBetween(m.id, "2000-01-01", now).slice(0, 10);
  const cBests = cardioBests(m.id);
  const progress = weightProgress(m.id);
  const history = await all<Session & { sets: number; done_sets: number }>(
    `SELECT x.*, (SELECT count(*) FROM workout_sets s WHERE s.session_id = x.id) AS sets,
            (SELECT count(*) FROM workout_sets s WHERE s.session_id = x.id AND s.done = 1) AS done_sets
       FROM workout_sessions x WHERE x.member_id = ? AND x.finished_at IS NOT NULL ORDER BY x.date DESC, x.id DESC LIMIT 20`, m.id);

  // just finished one: say well done, and any new personal bests
  const justDone = typeof sp.done === "string" ? await get<Session>("SELECT * FROM workout_sessions WHERE id = ? AND member_id = ?", Number(sp.done), m.id) : undefined;
  const justBests = justDone ? newBests(m.id, justDone) : [];
  const hidden = { member_id: m.id, slug: m.slug };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {justDone && (
          <div className="rounded-xl border border-accent bg-accent-soft p-4 text-sm text-accent">
            <div className="font-semibold">💪 {justDone.name} done – nice work!</div>
            {justBests.length > 0 && <div className="mt-1">🏆 New personal best{justBests.length === 1 ? "" : "s"}: {justBests.map((b) => `${b.exercise} ${b.label}`).join(", ")}</div>}
          </div>
        )}

        <TodayCard m={hidden} date={now} workouts={workouts} todays={todays} sessions={todaySessions} />

        <Card
          title="This week"
          actions={
            <span className="flex items-center gap-3 text-xs text-muted">
              {st.planned > 0 && <span className="tabular-nums">{Math.min(st.done, st.planned)} of {st.planned} done</span>}
              {st.weeks > 0 && <span className="flex items-center gap-1 font-medium text-warn"><Flame size={13} /> {st.weeks} week{st.weeks === 1 ? "" : "s"} in a row</span>}
            </span>
          }
        >
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {DAY_NAMES.map((d, i) => {
              const date = iso(addDays(parseISO(monday), i));
              const plan = plannedOn(workouts, date);
              const doneHere = week.filter((s) => s.date === date && s.finished_at);
              const cardioHere = weekCardio.filter((c) => c.date === date);
              const missed = date < now && plan.length > 0 && doneHere.length < plan.length;
              return (
                <div key={d} className={cx("rounded-lg border p-1.5", date === now ? "border-accent" : "border-line", doneHere.length || cardioHere.length ? "bg-accent-soft" : "bg-surface")}>
                  <div className="font-medium">{d}</div>
                  <div className="text-muted tabular-nums">{format(parseISO(date), "d")}</div>
                  <div className="mt-1 flex h-5 items-center justify-center">
                    {doneHere.length ? <Check size={16} className="text-accent" /> : missed ? <span className="text-muted">–</span> : plan.length ? <Dumbbell size={14} className="text-muted" /> : null}
                  </div>
                  {cardioHere.length > 0 && <div className="text-[11px] leading-none" title={cardioHere.map((c) => c.activity).join(", ")}>{cardioHere.map((c) => cardioIcon(c.activity)).join("")}</div>}
                  <div className="truncate text-[10px] text-muted" title={plan.map((w) => w.name).join(", ")}>{plan.length ? plan.map((w) => w.name).join(", ") : "Rest"}</div>
                </div>
              );
            })}
          </div>
          {st.planned > 0 && st.weeks === 0 && <p className="mt-2 text-xs text-muted">Do every planned workout this week to start a streak.</p>}
        </Card>

        <CardioCard memberId={m.id} goal={cardioGoal(m.id)} week={weekCardio} recent={recentCardio} today={now} />

        <Card title="Routine" actions={<span className="text-xs text-muted">{workouts.length} workout{workouts.length === 1 ? "" : "s"}</span>}>
          {workouts.length === 0 ? (
            <Empty>No workouts yet – pick a starter routine below and change it to suit, or add your own.</Empty>
          ) : (
            <div className="space-y-4">{workouts.map((w) => <WorkoutBlock key={w.id} w={w} />)}</div>
          )}
          <div className="mt-4">
            <AddPanel label="Add a workout">
              <form action={addWorkout} className="space-y-3" key={workouts.length}>
                <input type="hidden" name="member_id" value={m.id} />
                <Field label="Name"><Input name="name" required placeholder="Push day, Easy run, Stretch…" autoComplete="off" /></Field>
                <DayPicker />
                <SubmitButton>Add workout</SubmitButton>
              </form>
            </AddPanel>
          </div>
        </Card>

        <Card title="Starter routines">
          <p className="mb-3 text-sm text-muted">Adds the workouts and exercises to {m.name}&apos;s routine – change anything after.</p>
          <ul className="divide-y divide-line text-sm">
            {STARTERS.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="font-medium">{s.name}</span><span className="block text-xs text-muted">{s.hint}</span></span>
                <form action={addStarter}>
                  <input type="hidden" name="member_id" value={m.id} />
                  <input type="hidden" name="starter" value={s.key} />
                  <SubmitButton variant="secondary" className="!px-3 !py-1.5 text-xs">Add</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={<span className="flex items-center gap-1"><Trophy size={14} className="text-warn" /> Personal bests</span>}>
          {bests.length === 0 ? <Empty>Finish a workout to start keeping bests.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {bests.map((b) => (
                <li key={b.exercise} className="flex justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">{b.exercise}</span>
                  <span className="shrink-0 tabular-nums"><strong>{b.label}</strong> <span className="text-xs text-muted">{format(parseISO(b.date), "d MMM")}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {cBests.length > 0 && (
          <Card title={<span className="flex items-center gap-1"><HeartPulse size={14} className="text-danger" /> Cardio bests</span>}>
            <ul className="divide-y divide-line text-sm">
              {cBests.map((b) => (
                <li key={b.activity} className="py-1.5">
                  <div className="font-medium">{b.icon} {b.activity} <span className="text-xs font-normal text-muted">· {b.count} time{b.count === 1 ? "" : "s"}</span></div>
                  <div className="text-xs text-muted tabular-nums">
                    {[
                      b.furthest && `furthest ${b.furthest.distance} km`,
                      b.fastest && `fastest ${pace(b.fastest)}`,
                      b.longest && `longest ${b.longest.minutes} min`,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {progress.length > 0 && (
          <Card title="Progress" actions={<span className="text-xs text-muted">heaviest set each time</span>}>
            <div className="space-y-4">{progress.map((rows) => <Spark key={rows[0].exercise} rows={rows} />)}</div>
          </Card>
        )}

        <Card title="History">
          {history.length === 0 ? <Empty>No workouts done yet.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {history.map((s) => (
                <li key={s.id}>
                  <Link href={`/${m.slug}/workout/${s.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-accent">
                    <span className="min-w-0 truncate"><span className="font-medium">{s.name}</span>{s.notes && <span className="block truncate text-xs text-muted">{s.notes}</span>}</span>
                    <span className="shrink-0 text-right text-xs text-muted">{niceDate(s.date)}<span className="block tabular-nums">{s.done_sets}/{s.sets} sets</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Today: what's planned (start it, carry on, or done), or a rest day – with anything else to start instead. */
function TodayCard({ m, date, workouts, todays, sessions }: { m: { member_id: number; slug: string }; date: string; workouts: RoutineWorkout[]; todays: RoutineWorkout[]; sessions: Session[] }) {
  const others = workouts.filter((w) => !todays.some((t) => t.id === w.id));
  const extra = sessions.filter((s) => !todays.some((t) => t.id === s.workout_id));
  return (
    <Card title={`Today · ${format(parseISO(date), "EEEE d MMMM")}`}>
      {todays.length === 0 && <p className="mb-3 text-sm text-muted">{workouts.length ? "Rest day – nothing planned." : "Add a workout below to plan the week."}</p>}
      <div className="space-y-3">
        {todays.map((w) => {
          const s = sessions.filter((x) => x.workout_id === w.id).at(-1);
          return (
            <div key={w.id} className="rounded-xl border border-line bg-bg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{w.name}</div>
                  <div className="text-xs text-muted">{w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}{w.exercises.length ? ` · ${w.exercises.map((e) => e.name).join(", ")}` : ""}</div>
                </div>
                {s?.finished_at ? (
                  <Link href={`/${m.slug}/workout/${s.id}`} className="flex items-center gap-1 text-sm font-medium text-accent"><Check size={16} /> Done</Link>
                ) : (
                  <form action={startWorkout}>
                    <input type="hidden" name="member_id" value={m.member_id} />
                    <input type="hidden" name="slug" value={m.slug} />
                    <input type="hidden" name="workout_id" value={w.id} />
                    <SubmitButton className="!px-5 !py-2.5"><Play size={16} /> {s ? "Carry on" : "Start"}</SubmitButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {extra.map((s) => (
          <Link key={s.id} href={`/${m.slug}/workout/${s.id}`} className="flex items-center justify-between rounded-xl border border-line p-3 text-sm hover:text-accent">
            <span className="font-medium">{s.name}</span>
            <span className="flex items-center gap-1 text-accent">{s.finished_at ? <><Check size={15} /> Done</> : "Carry on →"}</span>
          </Link>
        ))}
      </div>
      {others.length > 0 && (
        <form action={startWorkout} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="member_id" value={m.member_id} />
          <input type="hidden" name="slug" value={m.slug} />
          <span className="text-muted">{todays.length ? "Or do" : "Do one anyway:"}</span>
          <Select name="workout_id" options={others.map((w): [string, string] => [String(w.id), w.name])} className="!w-auto !py-1.5" aria-label="Workout" />
          <SubmitButton variant="secondary" className="!py-1.5"><Play size={14} /> Start</SubmitButton>
        </form>
      )}
    </Card>
  );
}

/** Cardio: this week's minutes against the goal, a quick way to log one, and the recent ones. */
function CardioCard({ memberId, goal, week, recent, today: now }: { memberId: number; goal: number; week: Cardio[]; recent: Cardio[]; today: string }) {
  const minutes = week.reduce((t, c) => t + (c.minutes ?? 0), 0);
  const km = Math.round(week.reduce((t, c) => t + (c.distance ?? 0), 0) * 10) / 10;
  return (
    <Card
      title={<span className="flex items-center gap-1"><HeartPulse size={14} className="text-danger" /> Cardio</span>}
      actions={<span className="text-xs text-muted tabular-nums">{minutes} of {goal} min this week{km ? ` · ${km} km` : ""}</span>}
    >
      <Progress value={minutes} max={goal} tone={minutes >= goal ? "good" : "info"} />
      {minutes >= goal && <p className="mt-1 text-xs font-medium text-accent">Weekly goal done 🎉</p>}

      <form action={addCardio} key={recent.length} className="mt-4 space-y-3">
        <input type="hidden" name="member_id" value={memberId} />
        <CardioFields date={now} />
        <SubmitButton>Log it</SubmitButton>
      </form>

      {recent.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
          {recent.map((c) => (
            <li key={c.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{cardioIcon(c.activity)} {c.activity}</span>{" "}
                  <span className="text-muted tabular-nums">{cardioLabel(c)}{pace(c) ? ` · ${pace(c)}` : ""}</span>
                  {c.notes && <span className="block truncate text-xs text-muted">{c.notes}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{c.date === now ? "today" : relDays(c.date)}</span>
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-accent select-none">Edit</summary>
                <form action={updateCardio} className="mt-2 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
                  <input type="hidden" name="id" value={c.id} />
                  <CardioFields c={c} date={c.date} />
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </form>
                <div className="mt-2"><DeleteButton action={deleteCardio} id={c.id} confirmText={`Delete this ${c.activity.toLowerCase()}?`} /></div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted select-none hover:text-ink">Change the weekly goal ({goal} min)</summary>
        <form action={saveCardioGoal} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="member_id" value={memberId} />
          <Input name="goal" type="number" min={10} max={2000} defaultValue={goal} className="!w-24" aria-label="Minutes a week" />
          <span className="text-muted">minutes a week</span>
          <SubmitButton variant="secondary">Save</SubmitButton>
        </form>
      </details>
    </Card>
  );
}

/** Which activity (tap one), the date, and how long / how far. */
function CardioFields({ c, date }: { c?: Cardio; date: string }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {CARDIO.map((a) => (
          <label key={a.value} className="cursor-pointer rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
            <input type="radio" name="activity" value={a.value} defaultChecked={(c?.activity ?? "Run") === a.value} className="sr-only" /> {a.icon} {a.value}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Date" className="col-span-2 sm:col-span-1"><Input type="date" name="date" defaultValue={date} required /></Field>
        <Field label="Minutes"><Input name="minutes" type="number" min={0} inputMode="numeric" defaultValue={c?.minutes ?? ""} placeholder="e.g. 30" /></Field>
        <Field label="km (optional)"><Input name="distance" inputMode="decimal" defaultValue={c?.distance ?? ""} placeholder="e.g. 5" /></Field>
      </div>
      <Field label="Notes (optional)"><Input name="notes" defaultValue={c?.notes ?? ""} placeholder="Felt good, hilly route…" /></Field>
    </>
  );
}

/** Tick boxes for the days of the week a workout is on. */
function DayPicker({ days = "" }: { days?: string }) {
  const on = new Set(days.split(",").map(Number));
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted">Days</legend>
      <div className="flex flex-wrap gap-1.5">
        {DAY_NAMES.map((d, i) => (
          <label key={d} className="cursor-pointer rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
            <input type="checkbox" name="days" value={i + 1} defaultChecked={on.has(i + 1)} className="sr-only" /> {d}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One workout in the routine: its days, its exercises (with targets), and ways to change them. */
function WorkoutBlock({ w }: { w: RoutineWorkout }) {
  return (
    <section className="rounded-xl border border-line bg-bg p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{w.name}</h3>
        <Badge tone="info">{daysLabel(w.days)}</Badge>
      </div>
      {w.exercises.length === 0 ? <p className="mt-2 text-xs text-muted">No exercises yet.</p> : (
        <ol className="mt-2 divide-y divide-line text-sm">
          {w.exercises.map((e, i) => (
            <li key={e.id} className="py-1.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  {e.name} <span className="text-xs text-muted tabular-nums">· {target(e)}</span>
                  {e.notes && <span className="block text-xs text-muted">{e.notes}</span>}
                </span>
                <form action={moveExercise}><input type="hidden" name="id" value={e.id} /><button name="dir" value="up" disabled={i === 0} aria-label="Move up" className="p-1 text-muted hover:text-ink disabled:opacity-30"><ArrowUp size={13} /></button></form>
                <form action={moveExercise}><input type="hidden" name="id" value={e.id} /><button name="dir" value="down" disabled={i === w.exercises.length - 1} aria-label="Move down" className="p-1 text-muted hover:text-ink disabled:opacity-30"><ArrowDown size={13} /></button></form>
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-accent select-none">Edit</summary>
                <form action={updateExercise} className="mt-2 space-y-2 rounded-lg border border-line bg-surface-2 p-3">
                  <input type="hidden" name="id" value={e.id} />
                  <ExerciseFields e={e} />
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </form>
                <div className="mt-2"><DeleteButton action={deleteExercise} id={e.id} label="Remove exercise" confirmText={`Remove ${e.name}?`} /></div>
              </details>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <details className="w-full">
          <summary className="cursor-pointer text-xs font-medium text-accent select-none">+ Add exercise</summary>
          <form action={addExercise} className="mt-2 space-y-2 rounded-lg border border-line bg-surface-2 p-3" key={w.exercises.length}>
            <input type="hidden" name="workout_id" value={w.id} />
            <ExerciseFields />
            <SubmitButton>Add exercise</SubmitButton>
          </form>
        </details>
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-muted select-none hover:text-ink">Rename, change days or delete</summary>
          <form action={updateWorkout} className="mt-2 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
            <input type="hidden" name="id" value={w.id} />
            <Field label="Name"><Input name="name" required defaultValue={w.name} /></Field>
            <DayPicker days={w.days} />
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
          <div className="mt-2"><DeleteButton action={deleteWorkout} id={w.id} label="Delete workout" confirmText={`Delete "${w.name}" from the routine? Past sessions stay in the history.`} /></div>
        </details>
      </div>
    </section>
  );
}

/** A small line of the heaviest set each time, with the first and latest weights. */
function Spark({ rows }: { rows: { exercise: string; date: string; weight: number }[] }) {
  const W = 200;
  const H = 40;
  const min = Math.min(...rows.map((r) => r.weight));
  const max = Math.max(...rows.map((r) => r.weight));
  const span = Math.max(max - min, 1);
  const pts = rows.map((r, i) => `${((i / (rows.length - 1)) * W).toFixed(1)},${(H - 4 - ((r.weight - min) / span) * (H - 8)).toFixed(1)}`).join(" ");
  const first = rows[0];
  const last = rows.at(-1)!;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{first.exercise}</span>
        <span className="text-xs text-muted tabular-nums">{first.weight} → <strong className="text-ink">{last.weight} kg</strong></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" preserveAspectRatio="none" role="img" aria-label={`${first.exercise}: ${first.weight} kg to ${last.weight} kg`}>
        <polyline points={pts} className="fill-none stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-muted"><span>{format(parseISO(first.date), "d MMM")}</span><span>{relDays(last.date)}</span></div>
    </div>
  );
}
