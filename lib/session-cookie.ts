import { getSessionCookie } from "better-auth/cookies";

/**
 * Whether a request carries something shaped like a session cookie — and nothing more.
 *
 * ── This is not `lib/session.ts`, and the difference is the whole file ───────────────
 *
 * `lib/session.ts` answers *who is this*, by querying the session table, and it is the
 * only module allowed to. This one answers *is there a cookie*, by reading a header. It
 * does not know whether the token is valid, whether the row still exists, or who it
 * belongs to. A revoked session leaves the cookie in the browser until the response that
 * clears it lands, and a forged one is a string anybody can type.
 *
 * So nothing may branch on this to decide what a reader is allowed to see. Its one caller
 * is `proxy.ts`, which uses it to turn a signed-out request away at the edge of the app
 * before it renders anything — and every page behind it still calls `requireUserId()`,
 * which is the check that actually holds. Next's own guidance is the same: proxy is for
 * optimistic checks, not for authorization.
 *
 * ── Why it lives in `lib/` ───────────────────────────────────────────────────────────
 *
 * Because `eslint.config.mjs` restricts `better-auth` to `lib/`, so that no page builds a
 * second auth instance or resolves its own session. Putting the cookie read here obeys
 * that rule rather than disabling it at the root — and the root is the last file in the
 * repository where an exemption to the session boundary should be sitting.
 *
 * It is a separate module from `lib/session.ts` rather than a third export on it because
 * `proxy.ts` runs on every request to every route: importing `lib/session.ts` would pull
 * `lib/auth.ts`, the Better Auth instance and the Neon driver into the proxy's module
 * graph, to read one header.
 */
export function carriesSessionCookie(request: Request): boolean {
  /**
   * Better Auth's own reader, rather than a cookie name written out here. The name it
   * looks for changes with the deployment — it is `better-auth.session_token` on
   * `localhost` and `__Secure-better-auth.session_token` over HTTPS — and a copy of that
   * rule here would be a second place to get the prefix wrong.
   */
  return getSessionCookie(request) !== null;
}
