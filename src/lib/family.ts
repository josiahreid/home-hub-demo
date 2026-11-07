// Family members and what each one's page has. No server-only imports, so the menu can use it too.

export type Feature = "projects" | "wishlists" | "prices" | "calendar" | "health" | "workout";

export const FEATURES: { value: Feature; label: string; hint: string }[] = [
  { value: "projects", label: "Projects", hint: "Job cards with steps, plus a parts list with prices – budget planning for projects" },
  { value: "wishlists", label: "Wish lists", hint: "Present ideas, for them and anyone else (kids, family)" },
  { value: "prices", label: "Price compare", hint: "Cards for things you're hunting, with a link and price per shop (and sale prices with end dates)" },
  { value: "calendar", label: "Calendar", hint: "Their own calendar: events tagged for them, project due dates and wish list buy-by dates (hidden on the main calendar unless switched on there)" },
  { value: "health", label: "Health", hint: "Simple health notes: what happened, the date, and notes underneath (doctor visits, jabs, symptoms)" },
  { value: "workout", label: "Workout", hint: "A workout routine: workouts on set days, today's workout to tick off set by set, personal bests and progress" },
];

export type Member = { id: number; slug: string; name: string; features: string; sort: number };

export function featuresOf(m: Pick<Member, "features">): Feature[] {
  const set = new Set(m.features.split(",").map((f) => f.trim()));
  return FEATURES.map((f) => f.value).filter((f) => set.has(f));
}

export const hasFeature = (m: Pick<Member, "features">, f: Feature) => featuresOf(m).includes(f);

/** The tabs on a member's page, in menu order. */
export function memberTabs(m: Pick<Member, "slug" | "features">): { href: string; label: string }[] {
  const tabs: { href: string; label: string }[] = [];
  for (const f of featuresOf(m)) {
    if (f === "projects") tabs.push({ href: `/${m.slug}/projects`, label: "Projects" }, { href: `/${m.slug}/parts`, label: "Parts" });
    if (f === "wishlists") tabs.push({ href: `/${m.slug}/wishlist`, label: "Wish lists" });
    if (f === "prices") tabs.push({ href: `/${m.slug}/prices`, label: "Price compare" });
    if (f === "calendar") tabs.push({ href: `/${m.slug}/calendar`, label: "Calendar" });
    if (f === "health") tabs.push({ href: `/${m.slug}/health`, label: "Health" });
    if (f === "workout") tabs.push({ href: `/${m.slug}/workout`, label: "Workout" });
  }
  return tabs;
}

/** Where a member's link in the menu goes: their first tab, or the settings to switch something on. */
export const memberHome = (m: Pick<Member, "slug" | "features">) => memberTabs(m)[0]?.href ?? `/${m.slug}/projects`;

export function memberSubtitle(m: Pick<Member, "features">): string {
  const f = featuresOf(m);
  if (f.length === 0) return "Nothing switched on yet – choose what this page has in Settings → Family members.";
  const parts = f.map((x) => ({ projects: "projects and parts", wishlists: "wish lists", prices: "price comparing", calendar: "their own calendar", health: "health notes", workout: "a workout routine" })[x]);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `${list[0].toUpperCase()}${list.slice(1)}.`;
}

// Page addresses already used by Home Hub, so a member can't be called "budget" and hide that page.
export const RESERVED_SLUGS = [
  "api", "budget", "calendar", "car", "church", "feed", "files", "house", "meals", "settings", "todos", "utilities",
  "projects", "parts", "wishlist", "prices", "health", "workout", "insurance", "food", "new", "favicon.ico", "_next",
];

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "member";
}
