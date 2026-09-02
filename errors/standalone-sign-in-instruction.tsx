import { FAILURE_HEADING, FAILURE_PROSE, FAILURE_SECTION } from "./failure-treatment";

/**
 * What a standalone launch with no session sees instead of the button — issue #309.
 *
 * `errors/sign-in-failure.tsx`'s docblock already carries the argument for why an
 * authentication failure is full-page: *a signed-out reader has one control and no
 * other surface to be told anything on, so a failure that is not full-page is a failure
 * that is nowhere.* This is the same placement, for a precondition rather than a failed
 * attempt — `errors/sign-in-treatment.ts` decides which one applies — so it reuses the
 * same treatment tokens rather than inventing a fourth shape for a third case of the
 * same rule. `AGENTS.md`: *the mechanisms exist already — build the caller, not a fifth
 * surface.*
 *
 * ── Why there is no button here ──────────────────────────────────────────────────────
 *
 * `SignInFailure` renders above the **Continue with Google** button and leaves it on
 * screen, because a failed round trip is worth retrying. This is not that: the cookie
 * store a standalone window writes to is not the one the browser reads, so pressing the
 * same button runs the same broken round trip again. `app/sign-in/sign-in-surface.tsx`
 * renders this *instead of* the button for exactly that reason — offering it back would
 * be offering a control that cannot work from here.
 *
 * ── Why there is no reference id ─────────────────────────────────────────────────────
 *
 * Nothing has failed. No exception was thrown, no Sentry event exists, and
 * `errors/reference.ts`'s id is for the event a reader might need to quote back — there
 * is not one here to give them.
 */
export function StandaloneSignInInstruction() {
  return (
    <section
      // `status`, not `alert`: this replaces the button once the standalone check
      // resolves after mount, and it is a fact about where the reader is, not an
      // interruption of something already in progress. `SignInFailure` reasons the
      // same way about its own arrival.
      role="status"
      className={FAILURE_SECTION}
    >
      <h2 className={FAILURE_HEADING}>Sign in from your browser</h2>

      <p className={FAILURE_PROSE}>
        MediaSafe was opened from its home screen icon, which keeps its sign-in
        separate from the browser&rsquo;s. Open MediaSafe in Safari or Chrome and sign
        in there, then come back to this icon to reach your library.
      </p>
    </section>
  );
}
