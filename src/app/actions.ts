"use server";

import { revalidatePath } from "next/cache";
import { removeSampleData } from "@/lib/sample";

export async function clearSampleData() {
  removeSampleData();
  revalidatePath("/", "layout");
}

// ── who's using this device (the "Who are you?" screen) ──

export async function chooseUser(fd: FormData) {
  const { cookies } = await import("next/headers");
  const { db } = await import("@/lib/db");
  const { USER_COOKIE } = await import("@/lib/current-user");
  const slug = String(fd.get("slug") ?? "");
  if (!db.prepare("SELECT 1 FROM members WHERE slug = ?").get(slug)) return;
  (await cookies()).set(USER_COOKIE, slug, { maxAge: 60 * 60 * 24 * 400, sameSite: "lax", httpOnly: true, path: "/" });
  revalidatePath("/", "layout");
}

export async function switchUser() {
  const { cookies } = await import("next/headers");
  const { USER_COOKIE } = await import("@/lib/current-user");
  (await cookies()).delete(USER_COOKIE);
  revalidatePath("/", "layout");
}
