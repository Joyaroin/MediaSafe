import { cachedLastWatchedTitle } from "@/cache/last-watched";
import { lastWatchedOwner } from "@/db/access";
import { lastWatchedResponse, lastWatchedTokenFrom } from "@/lib/last-watched";

/**
 * The reader's last watched title — issue #528. `GET /api/last-watched/<token>`.
 *
 * ── Un-sessioned, not unauthenticated ────────────────────────────────────────────────
 *
 * A visitor's browser sends no session, so this is the fifth named exemption in
 * `proxy.ts`'s matcher and in `tests/route-manifest.test.ts`'s `EXEMPT`. The token in the
 * path is the credential: 256 random bits, minted by the server, held by one account, and
 * answering only while that reader has sharing switched on.
 *
 * ── 404 for every way of not having an answer ────────────────────────────────────────
 *
 * Sharing off, an unknown or replaced token, a malformed one and a reader with no dated
 * watch are one response (`lastWatchedResponse(null)`).
 *
 * ── No `try` ─────────────────────────────────────────────────────────────────────────
 *
 * A failed read throws and Next answers 500. It must never become a 404, or "the database
 * is down" would read as "this reader shares nothing"; the site shows nothing on either,
 * but only one of them is true.
 *
 * ── The title is cached for an hour, the token is not ───────────────────────────────
 *
 * The token lookup runs on every request, so switching sharing off or replacing the link
 * answers 404 at once even while a title is cached. The title behind it is worked out at
 * most once an hour per reader (`cache/last-watched.ts`, which says why no write clears it).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token: segment } = await context.params;
  const token = lastWatchedTokenFrom(segment);
  const owner = token === null ? null : await lastWatchedOwner(token);

  return lastWatchedResponse(owner === null ? null : await cachedLastWatchedTitle(owner));
}
