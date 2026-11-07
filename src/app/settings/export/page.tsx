import Link from "next/link";
import { io } from "next/cache";
import { FileSpreadsheet, FileText } from "lucide-react";
import { all } from "@/lib/db";
import { Card, btn } from "@/components/ui";

export default async function ExportPage() {
  await io();
  const [{ tx, first, last }] = await all<{ tx: number; first: string | null; last: string | null }>(
    "SELECT count(*) AS tx, min(date) AS first, max(date) AS last FROM transactions");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Excel">
        <p className="mb-4 text-sm text-muted">
          The whole budget as a spreadsheet, one sheet each: summary, fortnight plan, income, ways to close the gap, savings runway,
          payday split, repeat payments, goals, category limits, all {tx} transactions{first ? ` (${first} → ${last})` : ""} and receipts.
          Money and dates are real numbers, so you can sort, filter and add formulas.
        </p>
        <a href="/settings/export/excel" className={btn.primary} download>
          <FileSpreadsheet size={16} /> Download Excel (.xlsx)
        </a>
      </Card>
      <Card title="PDF">
        <p className="mb-4 text-sm text-muted">
          A printable budget report with the same sections. It opens the print window; choose <strong>Save as PDF</strong> as the printer
          (on a phone: Share → Print, then pinch out on the preview to save it).
        </p>
        <Link href="/settings/export/pdf" className={btn.primary}>
          <FileText size={16} /> Open PDF report
        </Link>
      </Card>
    </div>
  );
}
