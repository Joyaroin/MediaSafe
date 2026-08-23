import { revalidateTag, unstable_cache, updateTag } from "next/cache";

import { listLibraryEntries, type LibraryEntryRow, type UserId } from "@/db/access";
import { DEFAULT_LIBRARY_SORT, type LibrarySort } from "@/db/library-sort";

/**
 * The read cache: the owned half of the vocabulary, and every write that busts one.
 *
 * ── What this module reverses ────────────────────────────────────────────────────────
 *
 * `SPEC.md` §3 constraint 1 said *no read cache*, in a list of six things `tvtracker`'s
 * dual data path had taught. Issue #219 took that clause back and left the other five
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
 * 1. **Every key carries an account.** Every call to `unstable_cache` in this repository
 *    is in `cache/` — this file and `borrowed-facts.ts` beside it — and
 *    `eslint-rules/cache-key-carries-account.mjs` fails the build if any of their key
 *    parts stops naming one. The rule reads every such call wherever it is written, so the
 *    next cached read is checked before it exists rather than after it leaks. It held for
 *    one call when #219 wrote it and holds for five now.
 * 2. **Every write busts its tags.** `INVALIDATES` below is the map, it is keyed by
 *    the write's own name in `db/access.ts`, and `tests/cache-tags.test.ts` fails when
 *    that file grows an `export async function` the map has not classified. A write
 *    nobody thought about is a failing test rather than a library that quietly disagrees
 *    with the database.
 *
 *    The check is that narrow on purpose and it is worth knowing where it stops: it reads
 *    `db/access.ts` as text and matches `export async function`. Every read and every
 *    write in that module is async, because every one of them awaits Postgres — so the
 *    set it matches is the set that matters today, and a synchronous export
 *    (`asUserId`, `ownedBy`) is a helper rather than a query. A synchronous exported
 *    *write* would slip past, and would also be a thing that could not touch the database.
 *
 * ── Nothing caches or busts outside `cache/` ─────────────────────────────────────────
 *
 * `eslint.config.mjs` restricts `next/cache` to this directory, in the same register as
 * the data-access choke point next to it. That is what makes the two properties above
 * statements about the repository rather than about this module: a page that reached for
 * `unstable_cache` itself could satisfy neither, and now it cannot reach for it at all.
 *
 * ── Two kinds of fact, and two files ─────────────────────────────────────────────────
 *
 * **Owned facts** are answers about an account — the library, and in #226 up next, lists
 * and owned title detail. They are correct until a write says otherwise, so they carry a
 * tag and **no window**. That is this file.
 *
 * **Borrowed facts** are answers about a title, copied from TMDB and the same for every
 * reader: a synopsis, a cast list, a watch-provider row, and the mirrored `title` and
 * `episode` metadata. They change on TMDB's schedule and nothing MediaSafe does observes
 * it, so a tag alone would never fire and they carry **a window as well** — issue #225,
 * and `borrowed-facts.ts` beside this file, whose top block says why it is a second file
 * rather than a second section. `SPEC.md` §3.1's amendment sets out the two lifetimes.
 */

/**
 * The **owned** reads that are cached, named by the account-scoped tag they carry.
 *
 * One, today: issue #219 proved the machinery on the library and #226 is the ticket that
 * brings up next, lists and owned title detail behind it. Borrowed reads are a separate
 * vocabulary in `borrowed-facts.ts` — because a bust for one of those has to name a title
 * rather than an account, and that file says why at length.
 */
export type CachedRead = "library";

/**
 * An account and a read — the shape every **owned** tag has. (`borrowedTagFor`, in
 * `borrowed-facts.ts`, is the other one: a fact and a title, and no account. Its own block
 * argues why that is not the property being given up.)
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
 * **owned** cached read there is.
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
 * ── Four writes change what *other people's* libraries show ─────────────────────────
 *
 * `MIRRORS_SHARED_TITLE_ROWS` below names them, and it is the subtlest thing in this
 * file. All four go through `db/access.ts`'s `mirrorTitle`, which upserts the **global**
 * `title` row — `name`, `release_year`, `poster_path`, the three columns the library grid
 * prints beyond state — and the global `episode` rows that `library_entry_state` and
 * `library_entry_up_next` are derived from. `title` and `episode` are unowned, one row per
 * TMDB id, shared by every account (ADR-0001), so **one account adding a show changes what
 * every other account holding it sees.** `addTitleToLibrary`'s own docblock has said so
 * since build step 2: *one person adding a show creates the rows every other person reads,
 * and re-adding one refreshes what they see.*
 *
 * Without a cache that was harmless — everybody's next read was fresh. With one it is the
 * exact failure this ticket exists to prevent, and it does not heal, because there is no
 * expiry to fall back on. So every caller of these four resolves the holders through
 * `accountsHoldingTitles` and calls `invalidateForOtherAccounts` as well as its own bust.
 *
 * `tests/cache-tags.test.ts` reads `db/access.ts` and fails if a function whose body calls
 * `mirrorTitle` is missing from that set — the add path was missed on the first pass here,
 * found in review, and this is the check that means the next one is not.
 *
 * Since issue #225 these same writes owe a **second** call, `invalidateBorrowedFactsFor`,
 * and for a reason `invalidateForOtherAccounts` does not cover: the accounts *holding* a
 * title are not the accounts reading its borrowed facts. That function's docblock draws
 * the distinction; this list is the answer to *who owes it*, for both.
 */
