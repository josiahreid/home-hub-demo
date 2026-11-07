"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, run } from "@/lib/db";
import { int, str, today } from "@/lib/format";
import { CARDIO, addStarter as addStarterRoutine, setCardioGoal, startSets, type Kind, type SetRow } from "@/lib/workout";

function done() {
  revalidatePath("/[member]", "layout");
  revalidatePath("/", "layout"); // Home and the calendars show workouts too
}

const KIND_VALUES: Kind[] = ["weights", "bodyweight", "time", "distance"];
const kindOf = (v: FormDataEntryValue | null): Kind => (KIND_VALUES.includes(String(v) as Kind) ? (String(v) as Kind) : "weights");
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return String(v ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};
const days = (fd: FormData) => [...new Set(fd.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7))].sort().join(",");
const slugOf = (fd: FormData) => (str(fd.get("slug")) ?? "").replace(/[^a-z0-9-]/g, "");

// ── the routine ──

export async function addWorkout(fd: FormData) {
  const memberId = int(fd.get("member_id"));
  const name = str(fd.get("name"));
  if (!memberId || !name) return;
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) AS n FROM workouts WHERE member_id = ?").get(memberId) as { n: number };
  run("INSERT INTO workouts (member_id, name, days, sort) VALUES (?, ?, ?, ?)", memberId, name.slice(0, 80), days(fd), n + 1);
  done();
}

export async function updateWorkout(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"));
  if (!id || !name) return;
  run("UPDATE workouts SET name = ?, days = ? WHERE id = ?", name.slice(0, 80), days(fd), id);
  done();
}

export async function deleteWorkout(fd: FormData) {
  // its past sessions stay in the history (they keep the workout's name)
  run("DELETE FROM workouts WHERE id = ?", int(fd.get("id")));
  done();
}

function exerciseValues(fd: FormData) {
  const kind = kindOf(fd.get("kind"));
  return [
    (str(fd.get("name")) ?? "Exercise").slice(0, 80), kind,
    kind === "distance" ? 1 : Math.max(1, Math.min(20, int(fd.get("sets")) ?? 3)),
    kind === "weights" || kind === "bodyweight" ? num(fd.get("reps")) : null,
    kind === "weights" ? num(fd.get("weight")) : null,
    kind === "time" || kind === "distance" ? num(fd.get("seconds")) : null,
    kind === "distance" ? num(fd.get("distance")) : null,
    str(fd.get("notes")),
  ] as const;
}

export async function addExercise(fd: FormData) {
  const workoutId = int(fd.get("workout_id"));
  if (!workoutId || !str(fd.get("name"))) return;
  const { n } = db.prepare("SELECT coalesce(max(sort), 0) AS n FROM workout_exercises WHERE workout_id = ?").get(workoutId) as { n: number };
  run(
    "INSERT INTO workout_exercises (name, kind, sets, reps, weight, seconds, distance, notes, workout_id, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ...exerciseValues(fd), workoutId, n + 1,
  );
  done();
}

export async function updateExercise(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id || !str(fd.get("name"))) return;
  run("UPDATE workout_exercises SET name = ?, kind = ?, sets = ?, reps = ?, weight = ?, seconds = ?, distance = ?, notes = ? WHERE id = ?", ...exerciseValues(fd), id);
  done();
}

export async function deleteExercise(fd: FormData) {
  run("DELETE FROM workout_exercises WHERE id = ?", int(fd.get("id")));
  done();
}

