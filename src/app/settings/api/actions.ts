"use server";

import { revalidatePath } from "next/cache";
import {
  apiUnlocked, changeApiPassword, createApiPassword, hasApiPassword, lockApi, passwordProblem, resetApiLock, unlockApi,
} from "@/lib/api-lock";

export type LockState = { error?: string; message?: string };

const LOCKED = { error: "Settings → API locked itself (30 minutes are up). Reload the page and unlock again." };

function done() {
  revalidatePath("/settings/api", "layout");
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function setupPassword(_prev: LockState, fd: FormData): Promise<LockState> {
  // only the very first time – after that the password can only be changed when unlocked
  if (hasApiPassword()) return { error: "A password is already set." };
  const pw = text(fd.get("password"));
  if (pw !== text(fd.get("confirm"))) return { error: "The two passwords don't match." };
  const problem = passwordProblem(pw);
  if (problem) return { error: problem };
  await createApiPassword(pw);
  done();
  return {};
}

export async function unlock(_prev: LockState, fd: FormData): Promise<LockState> {
  const r = await unlockApi(text(fd.get("password")));
  if (!r.ok) return { error: r.error };
  done();
  return {};
}

export async function lock() {
  await lockApi();
  done();
}

export async function changePassword(_prev: LockState, fd: FormData): Promise<LockState> {
  if (!(await apiUnlocked())) return LOCKED;
  const next = text(fd.get("next"));
  if (next !== text(fd.get("confirm"))) return { error: "The two new passwords don't match." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const err = await changeApiPassword(text(fd.get("current")), next);
  if (err) return { error: err };
  done();
  return { message: "Password changed. Other browsers have to unlock again." };
}

/** Forgotten password. Anyone could press this, so it also deletes every saved API token – nothing is revealed. */
export async function resetPassword(fd: FormData) {
  if (text(fd.get("confirm")) !== "RESET") return;
  if (await apiUnlocked()) await lockApi();
  resetApiLock();
  done();
}
