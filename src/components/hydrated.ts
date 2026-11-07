"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False until the page's JavaScript has started. Buttons that use it stay disabled until then, so a tap
 * before the page is ready can't send an old-style full-page form post (which `next dev` mishandles when
 * the action reads cookies).
 */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
