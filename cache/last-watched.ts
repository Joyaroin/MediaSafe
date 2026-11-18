import { unstable_cache } from "next/cache";

import { lastWatchedTitle, type UserId } from "@/db/access";

/**
 * The one owned fact with a window and no tag — issue #529, and a named exception to the
 * rule `cache/tags.ts` is built on.
 *
 * `tags.ts` sorts the read cache into **owned** facts (about an account: a tag and *no
 * window*, correct until a write says otherwise) and **borrowed** facts (TMDB's, in
 * `borrowed-facts.ts`: a tag *and* a window). This is owned data that carries **a window
 * and no tag**, and it is in a file of its own so that every sentence in `tags.ts` that
 * says "nothing in this file has a window" stays true.
 *
 * ── Why it is not busted by a write ──────────────────────────────────────────────────
 *
 * The reason is **privacy, not cost**. The read answers a public link, and anyone can ask
 * a public link and note when each new title appears. If a new watch busted the entry, the
 * link would timestamp every title to the minute; with an hour in front of it, the same
 * observer learns the hour. The hour is the point, so `INVALIDATES` has no entry that
 * names this read — a new watch, an unwatch and an import all leave the cached title in
 * place until it expires. The spec (#527) chose that on purpose and Adham confirmed the
 * exception.
 *
 * ── What it does *not* cache ─────────────────────────────────────────────────────────
 *
 * The token lookup (`lastWatchedOwner`) is not cached anywhere. It runs on every request,
 * so switching sharing off or asking for a new link takes effect at once, even while a
 * title is cached here: the route finds no owner and never reaches this read.
 *
 * ── No `try`, and the key carries the account ────────────────────────────────────────
 *
 * Like every cached read, a failure rejects out of `unstable_cache` and nothing is stored,
 * so a database that is down is never remembered as "no title". A reader with no dated
 * watch caches `null` for the hour — that is a query that succeeded and found nothing.
 * The key parts name the account, as `mediasafe/cache-key-carries-account` requires, and
 * they are written out here for the rule to see.
 */
export const LAST_WATCHED_WINDOW_SECONDS = 60 * 60;

export function cachedLastWatchedTitle(userId: UserId): Promise<string | null> {
  const read = unstable_cache(lastWatchedTitle, ["lastWatchedTitle", userId], {
    revalidate: LAST_WATCHED_WINDOW_SECONDS,
  });

  return read(userId);
}
