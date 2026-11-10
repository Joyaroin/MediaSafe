"use client";

/**
 * The client-side half of every signed-in `GET` Route Handler (issue #480) — Search's own
 * fetch, and the list pickers' once they move off their Server Action too.
 *
 * ── Signed-out is one behaviour, arriving two ways ───────────────────────────────────
 *
 * `proxy.ts` gates every route on a session *cookie* and redirects a request with none
 * straight to `/sign-in`, before the route handler ever runs. A route handler's own
 * `401 { signedOut: true }` is the other half: a cookie was present but
 * `lib/session.ts`'s `signedInUserId()` found no session behind it — expired, revoked, or
 * forged. `fetch` follows a redirect on its own, so by the time either shape reaches here
 * it is a `401`, or an ordinary-looking `200` whose `redirected` flag and final `url` are
 * the only trace of where it actually landed. Both are *signed out*, and the error
 * discipline's auth row is full-page: there is no inline treatment for a reader with
 * nothing to act on, so this sends them to `/sign-in` itself rather than handing the
 * caller a value to notice and act on later — every caller would otherwise have to
 * remember to check for both shapes, and a reader a caller forgot to check would see a
 * broken panel instead of the sign-in screen the error discipline promises them.
 *
 * `SignedOutError` still throws, so a caller's `catch` does not also draw this as a read
 * failure — a search or a list-picker read half-done by a browser already navigating away
 * must never flash the inline failure state behind it.
 *
 * ── Everything else is a plain `throw` ───────────────────────────────────────────────
 *
 * A network failure, a response that is not JSON, and an aborted request all propagate
 * unchanged — there is no `catch` here to turn any of them into a value, which is the
 * same rule `AGENTS.md` states for a server read: empty and failed are structurally
 * separate, and nothing here manufactures a third thing out of either. An aborted
 * request rejects with the platform's own `AbortError`, before a request is even sent if
 * the signal was already aborted; callers that pass an `AbortController`'s signal are
 * expected to ignore that one specifically, which is what lets a superseded search be
 * cancelled without ever being drawn as a failure.
 */
export class SignedOutError extends Error {
  constructor() {
    super("Signed out");
    this.name = "SignedOutError";
  }
}

/** Whether `response` is the shape of being signed out — a `401`, or a redirect that
 * landed on the sign-in page instead of the route that was asked for. */
function isSignedOut(response: Response): boolean {
  if (response.status === 401) return true;
  return response.redirected && new URL(response.url).pathname === "/sign-in";
}

export async function readRoute<T>(
  path: string,
  init?: { signal?: AbortSignal },
): Promise<T> {
  const response = await fetch(path, { signal: init?.signal });

  if (isSignedOut(response)) {
    /* eslint-disable-next-line @next/next/no-location-assign-relative-destination --
     * A hard navigation is the point, not an oversight `router.push()` would fix: a
     * reader this module has just found signed out may be holding a React tree built
     * for an account that is no longer theirs, and the Shared Interface this implements
     * (issue #480) specifies `window.location.assign`, not the router, for exactly that
     * reason. */
    window.location.assign("/sign-in");
    throw new SignedOutError();
  }

  return (await response.json()) as T;
}
