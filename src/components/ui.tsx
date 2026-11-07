import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="h-full min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold break-words tabular-nums", tone && TONE_TEXT[tone])}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const TONE_TEXT: Record<Tone, string> = {
  neutral: "",
  good: "text-accent",
  warn: "text-warn",
  bad: "text-danger",
  info: "text-info",
};
const TONE_BADGE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  good: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  bad: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE_BADGE[tone])}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer";
export const btn = {
  primary: cx(BTN_BASE, "bg-accent text-accent-ink hover:opacity-90"),
  secondary: cx(BTN_BASE, "border border-line bg-surface hover:bg-surface-2"),
  ghost: cx(BTN_BASE, "hover:bg-surface-2 text-muted hover:text-ink"),
  danger: cx(BTN_BASE, "text-danger hover:bg-danger-soft"),
  small: "!px-2 !py-1 !text-xs",
};

const FIELD = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(FIELD, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cx(FIELD, props.className)} />;
}

export function Select({ options, ...props }: ComponentProps<"select"> & { options: (string | [string, string])[] }) {
  return (
    <select {...props} className={cx(FIELD, props.className)}>
      {options.map((o) => {
        const [value, label] = Array.isArray(o) ? o : [o, o];
        return <option key={value} value={value}>{label}</option>;
      })}
    </select>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1 text-sm", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/** A collapsible "add" form so lists stay the focus of each page. */
export function AddPanel({ label, children, open }: { label: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-xl border border-line bg-surface" open={open}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-accent select-none">
        <span className="group-open:hidden">+ {label}</span>
        <span className="hidden group-open:inline">− {label}</span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const td = "px-3 py-2 align-top";

export function Progress({ value, max, tone = "good" }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const bar = { neutral: "bg-muted", good: "bg-accent", warn: "bg-warn", bad: "bg-danger", info: "bg-info" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cx("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
