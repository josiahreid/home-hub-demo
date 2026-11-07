import { PageHeader } from "@/components/ui";
import { SubTabs } from "@/components/nav";
import { format } from "date-fns";

// Set when the app is built (next.config.ts → build-info.ts), so this shows which update is running.
const COMMIT = process.env.HOME_HUB_COMMIT;
const BUILT = process.env.HOME_HUB_BUILT;

function Version() {
  const built = BUILT ? format(new Date(BUILT), "d MMM yyyy, h:mm a") : null;
  return (
    <p className="mt-10 border-t border-line pt-3 text-xs text-muted print:hidden">
      Home Hub{COMMIT ? <> version <a href={`https://github.com/josiahreid/home-hub-demo/commit/${COMMIT}`} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">{COMMIT}</a></> : null}
      {built && ` · built ${built}`}
      {process.env.NODE_ENV === "development" && " · test copy on this PC"}
    </p>
  );
}

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Settings" subtitle="How Home Hub works, family members, push notifications, exporting your budget, backups, storage, and the password-protected API connections (bank and Telegram)." />
        <SubTabs
          tabs={[
            { href: "/settings", label: "How to" },
            { href: "/settings/family", label: "Family members" },
            { href: "/settings/push", label: "Push notifications" },
            { href: "/settings/export", label: "Export budget" },
            { href: "/settings/backups", label: "Backups" },
            { href: "/settings/storage", label: "Storage" },
            { href: "/settings/api", label: "API 🔒" },
          ]}
        />
      </div>
      {children}
      <Version />
    </>
  );
}
