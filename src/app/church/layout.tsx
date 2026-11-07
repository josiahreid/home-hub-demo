import { PageHeader } from "@/components/ui";
import { SubTabs } from "@/components/nav";

export default function ChurchLayout({ children }: LayoutProps<"/church">) {
  return (
    <>
      <PageHeader title="Church" subtitle="When Default Name and Default Name 2 are serving." />
      <SubTabs
        tabs={[
          { href: "/church", label: "Overview" },
          { href: "/church/default-name", label: "Default Name" },
          { href: "/church/default-name-2", label: "Default Name 2" },
        ]}
      />
      {children}
    </>
  );
}
