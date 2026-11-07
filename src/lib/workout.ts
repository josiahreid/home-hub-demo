import "server-only";
import { getISODay, startOfWeek } from "date-fns";
import { db, getSetting, run, setSetting } from "./db";
import { addDays, iso, parseISO, today } from "./format";

/**
 * Workouts: each family member's routine (workouts on set days of the week, each a list of exercises), the
 * sessions they've done set by set, and what follows from that – this week, the streak, personal bests, progress.
 */

export type Kind = "weights" | "bodyweight" | "time" | "distance";
export const KINDS: [Kind, string][] = [
  ["weights", "Weights (sets × reps × kg)"],
  ["bodyweight", "Bodyweight (sets × reps)"],
  ["time", "Timed (sets × seconds)"],
  ["distance", "Distance (km)"],
];
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Workout = { id: number; member_id: number; name: string; days: string; sort: number };
export type Exercise = {
  id: number; workout_id: number; name: string; kind: Kind; sets: number;
  reps: number | null; weight: number | null; seconds: number | null; distance: number | null; notes: string | null; sort: number;
};
export type Session = { id: number; member_id: number; workout_id: number | null; name: string; date: string; notes: string | null; finished_at: string | null };
export type SetRow = {
  id: number; session_id: number; exercise_id: number | null; exercise: string; kind: Kind; set_no: number;
  reps: number | null; weight: number | null; seconds: number | null; distance: number | null; done: number;
};

/** Database rows as plain objects – they can then be handed to the interactive parts of a page (like db.ts's all()). */
const plain = <T,>(rows: unknown[]) => rows.map((r) => ({ ...(r as object) })) as T[];

/** "1,3,5" → [1, 3, 5] (Monday = 1 … Sunday = 7) */
export const dayList = (days: string) => days.split(",").map(Number).filter((d) => d >= 1 && d <= 7);
export const daysLabel = (days: string) => {
  const d = dayList(days);
  if (d.length === 7) return "Every day";
  if (!d.length) return "Any day";
  return d.map((n) => DAY_NAMES[n - 1]).join(" · ");
};

/** What one exercise's target looks like: "3 × 8 @ 60 kg", "3 × 45 s", "5 km". */
export function target(e: Pick<Exercise, "kind" | "sets" | "reps" | "weight" | "seconds" | "distance">) {
  if (e.kind === "distance") return `${e.distance ?? "?"} km${e.seconds ? ` in ${mins(e.seconds)}` : ""}`;
  if (e.kind === "time") return `${e.sets} × ${e.seconds ?? "?"} s`;
  return `${e.sets} × ${e.reps ?? "?"}${e.kind === "weights" && e.weight != null ? ` @ ${e.weight} kg` : ""}`;
}
export const mins = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function routine(memberId: number) {
  const workouts = plain<Workout>(db.prepare("SELECT * FROM workouts WHERE member_id = ? ORDER BY sort, id").all(memberId));
  const exercises = plain<Exercise>(db.prepare(
    "SELECT e.* FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id WHERE w.member_id = ? ORDER BY e.sort, e.id").all(memberId));
  return workouts.map((w) => ({ ...w, exercises: exercises.filter((e) => e.workout_id === w.id) }));
}
export type RoutineWorkout = ReturnType<typeof routine>[number];

/** The workouts on a given day of the week. */
export const plannedOn = <T extends Workout>(workouts: T[], date: string): T[] => workouts.filter((w) => dayList(w.days).includes(getISODay(parseISO(date))));

export function sessionsBetween(memberId: number, from: string, to: string) {
  return plain<Session>(db.prepare("SELECT * FROM workout_sessions WHERE member_id = ? AND date BETWEEN ? AND ? ORDER BY date, id").all(memberId, from, to));
}

/**
 * The sets for a new session of a workout: last time's numbers for each exercise (so it's just ticking, or nudging
 * a number up), or the routine's targets the first time.
 */
