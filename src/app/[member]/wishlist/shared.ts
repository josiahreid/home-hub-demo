// Constants shared by the wish list pages (no server-only imports).

export const OCCASIONS = ["Birthday", "Christmas", "Anniversary", "Valentine's", "Any time"];

export type WishStatus = "idea" | "bought" | "given";
export const WISH_STATUSES: { value: WishStatus; label: string }[] = [
  { value: "idea", label: "To get" },
  { value: "bought", label: "Bought" },
  { value: "given", label: "Given" },
];

export const WISH_PRIORITIES: { value: number; label: string; tone: "bad" | "warn" | "neutral" }[] = [
  { value: 1, label: "Must-have", tone: "bad" },
  { value: 2, label: "Would love", tone: "warn" },
  { value: 3, label: "Nice idea", tone: "neutral" },
];

export type Wish = {
  id: number;
  item: string;
  occasion: string | null;
  url: string | null;
  price_cents: number | null;
  priority: number;
  notes: string | null;
  status: WishStatus;
  added_at: string;
  list_id: number;
  buy_by: string | null;    // optional date – shows on the list owner's Calendar tab
};

export type WishList = { id: number; name: string; notes: string | null; sort: number; member_id: number };

/** A member's own list (their first one) lives at /<member>/wishlist; any others at /<member>/wishlist/<id>. */
export const listPath = (list: { id: number }, firstId: number, slug: string) => (list.id === firstId ? `/${slug}/wishlist` : `/${slug}/wishlist/${list.id}`);
