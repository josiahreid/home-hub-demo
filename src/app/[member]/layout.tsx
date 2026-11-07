import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { SubTabs } from "@/components/nav";
import { memberBySlug } from "@/lib/members";
import { memberSubtitle, memberTabs } from "@/lib/family";

// Every family member's page (Default Name, Default Name 2, anyone added in Settings → Family members) shares these tabs.
// The header reads the database, so it streams in behind a placeholder and never holds up the page.
export default function MemberLayout({ children, params }: LayoutProps<"/[member]">) {
  return (
    <div>
      <Suspense fallback={<div className="mb-6 h-16 animate-pulse rounded bg-surface-2" />}>
        <Header params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function Header({ params }: { params: Promise<{ member: string }> }) {
  const m = await memberBySlug((await params).member);
  const tabs = memberTabs(m);
  return (
    <>
      <PageHeader title={m.name} subtitle={memberSubtitle(m)} />
      {tabs.length > 1 && <SubTabs tabs={tabs} />}
    </>
  );
}
