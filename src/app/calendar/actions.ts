"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { run } from "@/lib/db";
import { asRepeat, int, str, toCents, today } from "@/lib/format";
import { syncFeed } from "@/lib/ics";
import { DEMO, DEMO_OFF } from "@/lib/demo";

function done() {
  revalidatePath("/", "layout");
}

function eventFields(fd: FormData) {
  return [
    str(fd.get("title")) ?? "Untitled", str(fd.get("start_date")) ?? today(), str(fd.get("start_time")),
    str(fd.get("end_date")), str(fd.get("end_time")), str(fd.get("location")), str(fd.get("notes")),
    str(fd.get("kind")) ?? "general", toCents(fd.get("budget")),
    int(fd.get("wish_list_id")), str(fd.get("wish_occasion")),
    asRepeat(fd.get("repeat")), asRepeat(fd.get("repeat")) ? str(fd.get("repeat_until")) : null,
    // who it's for: member slugs, null = everyone
    fd.getAll("people").map(String).filter((p) => /^[a-z0-9-]+$/.test(p)).join(",") || null,
  ] as const;
}

export async function addEvent(fd: FormData) {
  const id = run(
    "INSERT INTO events (title, start_date, start_time, end_date, end_time, location, notes, kind, budget_cents, wish_list_id, wish_occasion, repeat, repeat_until, people) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ...eventFields(fd),
  ).lastInsertRowid;
  done();
  // added from a family member's Calendar tab: back there
  const back = str(fd.get("back"));
  if (back && /^\/[a-z0-9-]+\/calendar(\?month=\d{4}-\d{2})?$/.test(back)) redirect(back);
  redirect(`/calendar?month=${String(fd.get("start_date")).slice(0, 7)}&event=${id}`);
}

export async function updateEvent(fd: FormData) {
  run(
    "UPDATE events SET title = ?, start_date = ?, start_time = ?, end_date = ?, end_time = ?, location = ?, notes = ?, kind = ?, budget_cents = ?, wish_list_id = ?, wish_occasion = ?, repeat = ?, repeat_until = ?, people = ? WHERE id = ? AND feed_id IS NULL",
    ...eventFields(fd), int(fd.get("id")),
  );
  done();
}

/** Synced events can't be edited (the next sync would overwrite), but they can carry a budget. */
export async function setEventBudget(fd: FormData) {
  run("UPDATE events SET budget_cents = ? WHERE id = ?", toCents(fd.get("budget")), int(fd.get("id")));
  done();
}

export async function deleteEvent(fd: FormData) {
  run("DELETE FROM events WHERE id = ? AND feed_id IS NULL", int(fd.get("id")));
  done();
  redirect("/calendar");
}

export async function planForEvent(fd: FormData) {
  const id = int(fd.get("id"));
  const target = toCents(fd.get("budget"));
  const date = str(fd.get("start_date"));
  if (!id || !target || !date) return;
  run(
    "INSERT INTO plans (name, target_cents, start_date, target_date, event_id) VALUES (?, ?, ?, ?, ?)",
    str(fd.get("title")) ?? "Event", target, today(), date, id,
  );
  done();
  redirect("/budget/plans");
}

// ── bins ──

const COST_PER = ["collection", "month", "quarter", "year"];

/** A bin's cost: an amount (blank = no cost recorded) and what it's per. */
function binCost(fd: FormData) {
  const cents = toCents(fd.get("cost"));
  const per = str(fd.get("cost_per"));
  return cents == null ? [null, null] : [Math.abs(cents), per && COST_PER.includes(per) ? per : "collection"];
}

export async function addBin(fd: FormData) {
  const bin = str(fd.get("bin"));
  const anchor = str(fd.get("anchor_date"));
  if (!bin || !anchor) return;
  run("INSERT INTO bin_schedules (bin, anchor_date, interval_weeks, cost_cents, cost_per) VALUES (?, ?, ?, ?, ?)",
    bin, anchor, int(fd.get("interval_weeks")) ?? 1, ...binCost(fd));
  done();
}

export async function setBinCost(fd: FormData) {
  run("UPDATE bin_schedules SET cost_cents = ?, cost_per = ? WHERE id = ?", ...binCost(fd), int(fd.get("id")));
  done();
}

export async function deleteBin(fd: FormData) {
  run("DELETE FROM bin_schedules WHERE id = ?", int(fd.get("id")));
  done();
}

// ── feeds ──

export type FeedState = { message?: string; error?: string };

export async function addFeed(_prev: FeedState, fd: FormData): Promise<FeedState> {
  if (DEMO) return { error: DEMO_OFF };
  const url = str(fd.get("url"));
  if (!url || !/^(https?|webcal):\/\//i.test(url)) return { error: "Paste the full iCal link (starts with https:// or webcal://)." };
  const id = Number(run("INSERT INTO calendar_feeds (name, url) VALUES (?, ?)", str(fd.get("name")) ?? "Calendar", url).lastInsertRowid);
  try {
    const n = await syncFeed(id);
    done();
    return { message: `Connected. Pulled in ${n} events.` };
  } catch (e) {
    run("DELETE FROM calendar_feeds WHERE id = ?", id);
    return { error: `Couldn't read that calendar: ${(e as Error).message}` };
  }
}

export async function syncAllFeeds(): Promise<FeedState> {
  if (DEMO) return { error: DEMO_OFF };
  const { db } = await import("@/lib/db");
  const feeds = db.prepare("SELECT id, name FROM calendar_feeds").all() as { id: number; name: string }[];
  const results: string[] = [];
  for (const f of feeds) {
    try {
      results.push(`${f.name}: ${await syncFeed(f.id)} events`);
    } catch (e) {
      results.push(`${f.name}: failed (${(e as Error).message})`);
    }
  }
  done();
  return { message: results.join(" · ") || "No calendars connected." };
}

export async function deleteFeed(fd: FormData) {
  run("DELETE FROM calendar_feeds WHERE id = ?", int(fd.get("id")));
  done();
}

// ── Home Hub's own calendar feed ──

export async function saveFeedKinds(fd: FormData) {
  const { setFeedKinds } = await import("@/lib/calendar-feed");
  setFeedKinds(fd.getAll("kind").map(String));
  done();
}

export async function resetFeedLink() {
  const { resetFeedToken } = await import("@/lib/calendar-feed");
  resetFeedToken();
  done();
}

// ── calendar colours ──

export async function setCalendarColor(kind: string, color: string) {
  const { saveCalendarColor } = await import("@/lib/calendar-colors");
  saveCalendarColor(kind, color);
  done();
}

export async function resetCalendarColors() {
  const { resetCalendarColorsTo } = await import("@/lib/calendar-colors");
  resetCalendarColorsTo();
  done();
}

/** Synced (Google/Apple) events can't be edited, but they can still be linked to a wish list. */
export async function setEventWishList(fd: FormData) {
  run("UPDATE events SET wish_list_id = ?, wish_occasion = ? WHERE id = ?", int(fd.get("wish_list_id")), str(fd.get("wish_occasion")), int(fd.get("id")));
  done();
}
