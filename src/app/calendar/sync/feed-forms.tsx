"use client";

import { useActionState } from "react";
import { addFeed, syncAllFeeds, type FeedState } from "../actions";
import { Field, Input, btn } from "@/components/ui";

export function AddFeedForm() {
  const [state, action, pending] = useActionState<FeedState, FormData>(addFeed, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Name"><Input name="name" placeholder="Family (Google)" /></Field>
      <Field label="iCal link"><Input name="url" required placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" /></Field>
      <button disabled={pending} className={btn.primary}>{pending ? "Connecting…" : "Connect"}</button>
      <Result state={state} />
    </form>
  );
}

export function SyncButton() {
  const [state, action, pending] = useActionState<FeedState>(syncAllFeeds, {});
  return (
    <form action={action} className="space-y-2">
      <button disabled={pending} className={btn.secondary}>{pending ? "Syncing…" : "Sync now"}</button>
      <Result state={state} />
    </form>
  );
}

function Result({ state }: { state: FeedState }) {
  if (state.error) return <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="rounded-lg bg-accent-soft p-2 text-sm text-accent">{state.message}</p>;
  return null;
}
