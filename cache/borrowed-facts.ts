import { revalidateTag, unstable_cache } from "next/cache";

import {
  getUnownedTitleDetail,
  type UnownedTitleDetailRow,
  type UserId,
} from "@/db/access";
import {
  titleCastAndCrew,
  titleSynopsis,
  titleWatchProviders,
  type CastAndCrew,
} from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { CatalogueKey, TitleKind } from "@/tmdb/mirror";

/**
 * The read cache's other half: the facts a title page borrows from TMDB — issue #225.
 *
 * `tags.ts` next door owns **owned** facts, the writes that bust them, and the account-
 * scoped tag vocabulary. This file owns the four that belong to a *title* rather than to
 * an account, and everything about them that is different. Read `tags.ts`'s top docblock
 * first; it draws the line these two files sit on either side of, and
 * `docs/adr/0002-the-read-cache-and-its-tags.md` argues it.
 *
 * ── Why this is a second file and not a second section ───────────────────────────────
 *
 * Not taste. `tmdb/catalogue.ts` is `import "server-only"`, and three of the four reads
 * below are calls into it. `tags.ts` is imported by every Server Action in the
 * application, several of which are imported in turn by **client** modules —
 * `watch-marks.ts` and the bulk-selection store reach `watch-action.ts` from `"use
 * client"` files, and the suite exercises those stores directly under Vitest, where
 * `server-only` is a hard throw rather than a no-op.
 *
 * So a single file would have put TMDB in the import graph of the client marks store, and
 * the way that announces itself is eight test files failing to load. Splitting keeps
 * `server-only` exactly where it already was: this file is reached only from places that
 * were server-only before it existed.
 *
 * Both files are `cache/`, which is what the two boundaries care about — `eslint.config.mjs`
 * exempts the directory from the `next/cache` restriction, and
 * `mediasafe/cache-key-carries-account` reads every `unstable_cache` call in the
 * repository wherever it is written. Nothing constructs a key or a tag outside these two
 * files, and `tests/cache-tags.test.ts` covers both.
 */

/**
 * The four things a title page shows that MediaSafe does not know: TMDB does.
 *
 * Three of them are never stored at all — `tmdb/live-facts.ts` owns the right-hand column
 * of ADR-0001's metadata caching policy, and a synopsis, a cast list and a watch-provider
 * row have always been fetched fresh on every render. The fourth is stored, in `title` and
 * `episode`, and is still borrowed for the purpose that matters here: the rows say what
 * TMDB last said, and MediaSafe rewrites them on TMDB's schedule rather than on a reader's.
 *
 * ── Why these are their own vocabulary, and not four more `CachedRead`s ──────────────
 *
 * `CachedRead` and `INVALIDATES` answer one question — *which account's entry does this
 * write expire?* — and every read in them is a fact **about an account**: your library,
 * and in #226 your up next, your lists, your title detail. A borrowed fact is about a
 * title, and it is the same answer for everybody, so the question a bust has to answer is
 * a different one: *which title changed?* Folding them into the same map would mean a
 * `Write → CachedRead[]` entry that cannot be honoured, because the caller of
 * `invalidateFor` has a `UserId` and no idea which titles it is about.
 *
 * Two vocabularies, two tag shapes, two bust functions, and a reviewer can tell from the
 * call which kind of fact a diff is invalidating.
 *
 * **The names themselves live in `tags.ts`** — `BorrowedFact` and `BORROWED_READS`, beside
 * `CachedRead` and the other two classification maps. That is the split this pair of files
 * is built on: `tags.ts` is the **vocabulary**, including which of the three buckets each
 * read in `db/access.ts` falls into, and this file is the **mechanism** for one of them.
 * The vocabulary has no TMDB import and so stays reachable from the client graph; the
 * mechanism does, and does not. `READS` is the concrete reason it has to be that way round
 * rather than the other: it must name the borrowed read, and it could not import it.
 */

