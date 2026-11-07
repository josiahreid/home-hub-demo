"use server";

import { revalidatePath } from "next/cache";
import { all, run, setSetting } from "@/lib/db";
import { int, str } from "@/lib/format";
import { hiddenFeeds, inFeedOrder } from "@/lib/calendar-view";

/** Move an imported calendar up or down the Calendar page. */
export async function moveFeed(fd: FormData) {
  const id = int(fd.get("id"));
  const step = fd.get("dir") === "up" ? -1 : 1;
  const feeds = inFeedOrder(await all<{ id: number; name: string }>("SELECT id, name FROM calendar_feeds"));
  const i = feeds.findIndex((f) => f.id === id);
  const j = i + step;
  if (i === -1 || j < 0 || j >= feeds.length) return;
  [feeds[i], feeds[j]] = [feeds[j], feeds[i]];
  setSetting("calendar_feed_order", feeds.map((f) => f.id).join(","));
  revalidatePath("/calendar");
}

/** Fold an imported calendar away on the Calendar page (its events stay and keep syncing), or show it again. */
export async function toggleFeedHidden(fd: FormData) {
  const id = int(fd.get("id"));
  if (!id) return;
  const hidden = hiddenFeeds();
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  setSetting("calendar_feed_hidden", [...hidden].join(","));
  revalidatePath("/calendar");
}

/** Give an imported calendar a new name (shown on the Calendar page; the next sync keeps it). */
export async function renameFeed(fd: FormData) {
  const id = int(fd.get("id"));
  const name = str(fd.get("name"))?.slice(0, 80);
  if (!id || !name) return;
  run("UPDATE calendar_feeds SET name = ? WHERE id = ?", name, id);
  revalidatePath("/calendar");
}
