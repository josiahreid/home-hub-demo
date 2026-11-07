import Link from "next/link";
import { io } from "next/cache";
import type { ReactNode } from "react";
import { DATA_DIR } from "@/lib/db";
import { onTailnet } from "@/lib/deploy";
import { Card } from "@/components/ui";

type Topic = { id: string; title: string; steps: ReactNode[] };

const A = ({ href, children }: { href: string; children: ReactNode }) => <Link href={href} className="text-accent underline">{children}</Link>;
const K = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface-2 px-1 text-[13px]">{children}</code>;

export default async function HowTo() {
  await io();
  // the drive letter changes with whichever PC the drive is plugged into, so show where it is right now
  const appDir = process.cwd();

  const topics: Topic[] = [
    {
      id: "start", title: "Getting started",
      steps: onTailnet ? [
        <>Home Hub runs on your home server and is reachable from <strong>your own devices on Tailscale</strong> – never the public internet. On a phone, turn Tailscale on and open the Home Hub address (the <K>https://…ts.net</K> one you&apos;re on now).</>,
        <>Add it to your home screen (Safari: Share → Add to Home Screen) so it opens like an app.</>,
        <>It starts by itself with the server. To update or restart it, use the <strong>home-hub</strong> stack in Portainer.</>,
        <>Everything you enter is saved in the <K>home-hub-data</K> Docker volume (<K>{DATA_DIR}</K> inside the container). <strong>Back it up</strong> – see DEPLOY.md in the project folder.</>,
        <>A blue banner on Home means <strong>sample data</strong> is showing. Press <em>Remove sample data</em> before using it for real; your own entries are never touched.</>,
      ] : [
        <>Home Hub runs on the PC the drive is plugged into, at <K>http://localhost:3000</K>. Other devices and the internet can&apos;t reach it.</>,
        <>To start it, open a terminal in the <K>home-hub</K> folder on the drive (right now <K>{appDir}</K>) and run <K>npm run dev</K>. The PC needs Node.js installed.</>,
        <>Everything you enter is saved in <K>{DATA_DIR}</K>. <strong>Back that folder up</strong> (e.g. copy it to another drive now and then).</>,
        <>A blue banner on Home means <strong>sample data</strong> is showing. Press <em>Remove sample data</em> before using it for real; your own entries are never touched.</>,
      ],
    },
    {
      id: "home", title: "Home & To do",
      steps: [
        <>Home shows today, the next 7 days, a <strong>bins out tonight</strong> alert, money left each fortnight and your savings runway.</>,
        <>The green <strong>To do</strong> button adds an important to-do straight away. Important ones show on Home where you can tick them off.</>,
        <>On <A href="/todos">To do</A>, the <strong>Default Name</strong> and <strong>Default Name 2</strong> tabs keep each person&apos;s list (add on their tab, or pick who it&apos;s for on <em>Everyone</em>). Drag ⋮⋮ to put them in order, tap ☆ to mark important.</>,
        <>A due date puts a to-do on the calendar (and a subscribed calendar such as Outlook, with a 9am reminder). Finished ones go under <em>Done</em> – <em>Back to list</em> puts one back.</>,
      ],
    },
    {
      id: "budget", title: "Budget",
      steps: [
        <>The Budget has four tabs: <A href="/budget">This fortnight</A>, <A href="/budget/transactions">Transactions</A>, <A href="/budget/recurring">Bills</A> and <A href="/budget/plans">Goals</A>. A <strong>How to use the Budget</strong> guide at the top shows the setup steps and what&apos;s done.</>,
        <><A href="/budget/setup">Pay &amp; pots</A> (button on This fortnight): your payday, what comes in, and how each payday is split into <strong>pots</strong> – Bills, Food &amp; fuel, Spending, Savings… Tick which spending comes out of each pot.</>,
        <><strong>This fortnight</strong> shows what&apos;s left in each pot until payday (and per day), where the money went, pay in, bills still to come, <strong>Can we afford it?</strong> and how last fortnight went. ← → move between fortnights; <em>Whole year</em> shows the year.</>,
        <><A href="/budget/import">Upload statements</A>: <strong>Choose a folder</strong> and pick your statements folder (Westpac and Q Card PDFs). Upload it again any time – only new statements are added.</>,
        <><A href="/budget/sort">Sort</A> shows new transactions one card at a time – tap a category (keys 1–9 on a PC). &ldquo;Do all from this shop and remember&rdquo; sorts the rest and every future statement. <A href="/budget/settings">Shop rules</A> lists what&apos;s remembered.</>,
        <>Six spending categories: Bills, Groceries, Transport, Eating out &amp; fun, Home &amp; family, Other – plus Income, Savings and Transfers, which aren&apos;t spending. Paying the Q Card off and PayPal&apos;s copies of purchases count as Transfers, so nothing is counted twice.</>,
        <><A href="/budget/recurring">Bills</A>: a payday-to-payday timeline with a warning if the bills add up to more than the Bills pot. Home Hub spots repeat payments in your statements – <em>Track it</em> or <em>Not a repeat</em>. Press <em>Paid</em> to move a bill to its next date.</>,
        <>On payday at 8am you get how last fortnight went – as a push notification, and on Telegram if it&apos;s connected (switch it off on Pay &amp; pots).</>,
        <><A href="/budget/receipts">Receipts</A>: <strong>Take photo</strong> or <strong>Choose file</strong>; tick <em>meal prep</em> to count it as a meal-prep shop.</>,
      ],
    },
    {
      id: "utilities", title: "Utilities & Car",
      steps: [
        <><A href="/utilities">Utilities</A>: each bill (power, internet, mortgage, rates…) with its provider and contract end. Log bills to see trends, and log quotes from other providers to see the saving.</>,
        <><A href="/car">Car</A>: WOF, rego and insurance dates warn you 30 days out. Add servicing (every X months / km) and press <em>Mark done</em> after each service. Parts keeps wiper sizes, tyre sizes and costs.</>,
      ],
    },
    {
      id: "meals", title: "Food",
      steps: [
        <><A href="/food/meal-prep">Food → Meal prep</A> shows <strong>Meal Planner</strong> (your mate&apos;s meal-prep app) right inside Home Hub. Paste your Meal Planner link the first time; after that it just opens.</>,
        <><A href="/food/groceries">Food → Grocery list</A>: add things as <strong>Urgent</strong> or not, tick them off when bought. It works with Apple Shortcuts (and NFC tags) – the steps are on that page.</>,
        <>Use <em>Open in new tab</em> if anything in Meal Planner doesn&apos;t work inside the page, and <em>Change link</em> if you get a new one.</>,
        <>To track what meal prep costs, tick <strong>Meal prep shop</strong> when adding a supermarket receipt under <A href="/budget/receipts">Receipts</A>.</>,
      ],
    },
    {
      id: "calendar", title: "Calendar",
      steps: [
        <>Everything with a date from every tab shows on the <A href="/calendar">Calendar</A>. Tap a dot in the legend to change that colour.</>,
        <>When adding an event you can make it <strong>repeat</strong> every day, week, month or year (with an optional end date), give it an <strong>expected cost</strong> (it counts toward savings goals) and link a <strong>wish list</strong> – then clicking the event opens that list. The ✎ next to it edits the event.</>,
        <><A href="/calendar/sync">Import other calendars</A> (Google, Apple) each show as their own calendar under Home Hub&apos;s, with their own heading – never mixed in.</>,
        <><A href="/calendar/bins">Bin days</A>: enter one known collection date per bin and how often.</>,
        <><A href="/calendar/subscribe">Subscribe</A> puts Home Hub in a calendar app on this PC, such as Outlook. It refreshes hourly while Home Hub is running.</>,
      ],
    },
    {
      id: "church", title: "Church",
      steps: [
        <>On the <A href="/church/default-name">Default Name</A> or <A href="/church/default-name-2">Default Name 2</A> tab, <strong>Add a serving date</strong>: date, service name, time, Spotify link and notes (what you&apos;re doing, what to bring), then <strong>Save</strong>. It&apos;s that person&apos;s automatically.</>,
        <>On the <A href="/church">Overview</A> you can add one for Default Name, Default Name 2 or both at once. Each date has <em>Edit</em>, <em>Delete</em> and a <em>Playlist</em> button.</>,
        <>Reminders: Telegram (Settings → API → Telegram, as many times as you like) and phone notifications (Settings → Push) – each person only gets their own.</>,
      ],
    },
    {
      id: "house", title: "House",
      steps: [
        <><A href="/house/chores">Chores</A> and <A href="/house/cleaning">Cleaning</A>: press <em>Done</em> and the next due date works itself out. Every repeat shows on the <A href="/calendar">Calendar</A> (cleaning has a 🧽).</>,
        <><A href="/house/projects">Projects</A>: <strong>Upload invoice / receipt</strong> (camera or PDF), pick the project, and it&apos;s added to that project&apos;s costs. Change the project in the list to re-tag one.</>,
        <><A href="/house/quotes">Quotes</A> link to <A href="/house/businesses">Businesses</A>, where you keep each tradie&apos;s email, phone, website and GST number. Tap an email or number to contact them.</>,
        <>On a project, <strong>Emails</strong> keeps the conversation: paste an email in, or attach one (Gmail: ⋮ → Download message; Outlook: Save as). A .eml file fills in the details itself.</>,
      ],
    },
    {
      id: "family", title: "Family members",
      steps: [
        <>Add people (and choose what each page has) on <A href="/settings/family">Settings → Family members</A>. Each person can have any mix of <strong>Projects</strong>, <strong>Wish lists</strong> and <strong>Price compare</strong>.</>,
        <><strong>Projects</strong>: job cards with steps, tags and a parts list with prices (AliExpress or anywhere), so you can see what a project will cost.</>,
        <><strong>Wish lists</strong>: present ideas. <em>+ New wish list</em> adds one for the kids or anyone else. Filter by occasion, priority, price or search.</>,
        <><strong>Price compare</strong>: a card per thing you&apos;re hunting (name, tags, goal, status). Add a link and price for each shop – if it&apos;s on sale, add the sale price and when the sale ends. The cheapest price right now is highlighted; when a sale ends it goes back to the normal price.</>,
      ],
    },
    {
      id: "telegram", title: "Telegram bot",
      steps: [
        <>Set it up on <A href="/settings/api/telegram">Settings → API → Telegram bot</A> (password-protected): make a bot with @BotFather, paste its token, then send <K>/start</K> to it from each phone and press <em>Link</em>.</>,
        <>Four scheduled messages, each with its own time and wording (with a live preview): the <strong>daily calendar</strong> and <strong>next day&apos;s calendar</strong> (by category), the <strong>grocery list</strong> (only if something&apos;s still on it) and <strong>church reminders</strong>.</>,
        <>Send <K>/todo ring the plumber</K> or <K>/wish Kindle</K> to add things from anywhere; <K>/today</K>, <K>/tomorrow</K>, <K>/groceries</K>, <K>/bins</K> and <K>/todos</K> to check. The PC needs to be on.</>,
      ],
    },
    {
      id: "export", title: "Exporting the budget",
      steps: [
        <><A href="/settings/export">Export budget</A> downloads the whole budget as an Excel file, or opens a report you can <em>Save as PDF</em>.</>,
      ],
    },
    {
      id: "help", title: "If something isn't working",
      steps: [
        <>Page won&apos;t open: is the terminal running <K>npm run dev</K> still open? Use <K>http://localhost:3000</K> on the same PC.</>,
        <>Calendar or Telegram not updating: Home Hub only works while the terminal running <K>npm run dev</K> is open.</>,
        <>Anything odd: in the terminal press <K>Ctrl + C</K>, then run <K>npm run dev</K> again.</>,
      ],
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <nav className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">On this page</div>
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {topics.map((t) => (
            <li key={t.id}><a href={`#${t.id}`} className="block rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-ink">{t.title}</a></li>
          ))}
        </ul>
      </nav>
      <div className="space-y-4">
        {topics.map((t) => (
          <Card key={t.id} title={t.title}>
            <div id={t.id} className="-mt-24 pt-24" />
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              {t.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}
