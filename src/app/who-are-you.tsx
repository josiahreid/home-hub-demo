import { chooseUser } from "./actions";
import type { Member } from "@/lib/family";

/** The lock screen: pick who you are once on each device. No passcodes – it decides whose notifications are whose. */
export function WhoAreYou({ people }: { people: Member[] }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-1 text-sm font-semibold tracking-wide text-muted uppercase">Home Hub</div>
        <h1 className="mb-8 text-3xl font-semibold">Who are you?</h1>
        <div className="grid gap-3">
          {people.map((p) => (
            <form key={p.slug} action={chooseUser}>
              <input type="hidden" name="slug" value={p.slug} />
              <button className="w-full rounded-2xl border border-line bg-surface px-6 py-5 text-2xl font-semibold hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:border-accent focus-visible:outline-none">
                {p.name}
              </button>
            </form>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted">This sets whose to-dos and notifications come to this device. Change it any time from the menu.</p>
      </div>
    </div>
  );
}
