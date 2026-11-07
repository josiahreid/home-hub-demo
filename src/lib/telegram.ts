import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { db, getSetting, run, setSetting } from "./db";
import { iso, today } from "./format";
import { upcoming } from "./upcoming";
import { buildMessage, notifyConfig } from "./notify";
import { CAL_CATS } from "./notify-format";
import { todoGroups, type TodoRow } from "./todo-groups";

/**
 * Home Hub's Telegram bot. Everything goes out from this PC to Telegram (long polling),
 * so nothing has to be reachable from the internet. Only linked chats can use commands.
 */

export type Chat = { id: number; name: string };
export type SeenChat = Chat & { at: string };
/** The scheduled messages live in notify.ts; this is just whether linked chats can use commands. */
export type Prefs = { commands: boolean };
export const DEFAULT_PREFS: Prefs = { commands: true };

const json = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(getSetting(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};

export const telegramToken = () => getSetting("telegram_token") ?? null;
export const linkedChats = () => json<Chat[]>("telegram_chats", []);
export const seenChats = () => json<SeenChat[]>("telegram_seen_chats", []);
export const telegramPrefs = (): Prefs => ({ ...DEFAULT_PREFS, ...json<Partial<Prefs>>("telegram_prefs", {}) });
export const telegramStatus = () => json<{ bot?: string; lastPoll?: string; error?: string; errorAt?: string }>("telegram_status", {});

export function setTelegramStatus(patch: Record<string, string | undefined>) {
  setSetting("telegram_status", JSON.stringify({ ...telegramStatus(), ...patch }));
}

// ── Bot API ──

/** Calls the Telegram Bot API. Errors never include the token. */
export async function tg<T = unknown>(method: string, params: Record<string, unknown> = {}, token = telegramToken(), timeoutMs = 15_000): Promise<T> {
  if (!token) throw new Error("No bot token saved yet.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e: Error) => {
    throw new Error(`Couldn't reach Telegram (${e.name === "TimeoutError" ? "timed out" : "no connection"}).`);
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!body.ok) {
    const why = body.description ?? `HTTP ${res.status}`;
    throw new Error(res.status === 401 || res.status === 404 ? "Telegram rejected the token – check it was copied in full." : `Telegram: ${why}`.replaceAll(token, "•••"));
  }
  return body.result as T;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendTo(chatId: number, html: string, extra: Record<string, unknown> = {}) {
  const sent = await tg<{ message_id: number }>("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
  remember(chatId, sent.message_id);
  return sent;
}

// ── tidying up: /clear deletes what's been said in the chat (Telegram allows it for 48 hours) ──

const KEEP_MS = 48 * 3600_000;
type Remembered = Record<string, { id: number; at: number }[]>;

/** Notes a message in a chat so /clear can delete it later. Only the last 48 hours are kept. */
function remember(chatId: number, messageId: number) {
  const all = json<Remembered>("telegram_msgs", {});
  const now = Date.now();
  const list = (all[chatId] ?? []).filter((m) => now - m.at < KEEP_MS);
  list.push({ id: messageId, at: now });
  all[chatId] = list.slice(-500);
  setSetting("telegram_msgs", JSON.stringify(all));
}

/** Deletes everything Home Hub remembers from the last 48 hours in this chat – its own messages and yours. */
async function clearChat(chatId: number) {
  const all = json<Remembered>("telegram_msgs", {});
  const now = Date.now();
  // a little under 48 hours, so Telegram doesn't refuse ones right on the limit
  const ids = (all[chatId] ?? []).filter((m) => now - m.at < KEEP_MS - 5 * 60_000).map((m) => m.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      await tg("deleteMessages", { chat_id: chatId, message_ids: batch });
      deleted += batch.length;
    } catch {
      // one bad id fails the whole batch – fall back to one at a time
      for (const id of batch) {
        try {
          await tg("deleteMessage", { chat_id: chatId, message_id: id });
          deleted++;
        } catch {}
      }
    }
  }
  delete all[chatId];
  setSetting("telegram_msgs", JSON.stringify(all));
  return deleted;
}

/** Quick-command buttons that sit under the message box in the chat – tap instead of typing. */
const QUICK: Record<string, string> = {
  "📅 Today": "today", "🌙 Tomorrow": "tomorrow", "✅ To-dos": "todos", "🛒 Groceries": "groceries", "🗑 Bins": "bins", "⛪ Church": "church", "🧹 Clear": "clear",
};

const family = () => db.prepare("SELECT slug, name FROM members ORDER BY sort, id").all() as { slug: string; name: string }[];
/** "✅ Default Name's to-dos" – a button for each family member. */
const personButton = (name: string) => `✅ ${name}'s to-dos`;

/** The buttons, with a "<name>'s to-dos" row for the family members (two to a row). */
function keyboard() {
  const people = family().map((m) => ({ text: personButton(m.name) }));
  const rows: { text: string }[][] = [];
  for (let i = 0; i < people.length; i += 2) rows.push(people.slice(i, i + 2));
  return [
    [{ text: "📅 Today" }, { text: "🌙 Tomorrow" }],
    [{ text: "✅ To-dos" }, { text: "🛒 Groceries" }],
    ...rows,
    [{ text: "🗑 Bins" }, { text: "⛪ Church" }],
    [{ text: "🧹 Clear" }],
  ];
}
const withKeyboard = () => ({ reply_markup: { keyboard: keyboard(), resize_keyboard: true, is_persistent: true } });

/** A tapped button's label → the command it stands for (a person's to-do button → "/todos personA"). */
function fromButton(text: string) {
  const t = text.trim();
  if (QUICK[t]) return `/${QUICK[t]}`;
  const person = family().find((m) => personButton(m.name) === t);
  return person ? `/todos ${person.slug}` : text;
}

/** Puts the commands in the bot's menu (the Menu button / typing "/"), so nobody has to set them up in BotFather. */
export async function registerCommands(token = telegramToken()) {
  if (!token) return;
  await tg("setMyCommands", { commands: COMMANDS.map(([command, description]) => ({ command, description: description.slice(0, 256) })) }, token);
}

export async function broadcast(html: string) {
  const errors: string[] = [];
  for (const c of linkedChats()) {
    try {
      await sendTo(c.id, html);
    } catch (e) {
      errors.push(`${c.name}: ${(e as Error).message}`);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}

// ── commands (only from linked chats) ──

export const COMMANDS: [string, string][] = [
  ["today", "What's on today"],
  ["tomorrow", "What's on tomorrow (and bins)"],
  ["todos", "Open to-dos – everyone's, or one person's: /todos personA"],
  ["groceries", "The grocery list"],
  ["add", "Add to the grocery list: /add milk, bread"],
  ["urgent", "Add as urgent: /urgent nappies"],
  ["bins", "Next bin days"],
  ["church", "Church in the next two weeks"],
  ["workout", "Today's workouts – everyone's"],
  ["todo", "Add an important to-do: /todo ring the plumber"],
  ["wish", "Add to Default Name 2's wish list: /wish Kindle"],
  ["clear", "Tidy up: delete the chat's last 48 hours"],
  ["help", "Show the buttons and commands"],
];

type Update = { update_id: number; message?: { message_id: number; text?: string; chat: { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string } } };

function chatName(c: NonNullable<Update["message"]>["chat"]) {
  return c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || String(c.id);
}

export async function handleUpdate(u: Update) {
  const m = u.message;
  if (!m?.text) return;
  const chat = m.chat;
  const linked = linkedChats().some((c) => c.id === chat.id);

  // remember who has said hello so they can be linked from the settings page
  if (!linked) {
    const seen = seenChats().filter((c) => c.id !== chat.id);
    seen.unshift({ id: chat.id, name: chatName(chat), at: new Date().toISOString() });
    setSetting("telegram_seen_chats", JSON.stringify(seen.slice(0, 10)));
    if (m.text.startsWith("/start")) {
      await sendTo(chat.id, "👋 Hi! To use Home Hub here, open Home Hub → <b>Settings → API → Telegram bot</b> and press <b>Link</b> next to this chat.");
    }
    return;
  }

  remember(chat.id, m.message_id); // so /clear can tidy your messages too
  const prefs = telegramPrefs();
  // a quick-command button sends its label; turn it into the command it stands for
  const text = fromButton(m.text);
  const [cmdRaw, ...rest] = text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/^\//, "").replace(/@.*$/, "");
  const arg = rest.join(" ").trim();
  if (!prefs.commands && cmd !== "start") return;

  switch (cmd) {
    case "start":
    case "help":
      return sendTo(chat.id, `🏠 <b>Home Hub</b>\nTap a button below, or:\n${COMMANDS.map(([c, d]) => `/${c} – ${esc(d)}`).join("\n")}`, withKeyboard());
    case "clear": {
      await clearChat(chat.id);
      // a fresh message so the buttons stay; the next /clear removes it too
      return sendTo(chat.id, "🧹 All tidy.", withKeyboard());
    }
    case "add":
    case "urgent": {
      if (!arg) return sendTo(chat.id, `Send it like this: /${cmd} milk, bread`);
      const { addGrocery } = await import("./groceries");
      const names = arg.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
      const added = names.filter((n) => addGrocery(n, cmd === "urgent")?.added);
      const already = names.filter((n) => !added.includes(n));
      return sendTo(chat.id, [
        added.length ? `🛒 Added${cmd === "urgent" ? " (urgent)" : ""}: <b>${esc(added.join(", "))}</b>` : "",
        already.length ? `Already on the list: ${esc(already.join(", "))}` : "",
      ].filter(Boolean).join("\n"));
    }
    case "church": {
      const items = (await upcoming(today(), iso(addDays(new Date(), 14)))).filter((i) => i.kind === "church");
      return sendTo(chat.id, items.length
        ? `⛪ <b>Church – next two weeks</b>\n${items.map((i) => `${format(parseISO(i.date), "EEE d MMM")}${i.time ? ` ${i.time}` : ""} – ${esc(i.title)}`).join("\n")}`
        : "Nothing church-related in the next two weeks.");
    }
    case "today":
    case "tomorrow": {
      // every category, whatever the scheduled message leaves out
      const c = notifyConfig();
      const config = { ...c, [cmd]: { ...c[cmd], cats: CAL_CATS.map((x) => x.value) } };
      return sendTo(chat.id, (await buildMessage(cmd, { force: true, config }))!);
    }
    case "workout": {
      const { familyToday } = await import("./workout");
      const people = familyToday();
      if (!people.length) return sendTo(chat.id, "Nobody has the Workout tab switched on.");
      const lines = people.map((p) => {
        const plan = p.planned.map((w) => `${esc(w.name)} ${w.done ? "✅" : "⬜"}`);
        const extra = p.extra.map((n) => `${esc(n)} ✅`);
        return `<b>${esc(p.name)}</b>: ${[...plan, ...extra].join(", ") || "rest day"}`;
      });
      return sendTo(chat.id, `💪 <b>Workouts today</b>\n${lines.join("\n")}`);
    }
    case "groceries":
      return sendTo(chat.id, (await buildMessage("groceries")) ?? "The grocery list is empty. 🎉");
    case "bins": {
      const bins = (await upcoming(today(), iso(addDays(new Date(), 21)))).filter((i) => i.kind === "bin");
      return sendTo(chat.id, bins.length ? `🗑 <b>Bin days</b>\n${bins.map((b) => `${format(parseISO(b.date), "EEE d MMM")} – ${esc(b.title.replace(" bin out", ""))}`).join("\n")}` : "No bin schedule set up yet.");
    }
    case "todo": {
      if (!arg) return sendTo(chat.id, "Send it like this: /todo ring the plumber");
      run("INSERT INTO todos (title, important) VALUES (?, 1)", arg.slice(0, 200));
      return sendTo(chat.id, `✅ Added to-do: <b>${esc(arg)}</b>`);
    }
    case "todos": {
      const members = family();
      // "/todos personA" (or the "Default Name's to-dos" button): just that person's
      const who = arg ? members.find((p) => p.slug === arg.toLowerCase() || p.name.toLowerCase() === arg.toLowerCase()) : undefined;
      if (arg && !who) return sendTo(chat.id, `I don't know ${esc(arg)}. Try: ${members.map((p) => `/todos ${p.slug}`).join(", ")}`);
      const all = db.prepare("SELECT title, person, category, due, important FROM todos WHERE done_at IS NULL ORDER BY sort, id").all() as TodoRow[];
      const open = who ? all.filter((t) => t.person === who.slug) : all;
      if (!open.length) return sendTo(chat.id, who ? `Nothing on ${esc(who.name)}'s list. 🎉` : "Nothing to do. 🎉");
      // one block per person (and work / personal), then everyone's – up to 10 in each
      const blocks = todoGroups(open, members).map((g) => [
        `<b>${esc(g.label)}</b>`,
        ...g.items.slice(0, 10).map((t) => `${t.important ? "⭐" : "•"} ${esc(t.title)}${t.due ? ` <i>(${format(parseISO(t.due), "d MMM")})</i>` : ""}`),
        ...(g.items.length > 10 ? [`<i>…and ${g.items.length - 10} more</i>`] : []),
      ].join("\n"));
      return sendTo(chat.id, `📝 <b>${who ? `${esc(who.name)}'s to-dos` : "To do"}</b>\n\n${blocks.join("\n\n")}`);
    }
    case "wish": {
      if (!arg) return sendTo(chat.id, "Send it like this: /wish Kindle Paperwhite");
      const list = db.prepare("SELECT l.id, l.name FROM wish_lists l JOIN members m ON m.id = l.member_id ORDER BY m.sort, m.id, l.sort, l.id LIMIT 1").get() as { id: number; name: string } | undefined;
      run("INSERT INTO wishlist (item, occasion, priority, list_id) VALUES (?, 'Any time', 2, ?)", arg.slice(0, 200), list?.id ?? 1);
      return sendTo(chat.id, `🎁 Added to ${esc(list?.name ?? "Default Name 2")}'s wish list: <b>${esc(arg)}</b>`);
    }
    default:
      if (m.text.startsWith("/")) return sendTo(chat.id, "I don't know that one. Try /help");
  }
}
