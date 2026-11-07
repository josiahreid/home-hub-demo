import "server-only";
import { getSetting, setSetting } from "./db";
import type { Item } from "./upcoming";

export type Kind = Item["kind"];

// Distinct defaults so every kind is readable at a glance; each can be changed from the calendar legend.
export const DEFAULT_COLORS: Record<Kind, string> = {
  event: "#4f86e8",
  church: "#8b6fe0",
  todo: "#e6a23c",
  payment: "#d9822b",
  bin: "#3f9f74",
  car: "#e05d5d",
  chore: "#9c9991",
  plan: "#2aa198",
  utility: "#c2410c",
  meal: "#6aa84f",
  feed: "#64748b",
};

const HEX = /^#[0-9a-f]{6}$/i;

export function calendarColors(): Record<Kind, string> {
  let saved: Partial<Record<Kind, string>> = {};
  try {
    saved = JSON.parse(getSetting("calendar_colors") ?? "{}");
  } catch {}
  const out = { ...DEFAULT_COLORS };
  for (const k of Object.keys(out) as Kind[]) if (saved[k] && HEX.test(saved[k]!)) out[k] = saved[k]!;
  return out;
}

export function saveCalendarColor(kind: string, color: string) {
  if (!(kind in DEFAULT_COLORS) || !HEX.test(color)) return;
  const current = calendarColors();
  setSetting("calendar_colors", JSON.stringify({ ...current, [kind]: color.toLowerCase() }));
}

export function resetCalendarColorsTo() {
  setSetting("calendar_colors", "{}");
}
