"use client";

import { useState } from "react";
import { cx, Input } from "@/components/ui";

type PotLeft = { id: number; name: string; left: number };
const money = (c: number) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Can we afford it?" – type an amount, see which pot it would come from and what's left, or how long to save. */
export function Afford({ pots, savePerFortnight }: { pots: PotLeft[]; savePerFortnight: number }) {
  const [amount, setAmount] = useState("");
  const [potId, setPotId] = useState(pots.find((p) => p.left > 0)?.id ?? pots[0]?.id ?? 0);
  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100) || 0;
  const pot = pots.find((p) => p.id === potId);
  const after = pot ? pot.left - cents : 0;
  const fits = pots.filter((p) => p.left >= cents && cents > 0);
  const fortnights = savePerFortnight > 0 ? Math.ceil(Math.max(0, -after) / savePerFortnight) : null;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$ e.g. 350" className="!w-32" aria-label="How much" />
        <select value={potId} onChange={(e) => setPotId(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-2 text-sm" aria-label="From which pot">
          {pots.map((p) => <option key={p.id} value={p.id}>from {p.name} ({money(p.left)} left)</option>)}
        </select>
      </div>
      {cents > 0 && pot && (
        <div className={cx("rounded-lg p-3", after >= 0 ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn")}>
          {after >= 0 ? (
            <><strong>Yes.</strong> {pot.name} would have {money(after)} left until payday.</>
          ) : (
            <>
              <strong>Not from {pot.name} this fortnight</strong> – it&apos;s {money(-after)} short.
              {fits.length > 0 && <> It would fit in {fits.map((p) => `${p.name} (${money(p.left - cents)} left after)`).join(" or ")}.</>}
              {fortnights != null && fortnights > 0 && <> Saving {money(savePerFortnight)} a fortnight, it&apos;s about {fortnights} fortnight{fortnights === 1 ? "" : "s"} away.</>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