export const INVALIDATES = {
  addTitleToLibrary: ["library"],
  addTitleToLibraryWatched: ["library"],
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
export type Write = keyof typeof INVALIDATES;

/**
 * The writes that reach `mirrorTitle` and so change the shared `title` and `episode`
 * rows — the ones whose blast radius is every account holding the title, not just the one
 * that made the write. `INVALIDATES`'s docblock argues it; this is the list, and
 * `tests/cache-tags.test.ts` holds it against which functions in `db/access.ts` actually
 * reach that call.
 *
 * **Reach, not call.** `addTitleToLibraryWatched` never names `mirrorTitle` — it calls
 * `addTitleToLibrary`, deliberately, so that *"the mirror refresh every account reads
 * happens on this path exactly as it does on the plain one"* (its own docblock). It
 * mirrors the title just as surely for being one function further away, so the test
 * follows the calls to a fixed point rather than grepping each body once. That was found
 * the same way the add path was: by the check failing on a write somebody else added.
 */
export const MIRRORS_SHARED_TITLE_ROWS = [
  "addTitleToLibrary",
  "addTitleToLibraryWatched",
  "applyImportChunk",
  "refreshTitleMirror",
  "repointTitle",
] as const satisfies readonly Write[];

/**
 * `db/access.ts`'s reads, listed for one purpose: `tests/cache-tags.test.ts` adds them to
 * `INVALIDATES`'s keys and holds the union against the module's real exports, so that
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
 * ── This is the writer's own account, and only from a Server Action ─────────────────
 *
 * `updateTag` throws outside one, by design and by name. And it is the right call only
 * for the account that made the write — the one about to be shown the result. Every other
 * account whose library this write changed goes through `invalidateForOtherAccounts`
 * below, which is a different promise and not a different spelling.
 */
export function invalidateFor(write: Write, userId: UserId): void {
  for (const read of INVALIDATES[write]) {
    updateTag(tagFor(read, userId));
  }
}

/**
 * The same busts, for accounts that did **not** make the write — every holder of a title
 * whose shared mirror it changed (`MIRRORS_SHARED_TITLE_ROWS`), and the nightly sweep's
 * accounts, which are nobody's own.
 *
 * ── `revalidateTag(tag, "max")`, and why that is the honest call here ────────────────
 *
 * Nobody in `userIds` is reading their own write. They are somewhere else, or asleep, and
 * what changed under them is a poster, a name, a year, or an episode that arrived — so
 * stale-while-revalidate is exactly right: the next reader gets the entry that is already
 * there and the one after that gets the refreshed one, and nobody waits on a query for a
 * change they did not make. It would be the wrong call for the writer, which is why that
 * is a separate function.
 *
 * It also works where `updateTag` cannot: the sweep is a route handler, and `updateTag`
 * throws outside a Server Action.
 *
 * ── `writer` is skipped, not merely tolerated ───────────────────────────────────────
 *
 * `accountsHoldingTitles` returns every holder, and after an add the writer is one of
 * them. Their tag has already been busted by `invalidateFor`, with the stronger promise;
 * re-marking it stale here would be a second entry in Next's pending list for the same
 * tag under a different profile, which is noise at best. The sweep passes no writer
 * because it has none.
 */
export function invalidateForOtherAccounts(
  write: Write,
  userIds: readonly UserId[],
  writer?: UserId,
): void {
  for (const userId of userIds) {
    if (userId === writer) continue;
    for (const read of INVALIDATES[write]) {
      revalidateTag(tagFor(read, userId), "max");
    }
  }
}
