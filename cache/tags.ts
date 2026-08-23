import { revalidateTag, unstable_cache, updateTag } from "next/cache";

import { listLibraryEntries, type LibraryEntryRow, type UserId } from "@/db/access";
import { DEFAULT_LIBRARY_SORT, type LibrarySort } from "@/db/library-sort";

/**
 * The read cache: the whole tag vocabulary, every cached read, and every bust.
 *
 * ── What this module reverses ────────────────────────────────────────────────────────
 *
 * `SPEC.md` §3 constraint 1 said *no read cache*, in a list of five things `tvtracker`'s
 * dual data path had taught. Issue #219 took that clause back and left the other four
 * standing — there is still no guest mode, no second repository implementation, no local
 * store, no service worker and no offline queue — and
 * `docs/adr/0002-the-read-cache-and-its-tags.md` is where the reversal is argued. Read
 * the ADR before adding a second cached read; this file is the mechanism, not the
 * reasoning.
 *
 * ── The property, and the two things it now rests on ─────────────────────────────────
 *
 * What the original constraint bought was **two reads of the same fact cannot disagree**.
 * A cache keeps that property only while two things hold, and both of them are here
 * rather than in anybody's memory:
 *
 * 1. **Every key carries an account.** `cachedLibraryEntries` is the only call to
 *    `unstable_cache` there is, and `eslint-rules/cache-key-carries-account.mjs` fails
 *    the build if its key parts stop naming one — on every `unstable_cache` call in the
 *    repository, not only on this one, so the second cached read is checked before it is
 *    written rather than after it leaks.
 * 2. **Every write busts its tags.** `INVALIDATED_BY` below is the map, it is keyed by
 *    the write's own name in `db/access.ts`, and `tests/cache-tags.test.ts` fails when
 *    `db/access.ts` grows an export the map has not classified. A write nobody thought
 *    about is a failing test rather than a library that quietly disagrees with the
 *    database.
 *
 * ── Nothing caches or busts outside this file ────────────────────────────────────────
 *
 * `eslint.config.mjs` restricts `next/cache` everywhere but here, in the same register as
 * the data-access choke point next to it. That is what makes the two properties above
 * statements about the repository rather than about this module: a page that reached for
 * `unstable_cache` itself could satisfy neither, and now it cannot reach for it at all.
 */

/**
 * The reads that are cached. One, today, and deliberately: issue #219 proves the
 * machinery on the library and leaves the rest to #225, #226 and #227. A second entry
 * here is a second cached read, and it is the ticket for it that decides whether there
 * should be one.
 */
export type CachedRead = "library";

/**
 * An account and a read, and there is no other shape a tag has.
 *
 * Not exported: a tag that anything outside this file could build is a tag something
 * outside this file could bust, and half of what this module is for is that neither
 * happens. `revalidateTag` caps a tag at 256 characters; a Better Auth user id is 32, so
 * this is nowhere near it.
 */
function tagFor(read: CachedRead, userId: UserId): string {
  return `${read}:${userId}`;
}

/**
 * The library, read through the cache — `library/page.tsx`'s one read, and the only
 * cached read there is.
 *
 * ── There is no `try` here, and that is the point ────────────────────────────────────
 *
 * `unstable_cache` writes a cache entry from a resolved value only: a rejection
 * propagates out of it untouched and nothing is stored. So a failed read still throws
 * into `app/error.tsx`, an empty library is still reachable only by a query that
 * succeeded and found nothing, and `SPEC.md` §3.2 holds through the cache exactly as it
 * held without one. A cache that stored `[]` for a database that was down would be
 * `tvtracker`'s bug with a longer memory.
 *
 * ── Sort is part of the key, and one tag busts every sort ────────────────────────────
 *
 * `sort` is an argument, so each order is its own entry — four of them at most
 * (`db/library-sort.ts`). They all carry the same tag, because they are all the same
 * account's library, so one `updateTag` invalidates every order at once. Nothing has to
 * enumerate them and nothing can forget one.
 *
 * ── No `revalidate`, so no clock ─────────────────────────────────────────────────────
 *
 * An entry lives until a tag busts it. Time-based revalidation is the alternative the ADR
 * rejects, and it is rejected on the property rather than on cost: a window in which the
 * library is allowed to disagree with the database is exactly what the original
 * constraint existed to forbid, and a shorter window is a smaller lie rather than a
 * different kind of one.
 *
 * ── The key parts are written out here, and not built by a helper ────────────────────
 *
 * They were, in the first draft of this file, and `mediasafe/cache-key-carries-account`
 * rejected it — the rule has no type information and cannot see the account through a
 * function call, so a helper would have made every key in this codebase unreadable to the
 * one check that reads them. Inline is what the rule can see, and there is exactly one
 * call to keep inline because nothing outside this file may make a second.
 *
 * `unstable_cache` hashes `keyParts` together with the stringified callback and the JSON
 * of the call's arguments, so the account reaches the key twice: once in the array below,
 * and once as `listLibraryEntries`'s own first argument. Both are deliberate. The
 * argument is what a reader of the call site sees; the array is what the lint rule sees.
 */
export function cachedLibraryEntries(
  userId: UserId,
  sort: LibrarySort = DEFAULT_LIBRARY_SORT,
): Promise<readonly LibraryEntryRow[]> {
  const read = unstable_cache(listLibraryEntries, ["library", userId], {
    tags: [tagFor("library", userId)],
  });

  return read(userId, sort);
}

