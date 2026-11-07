import { io } from "next/cache";
import { all } from "@/lib/db";
import { centsToInput, money, niceDate, today } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { Badge, Card, Empty, Field, FormGrid, Input, PageHeader, Stat } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { CameraUpload } from "@/components/camera-upload";
import { deleteReceipt, updateReceipt, uploadReceipt } from "../actions";
import { MoneyNav } from "../money-nav";

type Receipt = { id: number; file_name: string; store: string | null; date: string | null; total_cents: number | null; is_meal_prep: number };

export default async function Receipts({ searchParams }: PageProps<"/budget/receipts">) {
  await io();
  const { saved } = await searchParams;
  const [receipts, month] = await Promise.all([
    all<Receipt>(
      `SELECT r.* FROM receipts r
        ORDER BY coalesce(r.date, r.uploaded_at) DESC LIMIT 200`),
    all<{ meal: number; other: number }>(
      `SELECT coalesce(SUM(CASE WHEN is_meal_prep = 1 THEN total_cents END), 0) AS meal,
              coalesce(SUM(CASE WHEN is_meal_prep = 0 THEN total_cents END), 0) AS other
         FROM receipts WHERE substr(date, 1, 7) = ?`, today().slice(0, 7)),
  ]);

  return (
    <>
      <PageHeader title="Receipts" subtitle="Snap shopping receipts with the camera or add a photo/PDF. Tick meal-prep shops to see what meal prep really costs each month." />
      <MoneyNav active="/budget/receipts" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Meal prep this month" value={money(month[0].meal)} tone="good" />
        <Stat label="Other receipts" value={money(month[0].other)} />
      </div>

      <Card title="Add receipt" className="mb-6">
        {saved && <p className="mb-3 rounded-lg bg-accent-soft p-2 text-sm text-accent">Receipt saved.</p>}
        <form action={uploadReceipt}>
          <FormGrid>
            <div className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3"><span className="text-xs font-medium text-muted">Photo</span><CameraUpload name="photo" required /></div>
            <Field label="Store"><Input name="store" list="stores" placeholder="Pak'nSave" /></Field>
            <Field label="Date"><Input type="date" name="date" defaultValue={today()} /></Field>
            <Field label="Total ($)"><Input name="total" inputMode="decimal" /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="is_meal_prep" defaultChecked /> Meal prep shop
            </label>
          </FormGrid>
          <datalist id="stores">
            {["Woolworths", "New World", "Pak'nSave", "Four Square", "FreshChoice", "The Warehouse", "Bunnings", "Mitre 10"].map((s) => <option key={s} value={s} />)}
          </datalist>
          <div className="mt-3"><SubmitButton>Save receipt</SubmitButton></div>
        </form>
      </Card>

      {receipts.length === 0 ? (
        <Empty>No receipts yet.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {receipts.map((r) => (
            <div key={r.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <a href={fileUrl(r.file_name)!} target="_blank" className="block h-40 bg-surface-2">
                {r.file_name.endsWith(".pdf") ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted">PDF</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(r.file_name)!} alt="" className="h-full w-full object-cover" />
                )}
              </a>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{r.store ?? "Unknown store"}</div>
                    <div className="text-xs text-muted">{niceDate(r.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{money(r.total_cents)}</div>
                    {r.is_meal_prep ? <Badge tone="good">meal prep</Badge> : null}
                  </div>
                </div>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs text-accent">Edit</summary>
                  <form action={updateReceipt} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <Input name="store" defaultValue={r.store ?? ""} placeholder="Store" />
                    <Input type="date" name="date" defaultValue={r.date ?? ""} />
                    <Input name="total" defaultValue={centsToInput(r.total_cents)} inputMode="decimal" placeholder="Total" />
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_meal_prep" defaultChecked={!!r.is_meal_prep} /> Meal prep</label>
                    <div className="flex justify-between">
                      <SubmitButton variant="secondary">Save</SubmitButton>
                    </div>
                  </form>
                  <div className="mt-2"><DeleteButton action={deleteReceipt} id={r.id} confirmText="Delete this receipt?" /></div>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
