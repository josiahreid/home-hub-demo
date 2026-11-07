"use client";

import { useEffect } from "react";

/** Keyboard shortcuts on the sorting card: 1–9 press that category's button, S skips. */
export function SortKeys() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (/^[1-9]$/.test(e.key)) document.querySelector<HTMLButtonElement>(`button[data-key="${e.key}"]`)?.click();
      if (e.key.toLowerCase() === "s") document.querySelector<HTMLAnchorElement>("a[data-skip]")?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
