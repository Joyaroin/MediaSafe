/**
 * The last-watched link's pure half — issue #528. What the route reads is in `db/access.ts`
 * (`lastWatchedOwner`, `lastWatchedTitle`); everything between that title and the bytes the
 * visitor's browser receives is here, with no request and no database, so
 * `tests/last-watched.test.ts` drives all of it.
 *
 * The contract is the one a personal site relies on, and it is deliberately narrow: a
 * working link answers the title alone, and every other case is one and the same 404.
 */

/** The path segment the route is mounted under; the token follows it. */
export const LAST_WATCHED_PATH = "/api/last-watched";

/** `crypto.randomBytes(32)` as base64url is always exactly this: 43 URL-safe characters. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The token in the route's last segment, or `null` when the segment cannot be one. Checked
 * before the database is asked, so a malformed URL costs no query and answers the same 404
 * a replaced token does. Unlike the calendar feed's there is no suffix to strip: the link
 * is read by a script, not by a calendar app that judges a link by how it ends.
 */
export function lastWatchedTokenFrom(segment: string): string | null {
  return TOKEN_SHAPE.test(segment) ? segment : null;
}

/** The URL the reader gives their site. */
export function lastWatchedUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${LAST_WATCHED_PATH}/${token}`;
}

/**
 * Every answer allows any origin. The link is public by nature — whoever holds it may ask
 * from anywhere — so limiting origins would protect nothing.
 */
const ANY_ORIGIN = { "Access-Control-Allow-Origin": "*" } as const;

/**
 * The response for a reader's last watched title, or for there being none to give.
 *
 * - **A title** answers `200`, as `text/plain`, with the title alone as the body: no
 *   wrapper, no quotes, no trailing newline, and no cut — the site decides what is short
 *   enough to show. It may be kept for an hour, which is the same hour the cache behind it
 *   will blur the answer to (a later ticket); a browser may therefore show an old title
 *   for up to an hour after the link is switched off, which is accepted.
 * - **`null`** answers the plain `404` for every way of not having an answer: sharing off,
 *   an unknown, replaced or malformed token, and no dated watch. They are one answer so
 *   that someone guessing learns nothing from which guess was nearly right. `no-store`, as
 *   the calendar feed's 404, so a switched-off link stops answering at once for anyone
 *   who asks again.
 */
export function lastWatchedResponse(title: string | null): Response {
  if (title === null) {
    return new Response("Not found", {
      status: 404,
      headers: { ...ANY_ORIGIN, "Cache-Control": "no-store" },
    });
  }

  return new Response(title, {
    status: 200,
    headers: {
      ...ANY_ORIGIN,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
