import { revalidateTag, unstable_cache, updateTag } from "next/cache";

import {
  accountFigures,
  accountStats,
  getListDetail,
  getTitleDetail,
  libraryEntryIdForTitle,
  listAbandoned,
  listLibraryEntries,
  listLists,
  listUpNextRails,
  listWatchlist,
  type AccountFigures,
  type AccountStats,
  type LibraryEntryRow,
  type LibraryStateGroupEntry,
  type ListDetailRow,
  type ListSummary,
  type TitleDetailRow,
  type UpNextRails,
  type UserId,
} from "@/db/access";
import { DEFAULT_LIBRARY_SORT, type LibrarySort } from "@/db/library-sort";
import type { TitleKind } from "@/tmdb/mirror";

/**
 * The read cache: the owned half of the vocabulary, and every write that busts one.
 *
 * ── What this module reverses ────────────────────────────────────────────────────────
 *
 * `SPEC.md` §3 constraint 1 said *no read cache*, in a list of six things `tvtracker`'s
 * dual data path had taught. Issue #219 took that clause back and left the other five
 * standing — there is still no guest mode, no second repository implementation, no local
 * store, no service worker and no offline queue — and
 * `docs/adr/0002-the-read-cache-and-its-tags.md` is where the reversal is argued.
 * `docs/adr/0003-the-clock-is-an-input-not-a-window.md` is the second half of it, added by
 * #226: the derived views read `current_date`, so the day is in the key of every read that
 * consults one. Read both before adding a cached read; this file is the mechanism, not the
 * reasoning.
 *
 * ── The property, and the two things it now rests on ─────────────────────────────────
 *
 * What the original constraint bought was **two reads of the same fact cannot disagree**.
 * A cache keeps that property only while two things hold, and both of them are here
 * rather than in anybody's memory:
 *
 * 1. **Every key carries an account.** Every call to `unstable_cache` in the repository is
 *    in `cache/` — this file and `borrowed-facts.ts` beside it — and
 *    `eslint-rules/cache-key-carries-account.mjs` fails the build if any of their key
 *    parts stops naming one. The rule was written for #219 before there was a second
 *    cached read; #226 added eight and #225 four, and every one of them was checked as it
 *    was written rather than after it leaked, which is the whole reason it was written
 *    early.
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
 * **The facts that are cached** — not the functions that read them. Five of them, and the
 * distinction between a fact and a function is what makes the map below tractable.
 *
 * Issue #219 opened with one, the library, and left the rest to #225, #226 and #227.
 * Issue #226 added three: the reader pays for up next, the lists and the title detail on
 * every navigation, and all three are **owned** — rows this account wrote, or derived from
 * them — so a write is the only thing that can make them wrong. Issue #227 added the
 * fifth, `stats`, which is the same category one step further out: every figure on that
 * page is an aggregate over those same owned rows.
 *
 * A *fact* rather than a *read*, because several functions can answer one fact and they
 * must not be able to disagree about it. `listUpNextRails`, `listWatchlist` and
 * `listAbandoned` are the phone's five groups and the desktop's three rails, drawn from
 * the same entries, so they share `up-next` and one bust reaches all of them. `listLists`
 * and `getListDetail` share `lists` for the same reason: adding a title to a list changes
 * that list's count on one surface and its rows on the other, and a vocabulary that let
 * those be busted separately would let them be busted separately by mistake.
 *
 * The cost is over-busting: `getListDetail` for list A is dropped when list B is renamed.
 * That is a read this account was going to pay for eventually, and it is the right way to
 * be wrong — the other direction is a surface holding an answer the database contradicts,
 * with no expiry behind it to heal.
 *
 * Borrowed facts — TMDB's synopsis, cast and providers, and the mirrored `title`/`episode`
 * metadata — are **not** here. Issue #225 built them, in `borrowed-facts.ts` beside this
 * file: they change on TMDB's schedule rather than on a write, and they are the one
 * category that carries a window as well as a tag. **Nothing in this file has a window**,
 * and `docs/adr/0003-the-clock-is-an-input-not-a-window.md` is why the day in some of the
 * keys below is not one.
 */
