// Constants and helpers shared by the House pages and actions (no server-only imports).

export const AREAS = ["Kitchen", "Bathroom", "Bedroom", "Living", "Laundry", "Outdoor", "Garage", "Whole house"];

export const FREQ_PRESETS: [number, string][] = [
  [1, "Daily"],
  [2, "Every 2 days"],
  [3, "Twice weekly"],
  [7, "Weekly"],
  [14, "Fortnightly"],
  [30, "Monthly"],
  [90, "Quarterly"],
  [182, "6-monthly"],
  [365, "Yearly"],
];

export function freqLabel(days: number): string {
  return FREQ_PRESETS.find(([d]) => d === days)?.[1] ?? `Every ${days} days`;
}

/** Options for a frequency <Select>, including a custom value if it isn't a preset. */
export function freqOptions(current?: number): [string, string][] {
  const opts = FREQ_PRESETS.map(([d, l]) => [String(d), l] as [string, string]);
  if (current != null && !FREQ_PRESETS.some(([d]) => d === current)) {
    opts.push([String(current), `Every ${current} days`]);
    opts.sort((a, b) => Number(a[0]) - Number(b[0]));
  }
  return opts;
}

/** [name, area, every_days] */
export const STARTER_CLEANING: [string, string, number][] = [
  ["Wipe benches & stovetop", "Kitchen", 1],
  ["Empty dishwasher / dishes", "Kitchen", 1],
  ["Clean microwave", "Kitchen", 7],
  ["Wipe out fridge & toss old food", "Kitchen", 7],
  ["Clean oven", "Kitchen", 90],
  ["Clean toilet", "Bathroom", 7],
  ["Clean shower & basin", "Bathroom", 7],
  ["Wash bath mats & towels", "Bathroom", 7],
  ["Change bed sheets", "Bedroom", 7],
  ["Flip / rotate mattress", "Bedroom", 182],
  ["Vacuum floors", "Whole house", 7],
  ["Mop hard floors", "Whole house", 14],
  ["Dust surfaces", "Living", 7],
  ["Wash windows (inside)", "Whole house", 90],
  ["Clean washing machine & lint filter", "Laundry", 30],
  ["Take out rubbish & recycling", "Kitchen", 3],
];

export const PROJECT_STATUSES: [string, string][] = [
  ["idea", "Idea"],
  ["planning", "Planning"],
  ["in_progress", "In progress"],
  ["done", "Done"],
];

export const QUOTE_STATUSES: [string, string][] = [
  ["received", "Received"],
  ["accepted", "Accepted"],
  ["declined", "Declined"],
];

export function statusLabel(s: string) {
  return PROJECT_STATUSES.find(([v]) => v === s)?.[1] ?? s;
}

export function quoteCostDescription(supplier: string, description: string | null) {
  return description ? `Quote: ${supplier} — ${description}` : `Quote: ${supplier}`;
}
