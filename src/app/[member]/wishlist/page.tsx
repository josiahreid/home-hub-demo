import { notFound } from "next/navigation";
import { wishLists } from "./lists";
import { WishlistView } from "./view";
import { memberWith } from "../member";

// The member's own list
export default async function OwnWishlist({ params, searchParams }: PageProps<"/[member]/wishlist">) {
  const m = await memberWith(params, "wishlists");
  const { lists, firstId } = await wishLists(m.id);
  const list = lists.find((l) => l.id === firstId);
  if (!list) notFound();
  return <WishlistView member={m} list={list} firstId={firstId} searchParams={searchParams} />;
}