export type CachedRead = "library" | "up-next" | "lists" | "title-detail" | "stats";

/**
 * An account and a fact — the shape every **owned** tag has. (`borrowedTagFor`, in
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
 * **Today, as the database sees it — the one input these reads have that no write
 * touches.**
 *
 * ── Why a date is in a cache key at all ──────────────────────────────────────────────
 *
 * `db/views.ts` derives *released* from `season_no > 0 AND air_date IS NOT NULL AND
 * air_date <= current_date`, and all three derived views rest on it. So the clock alone
 * moves a show from COMING BACK to ONGOING when tonight's episode airs, moves a caught-up
 * show back to watching, and lengthens the queue an Ongoing tile walks — **with no write
 * anywhere in the system**.
 *
 * A tag cannot fire for that: there is no write to hang the bust on. Before this, the
 * consequence was bounded only by how often the reader wrote something — an account that
 * marked nothing for a week would be served last week's Up next for a week, and there is
 * no expiry behind the entry to heal it. That is the failure `SPEC.md` §3 constraint 1
 * was written about, arriving by a door the tag vocabulary had left open.
 *
 * ── This is not a revalidation window, and the difference is the whole argument ───────
 *
 * ADR-0002 rejected time-based revalidation because *a window is a period during which
 * the answer is permitted to disagree with the database*. A day in the key is the
 * opposite of that. `current_date` is an **input to the query**, and this puts that input
 * in the query's key — so the entry is exactly right at every instant it is served, and
 * tomorrow is a different question rather than today's answer gone stale. Nothing here
 * expires, and there is no interval in which a wrong answer is tolerated.
 *
 * ── UTC, because `current_date` is the server's ─────────────────────────────────────
 *
 * `SPEC.md` §5 computes every day boundary `AT TIME ZONE` the reader's own zone, and
 * `db/views.ts` records the released test as a deliberate exception to it: an air date is
 * a `date` with no instant in it, so the views read the server's `current_date` literally.
 * This key part must be the same day those queries used or it would be keying on a
 * boundary the answer does not turn on, so it is UTC — matching a Postgres running with
 * `TimeZone` at UTC, which is Neon's default and the local container's.
 *
 * That is a claim about a live database rather than about this function, so it is checked
 * against one: `tests/server-day.test.ts` asserts this equals `select current_date`. If
 * the database is ever moved to another zone, that test fails rather than the cache
 * quietly keying on the wrong midnight.
 */
export function serverDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** What one cached read is: the fact it answers, and whether the clock is one of its
 *  inputs. */
interface CachedReadShape {
  readonly cachedAs: CachedRead;
  /** True when the query consults `current_date`, directly or through a derived view —
   *  see `serverDay`. It is what decides whether the day is in the key. */
  readonly readsCurrentDate: boolean;
}

/**
 * **Every cached read in this application, and there is nowhere else one can be.**
 *
 * Each entry is one function in `db/access.ts`, the fact it is tagged under, and whether
 * it consults the clock. The wrappers below are held against this table by
 * `tests/cache-tags.test.ts` — a name here with no wrapper, or a wrapper whose key or tag
 * disagrees with its entry, is a failing test.
 *
 * ── Why `readsCurrentDate` is written down rather than inferred ──────────────────────
 *
 * It cannot be inferred: `listWatchlist` contains no date at all, and reaches
 * `current_date` two joins away through `library_entry_state`. Getting it wrong in the
 * cautious direction costs one read a day; getting it wrong the other way is a surface
 * frozen at the day it was last written to. So it is a field somebody fills in, and the
 * line to hold when filling it in is simple: **does this query touch a derived view, or
 * an `air_date` comparison, at any depth?**
 *
 * `getListDetail` is the case worth reading twice. It prints a title's name, year and
 * poster and joins `library_entry` for the id — stored columns, every one, and no derived
 * view anywhere. A list's contents do not change at midnight, so it does not carry the
 * day.
 */
