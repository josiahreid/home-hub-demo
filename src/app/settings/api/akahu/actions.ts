"use server";

import { DEMO, DEMO_OFF } from "@/lib/demo";

import { revalidatePath } from "next/cache";
import { setSetting } from "@/lib/db";
import { forgetKey, logApi, apiUnlocked, requireApiUnlocked } from "@/lib/api-lock";
import { akahuState, connectAkahu, disconnectAkahu, syncAkahu } from "@/lib/akahu";

export type AkahuState = { error?: string; message?: string };

const LOCKED = { error: "Settings → API locked itself (30 minutes are up). Reload the page and unlock again." };

function done() {
  revalidatePath("/settings/api", "layout");
  revalidatePath("/budget", "layout");
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function saveAkahuTokens(_prev: AkahuState, fd: FormData): Promise<AkahuState> {
  if (DEMO) return { error: DEMO_OFF };
  if (!(await apiUnlocked())) return LOCKED;
  try {
    const { accounts } = await connectAkahu(text(fd.get("app")), text(fd.get("user")));
    done();
    return { message: `Connected – Akahu shows ${accounts} account${accounts === 1 ? "" : "s"}. Press Sync now to bring transactions in.` };
  } catch (e) {
    logApi("akahu-tokens", false, (e as Error).message);
    return { error: (e as Error).message };
  }
}

export async function removeAkahu() {
  await requireApiUnlocked();
  disconnectAkahu();
  done();
}

function syncMessage(r: Awaited<ReturnType<typeof syncAkahu>>) {
  return `Synced ${r.accounts.length} account${r.accounts.length === 1 ? "" : "s"}: ${r.added} new transaction${r.added === 1 ? "" : "s"}` +
    (r.covered ? `, ${r.covered} skipped (already in imported statements)` : "") + ".";
}

export async function syncNow(): Promise<AkahuState> {
  if (DEMO) return { error: DEMO_OFF };
  if (!(await apiUnlocked())) return LOCKED;
  try {
    const r = await syncAkahu("manual");
    done();
    return { message: syncMessage(r) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * From the Budget page. Doesn't need the API password session: it can only *read* from Akahu, and only works
 * while the key is in memory (someone unlocked Settings → API since Home Hub last started).
 */
export async function syncFromBudget(): Promise<AkahuState> {
  if (DEMO) return { error: DEMO_OFF };
  if (!akahuState().ready) return { error: "Unlock Settings → API once (after each Home Hub restart) to turn the bank feed on." };
  try {
    const r = await syncAkahu("manual");
    done();
    return { message: syncMessage(r) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setAutoSync(fd: FormData) {
  await requireApiUnlocked();
  setSetting("akahu_auto", fd.has("auto") ? "1" : "0");
  done();
}

/** Stops the feed until someone types the password again (drops the key from memory). */
export async function stopSyncing() {
  await requireApiUnlocked();
  forgetKey();
  logApi("akahu-sync", true, "stopped – key removed from memory until the next unlock");
  done();
}
