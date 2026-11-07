import { notFound, redirect } from "next/navigation";
import { wishLists } from "../lists";
import { WishlistView } from "../view";
import { memberWith } from "../../member";

// Anyone else's list: the kids, family, friends
export default async function OtherWishlist({ params, searchParams }: PageProps<"/[member]/wishlist/[id]">) {
  const m = await memberWith(params, "wishlists");
  const id = Number((await params).id);
  const { lists, firstId } = await wishLists(m.id);
  if (id === firstId) redirect(`/${m.slug}/wishlist`);
  const list = lists.find((l) => l.id === id);
  if (!list) notFound();
  return <WishlistView member={m} list={list} firstId={firstId} searchParams={searchParams} />;
}
