// Runs once when the Home Hub server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // the public demo runs none of the background jobs (Telegram, bank feed, notifications) – just its nightly reset
  const { DEMO, startDemo } = await import("./lib/demo");
  if (DEMO) return void (await startDemo());
  const { startTelegramWorker } = await import("./lib/telegram-worker");
  startTelegramWorker();
}