/**
 * The tag every borrowed fact of one title carries: the title, and nothing else.
 * **No account, and no fact either.**
 *
 * ── One tag for all four, not one each ───────────────────────────────────────────────
 *
 * The first draft gave each fact its own tag. Nothing ever busted one without the other
 * three — `invalidateBorrowedFactsFor`'s docblock argues at length that a mirror refresh
 * should re-earn all four — so four tags were four ways to express one event, three of
 * which no caller used. That is the shape of a distinction being kept for a need nobody
 * has, and it cost a fourfold multiple of `revalidateTag` calls on the sweep's path for
 * it. One tag per title; the four entries are still four entries, kept apart by their key
 * parts exactly as the library's four sort orders are.
 *
 * ── The key carries the account; the tag carries the title ───────────────────────────
 *
 * This is the one place in this module where those two do not agree, so it is worth being
 * exact about why, because the shape reads at first glance like the property #219 built
 * being given up.
 *
 * A **key** decides which entries are shared. Two accounts must never share one, and
 * `eslint-rules/cache-key-carries-account.mjs` is what makes that a check rather than a
 * habit — every `unstable_cache` call below keys by `userId`, exactly as
 * `cachedLibraryEntries` does, and the rule passes for the same reason.
 *
 * A **tag** decides which entries a bust can reach. What invalidates a borrowed fact is
 * TMDB changing its mind about one title, and the readers holding a stale entry for that
 * title are *whoever has opened its page* — which for `title-mirror` is by definition the
 * accounts that do **not** hold it (`getUnownedTitleDetail` is the unowned page's read;
 * an owner is redirected away from it). There is no set of accounts to enumerate. The
 * nightly sweep's `accountsHoldingTitles` is precisely the wrong answer here, and it is
 * the right answer for the library, which is how you can tell these are two questions.
 *
 * So the tag names the title and reaches every account's entry for it at once. Nothing
 * leaks: a tag cannot be read, only busted, and busting one account's entry too many
 * costs a re-read of a fact that is public to every reader anyway.
 *
 * Not exported, for the reason `tagFor` is not: a tag anything outside this file could
 * build is one it could bust.
 */
function borrowedTagFor(kind: TitleKind, tmdbId: number): string {
  return `borrowed-facts:${kind}:${tmdbId}`;
}

/**
 * *Expire this entry now*, as `revalidateTag`'s second argument — the one profile that is
 * not a staleness window. Named rather than inlined because `{ expire: 0 }` at a call site
 * reads like a configuration value and is in fact the whole difference between satisfying
 * this ticket's acceptance criterion and missing it by one read;
 * `invalidateBorrowedFactsFor`'s docblock is where that is argued.
 */
const EXPIRE_NOW = { expire: 0 } as const;

/**
 * How long a borrowed fact may sit in the cache with nothing busting it — the *window*
 * `SPEC.md` §3.1's amendment gives borrowed facts and withholds from owned ones.
 *
 * ── Why a window at all, when owned facts get none ───────────────────────────────────
 *
 * An owned fact is correct until a write says otherwise, and every write that could say
 * so is in this repository. A borrowed fact changes when a distributor signs a contract or
 * a TMDB contributor fixes a credit, and nothing MediaSafe does observes either — so a tag
 * alone would never fire and the first reader of a title would pin its synopsis for the
 * life of the deployment. The window is what makes the cache forget.
 *
 * ── Six hours ────────────────────────────────────────────────────────────────────────
 *
 * The four facts are not equally volatile and they share one number anyway, so the number
 * is set by the most volatile of them: watch providers, which change on a licensing date.
 * A synopsis and a cast list are effectively static once a title has aired.
 *
 * Six hours means a provider that lapsed this morning is off the page by this evening
 * without anyone doing anything, and a reader working through a show over one sitting pays
 * TMDB once for it. **One hour** was rejected for the round trips: four facts times every
 * title anybody opens, six times a day each, to chase a change that happens a few times a
 * year per title. **One day** was rejected the other way — it reads as *aligned with the
 * nightly sweep*, and the alignment is spurious, because the sweep does not refresh three
 * of these four at all; what it would actually buy is a provider row that is wrong for a
 * whole evening.
 *
 * The window is a ceiling on how long a borrowed fact may be wrong when nothing busts it.
 * It is not the mechanism anything relies on: a sweep, an add and an import all bust
 * `title-mirror` outright, which is the acceptance criterion that a refreshed title is
 * visible on the next read rather than at the end of a window.
 */
const BORROWED_FACT_WINDOW_SECONDS = 6 * 60 * 60;