export const CACHED_READS = {
  listLibraryEntries: { cachedAs: "library", readsCurrentDate: true },
  /** *Is this title in my library* — `library_entry` joined to `title`, by account. No
   *  derived view, so no clock: an add or a remove is the only thing that changes it. */
  libraryEntryIdForTitle: { cachedAs: "library", readsCurrentDate: false },
  listUpNextRails: { cachedAs: "up-next", readsCurrentDate: true },
  listWatchlist: { cachedAs: "up-next", readsCurrentDate: true },
  listAbandoned: { cachedAs: "up-next", readsCurrentDate: true },
  listLists: { cachedAs: "lists", readsCurrentDate: false },
  getListDetail: { cachedAs: "lists", readsCurrentDate: false },
  /** Its episode rows carry a `released` flag read straight off `air_date <=
   *  current_date`, so the season grid changes at midnight even when nothing was written. */
  getTitleDetail: { cachedAs: "title-detail", readsCurrentDate: true },
  /**
   * Issue #227's Stats page — the whole of it, in one entry.
   *
   * **`readsCurrentDate` is emphatically true**, and this read reaches the clock by both
   * routes this field exists to catch. It selects from `library_entry_state` and
   * `library_entry_remaining`, so the count per derived state and the episodes remaining
   * move at midnight exactly as Up next's do; and four of its eight statements consult
   * `now()` directly, for the streak, the two averages and the activity window. The
   * streak is the sharpest case in the application: it is *consecutive days up to
   * **today***, so without the day in the key a reader who watched something yesterday
   * would be shown yesterday's streak for as long as they wrote nothing — and a streak
   * that will not fall to zero is a streak that means nothing.
   */
  accountStats: { cachedAs: "stats", readsCurrentDate: true },
  /**
   * Issue #247's You page — the six figures, in one entry.
   *
   * **It shares `stats` rather than declaring a fact of its own.** The vocabulary's rule
   * is the one this file states over the Up next rails: reads that go stale on the same
   * writes share a fact, *because a vocabulary that let those be busted separately would
   * let them be busted separately by mistake*. These two are the strongest case of it in
   * the application — `accountFigures` reads the same two statements `accountStats` reads
   * first, over the same rows, so there is no write in `INVALIDATES` that changes one and
   * not the other. A second name would be a second list to keep in step, bought with
   * nothing.
   *
   * The name outliving the page is deliberate rather than overlooked: `/stats` goes in
   * issue #249, and renaming the fact is that ticket's to do once there is one page left
   * to name it after. A rename here would touch every write row for no behaviour.
   *
   * **`readsCurrentDate` is true**, on this field's own stated line: *does this query
   * touch a derived view, or an `air_date` comparison, at any depth?* `libraryTotals`
   * selects from `library_entry_remaining` and `library_entry_state`, and both derive
   * *released* from `air_date <= current_date`.
   *
   * It is worth recording that no figure this read **returns** is known to move at
   * midnight: *shows completed* reads the `finished` branch of `library_entry_state`,
   * which tests `in_production` and *every season-one-and-above episode watched* and no
   * date at all, and the branches above it are date-free too. The clock reaches this
   * statement through `episodes remaining` and the `caught_up` branch, neither of which
   * You prints.
   *
   * That analysis is exactly why the field is `true` rather than `false`. It rests on the
   * internal structure of a view in another file, so it is the kind of thing that is
   * right today and quietly wrong after the next amendment to ADR-0001. This field's own
   * docblock prices both mistakes: wrong in this direction costs one read a day, wrong in
   * the other is a surface frozen at the day it was last written to.
   */
  accountFigures: { cachedAs: "stats", readsCurrentDate: true },
} as const satisfies Record<string, CachedReadShape>;

/** A read `cache/tags.ts` wraps, named by the function in `db/access.ts` that performs it. */
export type CachedReadName = keyof typeof CACHED_READS;

