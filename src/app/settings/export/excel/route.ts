import { format } from "date-fns";
import { budgetExport } from "@/lib/budget-export";
import { POTS } from "@/lib/budget-sheet";
import { buildXlsx, type Sheet } from "@/lib/xlsx";

const $ = (cents: number | null | undefined) => (cents == null ? null : cents / 100);
const day = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00`) : null);
const money = (cents: number | null | undefined) => ({ money: $(cents) });

// GET /settings/export/excel – the whole Budget tab as a workbook
export async function GET() {
  const d = await budgetExport();
  const p = d.plan;
  const sheets: Sheet[] = [];

  sheets.push({
    name: "Summary",
    columns: [{ header: "Item", width: 42 }, { header: "Value", width: 24 }],
    rows: [
      ["Exported", format(d.generated, "d MMM yyyy, h:mm a")],
      ["Next payday", d.nextPayday ? day(d.nextPayday) : "not set"],
      ["Income per fortnight", money(p.incomeFn)],
      ["Planned outgoings per fortnight", money(p.outgoingFn)],
      ["Left each fortnight (before options)", money(p.remaining)],
      ["Savings from chosen options", money(p.chosen)],
      ["Left each fortnight (after options)", money(p.afterOptions)],
      ["Cash in accounts", money(p.cash)],
      ["Debt owing", money(p.debt)],
      [`Starting savings${p.payOffDebts ? " (after paying debts)" : ""}`, money(p.startingSavings)],
      ["Savings runway (fortnights)", p.runwayFortnights == null ? "not running down" : Number(p.runwayFortnights.toFixed(1))],
      ["Repeat payments per month", money(d.recurring.filter((r) => r.active).reduce((s, r) => s + r.monthly_cents, 0))],
      ["Transactions recorded", d.transactions.length],
    ],
  });

  sheets.push({
    name: "Fortnight plan",
    columns: [
      { header: "Group / line", width: 42 }, { header: "Category", width: 20 }, { header: "Payday pot", width: 26 },
      { header: "Old budget", type: "money" }, { header: "Actual (FN avg)", type: "money" }, { header: "Plan", type: "money" }, { header: "Notes", width: 70 },
    ],
    rows: [
      ...p.groups.flatMap((g) => [
        { bold: true as const, cells: [g.name, null, null, $(g.old), $(g.actual), $(g.budget)] },
        ...g.items.map((l) => [`   ${l.name}`, l.category, POTS[l.pot]?.label ?? l.pot, $(l.old_cents), $(l.actual_cents), $(l.budget_cents), l.notes]),
      ]),
      [],
      { bold: true, cells: ["Total outgoing", null, null, $(p.groups.reduce((s, g) => s + g.old, 0)), $(p.groups.reduce((s, g) => s + g.actual, 0)), $(p.outgoingFn)] },
      { bold: true, cells: ["Total income", null, null, null, null, $(p.incomeFn)] },
      { bold: true, cells: ["Left each fortnight", null, null, null, null, $(p.remaining)] },
    ],
  });

  sheets.push({
    name: "Income",
    columns: [{ header: "Income", width: 34 }, { header: "Per fortnight", type: "money" }, { header: "Counted in plan" }, { header: "Ends", type: "date" }, { header: "Notes", width: 60 }],
    rows: p.income.map((i) => [i.name, $(i.fortnightly_cents), i.included ? "Yes" : "No", day(i.ends_on), i.notes]),
  });

  sheets.push({
    name: "Ways to close the gap",
    columns: [{ header: "Option", width: 52 }, { header: "Saves per fortnight", type: "money", width: 20 }, { header: "Chosen" }, { header: "Notes", width: 70 }],
    rows: [
      ...p.options.map((o) => [o.name, $(o.saves_cents), o.used ? "Yes" : "No", o.notes]),
      { bold: true, cells: ["Total chosen", $(p.chosen)] },
    ],
  });

  sheets.push({
    name: "Savings runway",
    columns: [{ header: "Account / fortnight", width: 36 }, { header: "Type" }, { header: "Balance", type: "money" }, { header: "As of", type: "date" }],
    rows: [
      ...p.balances.map((b) => [b.name, b.kind === "debt" ? "Debt" : "Cash", $(b.amount_cents), day(b.as_of)]),
      [],
      { bold: true, cells: ["Starting savings", null, $(p.startingSavings)] },
      { bold: true, cells: ["Each fortnight", null, $(p.afterOptions)] },
      [],
      { bold: true, cells: ["Projection", "Fortnight", "Savings left"] },
      ...p.projection.map((v, i) => [null, i + 1, $(v)]),
    ],
  });

  sheets.push({
    name: "Payday split",
    columns: [{ header: "Account", width: 30 }, { header: "Per payday", type: "money" }, { header: "What it pays for", width: 40 }],
    rows: Object.entries(POTS).map(([key, pot]) => [pot.label, $((p.pots.get(key) ?? []).reduce((s, l) => s + l.budget_cents, 0)), pot.note]),
  });

  sheets.push({
    name: "Repeat payments",
    columns: [
      { header: "Payment", width: 38 }, { header: "Amount", type: "money" }, { header: "How often" }, { header: "Next due", type: "date" },
      { header: "Per month", type: "money" }, { header: "Category", width: 18 }, { header: "Active" }, { header: "Notes", width: 40 },
    ],
    rows: d.recurring.map((r) => [r.name, $(r.amount_cents), r.frequency, day(r.next_due), $(r.monthly_cents), r.category, r.active ? "Yes" : "Paused", r.notes]),
  });

  sheets.push({
    name: "Goals",
    columns: [{ header: "Goal", width: 34 }, { header: "Target", type: "money" }, { header: "Saved", type: "money" }, { header: "Start", type: "date" }, { header: "Need by", type: "date" }, { header: "Status" }, { header: "Notes", width: 40 }],
    rows: d.goals.map((g) => [g.name, $(g.target_cents), $(g.saved_cents), day(g.start_date), day(g.target_date), g.status, g.notes]),
  });

  sheets.push({
    name: "Category limits",
    columns: [{ header: "Category", width: 26 }, { header: "Monthly limit", type: "money" }, { header: "≈ per fortnight", type: "money" }],
    rows: d.limits.map((l) => [l.category, $(l.monthly_limit_cents), $(Math.round((l.monthly_limit_cents * 12) / 26))]),
  });

  sheets.push({
    name: "Transactions",
    filter: true,
    columns: [
      { header: "Date", type: "date", width: 13 }, { header: "Description", width: 52 }, { header: "Amount", type: "money" },
      { header: "Category", width: 22 }, { header: "Account", width: 24 }, { header: "Source" }, { header: "Notes", width: 30 },
    ],
    rows: d.transactions.map((t) => [day(t.date), t.description, $(t.amount_cents), t.category ?? "Uncategorised", t.account, t.source, t.notes]),
  });

  sheets.push({
    name: "Receipts",
    columns: [{ header: "Date", type: "date", width: 13 }, { header: "Store", width: 24 }, { header: "Total", type: "money" }, { header: "Meal prep" }, { header: "Notes", width: 40 }],
    rows: d.receipts.map((r) => [day(r.date), r.store, $(r.total_cents), r.is_meal_prep ? "Yes" : "", r.notes]),
  });

  return new Response(Buffer.from(buildXlsx(sheets)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Home Hub budget ${format(d.generated, "yyyy-MM-dd")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
