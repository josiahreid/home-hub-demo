"use server";

import { DEMO, DEMO_OFF } from "@/lib/demo";

import { revalidatePath } from "next/cache";
import { requireApiUnlocked } from "@/lib/api-lock";
import { run, setSetting } from "@/lib/db";
import { int, str } from "@/lib/format";
import { broadcast, linkedChats, registerCommands, seenChats, setTelegramStatus, tg, type Prefs } from "@/lib/telegram";
import { buildMessage, notifyConfig, saveNotifyConfig } from "@/lib/notify";
import { CAL_CATS, DEFAULT_NOTIFY, MESSAGE_INFO, slotLabel, withDefaults, type CalCat, type NotifyKind } from "@/lib/notify-format";

export type TgState = { message?: string; error?: string };

function done() {
  revalidatePath("/settings", "layout");
}

/** Saves the bot token after checking it with Telegram. */
export async function saveToken(_prev: TgState, fd: FormData): Promise<TgState> {
  if (DEMO) return { error: DEMO_OFF };
  await requireApiUnlocked();
  const token = str(fd.get("token"));
  if (!token || !/^\d+:[\w-]{30,}$/.test(token)) return { error: "That doesn't look like a bot token. It's the long code BotFather gives you, like 123456789:AA…" };
  try {
    const me = await tg<{ username: string }>("getMe", {}, token);
    setSetting("telegram_token", token);
    setSetting("telegram_offset", "0"); // a new bot starts reading from the beginning
    setTelegramStatus({ bot: me.username, error: undefined, errorAt: undefined });
    await registerCommands(token).catch(() => {});
    done();
    return { message: `Connected to @${me.username}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removeToken() {
  await requireApiUnlocked();
  run("DELETE FROM settings WHERE key IN ('telegram_token', 'telegram_offset', 'telegram_status')");
  done();
}

export async function linkChat(fd: FormData) {
  await requireApiUnlocked();
  const id = int(fd.get("id"));
  const seen = seenChats().find((c) => c.id === id);
  if (!seen) return;
  const name = str(fd.get("name")) ?? seen.name;
  setSetting("telegram_chats", JSON.stringify([...linkedChats().filter((c) => c.id !== id), { id, name }]));
  setSetting("telegram_seen_chats", JSON.stringify(seenChats().filter((c) => c.id !== id)));
  done();
}

export async function unlinkChat(fd: FormData) {
  await requireApiUnlocked();
  const id = int(fd.get("id"));
  setSetting("telegram_chats", JSON.stringify(linkedChats().filter((c) => c.id !== id)));
  done();
}

export async function saveCommands(fd: FormData) {
  await requireApiUnlocked();
  const prefs: Prefs = { commands: fd.has("commands") };
  setSetting("telegram_prefs", JSON.stringify(prefs));
  done();
}

const KINDS = Object.keys(DEFAULT_NOTIFY) as NotifyKind[];
const asKind = (v: FormDataEntryValue | null): NotifyKind | null => (KINDS.includes(v as NotifyKind) ? (v as NotifyKind) : null);
const time = (v: FormDataEntryValue | null, d: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d);

/** Saves one scheduled message: on/off, when, what's in it and its wording. */
export async function saveNotify(_prev: TgState, fd: FormData): Promise<TgState> {
  await requireApiUnlocked();
  const kind = asKind(fd.get("kind"));
  if (!kind) return { error: "Unknown message." };
  const c = notifyConfig();
  const template = (str(fd.get("template")) ?? DEFAULT_NOTIFY[kind].template).replace(/\r\n/g, "\n").slice(0, 2000);
  const base = { on: fd.has("on"), time: time(fd.get("time"), c[kind].time), template };
  if (kind === "today" || kind === "tomorrow") {
    const cats = fd.getAll("cats").map(String).filter((x): x is CalCat => CAL_CATS.some((cc) => cc.value === x));
    c[kind] = { ...base, cats, skipEmpty: fd.has("skipEmpty") };
  } else if (kind === "church") {
    // the time slots come as pairs: slot_time[i] at slot_days[i] days before
    const times = fd.getAll("slot_time").map(String);
    const days = fd.getAll("slot_days").map((d) => Math.max(0, Math.min(7, int(d) ?? 1)));
    const slots = times.map((t, i) => ({ time: t, daysBefore: days[i] ?? 1 })).filter((x) => /^d{2}:d{2}$/.test(x.time));
    if (base.on && !slots.length) return { error: "Add at least one time, or untick Send it." };
    c.church = withDefaults({ church: { ...base, slots } }).church;
  } else {
    c.groceries = base;
  }
  saveNotifyConfig(c);
  done();
  const when = kind === "church" ? c.church.slots.map(slotLabel).join(", ") : c[kind].time;
  return { message: `Saved. ${MESSAGE_INFO[kind].title} ${c[kind].on ? `goes out at ${when}` : "is switched off"}.` };
}

export async function resetNotifyTemplate(fd: FormData) {
  await requireApiUnlocked();
  const kind = asKind(fd.get("kind"));
  if (!kind) return;
  const c = notifyConfig();
  c[kind] = { ...c[kind], template: DEFAULT_NOTIFY[kind].template } as never;
  saveNotifyConfig(c);
  done();
}

/** Sends one message right now (even if it would be skipped as empty) to the linked chats. */
export async function testNotify(kind: NotifyKind): Promise<TgState> {
  await requireApiUnlocked();
  if (!asKind(kind)) return { error: "Unknown message." };
  if (linkedChats().length === 0) return { error: "Connect the bot and link a chat first (steps 1 and 2)." };
  try {
    await broadcast((await buildMessage(kind, { force: true }))!);
    return { message: `Sent to ${linkedChats().map((c) => c.name).join(", ")}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function sendTest(): Promise<TgState> {
  await requireApiUnlocked();
  if (linkedChats().length === 0) return { error: "Link a chat first." };
  try {
    await broadcast(`✅ <b>Home Hub is connected.</b>\n\nHere's what today's daily calendar would look like:\n\n${await buildMessage("today", { force: true })}`);
    return { message: `Sent to ${linkedChats().map((c) => c.name).join(", ")}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
