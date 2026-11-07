"use server";

import { revalidatePath } from "next/cache";
import { format, parseISO } from "date-fns";
import { db, run } from "@/lib/db";
import { int, str } from "@/lib/format";

export type ServingState = { message?: string; error?: string; savedAt?: number };

function done() {
  revalidatePath("/", "layout");
}

const isSunday = (date: string) => new Date(`${date}T12:00`).getDay() === 0;

/** Find the service on that date with that name, or create it – so Default Name and Default Name 2 serving the same service share it. */
function serviceFor(date: string, title: string) {
  const existing = db.prepare("SELECT id FROM church_services WHERE date = ? AND title = ? COLLATE NOCASE").get(date, title) as { id: number } | undefined;
  if (existing) return existing.id;
  const kind = isSunday(date) && /sunday/i.test(title) ? "sunday" : "event";
  return Number(run("INSERT INTO church_services (date, title, kind) VALUES (?, ?, ?)", date, title, kind).lastInsertRowid);
}

/** Read and check the form: date, service name, time, Spotify link, notes. */
function fields(fd: FormData) {
  const date = str(fd.get("date"));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." } as const;
  const time = str(fd.get("time"));
  const spotify = str(fd.get("spotify_url"));
  if (spotify && !/^https?:\/\//i.test(spotify)) return { error: "The Spotify link should start with https://" } as const;
  return {
    date,
    title: str(fd.get("title")) ?? "Sunday service",
    time: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
    spotify,
    notes: str(fd.get("notes")),
  } as const;
}

/** The time and playlist belong to the service (Default Name and Default Name 2 at the same service share them). */
function setServiceDetails(serviceId: number, time: string | null, spotify: string | null) {
  run("UPDATE church_services SET time = ?, spotify_url = ? WHERE id = ?", time, spotify, serviceId);
}

/** Removes a service that nobody serves at any more (one made by adding a serving date), unless it has its own notes. */
function tidy(serviceId: number | undefined) {
  if (!serviceId) return;
  run(`DELETE FROM church_services WHERE id = ? AND notes IS NULL
        AND id NOT IN (SELECT service_id FROM church_roles) AND id NOT IN (SELECT service_id FROM church_songs)`, serviceId);
}
const serviceOf = (roleId: number | null) =>
  (db.prepare("SELECT service_id FROM church_roles WHERE id = ?").get(roleId) as { service_id: number } | undefined)?.service_id;

const nice = (date: string) => format(parseISO(date), "EEE d MMM");

export async function saveServing(_prev: ServingState, fd: FormData): Promise<ServingState> {
  const f = fields(fd);
  if ("error" in f) return { error: f.error };
  const who = str(fd.get("person"));
  const people = who === "Both" ? ["Default Name", "Default Name 2"] : who === "Default Name 2" ? ["Default Name 2"] : ["Default Name"];
  const id = int(fd.get("id"));
  const before = serviceOf(id);

  const serviceId = serviceFor(f.date, f.title);
  setServiceDetails(serviceId, f.time, f.spotify);
  if (id) {
    // editing: move this person's entry to the (possibly different) service and update their notes
    run("UPDATE church_roles SET service_id = ?, notes = ? WHERE id = ?", serviceId, f.notes, id);
  } else {
    for (const p of people) {
      run("INSERT INTO church_roles (service_id, person, role, notes) VALUES (?, ?, 'Serving', ?)", serviceId, p, f.notes);
    }
  }
  if (before !== serviceId) tidy(before);
  done();
  const whom = people.length === 2 ? "Default Name & Default Name 2" : people[0];
  return { savedAt: Date.now(), message: id ? `Saved ✓ ${f.title}, ${nice(f.date)}.` : `Saved ✓ ${f.title}, ${nice(f.date)} – added for ${whom}.` };
}

export async function deleteRole(fd: FormData) {
  const id = int(fd.get("id"));
  const before = serviceOf(id);
  run("DELETE FROM church_roles WHERE id = ?", id);
  tidy(before);
  done();
}
