// Message settings and the template → Telegram text step. No server-only imports: the settings page uses it
// to show a live preview while a template is being typed.

export type CalCat = "event" | "church" | "todo" | "payment" | "bin" | "car" | "chore" | "plan" | "utility" | "feed";

export const CAL_CATS: { value: CalCat; label: string; icon: string }[] = [
  { value: "event", label: "Events", icon: "📅" },
  { value: "church", label: "Church", icon: "⛪" },
  { value: "todo", label: "To-dos due", icon: "✅" },
  { value: "payment", label: "Bills & payments", icon: "💸" },
  { value: "bin", label: "Bins", icon: "🗑" },
  { value: "car", label: "Car", icon: "🚗" },
  { value: "chore", label: "Chores & cleaning", icon: "🧹" },
  { value: "plan", label: "Savings goals", icon: "🎯" },
  { value: "utility", label: "Contracts ending", icon: "🔌" },
  { value: "feed", label: "Imported calendars", icon: "📆" },
];

/**
 * One line of a day's calendar, already worded, with the section it goes under – a section for each family member
 * (their tagged events, their to-dos and chores), then the household's ("Everyone") and imported calendars.
 * `html` is for Telegram, `text` for push notifications.
 */
export type CalLine = { section: string; kind: CalCat; html: string; text: string };

/** The day's calendar as Telegram HTML: a heading per person, only the ticked categories, in the order given. */
export function renderCalendar(lines: CalLine[], cats: CalCat[]) {
  const want = new Set(cats);
  const kept = lines.filter((l) => want.has(l.kind));
  const sections = [...new Set(kept.map((l) => l.section))];
  return sections.map((s) => `<b>${escHtml(s)}</b>\n${kept.filter((l) => l.section === s).map((l) => l.html).join("\n")}`).join("\n\n");
}

export type CalMessage = { on: boolean; time: string; template: string; cats: CalCat[]; skipEmpty: boolean };
export type GroceryMessage = { on: boolean; time: string; template: string };
/** One church reminder: at this time, this many days before the service (0 = on the day). */
export type ChurchSlot = { time: string; daysBefore: number };
/** `time` / `daysBefore` are the first slot, kept for older saved settings; `slots` is the full list. */
export type ChurchMessage = { on: boolean; time: string; daysBefore: number; slots: ChurchSlot[]; template: string };
export type NotifyConfig = { today: CalMessage; tomorrow: CalMessage; groceries: GroceryMessage; church: ChurchMessage };
export type NotifyKind = keyof NotifyConfig;

const ALL_CATS = CAL_CATS.map((c) => c.value);

export const DEFAULT_NOTIFY: NotifyConfig = {
  today: {
    on: true, time: "07:00", cats: ALL_CATS, skipEmpty: false,
    template: "☀️ **Good morning – {date}**\n\n{calendar}\n\n{overdue}",
  },
  tomorrow: {
    on: true, time: "19:00", cats: ALL_CATS, skipEmpty: true,
    template: "🌙 **Tomorrow – {date}**\n\n{bins}\n\n{calendar}",
  },
  groceries: {
    on: true, time: "17:00",
    template: "🛒 **Grocery list** – {count} still to get\n\n{urgent}\n\n{not_urgent}",
  },
  church: {
    on: true, time: "19:00", daysBefore: 1, slots: [{ time: "19:00", daysBefore: 1 }],
    template: "⛪ **Church {when}** – {date}\n\n{serving}",
  },
};

