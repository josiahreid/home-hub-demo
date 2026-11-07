import { io } from "next/cache";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getSetting } from "@/lib/db";
import { Card, btn, cx } from "@/components/ui";
import { DeleteButton } from "@/components/buttons";
import { clearMealPlannerLink } from "./actions";
import { LinkForm } from "./link-form";

/** Meal prep is done in Meal Planner (a friend's web app); Home Hub just shows it. */
export default async function MealPrep() {
  await io();
  const url = getSetting("meal_planner_url");

  if (!url) {
    return (
      <Card className="max-w-xl">
        <p className="mb-3 text-sm text-muted">Meal prep is done in Meal Planner. Add your link once and it shows right here.</p>
        <LinkForm />
        <p className="mt-3 text-xs text-muted">The link includes your personal Meal Planner key, so it&apos;s stored only in Home Hub&apos;s database.</p>
      </Card>
    );
  }

  // data-fullbleed lets this page use the whole content area (see globals.css)
  return (
    <div data-fullbleed>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-3 text-sm">
          <h1 className="font-semibold">Food</h1>
          <nav className="flex gap-1">
            <Link href="/food/groceries" className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink">Grocery list</Link>
            <span className="rounded-md bg-accent-soft px-2 py-1 font-medium text-accent">Meal prep</span>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <a href={url} target="_blank" rel="noreferrer" className={cx(btn.ghost, btn.small)}>
            <ExternalLink size={14} /> Open in new tab
          </a>
          <DeleteButton action={clearMealPlannerLink} id={0} label="Change link" confirmText="Remove the saved Meal Planner link? You can paste a new one straight after." />
        </div>
      </div>
      {/* Meal Planner runs on its own site; this just shows it inside Home Hub */}
      <iframe
        src={url}
        title="Meal Planner meal prep"
        className="border-0 bg-white"
        allow="clipboard-write"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
