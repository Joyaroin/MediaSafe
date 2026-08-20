import { getCookies } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

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
 * The one boundary where a session becomes a user id — **and the one place a session is
 * ended by something other than Better Auth's own sign-out endpoint.**
 *
 * Those are one responsibility rather than two, and the second was added deliberately
 * (issue #125, `clearSessionCookie`): a module that owns *is there a session, and whose* is
 * the module that owns *there is no longer one*. Splitting them would put half the answer
 * in a file that cannot see the other half, and the alternative home — `lib/session-cookie.ts`
 * — is ruled out by that file's own reason for existing, which `clearSessionCookie` sets out.
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
 * ── The session is read from the database once per request ───────────────────────────
 *
 * There is no cookie cache (`lib/auth.ts` turns Better Auth's off), so this is a query
 * and not a signature check. That is the cost of *sign-out revokes the session
 * server-side* being literally true: with the cache on, a copied cookie keeps answering
 * yes for the length of the cache after the row is gone.
 *
 * `lib/auth.ts` calls that cost "one query per request", and `cache()` on `currentSession`
 * below is what makes the sentence true. Without it the cost is one query per *caller*,
 * and the callers are not one: rendering `/up-next` asks three times — `masthead.tsx` and
 * `sidebar.tsx` each want the display name, the page itself wants the user id — so three
 * round trips answer a question whose answer cannot change between them.
 *
 * **This is not the cookie cache under another name, and it does not weaken revocation.**
 * React's `cache()` is scoped to a single server render pass and is dropped when that pass
 * ends. The next request queries the session table again, so a deleted row is still gone
 * on the very next navigation. What is deduplicated is one render asking one question
 * repeatedly — never one answer outliving the request that fetched it.
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
const currentSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

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
 * The display name for Settings' Profile section — `SPEC.md` §7, issue #123. Reads
 * `session.user.name` straight off the session Better Auth already resolved, the same
 * shape `requireImportOfferAnswered` takes for `importOfferAnsweredAt` above.
 *
 * Redirects on no session, matching every other `require*` export here. Settings' page
 * calls this alongside `requireUserId()`, the same two-query trade
 * `app/(signed-in)/library/page.tsx` already makes calling `requireUserId()` and
 * `requireImportOfferAnswered()` together.
 */
export async function requireDisplayName(): Promise<string> {
  const session = await currentSession();

  if (!session) redirect("/sign-in");

  return session.user.name;
}

/**
 * The current zone for Settings' Profile section — `SPEC.md` §7, issue #126. Same shape
 * as `requireDisplayName` above: reads `session.user.timezone` straight off the session
 * Better Auth already resolved, rather than a second query through `db/access.ts`.
 */
export async function requireTimezone(): Promise<string> {
  const session = await currentSession();

  if (!session) redirect("/sign-in");

  return session.user.timezone;
}

/**
 * The display name for the masthead, or `null` with no session.
 *
 * Never redirects — the masthead is not the gate (`app/(signed-in)/layout.tsx`'s
 * docblock explains why), and pairing this with a redirect would put a session check
 * back into the layout tree by the back door. In practice this only returns `null` when
 * a page under `(signed-in)/` has itself forgotten to call `requireUserId()`; rendering
 * nothing in the masthead for that case is strictly better than throwing in the middle
 * of the signed-in shell.
 */
export async function currentDisplayName(): Promise<string | null> {
  const session = await currentSession();
  return session?.user.name ?? null;
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
  const { name, attributes } = getCookies(authOptions).sessionToken;

  /**
   * Expired with **its own attributes**, rather than `cookies().delete(name)`.
   *
   * That shorter spelling is a no-op in production, and silently. Expiring a cookie is
   * setting it again with no lifetime, so the `Set-Cookie` that removes it has to match the
   * one that created it — and `delete(name)` writes no `Secure`. Over HTTPS the cookie is
   * `__Secure-better-auth.session_token`, and a browser **must reject** any `__Secure-`
   * cookie set without `Secure` (RFC 6265bis, cookie name prefixes), so the header is
   * discarded and the original cookie stays exactly where it was.
   *
   * This is invisible from localhost, which is the whole reason it is written out here:
   * `getCookies` returns the unprefixed name and `secure: false` on `http://`, so the short
   * version passes every local test and fails only on Vercel, where nothing would say so.
   *
   * Both headers were read off a real build with `BETTER_AUTH_URL` set to an `https` origin,
   * rather than reasoned about:
   *
   *     delete(name)  → Set-Cookie: __Secure-…=; Path=/; Expires=Thu, 01 Jan 1970 …
   *     this          → Set-Cookie: __Secure-…=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax
   *
   * The first is the one a browser throws away.
   *
   * `maxAge: 0` on the spread is what expires it; `path`, `sameSite`, `httpOnly` and
   * `secure` come from Better Auth's own derivation, so there is no second copy of any of
   * them here to drift.
   */
  (await cookies()).set(name, "", {
    ...attributes,
    sameSite: attributes.sameSite.toLowerCase() as "lax" | "strict" | "none",
    maxAge: 0,
  });
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
