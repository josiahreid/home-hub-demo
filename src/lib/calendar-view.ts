import { getSetting } from "./db";

/**
 * How the imported calendars sit on the Calendar page: their order and which are hidden (folded away).
 * Kept in settings as comma-separated feed ids; calendars not in the order list go last, by name.
 */
const ids = (key: string) => (getSetting(key) ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);

export const feedOrder = () => ids("calendar_feed_order");
export const hiddenFeeds = () => new Set(ids("calendar_feed_hidden"));

export function inFeedOrder<T extends { id: number; name: string }>(feeds: T[]): T[] {
  const order = feedOrder();
  const pos = (id: number) => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...feeds].sort((a, b) => pos(a.id) - pos(b.id) || a.name.localeCompare(b.name));
}
