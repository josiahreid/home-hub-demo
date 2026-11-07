import "server-only";
import { getSetting, setSetting } from "./db";
import { today } from "./format";
import { broadcast, handleUpdate, linkedChats, registerCommands, setTelegramStatus, telegramToken, tg } from "./telegram";
import { buildMessage, notifyConfig } from "./notify";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const g = globalThis as unknown as { __homeHubTelegram?: boolean };

/** Starts once per server process: long-polls Telegram for messages and sends the scheduled ones. */
export function startTelegramWorker() {
  if (g.__homeHubTelegram) return;
  g.__homeHubTelegram = true;
  void pollLoop();
  setInterval(() => void scheduleTick().catch(() => {}), 30_000);
  // push notifications (to-do reminders) run on the same clock, whether or not Telegram is set up
  setInterval(() => void import("./push").then((p) => p.pushTick()).catch(() => {}), 30_000);
  // a daily database backup (the first check each day; also runs if Telegram isn't set up)
  setInterval(() => void import("./backup").then((b) => b.dailyBackupTick()).catch(() => {}), 60_000);
  // a daily snapshot of how much storage Home Hub uses (Settings → Storage)
  setInterval(() => void import("./storage").then((s) => s.storageTick()).catch(() => {}), 60_000);
  // Akahu bank feed: every 6 hours, only while Settings → API has been unlocked since this start
  setInterval(() => void import("./akahu").then((a) => a.akahuAutoTick()).catch(() => {}), 60_000);
}

async function pollLoop() {
  let menuSetFor: string | null = null;
  for (;;) {
    const token = telegramToken();
    if (!token) {
      await sleep(10_000);
      continue;
    }
    // keep the bot's command menu up to date (once per token per start)
    if (menuSetFor !== token) {
      menuSetFor = token;
      await registerCommands(token).catch(() => {});
    }
    try {
      const offset = Number(getSetting("telegram_offset") ?? 0);
      // waits up to 25s for a message, so this is cheap when nothing is happening
      const updates = await tg<{ update_id: number }[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, token, 35_000);
      setTelegramStatus({ lastPoll: new Date().toISOString(), error: undefined, errorAt: undefined });
      for (const u of updates) {
        setSetting("telegram_offset", String(u.update_id + 1));
        try {
          await handleUpdate(u as Parameters<typeof handleUpdate>[0]);
        } catch (e) {
          setTelegramStatus({ error: `Reply failed: ${(e as Error).message}`, errorAt: new Date().toISOString() });
        }
      }
    } catch (e) {
      setTelegramStatus({ error: (e as Error).message, errorAt: new Date().toISOString() });
      await sleep(15_000);
    }
  }
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Sends each scheduled message once a day, within two hours after its time (if it has anything to say). */
async function scheduleTick() {
  if (!telegramToken() || linkedChats().length === 0) return;
  const config = notifyConfig();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let sent: Record<string, string> = {};
  try {
    sent = JSON.parse(getSetting("telegram_sent") ?? "{}");
  } catch {}

  // church can go out several times (e.g. 7pm two days before and 7am on the day); each slot is its own send
  const jobs = [
    ...(["today", "tomorrow", "groceries"] as const).map((kind) => ({ kind, key: kind as string, time: config[kind].time, daysBefore: undefined as number | undefined })),
    ...config.church.slots.map((x) => ({ kind: "church" as const, key: `church|${x.time}|${x.daysBefore}`, time: x.time, daysBefore: x.daysBefore })),
  ];
  for (const job of jobs) {
    const start = minutes(job.time);
    if (!config[job.kind].on || sent[job.key] === today() || nowMin < start || nowMin >= start + 120) continue;
    sent[job.key] = today(); // mark first so a slow send can't double up
    setSetting("telegram_sent", JSON.stringify(sent));
    try {
      const text = await buildMessage(job.kind, { config, daysBefore: job.daysBefore });
      if (text) await broadcast(text);
    } catch (e) {
      setTelegramStatus({ error: `${job.kind} message: ${(e as Error).message}`, errorAt: new Date().toISOString() });
    }
  }
}
