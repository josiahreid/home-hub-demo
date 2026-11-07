"use server";

import { revalidatePath } from "next/cache";
import { run, setSetting } from "@/lib/db";
import { str } from "@/lib/format";

export type LinkState = { error?: string };

/** Saves the Meal Planner link. It's kept in the database (not the code) because it contains a personal access key. */
export async function saveMealPlannerLink(_prev: LinkState, fd: FormData): Promise<LinkState> {
  const raw = str(fd.get("url"));
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    return { error: "Paste the full Meal Planner link, starting with https://" };
  }
  if (url.protocol !== "https:") return { error: "The link needs to start with https://" };
  setSetting("meal_planner_url", url.toString());
  revalidatePath("/food", "layout");
  return {};
}

export async function clearMealPlannerLink() {
  run("DELETE FROM settings WHERE key = 'meal_planner_url'");
  revalidatePath("/food", "layout");
}
