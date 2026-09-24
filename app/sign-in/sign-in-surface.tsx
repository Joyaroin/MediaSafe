"use client";

import { useState, useSyncExternalStore } from "react";

import { IN_FLIGHT, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { SignInFailure } from "@/errors/sign-in-failure";
import { signInTreatment } from "@/errors/sign-in-treatment";
import { StandaloneSignInInstruction } from "@/errors/standalone-sign-in-instruction";
import { authClient } from "@/lib/auth-client";
import { writeSignupTimezoneCookie } from "@/lib/timezone";

import { readLaunchMode, serverLaunchMode, subscribeToLaunchMode } from "./launch-mode";

/**
 * Screen 1: **one control and no form.**
 *
 * There is no password, no magic link and no email field anywhere in the system (#8), so
 * there is nothing to type and nothing to validate. What that leaves is a button, a
 * designated place to render a failure, and an honest in-flight state — and the last two
 * are the whole of this component, because the first is one line.
 *
 * ── The three states, and why in-flight is one of them ───────────────────────────────
 *
 * *Idle* is the button. *In flight* is the button, disabled, saying what is happening —
 * the round trip to Google is a full page navigation and can take seconds on a phone, and
 * a button that looks pressable while it is already working is a button that gets pressed
 * again. *Failed* is the region above it.
 *
 * The in-flight state is never cleared on success, and that is deliberate rather than an
 * oversight: success **is** the navigation away. Clearing it would make the button look
 * ready again for the frame or two before the browser leaves, which is exactly the
 * flicker `tvtracker` shipped.
 *
 * ── The fourth state: standalone, no session ─────────────────────────────────────────
 *
 * Issue #309. `launchMode` reads `app/sign-in/launch-mode.ts`'s store through
 * `useSyncExternalStore` — the server renders `"browser"`, having no `window` to ask, and
 * the browser corrects it in the same render pass rather than through a `setState` inside
 * an effect (`lib/theme.ts` draws the identical line for the same lint rule).
 * `errors/sign-in-treatment.ts` turns that plus *this surface only ever renders for a
 * signed-out reader* (`app/sign-in/page.tsx`'s `isSignedIn()` redirect is the one caller
 * of that check) into a treatment, and `"openInBrowser"` replaces the whole of what this
 * component would otherwise return — button, in-flight state and failure region included
 * — with `StandaloneSignInInstruction`. A standalone reader who has just failed a round
 * trip still gets the instruction, not the failure region: the failure region's retry is
 * the same broken round trip, and the instruction already tells them the one thing that
 * works.
 */
export function SignInSurface({
  /**
   * Whether Google, or Better Auth's handling of Google, sent this reader back here
   * having failed. It arrives as `?error=…` in the URL, and the server component reads
   * only *whether* it is there — never what it says.
   */
  arrivedFailed,
}: {
  arrivedFailed: boolean;
}) {
  const [failed, setFailed] = useState(arrivedFailed);
  const [reference, setReference] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const launchMode = useSyncExternalStore(
    subscribeToLaunchMode,
    readLaunchMode,
    serverLaunchMode,
  );

  async function continueWithGoogle() {
    setFailed(false);
    setReference(null);
    setInFlight(true);

    // Before the redirect, because after it there is no browser of ours to ask. See
    // `lib/timezone.ts` — this is the only thing that ever sets a new account's zone.
    writeSignupTimezoneCookie();

    const { error } = await authClient.signIn.social({
      provider: "google",
      /**
       * Where Google sends the reader on success. `/` is the signed-in shell's entrance
       * and redirects on from there, so this stays right when build step 2 repoints `/`
       * at the library.
       */
      callbackURL: "/",
      /**
       * And on failure: back here, with `?error=…`, which is what puts the region above
       * on screen. Without this Better Auth would send them to its own `/api/auth/error`
       * page — a page in its vocabulary, not ours, and the specific thing #15's
       * blast-radius rule is written to prevent.
       */
      errorCallbackURL: "/sign-in",
    });

    // This half is the request that starts the flow — a network that is down, a rate
    // limit, credentials the server does not have. The OAuth round trip's own failures
    // come back through `errorCallbackURL` above and never reach here.
    if (error) {
      setInFlight(false);
      setFailed(true);
      // A real exception, so a real Sentry event and a real reference id. The OAuth
      // half has neither, which is why the failure region renders without one there.
      setReference(referenceFor(new Error("Sign-in with Google could not be started.")));
    }
  }

  // `signedIn` is always `false` here: `app/sign-in/page.tsx` is the one caller of
  // `isSignedIn()` and has already redirected a signed-in reader to `/` before this
  // component renders. See the docblock above for what a standalone launch renders
  // instead of everything below.
  if (signInTreatment(launchMode, false) === "openInBrowser") {
    return <StandaloneSignInInstruction />;
  }

  return (
    <>
      {/* The designated place. It is above the control, not instead of it, because the
          recovery action and the only action on this surface are the same button. */}
      {failed ? <SignInFailure reference={reference} /> : null}

      <div className="mt-10">
        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={inFlight}
          // Buttons: the one primary action on a surface is solid `accent`
          // with `accent-ink` text. There is exactly one action here, so this is it.
          className={`${SOLID_RECOVERY} ${IN_FLIGHT}`}
        >
          {inFlight ? "Taking you to Google" : "Continue with Google"}
        </button>
      </div>
    </>
  );
}
