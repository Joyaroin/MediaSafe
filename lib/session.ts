import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { asUserId, type UserId } from "@/db/access";
/* eslint-disable-next-line no-restricted-imports --
 * The reason the restriction exists, reaching for the thing it restricts. This module is
 * the one place a session becomes a user id, so it is the one place that needs the
 * instance to ask. `eslint.config.mjs` keeps `**\/lib/auth` restricted even inside `lib/`
 * so that this stays a line with a reason beside it rather than an open door.
 */
import { getAuth } from "@/lib/auth";

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
 * Issue #43 adds a middleware matcher over the route manifest, so that constraint 5 —
 * *no unauthenticated route may ever be added* — is machine-checked rather than
 * remembered. When that lands, an unauthenticated request should already have been turned
 * away before any page calls this, and this becomes the assertion that the gate held.
 *
 * It still sends the reader somewhere rather than throwing, and the difference matters on
 * the glass: a throw here is a read failure, and issue #41's boundary would tell someone
 * whose session merely expired that *this did not load*, with a reference id for an
 * incident that never happened. Not being signed in is not a failure. It is a place to
 * go.
 */
/**
 * The one call to Better Auth in the codebase, and the reason this module is a module
 * rather than two functions: both exports below need the answer, and *asking twice in two
 * spellings* is how the second spelling eventually asks a slightly different question.
 * Not exported — a caller holding a session is a caller that can read a user id off it
 * without the branding, which is the whole thing `db/access.ts` is guarding.
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
