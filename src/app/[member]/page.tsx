import { redirect } from "next/navigation";
import { memberBySlug } from "@/lib/members";
import { memberHome, memberTabs } from "@/lib/family";
import { Empty } from "@/components/ui";
import Link from "next/link";

export default async function MemberPage({ params }: PageProps<"/[member]">) {
  const m = await memberBySlug((await params).member);
  if (memberTabs(m).length) redirect(memberHome(m));
  return (
    <Empty>
      Nothing is switched on for {m.name} yet. Choose projects, wish lists or price compare in{" "}
      <Link href="/settings/family" className="text-accent underline">Settings → Family members</Link>.
    </Empty>
  );
}
