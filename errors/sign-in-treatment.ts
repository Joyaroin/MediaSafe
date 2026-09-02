/**
 * Whether the sign-in surface offers its button or tells the reader to open a browser
 * instead — issue #309.
 *
 * An iOS home screen launch keeps a cookie store separate from Safari's own, so a
 * provider sign-in started inside it can fail or complete somewhere the standalone
 * window never sees. There is no recovery from inside that window — the round trip
 * itself is the thing that cannot be trusted — so *standalone, no session* is not a
 * failure to show a retry for. It is a precondition, decided before any attempt, and
 * `errors/sign-in-failure.tsx`'s retry button is the wrong answer to it.
 *
 * This is a pure function beside `errors/failure-treatment.ts` rather than a condition
 * written into `app/sign-in/sign-in-surface.tsx`, on the same reasoning `app/gesture-rules.ts`
 * and `app/restoration.ts` give for their own split: a rule that only exists inside a
 * component is a rule `vitest.config.mts`'s `environment: "node"` cannot assert. It holds
 * no state, touches no element and reads no clock — the two facts it needs, launch mode
 * and whether a session exists, are handed in as plain values by whatever binding read
 * them.
 */

/**
 * How this reader arrived. `"standalone"` is a home screen launch with no browser
 * chrome — Android and desktop PWAs answer this through
 * `matchMedia("(display-mode: standalone)")`, iOS Safari through `navigator.standalone`,
 * and `app/sign-in/launch-mode.ts` is the one place either is read. `"browser"` is
 * everything else, ordinary tab included.
 */
export type LaunchMode = "standalone" | "browser";

/**
 * The two things the sign-in surface can show.
 *
 * `"signInForm"` is today's screen, unchanged: the heading, the button, and
 * `SignInFailure` above it when a provider round trip has failed. `"openInBrowser"` is
 * the new one: a full-page plain instruction, and no button at all, because offering the
 * button back is offering the same broken round trip again.
 */
export type SignInTreatment = "signInForm" | "openInBrowser";

/**
 * A session already means past it — `app/sign-in/page.tsx`'s `isSignedIn()` redirect
 * takes a signed-in reader to `/` before this surface renders at all, standalone or not.
 * `signedIn` is still a real parameter rather than an assumption baked into this
 * function, so that fact is asserted here directly instead of being taken on faith from
 * a caller three files away.
 */
export function signInTreatment(
  launchMode: LaunchMode,
  signedIn: boolean,
): SignInTreatment {
  return launchMode === "standalone" && !signedIn ? "openInBrowser" : "signInForm";
}