/**
 * **The facts `borrowed-facts.ts` caches** — the other vocabulary, declared here beside the
 * owned one rather than in the file that uses it.
 *
 * The names are not `CachedRead`s and the two must not be merged: a `CachedRead` is a fact
 * about an account and its tag carries a `UserId`, while these are facts about a *title*
 * and their tags carry a catalogue key. `borrowed-facts.ts`'s own tag block argues why
 * that difference is not the isolation property being given up.
 *
 * They live in this file for a mechanical reason worth stating, because it is the only
 * thing keeping the pair of files coherent: **this file must stay out of the client import
 * graph.** `tags.ts` is reached from `watch-action.ts`, which is reached from the `"use
 * client"` marks store; `borrowed-facts.ts` imports `tmdb/catalogue.ts`, which is
 * `server-only` and throws under Vitest. So the vocabulary — plain names, no imports —
 * lives here where everything can see it, and the mechanism lives there where only the
 * server can. `READS` below is why that matters: it has to name every read in
 * `db/access.ts`, including the borrowed one, and it could not import it.
 */
export type BorrowedFact =
  | "title-synopsis"
  | "title-cast-crew"
  | "title-watch-providers"
  | "title-mirror";

/**
 * The reads in `db/access.ts` that `borrowed-facts.ts` caches — the third bucket, beside
 * `CACHED_READS` and `UNCACHED_READS`.
 *
 * One entry, and it earns being a map rather than a special case: `READS` below is the
 * union of all three, and `tests/cache-tags.test.ts` holds that union against
 * `db/access.ts`'s real exports. A read cannot fall between the three buckets, and the
 * check never had to learn an exception — which is how a check stops being one.
 *
 * `getUnownedTitleDetail` sat in `UNCACHED_READS` from #226 until #225, under a sentence
 * saying this ticket would come and take it. It came; the entry moved here rather than
 * staying behind as a false one.
 *
 * The three TMDB reads are not here. They are not in `db/access.ts` at all — they are
 * `tmdb/catalogue.ts`'s, and nothing classifies that module because nothing in it touches
 * Postgres.
 */
export const BORROWED_READS = {
  getUnownedTitleDetail: "title-mirror",
} as const satisfies Record<string, BorrowedFact>;

/**
 * **The other half of issue #226's *no read remains uncached without a recorded reason*.**
 *
 * Every read in `db/access.ts` that is cached nowhere is here with a sentence saying why,
 * and `tests/cache-tags.test.ts` fails on an entry whose sentence is too short to be one.
 * A reason is a thing somebody had to write; an omission is not. That is the entire
 * mechanism, and it is the same one `INVALIDATES`' empty arrays already use.
 *
 * **Cached nowhere, which since issue #225 is three places rather than two.** A read is
 * either in `CACHED_READS` above, in `borrowed-facts.ts`'s `BORROWED_READS`, or here with
 * its reason — and the test holds the union of the three against `db/access.ts`'s real
 * exports, so a read cannot fall between them. `getUnownedTitleDetail` was here until
 * #225, under a sentence saying that ticket would come and take it; it did, and the entry
 * left with it rather than becoming a false one.
 */
export const UNCACHED_READS = {
  accountFootprint:
    "Read once, on the delete-account confirmation, by a reader who is about to make it wrong. Caching a count somebody is reading in order to destroy buys nothing and adds a way for the number and the deletion to disagree.",
  accountsHoldingTitles:
    "A write's own read: it resolves who to bust *for* the cache. Caching it would mean invalidation deciding who to invalidate from a cached answer, which is the one place a stale row turns into a bust that never happens.",
  libraryCatalogueKeys:
    "The search screen's already-added check, read against a set of keys that changes per query. The key would be the query, so the hit rate is the odds of the same reader searching the same thing twice.",
  resolveSeedUserId:
    "`scripts/db-seed.ts` only. Nothing in the application calls it and there is no request around it to cache in.",
  titleFootprint:
    "The remove confirmation's counts, read by a reader about to remove the title — `accountFootprint`'s reason exactly, one title down.",
  titlesDueForRefresh:
    "The nightly sweep's candidate list, ordered by `metadata_refreshed_at`, which the sweep itself then moves. A cached answer would hand tomorrow's run the same 200 titles it refreshed tonight.",
  watchedTmdbEpisodeIds:
    "Read inside the sweep's reconciliation, from that run's transaction. `unstable_cache` cannot take an executor, so caching it would mean reading outside the transaction whose rows it is about.",
} as const satisfies Record<string, string>;

