import { SubTabs } from "@/components/nav";

export default function BudgetLayout({ children }: LayoutProps<"/budget">) {
  return (
    <>
      <SubTabs
        tabs={[
          { href: "/budget", label: "This fortnight" },
          { href: "/budget/transactions", label: "Transactions", also: ["/budget/sort", "/budget/import", "/budget/receipts", "/budget/settings"] },
          { href: "/budget/recurring", label: "Bills" },
          { href: "/budget/plans", label: "Goals" },
        ]}
      />
      {children}
    </>
  );
}
