"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { authClient } from "@/lib/auth-client";

/**
 * Sign out — the whole of the Account section, and the whole of what Settings ships with
 * at build step 1.
 *
 * ── Revocation is server-side, and this is what makes that true ──────────────────────
 *
 * `authClient.signOut()` posts to `/api/auth/sign-out`, and Better Auth **deletes the
 * session row** before clearing the cookie. That is real revocation rather than a cookie
 * being forgotten: `lib/auth.ts` turns off Better Auth's cookie cache precisely so that
 * there is no signed copy of the session left to keep answering yes for five minutes
 * after the row is gone.
 *
 * ── The back button ──────────────────────────────────────────────────────────────────
 *
 * `router.refresh()` before navigating, and it is not decoration. Next.js keeps rendered
 * segments in a client-side Router Cache, so a reader who signs out and then presses back
 * would be shown the signed-in shell straight out of that cache without a request ever
 * reaching the server. `refresh()` is what empties it. What is then fetched is a server
 * render with no session, which redirects to sign-in.
 *
 * `replace`, not `push`, for the same reason from the other direction: `push` would leave
 * `/settings` one back-press away as a history entry of its own.
 *
 * ── A sign-out that fails ────────────────────────────────────────────────────────────
 *
 * It does not navigate, and it says so. The blast radius is one region — the reader is
 * still on a working page, still signed in, and one thing they asked for did not happen —
 * so `SPEC.md` §6 places it inline, replacing that region. It is the established
 * treatment rather than a new one: `2px` `signal` top rule, heading in `signal`, a plain
 * sentence, and the same button as the recovery action.
 *
 * Navigating anyway would be the serious bug. The reader would see a sign-in page,
 * believe they had signed out — on a borrowed browser, which is a case #8 explicitly
 * designed for — and leave a live session behind them.
 */
export function SignOutButton() {
  const router = useRouter();
  const [inFlight, setInFlight] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    setInFlight(true);

    const { error } = await authClient.signOut();

    if (error) {
      setInFlight(false);
      setFailed(true);
      return;
    }

    // Order matters: empty the Router Cache first, so the navigation below cannot be
    // served the signed-in render that is still sitting in it.
    router.refresh();
    router.replace("/sign-in");
  }

  return (
    <div>
      {failed ? (
        <section role="alert" className="mb-6 border-t-2 border-signal py-6">
          <h3 className="bill-title text-bill-sm text-signal">
            You are still signed in
          </h3>
          <p className="mt-3 max-w-[60ch] text-note leading-relaxed text-stock">
            MediaSafe could not reach the server to end this session, so it has not ended.
            Try again.
          </p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={signOut}
        disabled={inFlight}
        className={`${GHOST_RECOVERY} disabled:cursor-wait disabled:opacity-60`}
      >
        {inFlight ? "Signing you out" : "Sign out"}
      </button>
    </div>
  );
}
