import { SubTabs } from "@/components/nav";

export default function ApiLayout({ children }: LayoutProps<"/settings/api">) {
  return (
    <>
      <SubTabs
        tabs={[
          { href: "/settings/api/akahu", label: "Akahu (bank)" },
          { href: "/settings/api/telegram", label: "Telegram bot" },
          { href: "/settings/api/security", label: "Password & log" },
        ]}
      />
      {children}
    </>
  );
}
