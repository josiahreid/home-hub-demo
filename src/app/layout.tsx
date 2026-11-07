import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { io } from "next/cache";
import { PhoneMenu, SideNav } from "@/components/nav";
import { members } from "@/lib/members";
import { currentUser } from "@/lib/current-user";
import { WhoAreYou } from "./who-are-you";
import { DEMO } from "@/lib/demo";
import Loading from "./loading";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Home Hub",
  description: "Budget, meals, calendar, car, house and projects in one place",
  // Added to the Home Screen on iPhone/iPad it opens full screen as its own app, not in Safari
  appleWebApp: { capable: true, title: "Home Hub", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // the phone's status bar matches the page in light and dark mode
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#151514" },
  ],
};

// Every page reads live household data and "today", so nothing below the nav is prerendered.
// Until someone picks who they are on this device, the "Who are you?" screen covers everything.
async function RequestTime({ children }: { children: ReactNode }) {
  await io();
  if (!(await currentUser())) return <WhoAreYou people={await members()} />;
  return children;
}

// The menu lists family members from the database (Settings → Family members).
async function Menu({ mobile }: { mobile?: boolean }) {
  const family = (await members()).map(({ slug, name, features }) => ({ slug, name, features }));
  const me = (await currentUser())?.name ?? null;
  return mobile ? <PhoneMenu family={family} me={me} /> : <SideNav family={family} me={me} />;
}

// Read when the page is asked for, not when the app is built (the demo is switched on when its server starts).
async function DemoBanner() {
  await io();
  if (!DEMO) return null;
  return (
    <div className="border-b border-info bg-info-soft px-4 py-2 text-center text-xs text-info print:hidden">
      <strong>Demo</strong> – try anything: add, change, delete. Nothing here is real, and it all resets every night.
      Bank feed, Telegram and phone notifications are switched off.
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NZ" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <div className="flex min-h-screen">
          <aside className="print:!hidden sticky top-0 hidden h-screen w-56 shrink-0 border-r border-line bg-surface p-4 md:block">
            <div className="mb-6 px-3 text-lg font-semibold tracking-tight">Home Hub</div>
            <Suspense fallback={<SideNav family={[]} me={null} />}><Menu /></Suspense>
          </aside>
          <div className="min-w-0 flex-1">
            {/* phones: a bar with the ☰ menu button (computers and iPads have the sidebar instead) */}
            <div className="sticky top-0 z-10 border-b border-line bg-bg/95 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden print:hidden">
              <Suspense fallback={<PhoneMenu family={[]} me={null} />}><Menu mobile /></Suspense>
            </div>
            <Suspense fallback={null}><DemoBanner /></Suspense>
            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
              <Suspense fallback={<Loading />}>
                <RequestTime>{children}</RequestTime>
              </Suspense>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