/**
 * Title detail's synopsis, cast and crew, and watch providers — the three reads that used
 * to reach TMDB on every single render of every title page (issue #218 moved them to the
 * server; this is where they stop being a round trip).
 *
 * ── Three entries, not one ───────────────────────────────────────────────────────────
 *
 * The same reason `tmdb/catalogue.ts` makes three requests instead of one
 * `append_to_response`: *one failed borrowed-fact read costs only its own region*. A
 * combined entry would be one cache entry that either has all three or is one failure
 * covering them, which is exactly the boundary this ticket's criteria say must hold.
 *
 * ── There is no `try` here either ────────────────────────────────────────────────────
 *
 * `cachedLibraryEntries`'s paragraph applies unchanged, and it matters more here, because
 * the callers of these three (`app/(signed-in)/library/live-facts.ts`) *do* catch — they
 * turn a failure into an `Outcome` so a section can render its own inline recovery and
 * reference id. The catch is deliberately **outside** the cache and not inside it: a
 * rejection propagates out of `unstable_cache` untouched and nothing is stored, so a TMDB
 * outage leaves no entry behind and the reader's *Try again* is a real retry rather than a
 * replay of a stored failure. A cache that held the `Outcome` would render a failed read
 * as an empty region for six hours, which is `AGENTS.md`'s opening rule with a memory.
 *
 * ── Four near-identical wrappers, and a helper is not available ──────────────────────
 *
 * These read as begging to be one function taking a fact and a read. They cannot be, for
 * the reason `cachedLibraryEntries` records next door: `mediasafe/cache-key-carries-account`
 * has no type information and cannot see an account through a function call, so key parts
 * built by a helper would be invisible to the one check that reads them. Inline is what
 * the rule can see. The duplication is the price of the check, it is bounded by the number
 * of cached reads, and `tests/cache-tags.test.ts` asserts the whole list of them.
 *
 * ── The account in the key is not ceremony ───────────────────────────────────────────
 *
 * These three are the same answer for every reader **today**. `titleWatchProviders` is one
 * line away from not being: `WATCH_PROVIDER_REGION` in `tmdb/catalogue.ts` is a fixed
 * constant with its own note saying it becomes a per-user setting the day `user` grows a
 * region. An entry keyed without an account is the thing that would quietly serve a
 * Canadian provider list to a reader somewhere else on that day, and the lint rule is what
 * means that day cannot arrive by accident. The cost of being early is one TMDB read per
 * account per window per title, on an application whose accounts are countable.
 */
