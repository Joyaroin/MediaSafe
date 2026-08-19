import { getCookies } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { asUserId, type UserId } from "@/db/access";
/* eslint-disable-next-line no-restricted-imports --
 * The reason the restriction exists, reaching for the thing it restricts. This module is
 * the one place a session becomes a user id, so it is the one place that needs the
 * instance to ask. `eslint.config.mjs` keeps `**\/lib/auth` restricted even inside `lib/`
 * so that this stays a line with a reason beside it rather than an open door.
 *
 * `authOptions` comes through the same door and for the same reason: it is the object the
 * cookie name is derived from, and deriving it anywhere else would be a second copy of the
 * secure-prefix rule. See `clearSessionCookie`.
 */
import { authOptions, getAuth } from "@/lib/auth";

/**
 * The one boundary where a session becomes a user id.
 *
 * Everything downstream of here — every function in `db/access.ts`, every server action,
 * every route handler — takes the user id as an argument. This module is the only place
 * that asks who is asking, and the only place that calls Better Auth's
 * `auth.api.getSession()`. `eslint.config.mjs` is what makes that a check rather than a
 * claim.
 *
 * One place, because "who is this" answered in two places is two answers. A read that
 * resolves its own session is also a read that cannot be called for anyone else, which
 * makes it untestable and makes the import and the nightly refresh — neither of which has
 * a session at all — impossible to write without a second path to the same rows.
 *
 * ── The session is read from the database on every call ──────────────────────────────
 *
 * There is no cookie cache (`lib/auth.ts` turns Better Auth's off), so this is a query
 * and not a signature check. That is the cost of *sign-out revokes the session
 * server-side* being literally true: with the cache on, a copied cookie keeps answering
 * yes for the length of the cache after the row is gone.
 */

/**
 * The user id for this request, or a redirect to sign-in.
 *
 * ── Why it redirects rather than throwing ────────────────────────────────────────────
 *
 * `proxy.ts` gates every route on a session cookie, so a request with no cookie at all was
 * turned away before it reached this line and the redirect below is the assertion that the
 * gate held. It is not redundant: the gate reads a cookie and this queries the session
 * table, so an expired session, a revoked one and a forged string all get past the gate
 * and are stopped here. This is the check with teeth; that one is the one that runs first.
 *
 * It still sends the reader somewhere rather than throwing, and the difference matters on
 * the glass: a throw here is a read failure, and issue #41's boundary would tell someone
 * whose session merely expired that *this did not load*, with a reference id for an
 * incident that never happened. Not being signed in is not a failure. It is a place to
 * go.
 */
/**
 * The one call to Better Auth in the codebase, and the reason this module is a module
 * rather than one function per export: every export below needs the answer, and *asking
 * twice in two spellings* is how the second spelling eventually asks a slightly different
 * question. Not exported — a caller holding a session is a caller that can read a user id
 * off it without the branding, which is the whole thing `db/access.ts` is guarding.
 */
async function currentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

export async function requireUserId(): Promise<UserId> {
  const session = await currentSession();

  if (!session) redirect("/sign-in");

  /**
   * The one honest cast in the codebase. `UserId` is branded so it cannot be confused
   * with the entry ids, watch ids and source keys the next build steps fill the app
   * with, and this is the single place a real one is minted — from an id Better Auth
   * just resolved from a session, and from nothing else.
   */
  return asUserId(session.user.id);
}

/**
 * Whether this signed-in reader has answered the first-run **Bring your library in**
 * offer — by choosing to import or by declining, either one (issue #75).
 *
 * Reads `session.user.importOfferAnsweredAt` straight off the session Better Auth already
 * resolved, rather than a second query through `db/access.ts`: the additional field is
 * part of the user row `getSession()` returns, exactly like `session.user.timezone` would
 * be, so there is nothing here worth a choke-point round trip of its own.
 *
 * Redirects rather than throwing on no session, for the same reason `requireUserId` does —
 * every caller of this has already called that too, on a route with no session at all,
 * but this stays correct on its own rather than trusting a call order nothing enforces.
 */
export async function requireImportOfferAnswered(): Promise<boolean> {
  const session = await currentSession();

  if (!session) redirect("/sign-in");

  return session.user.importOfferAnsweredAt !== null;
}

/**
 * Drop this browser's session cookie — the tidy-up after an account has been deleted, and
 * the only caller is `app/(signed-in)/settings/delete-account/actions.ts` (issue #125).
 *
 * ── Why this is not a sign-out ───────────────────────────────────────────────────────
 *
 * Sign-out revokes: `authClient.signOut()` posts to Better Auth, which deletes the session
 * row and clears the cookie. By the time this runs there is no row to delete — the account
 * is gone and `session.user_id` cascaded with it — so the revocation has already happened,
 * more completely than a sign-out could manage. What is left is a string in the browser
 * pointing at nothing.
 *
 * That string is harmless: `lib/session.ts` queries the session table on every call, and a
 * token whose row is gone resolves to nobody, so every protected page redirects to
 * sign-in. Clearing it anyway is the difference between *signed out* and *signed out, and
 * the browser has stopped claiming otherwise* — and on the one screen that promises to
 * remove everything, leaving a live-looking credential behind would be the promise not
 * quite meaning what it says.
 *
 * ── Why the deletion runs first and this second ──────────────────────────────────────
 *
 * The other order — sign out, then delete — was rejected. A delete that then failed would
 * leave the reader signed out of an account that still exists, on a page whose *nothing was
 * destroyed* message they can no longer act on. This way the irreversible statement goes
 * first and this cannot fail in a way that matters: a cookie that outlives the account it
 * named authenticates nothing.
 *
 * ── The name is derived, never written out ───────────────────────────────────────────
 *
 * `getCookies(authOptions).sessionToken.name` — Better Auth's own derivation, from the
 * same options object the instance is built from, so it is `better-auth.session_token` on
 * `localhost` and `__Secure-better-auth.session_token` over HTTPS without this file
 * knowing that rule. `lib/session-cookie.ts` reads the cookie through Better Auth's reader
 * for the same reason and is the wrong home for this: it exists so that `proxy.ts` can
 * read a header without pulling `lib/auth.ts` and the Neon driver into the module graph of
 * every request, and importing `authOptions` there would undo exactly that.
 */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(getCookies(authOptions).sessionToken.name);
}

/**
 * Whether this request already carries a signed-in session.
 *
 * Exactly one caller, and there should never be a second: the sign-in route, which has
 * to take someone who is already signed in past it rather than offering them a second
 * sign-in. Every other surface wants `requireUserId()` — a boolean invites a caller to
 * branch on it and then fetch the id from somewhere else, which is the two-answers
 * problem this module exists to prevent.
 */
export async function isSignedIn(): Promise<boolean> {
  return (await currentSession()) !== null;
}