export function startSets(sessionId: number, workoutId: number) {
  const exercises = db.prepare("SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY sort, id").all(workoutId) as Exercise[];
  for (const e of exercises) {
    // the last finished session with this exercise in it
    const prevSession = db.prepare(
      `SELECT x.id FROM workout_sessions x WHERE x.finished_at IS NOT NULL AND x.id <> ?
          AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.session_id = x.id AND s.exercise_id = ?)
        ORDER BY x.date DESC, x.id DESC LIMIT 1`).get(sessionId, e.id) as { id: number } | undefined;
    const last = prevSession
      ? (db.prepare("SELECT * FROM workout_sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_no").all(prevSession.id, e.id) as SetRow[])
      : [];
    const count = e.kind === "distance" ? 1 : Math.max(1, e.sets);
    for (let n = 1; n <= count; n++) {
      const prev = last.find((s) => s.set_no === n) ?? last.at(-1);
      run(
        `INSERT INTO workout_sets (session_id, exercise_id, exercise, kind, set_no, reps, weight, seconds, distance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sessionId, e.id, e.name, e.kind, n,
        prev?.reps ?? e.reps, prev?.weight ?? e.weight, prev?.seconds ?? e.seconds, prev?.distance ?? e.distance,
      );
    }
  }
}

export function sessionSets(sessionId: number) {
  return plain<SetRow>(db.prepare("SELECT * FROM workout_sets WHERE session_id = ? ORDER BY id").all(sessionId));
}

// ── personal bests ──

export type Best = { exercise: string; kind: Kind; value: number; label: string; date: string };

/** The best a set has ever been for each exercise: heaviest (weights), most reps (bodyweight), longest (time), furthest (distance). */
export function personalBests(memberId: number, beforeSession?: { date: string; id: number }): Best[] {
  const rows = db.prepare(
    `SELECT s.exercise, s.kind, s.reps, s.weight, s.seconds, s.distance, x.date, x.id AS sid
       FROM workout_sets s JOIN workout_sessions x ON x.id = s.session_id
      WHERE x.member_id = ? AND x.finished_at IS NOT NULL AND s.done = 1`).all(memberId) as (SetRow & { date: string; sid: number })[];
  const best = new Map<string, Best>();
  for (const r of rows) {
    if (beforeSession && (r.date > beforeSession.date || (r.date === beforeSession.date && r.sid >= beforeSession.id))) continue;
    const v = score(r);
    if (v == null) continue;
    const key = r.exercise.toLowerCase();
    const cur = best.get(key);
    if (!cur || v > cur.value) best.set(key, { exercise: r.exercise, kind: r.kind, value: v, label: bestLabel(r.kind, v), date: r.date });
  }
  return [...best.values()].sort((a, b) => a.exercise.localeCompare(b.exercise));
}

const score = (s: Pick<SetRow, "kind" | "reps" | "weight" | "seconds" | "distance">) =>
  s.kind === "weights" ? s.weight : s.kind === "bodyweight" ? s.reps : s.kind === "time" ? s.seconds : s.distance;
const bestLabel = (kind: Kind, v: number) => (kind === "weights" ? `${v} kg` : kind === "bodyweight" ? `${v} reps` : kind === "time" ? `${v} s` : `${v} km`);

/** New personal bests set in this session (only counts once there was something to beat). */
export function newBests(memberId: number, session: Session): Best[] {
  const before = new Map(personalBests(memberId, session).map((b) => [b.exercise.toLowerCase(), b]));
  const out = new Map<string, Best>();
  for (const s of sessionSets(session.id).filter((x) => x.done)) {
    const v = score(s);
    const prev = before.get(s.exercise.toLowerCase());
    if (v == null || !prev || v <= prev.value) continue;
    const cur = out.get(s.exercise.toLowerCase());
    if (!cur || v > cur.value) out.set(s.exercise.toLowerCase(), { exercise: s.exercise, kind: s.kind, value: v, label: bestLabel(s.kind, v), date: session.date });
  }
  return [...out.values()];
}

/** Heaviest set of each weights exercise per session, oldest first – for the progress charts. */
export function weightProgress(memberId: number) {
  const rows = db.prepare(
    `SELECT s.exercise, x.date, max(s.weight) AS weight FROM workout_sets s JOIN workout_sessions x ON x.id = s.session_id
      WHERE x.member_id = ? AND x.finished_at IS NOT NULL AND s.done = 1 AND s.kind = 'weights' AND s.weight IS NOT NULL
      GROUP BY s.exercise COLLATE NOCASE, x.id ORDER BY x.date, x.id`).all(memberId) as { exercise: string; date: string; weight: number }[];
  return [...Map.groupBy(rows, (r) => r.exercise.toLowerCase()).values()].filter((l) => l.length >= 2);
}

// ── this week and the streak ──

export function weekStart(date = today()) {
  return iso(startOfWeek(parseISO(date), { weekStartsOn: 1 }));
}

/** How many planned workouts a week, and how many were done in the week starting `monday`. */
function weekScore(workouts: Workout[], memberId: number, monday: string) {
  const planned = workouts.reduce((n, w) => n + dayList(w.days).length, 0);
  const done = sessionsBetween(memberId, monday, iso(addDays(parseISO(monday), 6))).filter((s) => s.finished_at).length;
  return { planned, done };
}

/** Weeks in a row (before this one) where every planned workout was done – and this week so far. */
export function streak(memberId: number, workouts: Workout[]) {
  const thisWeek = weekStart();
  const now = weekScore(workouts, memberId, thisWeek);
  let weeks = 0;
  if (now.planned > 0) {
    for (let i = 1; i <= 104; i++) {
      const w = weekScore(workouts, memberId, iso(addDays(parseISO(thisWeek), -7 * i)));
      if (w.done < w.planned) break;
      weeks++;
    }
  }
  return { weeks, ...now };
}

// ── starter routines ──

type Ex = [name: string, kind: Kind, sets: number, reps: number | null, seconds?: number | null, distance?: number | null];
export const STARTERS: { key: string; name: string; hint: string; workouts: { name: string; days: string; exercises: Ex[] }[] }[] = [
  {
    key: "fullbody", name: "Beginner full body", hint: "3 days a week (Mon, Wed, Fri) – gym or dumbbells at home",
    workouts: [{ name: "Full body", days: "1,3,5", exercises: [
      ["Squat", "weights", 3, 8], ["Push-ups", "bodyweight", 3, 10], ["Dumbbell row", "weights", 3, 10], ["Overhead press", "weights", 3, 8], ["Plank", "time", 3, null, 30],
    ] }],
  },
  {
    key: "ppl", name: "Push / Pull / Legs", hint: "6 days a week, each muscle group twice – gym",
    workouts: [
      { name: "Push day", days: "1,4", exercises: [["Bench press", "weights", 3, 8], ["Overhead press", "weights", 3, 8], ["Incline dumbbell press", "weights", 3, 10], ["Tricep dips", "bodyweight", 3, 10]] },
      { name: "Pull day", days: "2,5", exercises: [["Deadlift", "weights", 3, 5], ["Lat pulldown", "weights", 3, 10], ["Seated row", "weights", 3, 10], ["Bicep curl", "weights", 3, 12]] },
      { name: "Leg day", days: "3,6", exercises: [["Squat", "weights", 3, 8], ["Romanian deadlift", "weights", 3, 10], ["Lunges", "bodyweight", 3, 10], ["Calf raises", "bodyweight", 3, 15]] },
    ],
  },
  {
    key: "home", name: "Home workout, no gear", hint: "3 days a week, about 25 minutes – nothing needed",
    workouts: [{ name: "Home workout", days: "1,3,5", exercises: [
      ["Push-ups", "bodyweight", 3, 10], ["Squats", "bodyweight", 3, 15], ["Lunges", "bodyweight", 3, 10], ["Glute bridge", "bodyweight", 3, 12], ["Plank", "time", 3, null, 30], ["Burpees", "bodyweight", 3, 8],
    ] }],
  },
  {
    key: "run", name: "Running", hint: "3 runs a week (Tue, Thu, Sat) – nudge the distance up as it gets easier",
    workouts: [
      { name: "Easy run", days: "2,4", exercises: [["Run", "distance", 1, null, null, 3]] },
      { name: "Long run", days: "6", exercises: [["Run", "distance", 1, null, null, 5]] },
    ],
  },
  {
    key: "stretch", name: "Daily stretch", hint: "Every day, about 6 minutes",
    workouts: [{ name: "Stretch", days: "1,2,3,4,5,6,7", exercises: [
      ["Hamstring stretch", "time", 2, null, 30], ["Hip flexor stretch", "time", 2, null, 30], ["Chest & shoulder stretch", "time", 2, null, 30], ["Child's pose", "time", 1, null, 60],
    ] }],
  },
];

export function addStarter(memberId: number, key: string) {
  const s = STARTERS.find((x) => x.key === key);
  if (!s) return;
  let sort = (db.prepare("SELECT coalesce(max(sort), 0) AS n FROM workouts WHERE member_id = ?").get(memberId) as { n: number }).n;
  for (const w of s.workouts) {
    const id = Number(run("INSERT INTO workouts (member_id, name, days, sort) VALUES (?, ?, ?, ?)", memberId, w.name, w.days, ++sort).lastInsertRowid);
    w.exercises.forEach(([name, kind, sets, reps, seconds, distance], i) =>
      run("INSERT INTO workout_exercises (workout_id, name, kind, sets, reps, seconds, distance, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        id, name, kind, sets, reps, seconds ?? null, distance ?? null, i + 1));
  }
}

// ── cardio: runs, walks, rides… logged as they're done (not part of the routine) ──

export const CARDIO: { value: string; icon: string; paced?: boolean }[] = [
  { value: "Run", icon: "🏃", paced: true },
  { value: "Walk", icon: "🚶", paced: true },
  { value: "Bike", icon: "🚴" },
  { value: "Swim", icon: "🏊" },
  { value: "Row", icon: "🚣" },
  { value: "Hike", icon: "🥾", paced: true },
  { value: "Sport", icon: "⚽" },
  { value: "Other", icon: "❤️" },
];
export const cardioIcon = (activity: string) => CARDIO.find((c) => c.value === activity)?.icon ?? "❤️";

export type Cardio = { id: number; member_id: number; date: string; activity: string; minutes: number | null; distance: number | null; notes: string | null };

export function cardioBetween(memberId: number, from: string, to: string) {
  return plain<Cardio>(db.prepare("SELECT * FROM cardio_log WHERE member_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC").all(memberId, from, to));
}

/** "5 km · 30 min" */
export const cardioLabel = (c: Pick<Cardio, "minutes" | "distance">) =>
  [c.distance != null ? `${c.distance} km` : "", c.minutes != null ? `${c.minutes} min` : ""].filter(Boolean).join(" · ");

/** Minutes per km, as "5:30 /km" – for runs, walks and hikes with both a time and a distance. */
export function pace(c: Pick<Cardio, "activity" | "minutes" | "distance">) {
  if (!CARDIO.find((x) => x.value === c.activity)?.paced || !c.minutes || !c.distance) return null;
  const perKm = (c.minutes * 60) / c.distance;
  return `${Math.floor(perKm / 60)}:${String(Math.round(perKm % 60)).padStart(2, "0")} /km`;
}

/** Cardio minutes a week to aim for – 150 (the usual health guideline) until changed. */
export const cardioGoal = (memberId: number) => Number(getSetting(`cardio_goal:${memberId}`) ?? 150) || 150;
export const setCardioGoal = (memberId: number, minutes: number) => setSetting(`cardio_goal:${memberId}`, String(minutes));

/** For each activity: the furthest, the longest, and (runs, walks, hikes over 1 km) the fastest pace. */
export function cardioBests(memberId: number) {
  const all = plain<Cardio>(db.prepare("SELECT * FROM cardio_log WHERE member_id = ? ORDER BY date").all(memberId));
  return CARDIO.map((a) => {
    const mine = all.filter((c) => c.activity === a.value);
    if (!mine.length) return null;
    const furthest = mine.filter((c) => c.distance).sort((x, y) => y.distance! - x.distance!)[0];
    const longest = mine.filter((c) => c.minutes).sort((x, y) => y.minutes! - x.minutes!)[0];
    const fastest = mine.filter((c) => pace(c) && c.distance! >= 1).sort((x, y) => x.minutes! / x.distance! - y.minutes! / y.distance!)[0];
    return { activity: a.value, icon: a.icon, count: mine.length, furthest, longest, fastest };
  }).filter((x) => x != null);
}

// ── everyone's day (Home page, Telegram, reminders) ──

/** For each member with the Workout tab: what's planned today and whether it's done. */
export function familyToday(date = today()) {
  const members = db.prepare("SELECT id, slug, name, features FROM members ORDER BY sort, id").all() as { id: number; slug: string; name: string; features: string }[];
  return members
    .filter((m) => m.features.split(",").map((f) => f.trim()).includes("workout"))
    .map((m) => {
      const workouts = db.prepare("SELECT * FROM workouts WHERE member_id = ?").all(m.id) as Workout[];
      const sessions = sessionsBetween(m.id, date, date);
      const planned = plannedOn(workouts, date).map((w) => {
        const exercises = (db.prepare("SELECT count(*) AS n FROM workout_exercises WHERE workout_id = ?").get(w.id) as { n: number }).n;
        return { id: w.id, name: w.name, exercises, done: sessions.some((s) => s.workout_id === w.id && s.finished_at) };
      });
      // anything else done today: workouts not on the plan, and cardio
      const extra = [
        ...sessions.filter((s) => s.finished_at && !planned.some((p) => p.id === s.workout_id)).map((s) => s.name),
        ...cardioBetween(m.id, date, date).map((c) => `${cardioIcon(c.activity)} ${c.activity}${cardioLabel(c) ? ` ${cardioLabel(c)}` : ""}`),
      ];
      return { slug: m.slug, name: m.name, planned, extra };
    });
}

// ── notifications (built, but off until switched on in Settings → Push notifications) ──

/** `on`: a push to each person on their workout days at `time` (only if it isn't done yet). `inSummaries`: workouts in the daily calendar messages. */
export type WorkoutNotify = { on: boolean; time: string; inSummaries: boolean };
export const DEFAULT_WORKOUT_NOTIFY: WorkoutNotify = { on: false, time: "07:00", inSummaries: false };

export function workoutNotify(): WorkoutNotify {
  try {
    return { ...DEFAULT_WORKOUT_NOTIFY, ...JSON.parse(getSetting("workout_notify") ?? "{}") };
  } catch {
    return DEFAULT_WORKOUT_NOTIFY;
  }
}
export const saveWorkoutNotify = (c: WorkoutNotify) => setSetting("workout_notify", JSON.stringify(c));

/** One person's reminder for today, or null when there's nothing left to do. */
export function workoutMessage(slug: string) {
  const p = familyToday().find((x) => x.slug === slug);
  const left = p?.planned.filter((w) => !w.done) ?? [];
  if (!p || !left.length) return null;
  return {
    title: `💪 ${left.map((w) => w.name).join(" + ")} today`,
    body: left.map((w) => `${w.name} – ${w.exercises} exercise${w.exercises === 1 ? "" : "s"}`).join("\n"),
    url: `/${slug}/workout`,
    tag: `workout-${slug}`,
  };
}
