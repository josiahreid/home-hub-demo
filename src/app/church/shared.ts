import "server-only";
import { nextSunday, parseISO } from "date-fns";
import { all, get } from "@/lib/db";
import { iso, today } from "@/lib/format";

export const PEOPLE = ["Default Name", "Default Name 2"] as const;
export type Person = (typeof PEOPLE)[number];

/** One person serving at one service: the service's name, date, time and playlist, plus their own notes. */
export type Serving = {
  id: number; service_id: number; person: string; notes: string | null;
  date: string; time: string | null; title: string; kind: string; spotify_url: string | null;
};

const SELECT = `SELECT r.id, r.service_id, r.person, r.notes, s.date, s.time, s.title, s.kind, s.spotify_url
                  FROM church_roles r JOIN church_services s ON s.id = r.service_id`;

/** A person's serving dates from today on (or the most recent past ones). */
export function servingFor(person: Person, when: "upcoming" | "past") {
  return when === "upcoming"
    ? all<Serving>(`${SELECT} WHERE r.person = ? AND s.date >= ? ORDER BY s.date, s.time`, person, today())
    : all<Serving>(`${SELECT} WHERE r.person = ? AND s.date < ? ORDER BY s.date DESC, s.time DESC LIMIT 20`, person, today());
}

/** Everyone's serving dates in a date range. */
export function servingBetween(from: string, to: string) {
  return all<Serving>(`${SELECT} WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.time, r.person`, from, to);
}

/** The coming Sunday (today if it's Sunday). */
export function upcomingSunday() {
  const d = parseISO(today());
  return d.getDay() === 0 ? today() : iso(nextSunday(d));
}

/** What a new serving date starts with: next Sunday, and the service time used last time. */
export async function servingDefaults() {
  const last = await get<{ time: string | null }>(
    "SELECT s.time FROM church_roles r JOIN church_services s ON s.id = r.service_id WHERE s.time IS NOT NULL ORDER BY r.id DESC LIMIT 1");
  return { date: upcomingSunday(), title: "Sunday service", time: last?.time ?? "" };
}
