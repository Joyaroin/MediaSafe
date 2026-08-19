"use client";

import { useRef, useState } from "react";

import { GHOST_RECOVERY, IN_FLIGHT } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { authClient } from "@/lib/auth-client";

/**
 * Sign out other devices — issue #124, the second third of the Account section.
 *
 * `SPEC.md` §7: *Adham chose to stay signed in on the current device, which makes the
 * usual label a lie.* This ends every session but this one, and the label says exactly
 * that rather than "sign out everywhere".
 *
 * ── Revocation is real, and for the same reason `SignOutButton` already establishes ────
 *
 * `authClient.revokeOtherSessions()` posts to Better Auth's own `/revoke-other-sessions`,
 * which deletes every session row for this account except the one the request itself
 * carries. `lib/auth.ts` turns off the session cookie cache precisely so there is no
 * signed copy of a revoked session left to keep answering yes — the same fact
 * `SignOutButton`'s docblock gives, and it holds here without repeating the mechanism.
 * Nothing here is a cookie trick; it is a row on another device actually gone.
 *
 * ── No count, no list — and no failure state to roll back to ───────────────────────────
 *
 * `SPEC.md` §7 forbids both outright: *no session list — that is admin chrome.* This
 * control has one thing to say either way — it worked, or it did not — and the response
 * body is not even read for a count. Pressing it with nothing else signed in is not
 * checked for separately: Better Auth's endpoint deletes zero rows exactly as happily as
 * it deletes several, so "no other sessions" and "several, now gone" are the same success
 * with nothing to tell apart.
 *
 * ── Why a failure raises the toast rather than the inline region `SignOutButton` uses ──
 *
 * The acceptance criteria ask for it directly — *a failed revocation raises the
 * persistent toast* — and the blast radius supports it: unlike a failed sign-out, the
 * reader's own session is never in question here, so this page keeps working and nothing
 * about it looks broken. That is exactly AGENTS.md's *one write was lost* row, not its
 * *a sign-in did not happen* row.
 *
 * `errors/write-failure.ts`'s `LostWrite` names its required field `title` for *the
 * affected title* and `welcome-surface.tsx` documents the case where that shape cannot
 * represent an account-level write — this is that same kind of write. The acceptance
 * criteria settle it anyway: *no episode* names the one field this call omits, which only
 * reads as an instruction at all if `title` is still being sent. So `title` carries this
 * control's own label instead of a title from the library — the one string that names
 * what failed to save — and the toast reads as a labelled failure rather than a
 * mis-attributed one.
 */
export function SignOutOtherDevicesButton() {
  const [inFlight, setInFlight] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  async function revoke(): Promise<void> {
    setSucceeded(false);
    setInFlight(true);

    const { error } = await authClient.revokeOtherSessions();

    setInFlight(false);

    if (error) {
      // One toast per lost write, not one per attempt (AGENTS.md) — but only while the
      // reader can still see it, the same guard `RatingControl` and `AbandonControl` use.
      if (raised.current?.standing()) return;
      raised.current = writeFailures.raise({
        title: "Sign out other devices",
        reference: referenceFor(
          new Error("Revoking other sessions did not reach the server."),
        ),
        retry: () => void revoke(),
      });
      return;
    }

    raised.current?.resolve();
    raised.current = null;
    setSucceeded(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void revoke()}
        disabled={inFlight}
        className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
      >
        {inFlight ? "Signing out other devices" : "Sign out other devices"}
      </button>

      {succeeded ? (
        <p className="mt-3 code-line text-stock-dim">Other devices are signed out.</p>
      ) : null}
    </div>
  );
}
