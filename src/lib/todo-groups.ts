/**
 * To-dos split up by whose they are (each family member, then "Everyone") and, within a person, work and
 * personal – so Telegram messages and push notifications don't run everyone's list together.
 */

export type TodoRow = { title: string; person: string | null; category: string | null; important: number; due: string | null };
export type TodoGroup = { label: string; items: TodoRow[] };

const CATS: [string | null, string][] = [["work", "work"], ["personal", "personal"], [null, ""]];

export function todoGroups(rows: TodoRow[], members: { slug: string; name: string }[]): TodoGroup[] {
  const groups: TodoGroup[] = [];
  const known = new Set(members.map((m) => m.slug));
  const owners = [...members.map((m) => ({ slug: m.slug as string | null, name: m.name })), { slug: null, name: "Everyone" }];
  for (const o of owners) {
    // a to-do for someone who's since been removed counts as everyone's
    const mine = rows.filter((r) => (o.slug ? r.person === o.slug : !r.person || !known.has(r.person)));
    if (!mine.length) continue;
    const split = CATS.map(([cat, word]) => ({ word, items: mine.filter((r) => (cat ? r.category === cat : r.category !== "work" && r.category !== "personal")) })).filter((g) => g.items.length);
    // only say "work"/"personal" when it actually separates something
    if (split.length === 1 && !split[0].word) groups.push({ label: o.name, items: mine });
    else for (const g of split) groups.push({ label: g.word ? `${o.name} – ${g.word}` : `${o.name} – other`, items: g.items });
  }
  return groups;
}
