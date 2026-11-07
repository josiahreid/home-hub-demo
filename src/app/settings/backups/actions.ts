"use server";

import { revalidatePath } from "next/cache";
import { setSetting } from "@/lib/db";
import { makeBackup } from "@/lib/backup";

export type BackupState = { message?: string; error?: string };

export async function backupNow(): Promise<BackupState> {
  try {
    const file = makeBackup("manual");
    revalidatePath("/settings/backups");
    return { message: `Backed up: ${file}` };
  } catch (e) {
    return { error: `Couldn't make a backup: ${(e as Error).message}` };
  }
}

export async function setDailyBackups(fd: FormData) {
  setSetting("backup_daily_on", fd.has("on") ? "1" : "0");
  revalidatePath("/settings/backups");
}
