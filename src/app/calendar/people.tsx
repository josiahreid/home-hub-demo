"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cx } from "@/components/ui";
import { PEOPLE_COOKIE } from "@/lib/calendar-people";

// remembered on this device for about a year
function remember(slugs: string[]) {
  document.cookie = `${PEOPLE_COOKIE}=${slugs.join(",")}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
}

/**
 * One switch per family member on the main calendar. Off to start: their tagged events, project due dates and
 * wish list buy-by dates stay on their own Calendar tab until switched on here. Remembered on this device.
 */
export function PeopleSwitches({ people, on }: { people: { slug: string; name: string }[]; on: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (people.length === 0) return null;

  function toggle(slug: string) {
    const next = on.includes(slug) ? on.filter((s) => s !== slug) : [...on, slug];
    remember(next);
    start(() => router.refresh());
  }

  return (
    <div className={cx("mb-3 flex flex-wrap items-center gap-1.5 text-sm", pending && "opacity-60")}>
      <span className="mr-1 text-xs text-muted">Also show:</span>
      {people.map((p) => {
        const active = on.includes(p.slug);
        return (
          <button
            key={p.slug}
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => toggle(p.slug)}
            className={cx(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
