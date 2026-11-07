"use server";

import { revalidatePath } from "next/cache";
import { db, run } from "@/lib/db";
import { int, str, today } from "@/lib/format";

function done() {
  revalidatePath("/", "layout");
}

/** Work, personal, or neither. */
function category(fd: FormData): string | null {
  const c = str(fd.get("category"));
  return c === "work" || c === "personal" ? c : null;
}

/** Whose to-do it is: a family member's page address (personA, personB…), or nobody in particular. */
function person(fd: FormData): string | null {
  const p = str(fd.get("person"));
  return p && db.prepare("SELECT 1 FROM members WHERE slug = ?").get(p) ? p : null;
}

export async function addTodo(fd: FormData) {
  const title = str(fd.get("title"));
  if (!title) return;
  // new ones go to the top of the list
  const { top } = db.prepare("SELECT coalesce(min(sort), 0) - 1 AS top FROM todos").get() as { top: number };
  run(
    "INSERT INTO todos (title, notes, due, important, person, sort, category) VALUES (?, ?, ?, ?, ?, ?, ?)",
    title, str(fd.get("notes")), str(fd.get("due")), fd.get("important") ? 1 : 0, person(fd), top, category(fd),
  );
  done();
}

export async function toggleTodo(fd: FormData) {
  run("UPDATE todos SET done_at = CASE WHEN done_at IS NULL THEN ? ELSE NULL END WHERE id = ?", today(), int(fd.get("id")));
  done();
}

/** Puts a finished to-do back on the list. */
export async function reopenTodo(fd: FormData) {
  run("UPDATE todos SET done_at = NULL WHERE id = ?", int(fd.get("id")));
  done();
}

export async function toggleImportant(fd: FormData) {
  run("UPDATE todos SET important = 1 - important WHERE id = ?", int(fd.get("id")));
  done();
}

export async function updateTodo(fd: FormData) {
  const title = str(fd.get("title"));
  if (!title) return;
  run(
    "UPDATE todos SET title = ?, notes = ?, due = ?, important = ?, person = ?, category = ? WHERE id = ?",
    title, str(fd.get("notes")), str(fd.get("due")), fd.get("important") ? 1 : 0, person(fd), category(fd), int(fd.get("id")),
  );
  done();
}

/**
 * Saves a dragged order. Only the to-dos on screen are given; they swap among their own places,
 * so reordering Default Name's list doesn't shuffle Default Name 2's.
 */
export async function reorderTodos(ids: number[]) {
  const clean = ids.filter((id) => Number.isInteger(id));
  if (!clean.length) return;
  db.exec("BEGIN");
  try {
    // equal sort values would stop the new order sticking, so first number everything 1, 2, 3… in its current order
    const { dupes } = db.prepare("SELECT count(*) - count(DISTINCT sort) AS dupes FROM todos").get() as { dupes: number };
    if (dupes) {
      const all = db.prepare("SELECT id FROM todos ORDER BY sort, id").all() as { id: number }[];
      all.forEach((r, i) => run("UPDATE todos SET sort = ? WHERE id = ?", i + 1, r.id));
    }
    const slots = (db.prepare(`SELECT sort FROM todos WHERE id IN (${clean.map(() => "?").join(",")}) ORDER BY sort`).all(...clean) as { sort: number }[])
      .map((r) => r.sort);
    clean.forEach((id, i) => run("UPDATE todos SET sort = ? WHERE id = ?", slots[i], id));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  done();
}

export async function deleteTodo(fd: FormData) {
  run("DELETE FROM todos WHERE id = ?", int(fd.get("id")));
  done();
}

export async function clearDone() {
  run("DELETE FROM todos WHERE done_at IS NOT NULL");
  done();
}