/**
 * ═══ The cached reads ════════════════════════════════════════════════════════════════
 *
 * Nine wrappers, one per entry in `CACHED_READS`, and everything true of one is true of
 * all nine. The properties are stated here once rather than restated in each docblock;
 * what each function's own note carries is only what is particular to it.
 *
 * ── There is no `try` in any of them, and that is the point ──────────────────────────
 *
 * `unstable_cache` writes a cache entry from a resolved value only: a rejection
 * propagates out of it untouched and nothing is stored. So a failed read still throws
 * into `app/error.tsx`, an empty library is still reachable only by a query that
 * succeeded and found nothing, and `SPEC.md` §3.2 holds through the cache exactly as it
 * held without one. A cache that stored `[]` for a database that was down would be
 * `tvtracker`'s bug with a longer memory.
 *
 * ── No `revalidate`, on any of them ──────────────────────────────────────────────────
 *
 * An entry lives until a tag busts it. Time-based revalidation is the alternative
 * ADR-0002 rejects, and it is rejected on the property rather than on cost: a window in
 * which a surface is allowed to disagree with the database is exactly what the original
 * constraint existed to forbid, and a shorter window is a smaller lie rather than a
 * different kind of one. The day in some of these keys is **not** that — `serverDay`
 * argues the distinction at length.
 *
 * ── The key parts are written out at each call, and not built by a helper ────────────
 *
 * They were, in the first draft of this file, and `mediasafe/cache-key-carries-account`
 * rejected it — the rule has no type information and cannot see the account through a
 * function call, so a helper would have made every key in this codebase unreadable to the
 * one check that reads them. Inline is what the rule can see, and it is why the same
 * three tokens appear nine times below rather than once in a factory.
 *
 * `unstable_cache` hashes `keyParts` together with the stringified callback and the JSON
 * of the call's arguments, so the account reaches the key twice: once in the array, and
 * once as the read's own first argument. Both are deliberate. The argument is what a
 * reader of the call site sees; the array is what the lint rule sees.
 *
 * ── The first key part is the read's own name ────────────────────────────────────────
 *
 * Not the tag it carries, which several of these share — two reads under one tag with one
 * key would be relying on `unstable_cache` hashing the callback's source text to tell them
 * apart, which is true today and is not a thing to depend on. The name is unique because
 * `db/access.ts` cannot export two functions with it, and `tests/cache-tags.test.ts` holds
 * every key against `CACHED_READS`'s own keys.
 */

/**
 * The library grid — `library/page.tsx`'s one read.
 *
 * **Sort is an argument, so each order is its own entry** — four at most
 * (`db/library-sort.ts`). They all carry the same tag, because they are all the same
 * account's library, so one `updateTag` invalidates every order at once. Nothing has to
 * enumerate them and nothing can forget one.
 */
export function cachedLibraryEntries(
  userId: UserId,
  sort: LibrarySort = DEFAULT_LIBRARY_SORT,
): Promise<readonly LibraryEntryRow[]> {
  const read = unstable_cache(
    listLibraryEntries,
    ["listLibraryEntries", userId, serverDay()],
    { tags: [tagFor("library", userId)] },
  );

  return read(userId, sort);
}

/**
 * Up next's three rails, and the phone's first three groups — one read, both devices
 * (`up-next/page.tsx`), and the read behind #220's Ongoing tile.
 *
 * **This is the read the ticket is sharpest about.** A mark from a tile advances the tile
 * optimistically in the browser, so the screen is right immediately; without `recordWatch`
 * busting `up-next`, a reload would hand back the rail from before the mark and offer the
 * reader the episode they had just watched. The optimism and the bust are two halves of
 * one promise, and the second half is `INVALIDATES` below.
 */
