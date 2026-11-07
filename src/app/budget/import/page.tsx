import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { all } from "@/lib/db";
import { niceDate } from "@/lib/format";
import { folderSummary } from "@/lib/statement-folder";
import { hasSampleData } from "@/lib/sample";
import { onTailnet } from "@/lib/deploy";
import { Card, PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";
import { LinkedFolder } from "./linked-folder";
import { MoneyNav } from "../money-nav";
import { BankFeed } from "../bank-feed";

export default async function ImportPage() {
  const [accounts, recent, folder, sample] = await Promise.all([
    all<{ id: number; name: string }>("SELECT id, name FROM accounts ORDER BY name"),
    all<{ name: string | null; n: number; first: string; last: string }>(
      `SELECT a.name, count(*) AS n, min(t.date) AS first, max(t.date) AS last
         FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
        WHERE t.source IN ('import', 'akahu') GROUP BY t.account_id ORDER BY a.name`),
    folderSummary(),
    hasSampleData(),
  ]);
  // offer iCloud Drive on this PC as a starting point
  const icloud = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "iCloudDrive") : "";
  const suggestion = icloud && existsSync(icloud) ? icloud : "";
  // On the server iCloud Drive isn't there, so the linked folder only shows if a /statements folder was mounted (or one is already linked).
  const showLinked = !onTailnet || !!folder.folder || existsSync("/statements");

  return (
    <>
      <PageHeader title="Import statements" subtitle="Westpac and Q Card PDFs, PayPal and bank CSVs. Anything already imported is skipped, so re-importing is always safe." />
      <MoneyNav active="/budget/import" />

      {sample && (
        <div className="mb-4 rounded-xl border border-warn bg-warn-soft p-3 text-sm text-warn">
          Sample data is still loaded. Remove it on <Link href="/" className="underline">Home</Link> before importing your real statements, so the two don&apos;t mix.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Upload statements">
            <ImportForm accounts={accounts} />
          </Card>
          {showLinked && (
            <Card title="Linked folder (this PC only)">
              <LinkedFolder folder={folder.folder} read={folder.read} imported={folder.imported} lastRead={folder.lastRead} suggestion={suggestion} />
              {onTailnet && (
                <p className="mt-2 text-xs text-muted">On the server, the folder has to be mounted into the container first – see DEPLOY.md.</p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <BankFeed />
          <Card title="What can be read">
            <ul className="space-y-2 text-sm text-muted">
              <li><strong className="text-ink">Westpac PDF statements</strong> – Everyday, savings and home loan. Each goes to its own account, and is checked against its opening and closing balance.</li>
              <li><strong className="text-ink">Q Mastercard PDF statements</strong>.</li>
              <li><strong className="text-ink">PayPal</strong> activity CSV.</li>
              <li><strong className="text-ink">CSV exports</strong> from ANZ, ASB, BNZ, Westpac, Kiwibank (pick the account when importing).</li>
            </ul>
            <p className="mt-3 text-xs text-muted">Money moving between your own accounts, Q Card payments and home-loan entries are marked as <em>Transfers</em> so they don&apos;t count as spending.</p>
          </Card>
          {recent.length > 0 && (
            <Card title="Imported so far">
              <ul className="divide-y divide-line text-sm">
                {recent.map((r, i) => (
                  <li key={i} className="py-1.5">
                    <div className="font-medium">{r.name ?? "No account"}</div>
                    <div className="text-xs text-muted">{r.n} transactions · {niceDate(r.first)} → {niceDate(r.last)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
