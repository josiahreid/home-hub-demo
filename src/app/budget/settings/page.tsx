import { all } from "@/lib/db";
import { categoryList } from "@/lib/category-list";
import { Card, Empty, Field, Input, PageHeader, Select, btn } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/buttons";
import { addRule, deleteCategory, deleteRule, loadStarterRules, reapplyRules } from "../actions";
import { MoneyNav } from "../money-nav";

/** Shop rules: "if the description contains this, it's that category" – made by "remember" when sorting, or added here. */
export default async function ShopRules() {
  const rules = await all<{ id: number; pattern: string; category: string }>("SELECT * FROM category_rules ORDER BY category, pattern");
  const byCategory = Map.groupBy(rules, (r) => r.category);
  const cats = categoryList();

  return (
    <>
      <PageHeader title="Shop rules" subtitle="Each new statement sorts itself using these. Ticking “remember” when sorting adds one." />
      <MoneyNav active="/budget/settings" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Add a rule">
          <form action={addRule} className="space-y-2">
            <Field label="Description contains"><Input name="pattern" required placeholder="e.g. countdown" /></Field>
            <Field label="Category"><Select name="category" options={cats.all} /></Field>
            <SubmitButton>Add rule</SubmitButton>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <form action={loadStarterRules}><button className={btn.secondary}>Add NZ starter rules</button></form>
            <form action={reapplyRules}><button className={btn.ghost}>Re-sort everything with the rules</button></form>
          </div>
          <p className="mt-2 text-xs text-muted">Re-sorting changes every transaction a rule matches, including ones you sorted by hand. Longer matches win.</p>
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="mb-2 text-sm font-semibold">Your categories</h3>
            {cats.custom.length === 0 ? (
              <p className="text-xs text-muted">None yet – make one with the + on Sort.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {cats.custom.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{c.icon} {c.name} <span className="text-xs text-muted">· {c.spending ? "spending" : "not spending"}</span></span>
                    <DeleteButton action={deleteCategory} id={c.id} label="Delete"
                      confirmText={`Delete "${c.name}"? Its transactions, shop rules and bills go to ${c.spending ? "Other" : "Transfers"}.`} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {rules.length === 0 ? <Card><Empty>No rules yet – they build up as you sort.</Empty></Card> : (
            cats.all.filter((c) => byCategory.has(c)).map((c) => (
              <Card key={c} title={`${cats.info[c]?.icon ?? ""} ${c}`} actions={<span className="text-xs text-muted">{byCategory.get(c)!.length}</span>}>
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {byCategory.get(c)!.map((r) => (
                    <li key={r.id} className="flex items-center gap-1 rounded-full border border-line py-0.5 pr-1 pl-3">
                      <code>{r.pattern}</code>
                      <DeleteButton action={deleteRule} id={r.id} label="×" confirmText={`Delete the rule "${r.pattern}"?`} />
                    </li>
                  ))}
                </ul>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
