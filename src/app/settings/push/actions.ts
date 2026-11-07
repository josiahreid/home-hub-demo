"use server";

import { revalidatePath } from "next/cache";
import { db, run } from "@/lib/db";
import { int, str } from "@/lib/format";
import { currentUser } from "@/lib/current-user";
import { validP256 } from "@/lib/webpush";
import { DEMO, DEMO_OFF } from "@/lib/demo";
import {
  pushConfig, pushToDevice, pushToPerson, saveDevice, savePushConfig, sendCalendarNow, sendChurchReminders, todoMessage, todoReminderFor, type TodoCategory,
} from "@/lib/push";

export type PushState = { message?: string; error?: string };

function done() {
  revalidatePath("/settings/push");
}

/** This device said yes to notifications: save it as the current person's. */
export async function subscribeDevice(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, mobile: boolean, label: string): Promise<PushState & { id?: number }> {
  if (DEMO) return { error: DEMO_OFF };
  const me = await currentUser();
  if (!me) return { error: "Pick who you are first." };
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !validP256(sub.keys?.p256dh ?? "") || !sub.keys?.auth) return { error: "That browser sent an unusable subscription." };
  saveDevice({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, me.slug, mobile, label);
  const row = db.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").get(sub.endpoint) as { id: number };
  done();
  return { message: `Notifications are on for ${me.name} on this ${mobile ? "phone" : "computer"}.`, id: row.id };
}

export async function forgetDevice(fd: FormData) {
  run("DELETE FROM push_subscriptions WHERE id = ?", int(fd.get("id")));
  done();
}

export async function forgetEndpoint(endpoint: string) {
  run("DELETE FROM push_subscriptions WHERE endpoint = ?", endpoint);
  done();
}

/** A test notification to one device (computers included – a test always goes). */
export async function testDevice(id: number): Promise<PushState> {
  const r = await pushToDevice(id, { title: "👋 Home Hub", body: "Notifications are working on this device.", url: "/settings/push", tag: "test" });
  done();
  return r.ok ? { message: "Sent – it should pop up in a few seconds." } : { error: r.errors[0] ?? "That device has gone – turn notifications on again." };
}

export async function setPhonesOnly(fd: FormData) {
  const c = pushConfig();
  c.phonesOnly = fd.has("phonesOnly");
  savePushConfig(c);
  done();
}

const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Saves one person's to-do reminders: on/off, the times (as many as they like) and what's included. */
export async function saveTodoReminder(_prev: PushState, fd: FormData): Promise<PushState> {
  const slug = str(fd.get("person"));
  if (!slug || !db.prepare("SELECT 1 FROM members WHERE slug = ?").get(slug)) return { error: "Unknown person." };
  const times = [...new Set(fd.getAll("times").map(String).filter(isTime))].sort();
  const category = (["all", "work", "personal"].includes(String(fd.get("category"))) ? fd.get("category") : "all") as TodoCategory;
  const c = pushConfig();
  const scope = fd.get("scope") === "mine" ? "mine" : "family";
  c.todo[slug] = { on: fd.has("on"), times, scope, includeEveryone: fd.has("includeEveryone"), category, onlyIfAny: fd.has("onlyIfAny") };
  savePushConfig(c);
  done();
  return { message: c.todo[slug].on ? `Saved – ${times.length} reminder${times.length === 1 ? "" : "s"} a day.` : "Saved – to-do reminders are off." };
}

/** Church reminders: on/off, the time, and how many days before. */
export async function saveChurchReminder(_prev: PushState, fd: FormData): Promise<PushState> {
  const c = pushConfig();
  const time = String(fd.get("time") ?? "");
  c.church = { on: fd.has("on"), time: isTime(time) ? time : c.church.time, daysBefore: Math.max(0, Math.min(7, int(fd.get("daysBefore")) ?? 1)) };
  savePushConfig(c);
  done();
  return { message: c.church.on ? `Saved – reminders go out at ${c.church.time} to whoever's serving.` : "Saved – church reminders are off." };
}

/** Sends the church reminders now, for the day they'd normally cover. */
export async function sendChurchNow(): Promise<PushState> {
  const { date, sentTo, noDevice } = await sendChurchReminders(pushConfig().church);
  done();
  if (!sentTo.length && !noDevice.length) return { error: `Nobody is serving or practising on ${date}, so there's nothing to send.` };
  const parts = [
    sentTo.length ? `Sent to ${sentTo.join(" and ")}` : "",
    noDevice.length ? `${noDevice.join(" and ")} ${noDevice.length === 1 ? "is serving but has" : "are serving but have"} no phone set up for notifications yet` : "",
  ].filter(Boolean);
  const text = `${parts.join(". ")} (${date}).`;
  return sentTo.length ? { message: text } : { error: text };
}