export const MESSAGE_INFO: Record<NotifyKind, { title: string; hint: string; placeholders: [string, string][] }> = {
  today: {
    title: "Daily calendar",
    hint: "Today's calendar, broken down by category.",
    placeholders: [["date", "Today's date"], ["calendar", "Today, grouped by category"], ["overdue", "Overdue to-dos"], ["count", "How many things are on"]],
  },
  tomorrow: {
    title: "Next day's calendar",
    hint: "Tomorrow's calendar by category, and bins out tonight.",
    placeholders: [["date", "Tomorrow's date"], ["calendar", "Tomorrow, grouped by category"], ["bins", "Bins to put out tonight"], ["count", "How many things are on"]],
  },
  groceries: {
    title: "Grocery list",
    hint: "Sent only when something's still on the list – the whole list, urgent and not urgent.",
    placeholders: [["urgent", "Urgent items"], ["not_urgent", "Not urgent items"], ["count", "How many items"]],
  },
  church: {
    title: "Church reminders",
    hint: "Who's serving, the service time, their notes and the playlist – sent ahead of each serving date, as many times as you like.",
    placeholders: [["when", "\"tomorrow\", \"today\" or \"on Sunday\""], ["date", "The service date"], ["serving", "Services: who's serving, times, notes, playlist"]],
  },
};

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The words you type: **bold**, _italic_; everything else exactly as written. */
function formatText(s: string) {
  return escHtml(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])_(.+?)_(?=[\s).,!?]|$)/gm, "$1<i>$2</i>");
}

/**
 * Fills a template's {placeholders} with values that are already Telegram HTML, and turns the rest of the
 * text into Telegram HTML. Placeholders with nothing in them disappear along with their blank lines.
 */
export function renderTemplate(template: string, values: Record<string, string>) {
  // stand-ins first, so **bold** can wrap a placeholder ("**Good morning – {date}**") without touching the data inside
  const filled: string[] = [];
  const marked = template.replace(/\{([a-z_]+)\}/g, (whole, name: string) => {
    if (!(name in values)) return whole;
    filled.push(values[name]);
    return `\u0000${filled.length - 1}\u0000`;
  });
  const out = formatText(marked).replace(/\u0000(\d+)\u0000/g, (_, i: string) => filled[Number(i)]);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Merges saved settings over the defaults, so new options always have a value. */
export function withDefaults(saved: Partial<Record<NotifyKind, object>> | null): NotifyConfig {
  const s = saved ?? {};
  return {
    today: { ...DEFAULT_NOTIFY.today, ...(s.today as Partial<CalMessage>) },
    tomorrow: { ...DEFAULT_NOTIFY.tomorrow, ...(s.tomorrow as Partial<CalMessage>) },
    groceries: { ...DEFAULT_NOTIFY.groceries, ...(s.groceries as Partial<GroceryMessage>) },
    // no default slots underneath saved settings, so an older single time is kept rather than replaced
    church: churchWithSlots({ ...DEFAULT_NOTIFY.church, ...(s.church ? { slots: [] } : {}), ...(s.church as Partial<ChurchMessage>) }),
  };
}

/** Older settings had one time; make sure there's a slot list, sorted and without repeats. */
function churchWithSlots(c: ChurchMessage): ChurchMessage {
  const list = Array.isArray(c.slots) && c.slots.length ? c.slots : [{ time: c.time, daysBefore: c.daysBefore }];
  const seen = new Set<string>();
  const slots = list
    .filter((x) => /^\d{2}:\d{2}$/.test(x.time) && x.daysBefore >= 0 && x.daysBefore <= 7)
    .sort((a, b) => b.daysBefore - a.daysBefore || a.time.localeCompare(b.time))
    .filter((x) => {
      const k = `${x.time}|${x.daysBefore}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return { ...c, slots, time: slots[0]?.time ?? c.time, daysBefore: slots[0]?.daysBefore ?? c.daysBefore };
}

/** "7pm the day before" – for the settings page. */
export function slotLabel(x: ChurchSlot) {
  const [h, m] = x.time.split(":").map(Number);
  const t = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  const when = x.daysBefore === 0 ? "on the day" : x.daysBefore === 1 ? "the day before" : x.daysBefore === 7 ? "a week before" : `${x.daysBefore} days before`;
  return `${t} ${when}`;
}
