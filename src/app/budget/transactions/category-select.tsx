"use client";

import { setCategory } from "../actions";

/** Category picker that saves as soon as it changes. Ticking "remember" also creates a rule for future imports. */
export function CategorySelect({ id, category, description, categories }: { id: number; category: string | null; description: string; categories: string[] }) {
  // First chunk of the description is usually the merchant name.
  const suggestion = description.split(" · ")[0].replace(/\d{2,}.*$/, "").trim().toLowerCase().slice(0, 30);
  return (
    <form action={setCategory} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <select
        name="category"
        defaultValue={category ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded-md border border-line bg-surface px-2 py-1 text-xs ${category ? "" : "text-warn"}`}
      >
        <option value="">Uncategorised</option>
        {categories.map((c) => <option key={c}>{c}</option>)}
      </select>
      <label className="flex items-center gap-1 text-[11px] text-muted">
        <input type="checkbox" name="rule" value={suggestion} disabled={!suggestion} />
        remember for “{suggestion}”
      </label>
    </form>
  );
}
