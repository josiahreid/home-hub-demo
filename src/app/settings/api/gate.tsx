import type { ReactNode } from "react";
import { Lock, LockOpen } from "lucide-react";
import { PASSWORD_RULE, apiUnlocked, hasApiPassword, lockedOutFor } from "@/lib/api-lock";
import { Card, btn } from "@/components/ui";
import { ReadyButton } from "@/components/buttons";
import { lock, resetPassword } from "./actions";
import { SetupForm, UnlockForm } from "./lock-forms";

/**
 * Wraps every page under Settings → API. Until this browser unlocks, only the lock screen renders –
 * the page's own code (and anything it reads) never runs. Server actions check the lock separately.
 */
export async function ApiGate({ children }: { children: ReactNode }) {
  if (await apiUnlocked()) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent bg-accent-soft px-4 py-2 text-sm text-accent">
          <span className="flex items-center gap-2"><LockOpen size={16} /> Unlocked on this browser for 30 minutes.</span>
          <form action={lock}><ReadyButton className={`${btn.secondary} ${btn.small}`}><Lock size={12} /> Lock now</ReadyButton></form>
        </div>
        {children}
      </>
    );
  }

  const isSet = hasApiPassword();
  const wait = lockedOutFor();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={<span className="flex items-center gap-1"><Lock size={14} /> {isSet ? "API settings are locked" : "Set a password for API settings"}</span>} className="lg:col-span-2">
        {isSet ? (
          <>
            <p className="mb-3 text-sm text-muted">This tab holds the bank (Akahu) and Telegram connections. Enter the password to open it.</p>
            {wait ? <p className="rounded-lg bg-warn-soft p-2 text-sm text-warn">Too many wrong passwords. Try again in {wait} minute{wait === 1 ? "" : "s"}.</p> : <UnlockForm />}
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              This tab holds the bank (Akahu) and Telegram connections, so it has its own password. Only Default Name and Default Name 2 should know it.
              It isn&apos;t saved anywhere – only a scrambled check of it – so <strong>write it down somewhere safe</strong>.
            </p>
            <SetupForm rule={PASSWORD_RULE} />
          </>
        )}
      </Card>
      <div className="space-y-4">
        <Card title="How it's protected">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>The password is never stored, only a salted scrypt hash of it.</li>
            <li>Bank tokens are encrypted with a key made from the password. The key only exists in memory after an unlock, and is gone when Home Hub restarts.</li>
            <li>5 wrong passwords in a row locks this tab for 15 minutes.</li>
            <li>Unlocking lasts 30 minutes on that browser only.</li>
          </ul>
        </Card>
        {isSet && (
          <Card title="Forgot the password?">
            <p className="mb-2 text-sm text-muted">
              Resetting removes the password <strong>and the saved Akahu tokens</strong> (they can&apos;t be read without it). Then set a new password and paste
              the tokens again. The Telegram bot keeps working.
            </p>
            <form action={resetPassword} className="flex flex-wrap items-center gap-2">
              <input name="confirm" required pattern="RESET" placeholder="Type RESET" aria-label="Type RESET to confirm" className="w-32 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
              <ReadyButton className={btn.danger}>Reset</ReadyButton>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