/** Sends a person's to-do reminder right now, the way it'll look at the set times. */
export async function sendTodoNow(slug: string): Promise<PushState> {
  const c = pushConfig();
  const msg = todoMessage(slug, { ...todoReminderFor(c, slug), onlyIfAny: false });
  const r = await pushToPerson(slug, msg!);
  done();
  if (r.ok) return { message: `Sent to ${r.ok} device${r.ok === 1 ? "" : "s"}.` };
  return { error: r.errors[0] ?? (c.phonesOnly ? "No phones are set up for them yet (computers are left out – phones only is on)." : "No devices are set up for them yet.") };
}

/** The day's calendar notifications: on/off and the time for today's and tomorrow's. */
export async function saveCalendarPush(_prev: PushState, fd: FormData): Promise<PushState> {
  const c = pushConfig();
  for (const w of ["today", "tomorrow"] as const) {
    const time = String(fd.get(`${w}Time`) ?? "");
    c.calendar[w] = { on: fd.has(`${w}On`), time: isTime(time) ? time : c.calendar[w].time };
  }
  savePushConfig(c);
  done();
  return { message: "Saved." };
}

/** Reminders before events: on/off and how long before. */
export async function saveEventPush(_prev: PushState, fd: FormData): Promise<PushState> {
  const c = pushConfig();
  const m = int(fd.get("minutesBefore")) ?? 30;
  c.events = { on: fd.has("on"), minutesBefore: Math.max(5, Math.min(24 * 60, m)) };
  savePushConfig(c);
  done();
  return { message: c.events.on ? `Saved – a reminder ${c.events.minutesBefore} minutes before each event with a time.` : "Saved – event reminders are off." };
}

export async function sendCalendarPushNow(which: "today" | "tomorrow"): Promise<PushState> {
  const r = await sendCalendarNow(which === "tomorrow" ? "tomorrow" : "today");
  done();
  if (r.empty) return { error: `Nothing on ${which} – nothing to send.` };
  return r.ok ? { message: `Sent to ${r.ok} device${r.ok === 1 ? "" : "s"}.` } : { error: "No phones are set up for notifications yet." };
}

/** Workout notifications: the morning reminder on workout days, and whether workouts go in the daily calendar messages. */
export async function saveWorkoutPush(_prev: PushState, fd: FormData): Promise<PushState> {
  const { saveWorkoutNotify, workoutNotify } = await import("@/lib/workout");
  const c = workoutNotify();
  const time = String(fd.get("time") ?? "");
  saveWorkoutNotify({ on: fd.has("on"), time: isTime(time) ? time : c.time, inSummaries: fd.has("inSummaries") });
  done();
  return { message: fd.has("on") ? `Saved – a reminder at ${isTime(time) ? time : c.time} on workout days.` : "Saved – workout reminders are off." };
}

/** Sends today's workout reminders now (to try it out), whatever the on/off setting. */
export async function sendWorkoutNow(): Promise<PushState> {
  const { sendWorkoutReminders } = await import("@/lib/push");
  const { sentTo, noDevice } = await sendWorkoutReminders();
  done();
  if (!sentTo.length && !noDevice.length) return { error: "Nobody has a workout still to do today, so there's nothing to send." };
  const text = [
    sentTo.length ? `Sent to ${sentTo.join(" and ")}` : "",
    noDevice.length ? `${noDevice.join(" and ")} ${noDevice.length === 1 ? "has" : "have"} a workout today but no phone set up for notifications` : "",
  ].filter(Boolean).join(". ");
  return sentTo.length ? { message: `${text}.` } : { error: `${text}.` };
}

/** Transactions-to-sort reminder: on/off, time, who, only when new ones came in, Telegram too. */
export async function saveSortPush(_prev: PushState, fd: FormData): Promise<PushState> {
  const c = pushConfig();
  const time = String(fd.get("time") ?? "");
  const all = (db.prepare("SELECT slug FROM members").all() as { slug: string }[]).map((m) => m.slug);
  const picked = fd.getAll("people").map(String).filter((s) => all.includes(s));
  c.sort = {
    on: fd.has("on"),
    time: isTime(time) ? time : c.sort.time,
    people: picked.length === all.length ? null : picked,
    onlyNew: fd.has("onlyNew"),
    telegram: fd.has("telegram"),
  };
  savePushConfig(c);
  done();
  return { message: c.sort.on ? `Saved – at ${c.sort.time}${c.sort.onlyNew ? " when new ones have come in" : " whenever there are any to sort"}.` : "Saved – sort reminders are off." };
}

/** Sends the sort reminder now (whether or not anything new came in). */
export async function sendSortNow(): Promise<PushState> {
  const { sendSortReminder } = await import("@/lib/push");
  const r = await sendSortReminder(pushConfig().sort, false);
  done();
  if (r.empty) return { error: "Nothing to sort right now, so there's nothing to send." };
  return r.sent ? { message: `Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}${pushConfig().sort.telegram ? " (and Telegram)" : ""}.` } : { error: "No phones are set up for notifications yet." };
}