/** Moves an exercise up or down within its workout. */
export async function moveExercise(fd: FormData) {
  const id = int(fd.get("id"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const row = db.prepare("SELECT workout_id FROM workout_exercises WHERE id = ?").get(id) as { workout_id: number } | undefined;
  if (!row) return;
  const ids = (db.prepare("SELECT id FROM workout_exercises WHERE workout_id = ? ORDER BY sort, id").all(row.workout_id) as { id: number }[]).map((r) => r.id);
  const i = ids.indexOf(id!);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  ids.forEach((x, n) => run("UPDATE workout_exercises SET sort = ? WHERE id = ?", n + 1, x));
  done();
}

export async function addStarter(fd: FormData) {
  const memberId = int(fd.get("member_id"));
  const key = str(fd.get("starter"));
  if (!memberId || !key) return;
  addStarterRoutine(memberId, key);
  done();
}

// ── doing a workout ──

/** Starts (or carries on with) today's session of a workout, then opens it. */
export async function startWorkout(fd: FormData) {
  const memberId = int(fd.get("member_id"));
  const workoutId = int(fd.get("workout_id"));
  const slug = slugOf(fd);
  const w = db.prepare("SELECT id, name FROM workouts WHERE id = ? AND member_id = ?").get(workoutId, memberId) as { id: number; name: string } | undefined;
  if (!memberId || !w) return;
  const open = db.prepare("SELECT id FROM workout_sessions WHERE member_id = ? AND workout_id = ? AND date = ? AND finished_at IS NULL")
    .get(memberId, w.id, today()) as { id: number } | undefined;
  let id = open?.id;
  if (!id) {
    id = Number(run("INSERT INTO workout_sessions (member_id, workout_id, name, date) VALUES (?, ?, ?, ?)", memberId, w.id, w.name, today()).lastInsertRowid);
    startSets(id, w.id);
  }
  done();
  redirect(`/${slug}/workout/${id}`);
}

/**
 * One set changed or ticked (from the workout screen – saved straight away). Only what changed is sent, so a tick
 * straight after typing a number can't put the old number back.
 */
export async function saveSet(id: number, patch: { reps?: number | null; weight?: number | null; seconds?: number | null; distance?: number | null; done?: boolean }) {
  const clean = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n >= 0 ? n : null);
  for (const key of ["reps", "weight", "seconds", "distance"] as const) {
    if (key in patch) run(`UPDATE workout_sets SET ${key} = ? WHERE id = ?`, clean(patch[key]), id);
  }
  if ("done" in patch) run("UPDATE workout_sets SET done = ? WHERE id = ?", patch.done ? 1 : 0, id);
}

/** One more set of an exercise, copying the last one. Returns it so the screen can show it straight away. */
export async function addSet(sessionId: number, exercise: string): Promise<SetRow | null> {
  const last = db.prepare("SELECT * FROM workout_sets WHERE session_id = ? AND exercise = ? ORDER BY set_no DESC LIMIT 1").get(sessionId, exercise) as SetRow | undefined;
  if (!last) return null;
  const id = Number(run(
    `INSERT INTO workout_sets (session_id, exercise_id, exercise, kind, set_no, reps, weight, seconds, distance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sessionId, last.exercise_id, last.exercise, last.kind, last.set_no + 1, last.reps, last.weight, last.seconds, last.distance,
  ).lastInsertRowid);
  return { ...(db.prepare("SELECT * FROM workout_sets WHERE id = ?").get(id) as SetRow) }; // a plain object for the page
}

export async function removeSet(id: number) {
  run("DELETE FROM workout_sets WHERE id = ?", id);
}

export async function finishSession(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("UPDATE workout_sessions SET finished_at = coalesce(finished_at, datetime('now')), notes = ? WHERE id = ?", str(fd.get("notes")), id);
  done();
  redirect(`/${slugOf(fd)}/workout?done=${id}`);
}

export async function deleteSession(fd: FormData) {
  const id = int(fd.get("id"));
  const m = db.prepare("SELECT m.slug FROM workout_sessions x JOIN members m ON m.id = x.member_id WHERE x.id = ?").get(id) as { slug: string } | undefined;
  run("DELETE FROM workout_sessions WHERE id = ?", id);
  done();
  redirect(m ? `/${m.slug}/workout` : "/");
}

// ── cardio ──

function cardioValues(fd: FormData) {
  const activity = str(fd.get("activity")) ?? "Other";
  const date = str(fd.get("date"));
  const minutes = num(fd.get("minutes"));
  return [
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today(),
    CARDIO.some((c) => c.value === activity) ? activity : "Other",
    minutes == null ? null : Math.round(minutes),
    num(fd.get("distance")),
    str(fd.get("notes")),
  ] as const;
}

export async function addCardio(fd: FormData) {
  const memberId = int(fd.get("member_id"));
  if (!memberId) return;
  const v = cardioValues(fd);
  if (v[2] == null && v[3] == null) return; // needs a time or a distance
  run("INSERT INTO cardio_log (date, activity, minutes, distance, notes, member_id) VALUES (?, ?, ?, ?, ?, ?)", ...v, memberId);
  done();
}

export async function updateCardio(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  run("UPDATE cardio_log SET date = ?, activity = ?, minutes = ?, distance = ?, notes = ? WHERE id = ?", ...cardioValues(fd), id);
  done();
}

export async function deleteCardio(fd: FormData) {
  run("DELETE FROM cardio_log WHERE id = ?", int(fd.get("id")));
  done();
}

export async function saveCardioGoal(fd: FormData) {
  const memberId = int(fd.get("member_id"));
  const minutes = int(fd.get("goal"));
  if (!memberId || minutes == null) return;
  setCardioGoal(memberId, Math.max(10, Math.min(2000, minutes)));
  done();
}
