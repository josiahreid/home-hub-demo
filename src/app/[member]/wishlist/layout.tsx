import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { btn, cx } from "@/components/ui";
import { SubTabs } from "@/components/nav";
import { wishLists } from "./lists";
import { listPath } from "./shared";
import { memberWith } from "../member";

// One tab per wish list: the member's own, plus the kids', family…
export default function WishlistLayout({ children, params }: LayoutProps<"/[member]/wishlist">) {
  return (
    <div>
      <Suspense fallback={<div className="mb-6 h-10 border-b border-line" />}>
        <ListTabs params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function ListTabs({ params }: { params: Promise<{ member: string }> }) {
  const m = await memberWith(params, "wishlists");
  const { lists, firstId } = await wishLists(m.id);
  const tabs = lists.map((l) => ({ href: listPath(l, firstId, m.slug), label: `${l.name}'s wish list` }));
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1"><SubTabs tabs={tabs} /></div>
      <Link href={`/${m.slug}/wishlist/new`} className={cx(btn.secondary, btn.small, "mt-1 shrink-0")}>
        <Plus size={14} /> New wish list
      </Link>
    </div>
  );
}
