import { SubTabs } from "@/components/nav";

export default function CalendarLayout({ children }: LayoutProps<"/calendar">) {
  return (
    <>
      <SubTabs
        tabs={[
          { href: "/calendar", label: "Calendar" },
          { href: "/calendar/bins", label: "Bin days" },
          { href: "/calendar/subscribe", label: "Subscribe" },
          { href: "/calendar/sync", label: "Import other calendars" },
        ]}
      />
      {children}
    </>
  );
}
