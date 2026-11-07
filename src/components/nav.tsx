"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "./hydrated";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, Car, Church, FolderOpen, Hammer, Home, Gift, ListTodo, PiggyBank, PlugZap, Settings, Shield, Tag, User, UtensilsCrossed, Wrench,
} from "lucide-react";
import { cx } from "./ui";
import { switchUser } from "@/app/actions";
import { Menu, UserRound, X } from "lucide-react";
import { featuresOf, memberHome, type Member } from "@/lib/family";

type NavItem = { href: string; label: string; icon: typeof Home; match?: string };
type NavGroup = { heading?: string; items: NavItem[] };

export type FamilyLink = Pick<Member, "slug" | "name" | "features">;

// Each page's own tabs (Default Name → Projects / Parts, Default Name 2 → wish lists) live inside the page, not here.
// Family members come from Settings → Family members.
function nav(family: FamilyLink[]): NavGroup[] {
  return [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/todos", label: "To do", icon: ListTodo },
    ],
  },
  {
    heading: "Money",
    items: [
      { href: "/budget", label: "Budget", icon: PiggyBank },
      { href: "/food", label: "Food", icon: UtensilsCrossed },
    ],
  },
  {
    heading: "Other",
    items: [
      { href: "/church", label: "Church", icon: Church },
      { href: "/house", label: "House", icon: Wrench },
      { href: "/utilities", label: "Utilities", icon: PlugZap },
      { href: "/car", label: "Car", icon: Car },
      { href: "/insurance", label: "Insurance", icon: Shield },
      { href: "/files", label: "Files", icon: FolderOpen },
    ],
  },
  {
    heading: "Family members",
    items: family.map((m) => ({ href: memberHome(m), match: `/${m.slug}`, label: m.name, icon: memberIcon(m) })),
  },
  { items: [{ href: "/settings", label: "Settings", icon: Settings }] },
  ].filter((g) => g.items.length > 0);
}

/** Hammer for projects, gift for wish lists, tag for price compare – whichever comes first. */
function memberIcon(m: FamilyLink) {
  return { projects: Hammer, wishlists: Gift, prices: Tag }[featuresOf(m)[0] as string] ?? User;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

// Dynamic routes need usePathname() behind Suspense, so the layout renders these with a
// highlight-free fallback (pathname "") until the real path is known.
export function SideNav({ family, me }: { family: FamilyLink[]; me: string | null }) {
  return (
    <Suspense fallback={<SideNavLinks pathname="" family={family} me={me} />}>
      <WithPath render={(p) => <SideNavLinks pathname={p} family={family} me={me} />} />
    </Suspense>
  );
}

/**
 * Phones: a bar with the ☰ button; tapping it slides the whole menu in from the left (the same menu as the
 * sidebar on a computer or iPad). It closes when you pick a page, tap outside it, or press ✕.
 */
export function PhoneMenu({ family, me }: { family: FamilyLink[]; me: string | null }) {
  const [open, setOpen] = useState(false);
  const ready = useHydrated();

  // while it's open: Escape closes it, and the page behind doesn't scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <div className="flex items-center gap-2 px-2 pb-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the menu"
          aria-expanded={open}
          className="flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-2"
        >
          <Menu size={22} strokeWidth={1.8} />
        </button>
        <span className="flex-1 font-semibold">Home Hub</span>
        {me && <span className="flex items-center gap-1 pr-2 text-sm text-muted"><UserRound size={15} strokeWidth={1.8} /> {me}</span>}
      </div>

      {/* on the page itself, not inside the blurred bar (which would trap a full-screen panel inside it) */}
      {ready && createPortal(
        <div className={cx("fixed inset-0 z-50 md:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open} inert={!open}>
          <div onClick={() => setOpen(false)} className={cx("absolute inset-0 bg-black/40 transition-opacity", open ? "opacity-100" : "opacity-0")} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className={cx(
              "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-surface p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-xl transition-transform",
              open ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="mb-4 flex items-center justify-between px-1">
              <span className="px-2 text-lg font-semibold tracking-tight">Home Hub</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close the menu" className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                <X size={20} />
              </button>
            </div>
            <Suspense fallback={<SideNavLinks pathname="" family={family} me={me} onNavigate={() => setOpen(false)} />}>
              <WithPath render={(p) => <SideNavLinks pathname={p} family={family} me={me} onNavigate={() => setOpen(false)} />} />
            </Suspense>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function WithPath({ render }: { render: (pathname: string) => ReactNode }) {
  return render(usePathname());
}

function SideNavLinks({ pathname, family, me, onNavigate }: { pathname: string; family: FamilyLink[]; me: string | null; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-4">
      {nav(family).map((group, g) => (
        <div key={g} className="flex flex-col gap-0.5">
          {group.heading && (
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{group.heading}</div>
          )}
          {group.items.map(({ href, match, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                isActive(pathname, match ?? href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
        </div>
      ))}
      {me && (
        <form action={switchUser} className="border-t border-line pt-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-ink" title="Pick who's using this device">
            <UserRound size={18} strokeWidth={1.8} />
            <span className="flex-1"><span className="font-medium text-ink">{me}</span> · switch</span>
          </button>
        </form>
      )}
    </nav>
  );
}

/** Sub-tabs inside a section, e.g. Default Name → Projects / Parts. */
export function SubTabs({ tabs }: { tabs: Tab[] }) {
  return (
    <Suspense fallback={<SubTabLinks tabs={tabs} pathname="" />}>
      <WithPath render={(p) => <SubTabLinks tabs={tabs} pathname={p} />} />
    </Suspense>
  );
}

/** `also`: other pages that count as this tab (e.g. Sort and Receipts are part of Transactions). */
type Tab = { href: string; label: string; also?: string[] };

function SubTabLinks({ tabs, pathname }: { tabs: Tab[]; pathname: string }) {
  // Most specific tab wins, so /house/projects/3 highlights "Projects" and /budget only highlights on itself.
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const active = tabs
    .flatMap((t) => [t.href, ...(t.also ?? [])].filter(under).map((p) => ({ href: t.href, len: p.length })))
    .sort((a, b) => b.len - a.len)[0]?.href;
  return (
    // overflow-y-hidden: the active tab's underline sits 1px over the border, which otherwise shows a tiny scroll bar
    <div className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cx(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
            active === t.href ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
