"use client";

import { FEATURES, type Feature } from "@/lib/family";

/**
 * Tick boxes for what a member's page has. With `autoSave` (a member's own card) ticking one saves straight away –
 * the tab appears or goes without having to find the Save button.
 */
export function FeaturePicker({ selected, autoSave }: { selected: Feature[]; autoSave?: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-medium text-muted">Their page has{autoSave && <span className="font-normal"> · saves as soon as you tick</span>}</legend>
      {FEATURES.map((f) => (
        <label key={f.value} className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={f.value}
            defaultChecked={selected.includes(f.value)}
            onChange={autoSave ? (e) => e.currentTarget.form?.requestSubmit() : undefined}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">{f.label}</span>
            <span className="block text-xs text-muted">{f.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
