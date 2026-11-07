import "server-only";
import { all } from "@/lib/db";
import type { WishList } from "./shared";

/** One member's wish lists, their own first. */
export async function wishLists(memberId: number) {
  const lists = await all<WishList>("SELECT * FROM wish_lists WHERE member_id = ? ORDER BY sort, id", memberId);
  return { lists, firstId: lists[0]?.id ?? 0 };
}
