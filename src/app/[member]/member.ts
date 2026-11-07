import "server-only";
import { notFound } from "next/navigation";
import { memberBySlug } from "@/lib/members";
import { hasFeature, type Feature, type Member } from "@/lib/family";

/** The member for this page, or a 404 if this part of their page is switched off. */
export async function memberWith(params: Promise<{ member: string }>, feature: Feature): Promise<Member> {
  const m = await memberBySlug((await params).member);
  if (!hasFeature(m, feature)) notFound();
  return m;
}
