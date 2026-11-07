import { PageHeader } from "@/components/ui";
import { SubTabs } from "@/components/nav";

// Meal prep fills the whole screen with Meal Planner and has its own copy of these tabs in its toolbar.
export default function FoodLayout({ children }: LayoutProps<"/food">) {
  return (
    <>
      <PageHeader title="Food" subtitle="The grocery list, and meal prep in Meal Planner." />
      <SubTabs
        tabs={[
          { href: "/food/groceries", label: "Grocery list" },
          { href: "/food/meal-prep", label: "Meal prep" },
        ]}
      />
      {children}
    </>
  );
}
