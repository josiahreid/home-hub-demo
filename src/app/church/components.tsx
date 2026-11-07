import { format, parseISO } from "date-fns";
import { today } from "@/lib/format";
import { cx } from "@/components/ui";

/** Calendar-style date block used in every church list. */
export function DateBlock({ date, kind }: { date: string; kind?: string }) {
  const d = parseISO(date);
  return (
    <div className={cx(
      "flex w-12 shrink-0 flex-col items-center rounded-lg py-1",
      date === today() ? "bg-accent text-accent-ink" : kind === "event" ? "bg-info-soft text-info" : "bg-surface-2",
    )}>
      <span className="text-[10px] font-medium uppercase">{format(d, "EEE")}</span>
      <span className="text-lg leading-tight font-semibold">{format(d, "d")}</span>
      <span className="text-[10px] uppercase">{format(d, "MMM")}</span>
    </div>
  );
}
