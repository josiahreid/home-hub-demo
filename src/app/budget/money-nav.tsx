import Link from "next/link";
import { cx } from "@/components/ui";

const LINKS = [
  { href: "/budget/transactions", label: "All transactions" },
  { href: "/budget/sort", label: "Sort" },
  { href: "/budget/import", label: "Upload statements" },
  { href: "/budget/receipts", label: "Receipts" },
  { href: "/budget/settings", label: "Shop rules" },
];

/** The pages that live under the Transactions tab. */
export function MoneyNav({ active, unsorted }: { active: string; unsorted?: number }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-1.5 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cx("rounded-full px-3 py-1", active === l.href ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink")}
        >
          {l.label}
          {l.href === "/budget/sort" && unsorted ? <span className="ml-1 rounded-full bg-warn px-1.5 text-xs text-white tabular-nums">{unsorted}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
