import { Card, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { createList } from "../actions";
import { memberWith } from "../../member";

export default async function NewWishlist({ params }: PageProps<"/[member]/wishlist/new">) {
  const m = await memberWith(params, "wishlists");
  return (
    <Card title="New wish list" className="max-w-lg">
      <form action={createList} className="space-y-3">
        <input type="hidden" name="member_id" value={m.id} />
        <Field label="Who's it for?"><Input name="name" required autoFocus placeholder="e.g. Ava, the kids, Mum" /></Field>
        <Field label="Notes (optional)"><Textarea name="notes" rows={2} placeholder="Clothes size, favourite colours, what they're into…" /></Field>
        <SubmitButton>Create list</SubmitButton>
      </form>
    </Card>
  );
}