export function cachedUpNextRails(userId: UserId): Promise<UpNextRails> {
  const read = unstable_cache(
    listUpNextRails,
    ["listUpNextRails", userId, serverDay()],
    { tags: [tagFor("up-next", userId)] },
  );

  return read(userId);
}

/** The phone's WATCHLIST group, and the screen `more ›` opens on it. Tagged `up-next`
 *  with the rails: it is the same account's entries, filtered to one state. */
export function cachedWatchlist(
  userId: UserId,
): Promise<readonly LibraryStateGroupEntry[]> {
  const read = unstable_cache(listWatchlist, ["listWatchlist", userId, serverDay()], {
    tags: [tagFor("up-next", userId)],
  });

  return read(userId);
}

/** The phone's ABANDONED group, and its own screen. `cachedWatchlist`'s twin. */
export function cachedAbandoned(
  userId: UserId,
): Promise<readonly LibraryStateGroupEntry[]> {
  const read = unstable_cache(listAbandoned, ["listAbandoned", userId, serverDay()], {
    tags: [tagFor("up-next", userId)],
  });

  return read(userId);
}

/**
 * This account's lists, with their counts — the Lists destination, the phone's Lists rail
 * above the library grid (#223), and the *Add to list* picker on title detail (#147).
 *
 * Three surfaces, one read and one tag, so a list created from the picker is on the
 * destination and in the rail on the next render of either. That is the property the
 * ticket names as *every surface reading that fact*, and it holds here because there is
 * one read behind all three rather than because three call sites remember to agree.
 */
export function cachedLists(userId: UserId): Promise<ListSummary[]> {
  const read = unstable_cache(listLists, ["listLists", userId], {
    tags: [tagFor("lists", userId)],
  });

  return read(userId);
}

/**
 * One list and what is in it — `lists/[listId]/page.tsx`.
 *
 * **`listId` is an argument, not a tag**, exactly as `sort` is on the library: each list is
 * its own entry and one `lists` tag busts all of them. A per-list tag would be narrower and
 * would need every list write to know which list it touched — `deleteList` does,
 * `removeTitleFromLibrary` emphatically does not, since it changes the `libraryEntryId` on
 * every list holding that title. One tag is the version of this that cannot be wrong.
 *
 * A list id from another account throws rather than answering (`getListDetail`), and it
 * throws before there is anything to store — so a tampered id cannot put a foreign list in
 * this account's cache.
 */
export function cachedListDetail(
  userId: UserId,
  listId: string,
): Promise<ListDetailRow> {
  const read = unstable_cache(getListDetail, ["getListDetail", userId], {
    tags: [tagFor("lists", userId)],
  });

  return read(userId, listId);
}

/**
 * One title, as the programme note and the phone's `library/[entryId]` route show it.
 *
 * `libraryEntryId` is an argument for `cachedListDetail`'s reason. **Its ownership check is
 * still the query's**: `getTitleDetail` scopes by `ownedBy(userId, libraryEntry)` and the
 * entry id together, so another account's entry id throws rather than answering, and the
 * key being this account's does not make the row this account's — `ownedBy` does, and it
 * always did (ADR-0002, *isolation still rests on `ownedBy`*).
 */
export function cachedTitleDetail(
  userId: UserId,
  libraryEntryId: string,
): Promise<TitleDetailRow> {
  const read = unstable_cache(
    getTitleDetail,
    ["getTitleDetail", userId, serverDay()],
    { tags: [tagFor("title-detail", userId)] },
  );

  return read(userId, libraryEntryId);
}

