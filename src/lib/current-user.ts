import "server-only";
import { cookies } from "next/headers";
import { get } from "./db";
import type { Member } from "./family";

/**
 * Who's using this device – picked once on the "Who are you?" screen (no passcodes). It decides whose to-dos
 * and notifications are whose; it isn't a security lock.
 */
export const USER_COOKIE = "hh_user";

export async function currentUser(): Promise<Member | null> {
  const slug = (await cookies()).get(USER_COOKIE)?.value;
  if (!slug) return null;
  return (await get<Member>("SELECT * FROM members WHERE slug = ?", slug)) ?? null;
}
