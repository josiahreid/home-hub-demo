"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/lib/db";
import { int, str } from "@/lib/format";
import { addGrocery, resetGroceryToken } from "@/lib/groceries";

function done() {
  revalidatePath("/food", "layout");
}

export async function addGroceryItem(fd: FormData) {
  // several at once: "milk, bread, eggs"
  for (const name of (str(fd.get("name")) ?? "").split(/[,\n]/)) addGrocery(name, fd.has("urgent"));
  done();
}

export async function tickGrocery(fd: FormData) {
  run("UPDATE groceries SET done_at = datetime('now') WHERE id = ?", int(fd.get("id")));
  done();
}

export async function untickGrocery(fd: FormData) {
  run("UPDATE groceries SET done_at = NULL, cleared = 0 WHERE id = ?", int(fd.get("id")));
  done();
}

/** Clear all: everything still on the list goes to the Cleared list (not Bought) – each can be put back. */
export async function clearAllGroceries() {
  run("UPDATE groceries SET done_at = datetime('now'), cleared = 1 WHERE done_at IS NULL");
  done();
}

/** Puts everything that was cleared in one go on a given NZ day back on the list. */
export async function restoreCleared(fd: FormData) {
  const ids = fd.getAll("id").map((x) => int(x)).filter((x): x is number => x != null);
  for (const id of ids) run("UPDATE groceries SET done_at = NULL, cleared = 0 WHERE id = ? AND cleared = 1", id);
  done();
}

export async function toggleGroceryUrgent(fd: FormData) {
  run("UPDATE groceries SET urgent = 1 - urgent WHERE id = ?", int(fd.get("id")));
  done();
}

export async function deleteGrocery(fd: FormData) {
  run("DELETE FROM groceries WHERE id = ?", int(fd.get("id")));
  done();
}

export async function resetGroceryLink() {
  resetGroceryToken();
  done();
}

/** The Home page's quick add: says what went on (and what was already there). */
export async function quickAddGrocery(_prev: { message?: string }, fd: FormData): Promise<{ message?: string }> {
  const names = (str(fd.get("name")) ?? "").split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
  if (!names.length) return {};
  const urgent = fd.has("urgent");
  const added = names.filter((n) => addGrocery(n, urgent)?.added);
  const already = names.filter((n) => !added.includes(n));
  done();
  return {
    message: [
      added.length ? `Added ${added.join(", ")}${urgent ? " (urgent)" : ""}.` : "",
      already.length ? `Already on the list: ${already.join(", ")}.` : "",
    ].filter(Boolean).join(" "),
  };
}