/**
 * Every write in `db/access.ts`, and the cached reads each one invalidates.
 *
 * ── Why the whole list, including the writes that invalidate nothing ─────────────────
 *
 * An empty array is an answer, not an omission: *this write changes nothing any cached
 * read shows.* It is worth writing down because the alternative is a map holding only the
 * writes somebody remembered, which is indistinguishable from a complete one right up
 * until it is not. `tests/cache-tags.test.ts` holds this against `db/access.ts`'s actual
 * exports, so a new write is a failing test until it is classified here.
 *
 * ── The tag names the row, not the column ────────────────────────────────────────────
 *
 * `rateTitle` writes `library_entry.rating`, which `listLibraryEntries` does not select
 * today, so a strict reading would put it with the empty ones. It busts the library
 * anyway, because the entry it writes *is* the row the library reads, and the day that
 * read grows a rating is not the day anybody will come back to this line. The list writes
 * are the opposite case and belong with the empty ones on the same argument: they touch
 * `list` and `list_membership`, which the library grid does not join and is not about.
 *
 * ── `refreshTitleMirror` and `repointTitle` are not the reader's writes ──────────────
 *
 * They are the nightly sweep's, they change `title.name`, `release_year` and
 * `poster_path` — three columns the library grid prints — and they change them for every
 * account holding that title at once. That is why they are here and why
 * `invalidateForBackgroundWrite` exists: the sweep is a route handler rather than a
 * Server Action, so it cannot call `updateTag`, and the account is not the caller's own.
 * `app/api/cron/nightly-sweep/route.ts` resolves the accounts and busts each.
 */
export const INVALIDATED_BY = {
  addTitleToLibrary: ["library"],
  applyImportChunk: ["library"],
  recordWatch: ["library"],
  unwatch: ["library"],
  markWatchedUpTo: ["library"],
  abandonTitle: ["library"],
  abandonTitles: ["library"],
  unabandonTitle: ["library"],
  rateTitle: ["library"],
  removeTitleFromLibrary: ["library"],
  deleteAccount: ["library"],
  refreshTitleMirror: ["library"],
  repointTitle: ["library"],
  /** Writes `user.import_offer_answered_at`, which no cached read selects. */
  markImportOfferAnswered: [],
  /** `list` and `list_membership`. No cached read joins either. */
  createList: [],
  createListAndAddTitle: [],
  deleteList: [],
  addTitleToList: [],
  addTitlesToList: [],
  reorderListMembership: [],
} as const satisfies Record<string, readonly CachedRead[]>;

/** A write in `db/access.ts`, named by the function that performs it. */
export type Write = keyof typeof INVALIDATED_BY;

/**
 * `db/access.ts`'s reads, listed for one purpose: `tests/cache-tags.test.ts` adds them to
 * `INVALIDATED_BY`'s keys and holds the union against the module's real exports, so that
 * *classified* means classified as one or the other rather than merely absent from the
 * map. A read invalidates nothing, so there is nothing else this list is for.
 */
export const READS = [
  "accountFootprint",
  "accountsHoldingTitles",
  "getListDetail",
  "getTitleDetail",
  "getUnownedTitleDetail",
  "libraryCatalogueKeys",
  "libraryEntryIdForTitle",
  "listAbandoned",
  "listLibraryEntries",
  "listLists",
  "listUpNextRails",
  "listWatchlist",
  "resolveSeedUserId",
  "titleFootprint",
  "titlesDueForRefresh",
  "watchedTmdbEpisodeIds",
] as const;

/**
 * Bust one account's tags for a write that has **already committed** — the call every
 * Server Action makes, after the write and before it returns.
 *
 * ── `updateTag`, not `revalidateTag` ─────────────────────────────────────────────────
 *
 * They are not interchangeable, and the difference is the acceptance criterion.
 * `revalidateTag(tag, "max")` marks the entry stale and serves it while it refreshes in
 * the background — Next.js deliberately does not mark the path revalidated in that case,
 * *so that server actions don't pull their own writes* (`next/dist/server/web/spec-
 * extension/revalidate.js`, in as many words). Which is to say: the reader who just
 * marked an episode would be served the library from before they marked it. `updateTag`
 * expires the entry outright and marks the path, so the render that comes back with the
 * action's own response is the one that has the write in it. *The library agreeing within
 * the same breath* is what issue #219 asks for, and this is the call that provides it.
 *
 * ── Success only ─────────────────────────────────────────────────────────────────────
 *
 * Every caller invalidates on the success path, past the `catch` that reports the
 * failure. A write that did not land changed nothing, so there is nothing to invalidate;
 * busting anyway would throw away a correct cache entry and, worse, would make a failed
 * write look from here like a write that happened. The optimistic rollback and the
 * persistent toast (`errors/write-failure.ts`) are untouched by any of this.
 *
 * ── Only from a Server Action ────────────────────────────────────────────────────────
 *
 * `updateTag` throws outside one, by design and by name. The nightly sweep is the one
 * caller that is not an action; it uses `invalidateForBackgroundWrite` below.
 */
export function invalidateFor(write: Write, userId: UserId): void {
  for (const read of INVALIDATED_BY[write]) {
    updateTag(tagFor(read, userId));
  }
}

/**
 * The same busts, from a route handler — the nightly sweep, and nothing else today.
 *
 * `revalidateTag(tag, "max")` rather than `updateTag`, for the two reasons that make this
 * a separate function and not a parameter: `updateTag` throws outside a Server Action,
 * and nobody here is reading their own write. Stale-while-revalidate is the honest
 * treatment for a refreshed poster — the next reader gets the entry that is already
 * there, and the one after that gets the refreshed one — where it would be the wrong
 * treatment for a reader who just abandoned a title.
 */
export function invalidateForBackgroundWrite(write: Write, userId: UserId): void {
  for (const read of INVALIDATED_BY[write]) {
    revalidateTag(tagFor(read, userId), "max");
  }
}
