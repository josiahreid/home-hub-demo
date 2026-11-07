import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { all, get } from "./db";
import type { Member } from "./family";

export const members = () => all<Member>("SELECT * FROM members ORDER BY sort, id");

/** The member whose page this is (from the first part of the address), or a 404. */
export const memberBySlug = cache(async (slug: string): Promise<Member> => {
  const m = await get<Member>("SELECT * FROM members WHERE slug = ?", decodeURIComponent(slug).toLowerCase());
  if (!m) notFound();
  return m;
});