export function cachedTitleSynopsis(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<string | null> {
  const read = unstable_cache(titleSynopsis, ["titleSynopsis", userId], {
    tags: [borrowedTagFor(kind, tmdbId)],
    revalidate: BORROWED_FACT_WINDOW_SECONDS,
  });

  return read(kind, tmdbId);
}

/** `cachedTitleSynopsis`'s docblock covers all three of these; this is the credits one. */
export function cachedTitleCastAndCrew(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<CastAndCrew> {
  const read = unstable_cache(titleCastAndCrew, ["titleCastAndCrew", userId], {
    tags: [borrowedTagFor(kind, tmdbId)],
    revalidate: BORROWED_FACT_WINDOW_SECONDS,
  });

  return read(kind, tmdbId);
}

/** The providers one — the fact whose key the account is least ceremonial on, for the
 *  reason `cachedTitleSynopsis`'s last paragraph gives. */
export function cachedTitleWatchProviders(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<readonly WatchProvider[]> {
  const read = unstable_cache(titleWatchProviders, ["titleWatchProviders", userId], {
    tags: [borrowedTagFor(kind, tmdbId)],
    revalidate: BORROWED_FACT_WINDOW_SECONDS,
  });

  return read(kind, tmdbId);
}

/**
 * The mirrored title metadata the unowned title page renders — name, year, poster,
 * runtime and every episode — read from `title` and `episode` rather than from TMDB.
 *
 * ── Borrowed, even though it is a Postgres read ──────────────────────────────────────
 *
 * `getUnownedTitleDetail` takes no user id and could not take one: `title` and `episode`
 * are global and unowned (ADR-0001), and the read's own docblock says at length that
 * having no owned table in it is what makes it safe. Every field in it is a fact about the
 * world that MediaSafe copied from TMDB, so it belongs on this side of the file rather
 * than beside the library: what changes it is a mirror refresh, not a write of the
 * reader's, and a mirror refresh is a fact about a title.
 *
 * ── This is the one of the four the sweep actually rewrites ──────────────────────────
 *
 * Which is why `app/api/cron/nightly-sweep/route.ts` busts it, and why the criterion *a
 * title refreshed by the nightly sweep is visible on the next read* is about this entry
 * and not about the three above — the sweep does not fetch a synopsis, a credit or a
 * provider, and never has.
 *
 * The owned half of title detail — `getTitleDetail`, the page for a title you have — is
 * **not** cached here. It carries your state, your rating and your watches; it is an owned
 * fact with an owned fact's rules, and issue #226 is the ticket that gives it a tag and no
 * window.
 */
export function cachedUnownedTitleDetail(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<UnownedTitleDetailRow> {
  const read = unstable_cache(getUnownedTitleDetail, ["getUnownedTitleDetail", userId], {
    tags: [borrowedTagFor(kind, tmdbId)],
    revalidate: BORROWED_FACT_WINDOW_SECONDS,
  });

  return read(kind, tmdbId);
}

/**
 * Every borrowed fact of these titles, expired — the call that keeps a refreshed mirror
 * from being invisible until a window runs out.
 *
 * ── Who owes this call ───────────────────────────────────────────────────────────────
 *
 * Exactly the writes in `tags.ts`'s `MIRRORS_SHARED_TITLE_ROWS`, which is the list of
 * everything that reaches `mirrorTitle` and so rewrites the global `title` and `episode`
 * rows — the two add paths on each of two surfaces, the import chunk, and the sweep's refresh and
 * repoint. That list already exists because those same writes owe
 * `invalidateForOtherAccounts`; it is the same set for the same underlying reason, and
 * `tests/cache-tags.test.ts` is what holds it against the code rather than the docblock.
 *
 * The pairing is not redundant. `invalidateForOtherAccounts` busts *the library of every
 * account holding the title*; this busts *the borrowed facts of the title itself*, for
 * every account, holder or not. A write that made only the first call would leave the
 * unowned title page showing last night's poster to everybody who does not own it — which
 * is the entire population that page exists for.
 *
 * ── All four facts, not only the one that changed ────────────────────────────────────
 *
 * A mirror refresh rewrites `title-mirror` and demonstrably nothing else: a synopsis is
 * not stored and the sweep never asked TMDB for one. Busting all four anyway is the
 * cheaper mistake to make. The fetch that refreshed the mirror is itself evidence TMDB has
 * something new to say about this title, each live fact costs one request to re-earn, and
 * the alternative is a per-fact argument at every call site that has to stay correct as
 * facts are added. A fact that did not change is re-read once; a fact that changed and was
 * not busted is wrong for six hours.
 *
 * ── `{ expire: 0 }`, which is expiry rather than staleness ──────────────────────────
 *
 * This is the one line of this ticket that was written wrong first, and the correction is
 * worth keeping because the wrong version looked more idiomatic than the right one.
 *
 * The first draft passed `"max"`, copying `invalidateForOtherAccounts` next door. That is
 * **stale-while-revalidate**: Next marks the entry stale, serves it to the next reader,
 * and refreshes behind them — so the reader after the sweep would have been shown last
 * night's mirror, and only the one after *that* the refresh. #219 accepts that trade for
 * the library deliberately, and its test now says so. This ticket cannot: *a title
 * refreshed by the nightly sweep is visible on the **next** read* is its acceptance
 * criterion in those words, and *the read after next* is a different promise.
 *
 * `updateTag` is the call that expires outright and it is unavailable here — it throws on
 * any route ending in `/route`, which the sweep is. `EXPIRE_NOW` is the same instruction
 * in the spelling a route handler may use: `revalidate()` branches on
 * `cacheLife?.expire === 0` exactly where it branches on a missing profile, which is what
 * `updateTag` passes (`next/dist/server/web/spec-extension/revalidate.js`). The one-argument
 * `revalidateTag(tag)` would also do it and is what `updateTag` literally calls, but Next
 * has deprecated that form and dropped it from the types.
 *
 * `tests/cache-tags.test.ts` models the difference rather than flattening it: swap this
 * back to `"max"` and five assertions fail, one of them by name.
 *
 * ── A repoint has two keys, and the caller passes both ───────────────────────────────
 *
 * `repointTitle` moves a `title` row from a dead TMDB id onto the survivor, so the entries
 * to expire are the ones under the id that just stopped existing *and* the one it became.
 * This takes a list rather than one key partly so a caller holding both can say so —
 * `app/api/cron/nightly-sweep/route.ts` is the one that does.
 *
 * ── `CatalogueKey`, which is the type the rest of this application already uses ──────
 *
 * Not a structural `{ kind, tmdbId }` written out here. `tmdb/mirror.ts` owns that pair as
 * a named concept, `catalogueKeyFrom` is the one predicate every door validates it
 * through, and the sweep's `SweepCandidate` satisfies it without conversion. Spelling it
 * longhand would have made this the one place in the codebase where the catalogue key is
 * an anonymous shape rather than the thing it is.
 */
export function invalidateBorrowedFactsFor(titles: readonly CatalogueKey[]): void {
  for (const { kind, tmdbId } of titles) {
    revalidateTag(borrowedTagFor(kind, tmdbId), EXPIRE_NOW);
  }
}