/**
 * *Is this title already in my library* — the unowned title route's redirect check
 * (`titles/[kind]/[tmdbId]/page.tsx`).
 *
 * Tagged `library` rather than `title-detail`, because that is the fact it reads: a row in
 * `library_entry` for this account and this title. Every write that can create or destroy
 * one — the adds, the import, the remove, the account deletion — busts `library` already,
 * so this needed no new entry in the map, and a tag naming the surface instead of the fact
 * would have.
 *
 * ── The read-back inside the add actions is deliberately *not* this ──────────────────
 *
 * `titles/actions.ts` and `search/actions.ts` call `libraryEntryIdForTitle` directly,
 * immediately after `addTitleToLibrary` and **before** the bust, to learn the id they are
 * about to navigate the reader to. Routing that through here would read the entry from
 * before the add, find `null`, and throw the *"added it and then found no entry"* error
 * those actions raise for a case that is supposed to be unreachable. A read taken to
 * confirm a write must not be served from a cache that write has not yet invalidated —
 * which is the same rule `accountsHoldingTitles` is uncached for.
 */
export function cachedLibraryEntryIdForTitle(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<string | null> {
  const read = unstable_cache(
    libraryEntryIdForTitle,
    ["libraryEntryIdForTitle", userId],
    { tags: [tagFor("library", userId)] },
  );

  return read(userId, kind, tmdbId);
}

/**
 * Every figure on the Stats page — `stats/page.tsx`'s one read (issue #227).
 *
 * ── One entry over eight statements ──────────────────────────────────────────────────
 *
 * `accountStats` makes eight queries and returns one object (`db/access.ts`), so this is
 * one cache entry for the whole page rather than one per figure. That is what makes the
 * page cheap — a reader who navigates away and back pays nothing — and it is also what
 * keeps the figures on it consistent with each other for as long as the entry lives,
 * which eight separately-keyed reads would not.
 *
 * ── The day is in the key, and it is load-bearing here ───────────────────────────────
 *
 * `CACHED_READS`' own entry argues it: two of the eight statements read the derived views
 * and four consult `now()`. The streak is the case that would embarrass this page without
 * it — *consecutive days up to today* is a figure that must be allowed to fall to zero at
 * midnight, and no write does that.
 *
 * ── No argument beyond the account ───────────────────────────────────────────────────
 *
 * Unlike the library and title detail, this read takes no second parameter: `/stats` has
 * no sort, no id and no controls. So there is exactly one entry per account per day.
 */
export function cachedAccountStats(userId: UserId): Promise<AccountStats> {
  const read = unstable_cache(accountStats, ["accountStats", userId, serverDay()], {
    tags: [tagFor("stats", userId)],
  });

  return read(userId);
}

/**
 * You's six figures — `you/page.tsx`'s one read (issue #247).
 *
 * The same shape as `cachedAccountStats` above, and deliberately so: one entry for the
 * whole page, the account in the key, the day in the key, and no third argument because
 * `/you` has no sort, no id and no controls.
 *
 * **The key is `accountFigures`, and the tag is `stats`.** Those are two different things
 * and the difference is the point. The key is per read — sharing one with `accountStats`
 * would serve a nine-figure object to a page expecting six — while the tag is per *fact*,
 * and both reads answer the same fact about the same rows, so one `revalidateTag` drops
 * both. `CACHED_READS`' entry argues why that is a sharing rather than an omission.
 *
 * `unstable_cache` stores resolved values only, so there is no cache state in which a
 * database that is down comes back as an account that has watched nothing: a rejection
 * passes through untouched and reaches the page's boundary.
 */
export function cachedAccountFigures(userId: UserId): Promise<AccountFigures> {
  const read = unstable_cache(accountFigures, ["accountFigures", userId, serverDay()], {
    tags: [tagFor("stats", userId)],
  });

  return read(userId);
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
 * today, so a strict reading would put it with the empty ones. It busts `library` and
 * `up-next` anyway, because the entry it writes *is* the row both of them read, and the
 * day either grows a rating is not the day anybody will come back to this line. It busts
 * `title-detail` for a plainer reason: `TitleDetailRow` carries `rating` outright, so that
 * one is a dependency and not a precaution.
 *
 * ── What issue #226 changed here ─────────────────────────────────────────────────────
 *
 * Every row grew from one fact to as many as four, and the six list writes stopped being
 * empty. Three readings are worth stating, because they are the ones that are wrong in
 * somebody's first draft:
 *
 *  - **A watch does not touch the lists.** `listLists` counts memberships and
 *    `getListDetail` prints a title's name, poster and this account's entry id; none of
 *    them is a watch. So the watch writes bust three facts and not four.
 *  - **A remove *does* touch the lists.** `getListDetail` left-joins `library_entry`, and
 *    issue #133 decided a list survives its titles leaving the library — so the membership
 *    stays and its `libraryEntryId` becomes `null`. A remove that busted only `library`
 *    would leave every list holding that title claiming the reader still owns it.
 *  - **The mirror writes touch all four.** `mirrorTitle` rewrites `title` and `episode`,
 *    which is the name and poster on a list row, the episode grid on title detail, and the
 *    air dates every derived view is built from. Nothing that reads a title escapes it.
 *
 * The six list writes bust `lists` and nothing else, on the mirror image of the argument
 * that used to put them with the empty ones: they touch `list` and `list_membership`,
 * which the library grid does not join, the rails do not join, and title detail does not
 * join.
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
  /** A new entry, in `watchlist`, mirroring the shared title on the way in — the grid, the
   *  phone's WATCHLIST group, every list row for that title, and its own detail page. */
  addTitleToLibrary: ["library", "up-next", "lists", "title-detail", "stats"],
  addTitleToLibraryWatched: ["library", "up-next", "lists", "title-detail", "stats"],
  applyImportChunk: ["library", "up-next", "lists", "title-detail", "stats"],
  recordWatch: ["library", "up-next", "title-detail", "stats"],
  unwatch: ["library", "up-next", "title-detail", "stats"],
  markWatchedUpTo: ["library", "up-next", "title-detail", "stats"],
  abandonTitle: ["library", "up-next", "title-detail", "stats"],
  abandonTitles: ["library", "up-next", "title-detail", "stats"],
  unabandonTitle: ["library", "up-next", "title-detail", "stats"],
  /**
   * **The one write that changes three surfaces and no figure on `/stats`.** Rating is the
   * single fact a library entry carries that no aggregate reads — not a count, not a
   * decade, not a minute — so `stats` is absent here on purpose rather than by omission,
   * and `tests/cache-tags.test.ts` is what keeps that a decision somebody made.
   */
  rateTitle: ["library", "up-next", "title-detail"],
  /** The membership survives the entry (#133), so the list rows change too. */
  removeTitleFromLibrary: ["library", "up-next", "lists", "title-detail", "stats"],
  deleteAccount: ["library", "up-next", "lists", "title-detail", "stats"],
  /** `mirrorTitle`: the name, poster and year on every surface, and the episode rows the
   *  derived views are built from. */
  refreshTitleMirror: ["library", "up-next", "lists", "title-detail", "stats"],
  repointTitle: ["library", "up-next", "lists", "title-detail", "stats"],
  /** Writes `user.import_offer_answered_at`, which no cached read selects. */
  markImportOfferAnswered: [],
  /** `list` and `list_membership`, which only the two list reads join. */
  createList: ["lists"],
  createListAndAddTitle: ["lists"],
  deleteList: ["lists"],
  addTitleToList: ["lists"],
  addTitlesToList: ["lists"],
  reorderListMembership: ["lists"],
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
 * `db/access.ts`'s reads — every one of them, from the two tables above rather than from a
 * third list somebody would have to keep in step with both.
 *
 * It exists for one purpose: `tests/cache-tags.test.ts` adds these to `INVALIDATES`'s keys
 * and holds the union against the module's real exports, so that *classified* means
 * classified as cached, or as uncached with a reason, rather than merely absent from the
 * map. A read invalidates nothing, so there is nothing else this list is for.
 *
 * **Three buckets since #225, not two.** A read is owned-cached, borrowed-cached, or
 * uncached with a sentence saying why. Adding `BORROWED_READS` here rather than teaching
 * the test about it is what keeps the test one assertion about a union.
 */
export const READS: readonly string[] = [
  ...Object.keys(CACHED_READS),
  ...Object.keys(BORROWED_READS),
  ...Object.keys(UNCACHED_READS),
];

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
