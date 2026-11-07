"use client";

import Link from "next/link";
import { btn } from "@/components/ui";

/** Shown instead of a page that crashed – the menu stays, so the rest of Home Hub still works. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">This page hit a problem</h1>
      <p className="mt-2 text-sm text-muted">The rest of Home Hub still works. Try again, or go back to the home page.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className={btn.primary}>Try again</button>
        <Link href="/" className={btn.secondary}>Home</Link>
      </div>
      <p className="mt-8 text-xs text-muted">
        Version {process.env.HOME_HUB_COMMIT || "unknown"}
        {digest && <> · error code {digest}</>}
      </p>
    </div>
  );
}
