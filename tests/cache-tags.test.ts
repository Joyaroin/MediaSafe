import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TitleKind } from "@/tmdb/mirror";

/**
 * The read cache's two properties, held against the module that is supposed to have them
 * — issue #219, and since #225 both files of it: `cache/tags.ts` for owned facts and
 * `cache/borrowed-facts.ts` for the four a title page borrows from TMDB. One test file
 * rather than two, because the properties are properties of the directory: no key without
 * an account, no write without its bust, and no cached read constructed anywhere else.
 *
 * ── Why this file fakes Next.js instead of running it ────────────────────────────────
 *
 * `unstable_cache` needs an incremental cache on Next's own async storage, which exists
 * inside a request and nowhere else, so there is no version of this file that runs the
 * real one. What it runs instead is a stand-in that reproduces the **key derivation**
 * from Next's own source — `fixedKey = ${cb.toString()}-${keyParts.join(",")}`, then
 * `invocationKey = ${fixedKey}-${JSON.stringify(args)}`
 * (`next/dist/server/web/spec-extension/unstable-cache.js`) — because that derivation is
 * the entire mechanism by which one account's library is or is not another account's.
 *
 * Be precise about what that buys, because a fake that is mistaken for the real thing is
 * worse than no test. This proves that **the module hands Next.js enough to tell two
 * accounts apart**, and it fails the moment the account leaves the key parts *and* the
 * arguments. It does not prove Next.js caches the way its source says it does, and it is
 * not a substitute for the lint rule: the rule is what sees a *new* cached read written
 * wrong, and this is what sees the one that exists stop being right.
 *
 * `tests/support/database.ts` is deliberately not involved. Nothing here is a question
 * about Postgres.
 */

const { cacheState, reads, tmdb } = vi.hoisted(() => ({
  cacheState: {
    /** Cached values by invocation key, exactly as `unstable_cache` would hold them. */
    entries: new Map<string, unknown>(),
    /** The tags each entry carries, so a bust can find the entries it names. */
    tags: new Map<string, readonly string[]>(),
    /** Entries a profiled `revalidateTag` marked stale: served once more, then dropped. */
    stale: new Set<string>(),
    /** Every tag `updateTag` was called with, in order. */
    updated: [] as string[],
    /** Every `[tag, profile]` pair `revalidateTag` was called with, in order. */
    revalidated: [] as [string, unknown][],
    /** The key parts, tags and window of every cached read constructed, in order. */
    constructed: [] as {
      keyParts: string[];
      tags: readonly string[];
      revalidate: number | false | undefined;
    }[],
  },
  /**
   * Every read of `db/access.ts` that `cache/` wraps, faked — one `vi.fn()` apiece rather
   * than one shared spy, because *which* read the module reached for is half of what
   * several assertions below are about. A `cachedWatchlist` that quietly called
   * `listAbandoned` would satisfy a shared spy's call count and would be showing the
   * reader the wrong group.
   *
   * `getUnownedTitleDetail` is in here with the owned reads because it is in the same
   * module and mocked the same way; what is different about it — a title-scoped tag and a
   * window — is `cache/borrowed-facts.ts`'s doing, not this map's.
   */
  reads: {
    listLibraryEntries: vi.fn(),
    libraryEntryIdForTitle: vi.fn(),
    listUpNextRails: vi.fn(),
    listWatchlist: vi.fn(),
    listAbandoned: vi.fn(),
    listLists: vi.fn(),
    getListDetail: vi.fn(),
    getTitleDetail: vi.fn(),
    accountStats: vi.fn(),
    accountFigures: vi.fn(),
    getUnownedTitleDetail: vi.fn(),
  },
  /** The three borrowed reads that are not database reads at all — `tmdb/catalogue.ts`'s. */
  tmdb: {
    titleSynopsis: vi.fn(),
    titleCastAndCrew: vi.fn(),
    titleWatchProviders: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache(
    callback: (...args: never[]) => Promise<unknown>,
    keyParts?: string[],
    options?: { tags?: string[]; revalidate?: number | false },
  ) {
    const fixedKey = `${callback.toString()}-${Array.isArray(keyParts) && keyParts.join(",")}`;
    cacheState.constructed.push({
      keyParts: keyParts ?? [],
      tags: options?.tags ?? [],
      revalidate: options?.revalidate,
    });

    return async (...args: never[]) => {
      const invocationKey = `${fixedKey}-${JSON.stringify(args)}`;
      if (cacheState.entries.has(invocationKey)) {
        /**
         * A **stale** entry is served exactly once and then dropped, which is what
         * stale-while-revalidate looks like from the reader's side: this read gets the old
         * value, the refresh happens behind it, the next read gets the new one.
         *
         * Modelling this is not decoration. The first version of this double treated
         * `revalidateTag(tag, "max")` as an outright delete — identical to `updateTag` —
         * and so could not tell the two apart. A `cache/` that served one stale read after
         * the nightly sweep passed every assertion here, including the one whose name
         * claims to prove *visible on the next read*. The code review caught it; this is
         * the change that means the next one cannot hide the same way.
         */
        if (cacheState.stale.has(invocationKey)) {
          cacheState.stale.delete(invocationKey);
          const staleValue = cacheState.entries.get(invocationKey);
          cacheState.entries.delete(invocationKey);
          cacheState.tags.delete(invocationKey);
          return staleValue;
        }
        return cacheState.entries.get(invocationKey);
      }

      const result = await callback(...args);
      cacheState.entries.set(invocationKey, result);
      cacheState.tags.set(invocationKey, options?.tags ?? []);
      return result;
    };
  },

  updateTag(tag: string) {
    cacheState.updated.push(tag);
    expire(tag);
  },

  /**
   * The fork the double exists to model. A **staleness profile** (`"max"`) marks entries
   * stale and serves them once more; **`{ expire: 0 }`** expires them outright, taking the
   * same branch in Next's own `revalidate()` as the profile-less call `updateTag` makes
   * (`next/dist/server/web/spec-extension/revalidate.js`).
   */
  revalidateTag(tag: string, profile?: unknown) {
    cacheState.revalidated.push([tag, profile]);
    const expiresNow =
      profile === undefined ||
      (typeof profile === "object" && profile !== null && "expire" in profile
        ? (profile as { expire?: number }).expire === 0
        : false);
    if (expiresNow) expire(tag);
    else markStale(tag);
  },
}));

vi.mock("@/db/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/access")>()),
  ...reads,
}));

/**
 * Mocked **whole**, with no `importOriginal` — and that is a constraint rather than a
 * shortcut. `tmdb/catalogue.ts` is `import "server-only"`, which is a no-op inside Next's
 * build and a hard throw under plain Node module resolution, so loading the real module
 * here would fail the file before a single test ran (`tests/nightly-sweep-route.test.ts`
 * and `run-sweep.ts` document the same wall from the other side). Since issue #225
 * `cache/borrowed-facts.ts` imports it, so this mock is what keeps that half importable at
 * all — and the reason it is a separate file from `tags.ts` in the first place.
 *
 * Nothing is lost by it. The three functions are a URL, a header and a `fetch`, and are
 * deliberately untested there for that reason; what this file is about is the keys, the
 * tags and the window wrapped around them.
 */
vi.mock("@/tmdb/catalogue", () => ({ ...tmdb }));

/** Gone. The next read of this key is a real read. */
function expire(tag: string): void {
  for (const [key, tags] of cacheState.tags) {
    if (!tags.includes(tag)) continue;
    cacheState.entries.delete(key);
    cacheState.tags.delete(key);
    cacheState.stale.delete(key);
  }
}

/** Still there, but owed one more serve before it is. */
function markStale(tag: string): void {
  for (const [key, tags] of cacheState.tags) {
    if (tags.includes(tag)) cacheState.stale.add(key);
  }
}

const { asUserId } = await import("@/db/access");
const {
  CACHED_READS,
  INVALIDATES,
  MIRRORS_SHARED_TITLE_ROWS,
  READS,
  UNCACHED_READS,
  cachedAbandoned,
  cachedAccountFigures,
  cachedAccountStats,
  cachedLibraryEntries,
  cachedLibraryEntryIdForTitle,
  cachedListDetail,
  cachedLists,
  cachedTitleDetail,
  cachedUpNextRails,
  cachedWatchlist,
  invalidateFor,
  invalidateForOtherAccounts,
  serverDay,
} = await import("@/cache/tags");
const {
  cachedTitleCastAndCrew,
  cachedTitleSynopsis,
  cachedTitleWatchProviders,
  cachedUnownedTitleDetail,
  invalidateBorrowedFactsFor,
} = await import("@/cache/borrowed-facts");

/** Two accounts, named so that a leak between them reads as a leak in the failure. */
const mine = asUserId("user_mine");
const yours = asUserId("user_yours");

/** One row apiece, so *whose library came back* is answerable from the value alone. */
function libraryOf(userId: string) {
  return [{ libraryEntryId: `entry-${userId}`, name: `A title only ${userId} has` }];
}

/**
 * The same trick for every other read: a value that names the account it was read for, so
 * an assertion can say *whose* rows came back rather than merely that some came back. A
 * leak between two accounts is then a failure that prints the wrong name.
 */
function ownedBy(userId: string) {
  return { readFor: userId };
}

/**
 * Every cached wrapper, called the same way, so the account-isolation and staleness
 * assertions can run over all of them rather than being written out eight times. The
 * second argument each takes is fixed here — this table is about *whose* answer comes
 * back, and an entry id is not the axis under test.
 */
const CACHED = {
  listLibraryEntries: (userId: typeof mine) => cachedLibraryEntries(userId),
  libraryEntryIdForTitle: (userId: typeof mine) =>
    cachedLibraryEntryIdForTitle(userId, "show", 1399),
  listUpNextRails: (userId: typeof mine) => cachedUpNextRails(userId),
  listWatchlist: (userId: typeof mine) => cachedWatchlist(userId),
  listAbandoned: (userId: typeof mine) => cachedAbandoned(userId),
  listLists: (userId: typeof mine) => cachedLists(userId),
  getListDetail: (userId: typeof mine) => cachedListDetail(userId, "list-1"),
  getTitleDetail: (userId: typeof mine) => cachedTitleDetail(userId, "entry-1"),
  /** Issue #227. It takes no second argument at all — `/stats` has no controls — so it is
   *  the one entry here whose call is the whole of its signature. */
  accountStats: (userId: typeof mine) => cachedAccountStats(userId),
  /** Issue #247. Also signature-complete in one argument, and tagged `stats` alongside the
   *  read above rather than under a fact of its own — `cache/tags.ts` argues why, and the
   *  bust assertions below hold both against the same tag as a result. */
  accountFigures: (userId: typeof mine) => cachedAccountFigures(userId),
} as const;

/** What the fake behind `read` answers `userId` with. The library's is a list of rows,
 *  because the assertions that predate #226 are about rows; the rest need only to name
 *  the account they were read for. */
function answerFor(read: keyof typeof CACHED, userId: string) {
  return read === "listLibraryEntries" ? libraryOf(userId) : ownedBy(userId);
}

/* ── The borrowed half, issue #225 ─────────────────────────────────────────────────── */

/** Two titles, so *which title's entry was busted* is answerable from the value alone. */
const SOLARIS = { kind: "film", tmdbId: 1972 } as const;
const ANOTHER = { kind: "show", tmdbId: 2001 } as const;

/** What a borrowed read answers, said so the title is legible in a failure. */
function borrowedFrom(prefix: string) {
  return async (kind: string, tmdbId: number) => `${prefix} of ${kind} ${tmdbId}`;
}

/**
 * The four borrowed reads of one title, all of them, in one call.
 *
 * Not folded into `CACHED` above, and that is the point rather than an oversight: every
 * entry in that table is keyed and tagged by account, and these four are tagged by title.
 * A table that held both would have to carry the difference as a flag, and the difference
 * is the whole subject of `cache/borrowed-facts.ts`.
 */
async function readEveryBorrowedFact(
  userId: ReturnType<typeof asUserId>,
  title: { kind: TitleKind; tmdbId: number },
) {
  await cachedTitleSynopsis(userId, title.kind, title.tmdbId);
  await cachedTitleCastAndCrew(userId, title.kind, title.tmdbId);
  await cachedTitleWatchProviders(userId, title.kind, title.tmdbId);
  await cachedUnownedTitleDetail(userId, title.kind, title.tmdbId);
}

beforeEach(() => {
  cacheState.entries.clear();
  cacheState.tags.clear();
  cacheState.stale.clear();
  cacheState.updated.length = 0;
  cacheState.revalidated.length = 0;
  cacheState.constructed.length = 0;

  for (const read of Object.values(reads)) {
    read.mockReset();
    read.mockImplementation(async (userId: string) => ownedBy(userId));
  }
  reads.listLibraryEntries.mockImplementation(async (userId: string) => libraryOf(userId));

  // The borrowed four answer by title rather than by account — they take no user id, and
  // the whole question about them is which *title's* entry a bust reached.
  for (const [mock, prefix] of [
    [tmdb.titleSynopsis, "the synopsis"],
    [tmdb.titleCastAndCrew, "the cast and crew"],
    [tmdb.titleWatchProviders, "the watch providers"],
    [reads.getUnownedTitleDetail, "the mirrored metadata"],
  ] as const) {
    mock.mockReset();
    mock.mockImplementation(borrowedFrom(prefix));
  }
});

describe("every key carries an account", () => {
  /**
   * Asserted on the key parts directly, and not only through the leak below, because the
   * account reaches `unstable_cache` twice — in the key parts *and* as the read's own
   * first argument — and either one alone is enough to keep two accounts apart. Which
   * means the leak test cannot see the account leaving the key parts, and the realistic
   * regression is exactly that: the argument is `listLibraryEntries`'s signature and
   * nobody deletes it by accident, while the key parts are two tokens somebody could
   * simplify. This is the assertion that fails when they do.
   */
  it("hands Next.js key parts and a tag that both name the account", async () => {
    await cachedLibraryEntries(mine);

    expect(cacheState.constructed).toEqual([
      // `revalidate: undefined` is an assertion, not a filler: an owned fact is correct
      // until a write says otherwise, so a window here would only be a way for the
      // library to be wrong. It is the one thing borrowed facts have that this does not
      // (`cache/borrowed-facts.ts`), which makes it worth failing on rather than omitting.
      {
        keyParts: ["listLibraryEntries", mine, serverDay()],
        tags: [`library:${mine}`],
        revalidate: undefined,
      },
    ]);
  });

  /**
   * The same assertion for all eight, so a new cached read cannot arrive with a key that
   * names its entity and not its reader. `CACHED_READS` is the module's own table of what
   * each read is called and which tag it carries; this holds the calls against it.
   */
  it.each(Object.keys(CACHED) as (keyof typeof CACHED)[])(
    "keys %s by its account and tags it by the fact it reads",
    async (read) => {
      await CACHED[read](mine);

      const disposition = CACHED_READS[read];
      expect(cacheState.constructed).toEqual([
        {
          keyParts: disposition.readsCurrentDate
            ? [read, mine, serverDay()]
            : [read, mine],
          tags: [`${disposition.cachedAs}:${mine}`],
        },
      ]);
    },
  );

  /**
   * The one that would have caught it. Drop the account from the key parts and from the
   * arguments and this fails twice over: `yours` is served `mine`'s row, and the read it
   * should have made never happens.
   */
  it("never serves one account's library to another", async () => {
    expect(await cachedLibraryEntries(mine)).toEqual(libraryOf(mine));
    expect(await cachedLibraryEntries(yours)).toEqual(libraryOf(yours));

    expect(reads.listLibraryEntries.mock.calls.map(([userId]) => userId)).toEqual([
      mine,
      yours,
    ]);
  });

  it("is a cache, and not merely a function that reads twice", async () => {
    await cachedLibraryEntries(mine);
    await cachedLibraryEntries(mine);

    expect(reads.listLibraryEntries).toHaveBeenCalledTimes(1);
  });

  /**
   * Sort is an argument rather than a tag, so each order is its own entry — and every one
   * of them still belongs to one account. A key that scoped by sort and not by account
   * would pass the test above only if both accounts asked for different orders, which is
   * exactly the kind of accident this second case exists to remove.
   */
  it("keeps the orders apart without letting either escape its account", async () => {
    await cachedLibraryEntries(mine, "recently-added");
    await cachedLibraryEntries(mine, "title");

    expect(reads.listLibraryEntries).toHaveBeenCalledTimes(2);
    expect(await cachedLibraryEntries(yours, "title")).toEqual(libraryOf(yours));
  });

  /**
   * Issue #226's *two accounts cannot see each other's up next, lists or title detail
   * under any cache state*, asked of all eight rather than of the library alone — because
   * the ticket adds seven reads and the leak it forbids is a property of each key, not of
   * the module as a whole.
   *
   * `mine` reads first and warms an entry; `yours` reads second and must still reach the
   * database. Both halves matter: a shared key would fail the value assertion *and* leave
   * the second call unmade, and a test that only counted calls could be satisfied by a
   * cache that had simply stopped caching.
   */
  it.each(Object.keys(CACHED) as (keyof typeof CACHED)[])(
    "never serves one account's %s to another",
    async (read) => {
      expect(await CACHED[read](mine)).toEqual(answerFor(read, mine));
      expect(await CACHED[read](yours)).toEqual(answerFor(read, yours));

      expect(reads[read].mock.calls.map(([userId]) => userId)).toEqual([mine, yours]);
    },
  );

  it.each(Object.keys(CACHED) as (keyof typeof CACHED)[])(
    "reads %s once and serves the second call from the entry",
    async (read) => {
      await CACHED[read](mine);
      await CACHED[read](mine);

      expect(reads[read]).toHaveBeenCalledTimes(1);
    },
  );
});

describe("every write busts its tags", () => {
  it("gives the reader the library their own write landed in", async () => {
    expect(await cachedLibraryEntries(mine)).toEqual(libraryOf(mine));

    reads.listLibraryEntries.mockImplementation(async () => [
      ...libraryOf(mine),
      { libraryEntryId: "entry-just-added", name: "The one I just added" },
    ]);
    invalidateFor("addTitleToLibrary", mine);

    expect(await cachedLibraryEntries(mine)).toHaveLength(2);
  });

  /**
   * A watch reaches three of the four facts and every tag it busts is this account's.
   * Written out rather than derived from `INVALIDATES`, which would assert only that the
   * map is the map: *a watch does not touch the lists* is a claim about the queries, and
   * it is the claim this line is here to fail on if `getListDetail` ever grows a watch.
   */
  it("busts the writer's facts and leaves everybody else's alone", async () => {
    await cachedLibraryEntries(mine);
    await cachedLibraryEntries(yours);
    reads.listLibraryEntries.mockClear();

    invalidateFor("recordWatch", mine);

    expect(cacheState.updated).toEqual([
      `library:${mine}`,
      `up-next:${mine}`,
      `title-detail:${mine}`,
      // #227: a watch is what every figure on `/stats` is made of.
      `stats:${mine}`,
    ]);
    await cachedLibraryEntries(mine);
    await cachedLibraryEntries(yours);
    expect(reads.listLibraryEntries.mock.calls.map(([userId]) => userId)).toEqual([mine]);
  });

  it("busts nothing for a write no cached read shows", async () => {
    await cachedLibraryEntries(mine);
    reads.listLibraryEntries.mockClear();

    invalidateFor("markImportOfferAnswered", mine);

    expect(cacheState.updated).toEqual([]);
    await cachedLibraryEntries(mine);
    expect(reads.listLibraryEntries).not.toHaveBeenCalled();
  });

  /**
   * The nightly sweep's path. `revalidateTag` with a profile rather than `updateTag`, and
   * the profile is the whole point: without it Next.js logs a deprecation warning and
   * takes the immediate-expiry branch, which is `updateTag` wearing another name and is
   * not what a background write should be doing.
   */
  it("uses stale-while-revalidate for a write nobody is watching", () => {
    invalidateForOtherAccounts("refreshTitleMirror", [yours]);

    expect(cacheState.revalidated).toEqual([
      [`library:${yours}`, "max"],
      [`up-next:${yours}`, "max"],
      [`lists:${yours}`, "max"],
      [`title-detail:${yours}`, "max"],
      // The mirror carries `runtime_mins` and `release_year`, which only `/stats` reads.
      [`stats:${yours}`, "max"],
    ]);
    expect(cacheState.updated).toEqual([]);
  });

  /**
   * The writer is in `accountsHoldingTitles`' answer after their own add, and their tag
   * has already been busted with the stronger promise. Marking it stale again here would
   * be a second pending entry for the same tag under a different profile.
   */
  it("skips the writer when busting the other holders of a shared title", () => {
    invalidateForOtherAccounts("addTitleToLibrary", [mine, yours], mine);

    expect(cacheState.revalidated.map(([tag]) => tag)).toEqual([
      `library:${yours}`,
      `up-next:${yours}`,
      `lists:${yours}`,
      `title-detail:${yours}`,
      `stats:${yours}`,
    ]);
  });

  /**
   * The bug this pair of calls exists for, end to end: `mine` adds a title `yours`
   * already holds, which upserts the shared `title` row and so changes what `yours` sees.
   * Without the second call `yours` keeps the old mirror for ever — there is no expiry
   * behind the entry to save it.
   *
   * ── One stale read first, and that is the deliberate trade ──────────────────────────
   *
   * This assertion used to say the very next read was fresh. It passed because the double
   * treated `revalidateTag(tag, "max")` as an outright delete; the real call marks the
   * entry stale and serves it once while refreshing behind it (ADR-0002, and
   * `invalidateForOtherAccounts`' own docblock, which calls stale-while-revalidate "the
   * honest treatment" for an account that is not reading its own write). #225 corrected
   * the double, and this is what the corrected one shows.
   *
   * **The behaviour is unchanged and intended** — `yours` is asleep, and a poster one page
   * load out of date costs them nothing. What changed is that the test now says so instead
   * of claiming something stronger. `#225`'s borrowed facts are the case where one stale
   * read is *not* acceptable, and they use the profile-less call for exactly that reason.
   */
  it("hands the other holders one stale read, then the re-mirrored one", async () => {
    await cachedLibraryEntries(yours);
    reads.listLibraryEntries.mockClear();

    invalidateFor("addTitleToLibrary", mine);
    invalidateForOtherAccounts("addTitleToLibrary", [mine, yours], mine);

    // Served from the stale entry: no read reached the database.
    await cachedLibraryEntries(yours);
    expect(reads.listLibraryEntries).not.toHaveBeenCalled();

    // And now the refresh.
    await cachedLibraryEntries(yours);
    expect(reads.listLibraryEntries.mock.calls.map(([userId]) => userId)).toEqual([yours]);
  });
});

/**
 * Issue #227's own criterion: *every read on this page is cached and tagged through the tag
 * module, and every watch write busts them.*
 *
 * The Stats page is the one surface in the application whose entire content is derived from
 * `watch`, so a watch write that failed to bust it would leave a reader looking at a figure
 * their own action had just made wrong — with no expiry behind the entry to heal it.
 */
describe("the Stats page's figures follow the watches they are made of", () => {
  it("gives the reader figures their own watch landed in, whichever write made it", async () => {
    for (const write of [
      "recordWatch",
      "unwatch",
      "markWatchedUpTo",
      "addTitleToLibraryWatched",
      "applyImportChunk",
    ] as const) {
      cacheState.entries.clear();
      cacheState.tags.clear();
      cacheState.stale.clear();
      cacheState.updated.length = 0;
      reads.accountStats.mockClear();

      await cachedAccountStats(mine);
      invalidateFor(write, mine);
      await cachedAccountStats(mine);

      expect(
        reads.accountStats,
        `${write} did not bust the stats tag`,
      ).toHaveBeenCalledTimes(2);
    }
  });

  /**
   * The exception, asserted rather than left to the docblock. **Rating is the one fact a
   * library entry carries that no aggregate reads**, so `rateTitle` busts three facts and
   * leaves the figures standing — and a tag that named the account without naming the fact
   * could not express that at all.
   */
  it("leaves the figures standing when only a rating changed", async () => {
    await cachedLibraryEntries(mine);
    await cachedAccountStats(mine);
    reads.listLibraryEntries.mockClear();
    reads.accountStats.mockClear();

    invalidateFor("rateTitle", mine);

    await cachedLibraryEntries(mine);
    await cachedAccountStats(mine);
    expect(reads.listLibraryEntries).toHaveBeenCalledTimes(1);
    expect(reads.accountStats).not.toHaveBeenCalled();
  });

  /**
   * Abandoning moves a title between two of the five derived states, so the count per state
   * changes with no watch written at all. It is the write most likely to be forgotten here,
   * because nothing about it looks like a watch.
   */
  it("moves the count per state when a title is abandoned", async () => {
    await cachedAccountStats(mine);
    reads.accountStats.mockClear();

    invalidateFor("abandonTitle", mine);

    await cachedAccountStats(mine);
    expect(reads.accountStats).toHaveBeenCalledTimes(1);
  });
});

/**
 * Issue #226's own criteria: the four surfaces that read one fact agreeing after a write,
 * and the two writes whose blast radius the ticket names explicitly.
 */
describe("the surfaces reading one fact agree after a write", () => {
  /**
   * **The sharpest case in the ticket, and the reason it exists.** #220 lets a reader mark
   * tonight's episode from an Ongoing tile without leaving Up next. The tile advances
   * optimistically in the browser (`up-next-mark.ts` derives its position from the marks
   * store), so the screen is already right — and it would stay right until the reader
   * reloaded, at which point a cached `listUpNextRails` would hand back the rail from
   * before the mark and the tile would offer the episode they had just watched.
   *
   * There is no expiry behind that entry to heal it. `recordWatch` busting `up-next` is
   * the whole of the fix, and this is the assertion that fails if it stops.
   */
  it("gives a reloaded Ongoing tile the episode after the one just marked", async () => {
    reads.listUpNextRails.mockResolvedValue({ nextEpisode: "S01E04" });
    expect(await cachedUpNextRails(mine)).toEqual({ nextEpisode: "S01E04" });

    reads.listUpNextRails.mockResolvedValue({ nextEpisode: "S01E05" });
    invalidateFor("recordWatch", mine);

    expect(await cachedUpNextRails(mine)).toEqual({ nextEpisode: "S01E05" });
  });

  /** *An undo from a tile is equally correct after a reload* — the same property, walked
   *  back. `unwatch` is a different write and owes its own bust. */
  it("gives a reloaded Ongoing tile the episode an undo put back", async () => {
    reads.listUpNextRails.mockResolvedValue({ nextEpisode: "S01E05" });
    await cachedUpNextRails(mine);

    reads.listUpNextRails.mockResolvedValue({ nextEpisode: "S01E04" });
    invalidateFor("unwatch", mine);

    expect(await cachedUpNextRails(mine)).toEqual({ nextEpisode: "S01E04" });
  });

  /**
   * One write, four surfaces. The library grid, the rails, the title detail and the phone's
   * WATCHLIST group all read the same entry row, so a mark that left any one of them
   * holding the old answer is the disagreement `SPEC.md` §3 constraint 1 existed to
   * forbid — restated for the cache that replaced it.
   */
  it("leaves the grid, the rails, the groups and the title detail all agreeing", async () => {
    await Promise.all([
      cachedLibraryEntries(mine),
      cachedUpNextRails(mine),
      cachedWatchlist(mine),
      cachedAbandoned(mine),
      cachedTitleDetail(mine, "entry-1"),
    ]);
    for (const read of Object.values(reads)) read.mockClear();

    invalidateFor("markWatchedUpTo", mine);

    await Promise.all([
      cachedLibraryEntries(mine),
      cachedUpNextRails(mine),
      cachedWatchlist(mine),
      cachedAbandoned(mine),
      cachedTitleDetail(mine, "entry-1"),
    ]);

    expect(reads.listLibraryEntries).toHaveBeenCalledTimes(1);
    expect(reads.listUpNextRails).toHaveBeenCalledTimes(1);
    expect(reads.listWatchlist).toHaveBeenCalledTimes(1);
    expect(reads.listAbandoned).toHaveBeenCalledTimes(1);
    expect(reads.getTitleDetail).toHaveBeenCalledTimes(1);
  });

  /**
   * The list writes, which busted nothing before this ticket because nothing they touched
   * was cached. Both list reads carry one tag, so the picker on title detail and the list's
   * own page cannot disagree about which lists exist or what is in them.
   */
  it.each([
    "createList",
    "createListAndAddTitle",
    "deleteList",
    "addTitleToList",
    "addTitlesToList",
    "reorderListMembership",
  ] as const)("busts both list reads for %s", async (write) => {
    await cachedLists(mine);
    await cachedListDetail(mine, "list-1");
    reads.listLists.mockClear();
    reads.getListDetail.mockClear();

    invalidateFor(write, mine);

    await cachedLists(mine);
    await cachedListDetail(mine, "list-1");
    expect(reads.listLists).toHaveBeenCalledTimes(1);
    expect(reads.getListDetail).toHaveBeenCalledTimes(1);
  });

  /**
   * A list write is *only* a list write. The library grid does not join `list_membership`,
   * so busting it here would throw away a correct entry for a change it cannot show —
   * which is the same argument `INVALIDATES`' empty arrays make, applied to a write that
   * does bust something.
   */
  it("leaves the library alone when only a list changed", async () => {
    await cachedLibraryEntries(mine);
    reads.listLibraryEntries.mockClear();

    invalidateFor("addTitleToList", mine);

    expect(cacheState.updated).toEqual([`lists:${mine}`]);
    await cachedLibraryEntries(mine);
    expect(reads.listLibraryEntries).not.toHaveBeenCalled();
  });

  /**
   * *Import chunks, ratings, abandonment, list membership changes, adds and removes all
   * bust correctly.* Removing a title reaches the lists as well as the other three, and
   * that is the one people get wrong: `getListDetail` selects `library_entry.id` through a
   * left join, so a title leaving the library changes what its list rows say about it
   * while the membership itself survives (issue #133).
   */
  it("busts the lists when a title leaves the library", async () => {
    await cachedListDetail(mine, "list-1");
    reads.getListDetail.mockClear();

    invalidateFor("removeTitleFromLibrary", mine);

    await cachedListDetail(mine, "list-1");
    expect(reads.getListDetail).toHaveBeenCalledTimes(1);
  });

  /** A failed write busts nothing, because the caller never gets as far as the bust. This
   *  is the shape every action has — `invalidateFor` past the `catch` — asserted as the
   *  absence it is. */
  it("busts nothing when the write never reached the map", async () => {
    await cachedUpNextRails(mine);
    reads.listUpNextRails.mockClear();

    expect(cacheState.updated).toEqual([]);
    await cachedUpNextRails(mine);
    expect(reads.listUpNextRails).not.toHaveBeenCalled();
  });
});

/**
 * `SPEC.md` §3.2 through the cache. The whole reversal rests on a cache entry never being
 * made out of a failure, and until now that was asserted in four docblocks and checked
 * nowhere.
 *
 * What this can and cannot prove is worth stating, because the `unstable_cache` here is a
 * fake. It cannot prove Next.js declines to store a rejection — that is read off
 * `unstable-cache.js`, where `cacheNewResult` is reached only after the callback resolves.
 * What it does prove is the half that lives in this repository and could regress in a
 * refactor: **`cache/tags.ts` adds no handler of its own.** A `.catch(() => [])` put on
 * that read to "make the cache resilient" is the exact shape `AGENTS.md` opens on, and it
 * would fail both assertions below rather than quietly turning a dead database into an
 * empty library.
 */
describe("a failed read is not an empty library", () => {
  const unreachable = new Error("the database is unreachable");

  it("lets the rejection through instead of answering with rows", async () => {
    reads.listLibraryEntries.mockRejectedValueOnce(unreachable);

    await expect(cachedLibraryEntries(mine)).rejects.toThrow(unreachable);
  });

  it("stores nothing, so the next read is a real read", async () => {
    reads.listLibraryEntries.mockRejectedValueOnce(unreachable);
    await expect(cachedLibraryEntries(mine)).rejects.toThrow(unreachable);

    expect(cacheState.entries.size).toBe(0);
    expect(await cachedLibraryEntries(mine)).toEqual(libraryOf(mine));
  });

  /** Every read the module wraps, not the library alone — a `catch` added to any one of
   *  the seven #226 introduces would be the same lie in a new place. */
  it.each(Object.keys(CACHED) as (keyof typeof CACHED)[])(
    "lets a failed %s through and stores nothing",
    async (read) => {
      reads[read].mockRejectedValueOnce(unreachable);

      await expect(CACHED[read](mine)).rejects.toThrow(unreachable);
      expect(cacheState.entries.size).toBe(0);
    },
  );
});

/**
 * **The input these reads have that no write touches: today's date.**
 *
 * `db/views.ts` derives *released* from `air_date <= current_date`, and the three derived
 * views are what `listLibraryEntries`, `listUpNextRails`, `listWatchlist`, `listAbandoned`
 * and `getTitleDetail` are all built on. So an episode airing tonight moves a show from
 * COMING BACK to ONGOING, and a caught-up show back to watching, **with no write anywhere
 * in the system** — the clock alone did it.
 *
 * A tag cannot fire for that, because no write happened. Without the day in the key, a
 * reader who makes no writes for a week is served last week's Up next for a week, and
 * nothing expires behind it to heal. `cache/tags.ts` puts the day in the key parts of
 * exactly the reads that consult `current_date`, and these are the assertions that hold it
 * there.
 *
 * **This is not a revalidation window**, and the distinction is the one ADR-0002 rejected
 * time-based revalidation on: a window is a period in which the answer is permitted to
 * disagree with the database. A day in the key is the opposite — it is an input to the
 * query appearing in the key of the query, so the entry is exactly right at every instant
 * it is served, and a different day is a different question rather than a stale answer.
 */
describe("a read that consults today carries today in its key", () => {
  const clockDependent = (Object.keys(CACHED) as (keyof typeof CACHED)[]).filter(
    (read) => CACHED_READS[read].readsCurrentDate,
  );
  const clockFree = (Object.keys(CACHED) as (keyof typeof CACHED)[]).filter(
    (read) => !CACHED_READS[read].readsCurrentDate,
  );

  /** A regex-matched-nothing guard, in the same spirit as the one over `exported`: two
   *  empty lists would make every case below vacuous. */
  it("has reads on both sides of the line", () => {
    expect(clockDependent.length).toBeGreaterThan(0);
    expect(clockFree.length).toBeGreaterThan(0);
  });

  it.each(clockDependent)("reads %s again once the date has rolled over", async (read) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-23T22:00:00Z"));
      await CACHED[read](mine);
      reads[read].mockClear();

      vi.setSystemTime(new Date("2026-08-24T00:30:00Z"));
      await CACHED[read](mine);

      expect(reads[read]).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The reads over stored rows are on the other side of it, and stay there. A list's name,
   * its memberships and whether this account holds a title are facts no clock changes, so
   * a day in their key would be a fresh read every midnight buying nothing — the cost of
   * the mechanism without the reason for it.
   */
  it.each(clockFree)("serves %s across a date rollover from the same entry", async (read) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-23T22:00:00Z"));
      await CACHED[read](mine);
      reads[read].mockClear();

      vi.setSystemTime(new Date("2026-08-24T00:30:00Z"));
      await CACHED[read](mine);

      expect(reads[read]).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The day is read the way Postgres reads it, and `tests/server-day.test.ts` is what
   * holds that claim against a real `current_date`. Here it is only the shape: a bare
   * `YYYY-MM-DD`, so the key part is one token and not a whole timestamp that would change
   * on every request and make the cache a very expensive way to read twice.
   */
  it("is a date and not an instant", () => {
    expect(serverDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * The map is only worth having if it is complete, and *complete* is a claim about a file
 * that changes — `db/access.ts` gains a write every few tickets. So it is checked rather
 * than asserted: every `export async function` in that module is either a write with the
 * reads it invalidates, or a read. A new one is a failing test with the new name printed
 * in it, which is the smallest possible nudge to think about the cache once.
 *
 * **`export async function`, and nothing else.** The synchronous exports of that module
 * are `asUserId` and `ownedBy`, which are helpers rather than queries — every function
 * there that touches Postgres awaits it, so async is what separates the two, and adding
 * the sync ones would put two names in the map that answer no question about a cached
 * read. The cost is stated rather than hidden: a synchronous exported *write* would go
 * unclassified, and it would also be a write that could not reach the database.
 */
describe("the map covers db/access.ts", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "..", "db", "access.ts"),
    "utf8",
  );
  const exported = [...source.matchAll(/^export async function (\w+)/gm)].map(
    ([, name]) => name,
  );

  it("finds the exports it is meant to be checking", () => {
    // A regex that matched nothing would make every assertion below vacuously true.
    expect(exported.length).toBeGreaterThan(20);
  });

  it("classifies every one of them as a write or a read", () => {
    const classified = new Set<string>([...Object.keys(INVALIDATES), ...READS]);

    expect(exported.filter((name) => !classified.has(name))).toEqual([]);
  });

  it("classifies nothing that db/access.ts does not export", () => {
    const known = new Set(exported);

    expect(
      [...Object.keys(INVALIDATES), ...READS].filter((name) => !known.has(name)),
    ).toEqual([]);
  });

  it("does not call the same function both a write and a read", () => {
    const writes = new Set<string>(Object.keys(INVALIDATES));

    expect(READS.filter((name) => writes.has(name))).toEqual([]);
  });

  /**
   * **Issue #226's last criterion, made mechanical: *no read remains uncached without a
   * recorded reason*.**
   *
   * A read is in `CACHED_READS` with the tag it carries, or in `UNCACHED_READS` with a
   * sentence saying why not — and a sentence is a thing somebody had to write, which is
   * the smallest bar that cannot be cleared by forgetting. An empty string is the same
   * omission as a missing entry, wearing a key, so it fails here too.
   */
  it("gives every uncached read a reason somebody wrote", () => {
    const unexplained = Object.entries(UNCACHED_READS).filter(
      ([, reason]) => reason.trim().length < 20,
    );

    expect(unexplained.map(([name]) => name)).toEqual([]);
  });

  /** A read in both tables would be the module disagreeing with itself about whether it is
   *  in the cache, and `READS` would double-count it. */
  it("puts each read in exactly one of the two tables", () => {
    const cached = new Set<string>(Object.keys(CACHED_READS));

    expect(Object.keys(UNCACHED_READS).filter((name) => cached.has(name))).toEqual([]);
    expect(READS.length).toBe(new Set(READS).size);
  });

  /** Every cached read has a wrapper, and every wrapper a cached read. A table entry with
   *  no function behind it is a claim about a cache that does not exist. */
  it("has a wrapper for every read it calls cached", () => {
    expect(Object.keys(CACHED_READS).sort()).toEqual(Object.keys(CACHED).sort());
  });

  /**
   * The finding this test was written for. `mirrorTitle` upserts the **global** `title`
   * and `episode` rows, so every function that calls it changes what *other accounts'*
   * libraries show, and each of its callers owes an `invalidateForOtherAccounts` on top
   * of its own bust. The first pass at #219 covered the nightly sweep's two callers and
   * missed the add path's two — exactly the mistake a list in a docblock does not prevent
   * and this does, because the set is held against the functions that make the call.
   *
   * Read by splitting the module at **every** top-level function, exported or not, so a
   * call is attributed to the function it sits in. Splitting on the exported ones alone
   * was the first attempt and it was wrong in a way worth recording: the private helpers
   * between two exports fall inside the earlier one's slice, so `mirrorTitle`'s own
   * declaration counted as a call by whichever export happened to precede it —
   * `libraryCatalogueKeys`, which does not add a title to anything.
   *
   * **Followed to a fixed point, not grepped once.** `addTitleToLibraryWatched` reaches
   * the shared write through `addTitleToLibrary` and never names `mirrorTitle` itself, so
   * a single pass would have called it clean. It arrived on `main` while #219 was in
   * review and this check found it, which is the whole argument for the check — but only
   * because it follows the call one more step.
   */
  it("names every function that writes the shared title rows", () => {
    const boundaries = [...source.matchAll(/^(export )?(?:async )?function (\w+)/gm)];

    const bodies = boundaries.map(([, exported, name], index) => ({
      name,
      exported: exported !== undefined,
      body: source.slice(
        boundaries[index].index ?? 0,
        boundaries[index + 1]?.index ?? source.length,
      ),
    }));

    const reachesMirrorTitle = new Set(["mirrorTitle"]);
    for (let pass = 0; pass < bodies.length; pass++) {
      const before = reachesMirrorTitle.size;
      for (const { name, body } of bodies) {
        const reaches = [...reachesMirrorTitle].some(
          (callee) => callee !== name && body.includes(`${callee}(`),
        );
        if (reaches) reachesMirrorTitle.add(name);
      }
      if (reachesMirrorTitle.size === before) break;
    }

    const writers = bodies
      .filter(({ name, exported }) => exported && reachesMirrorTitle.has(name))
      .map(({ name }) => name);

    expect([...writers].sort()).toEqual([...MIRRORS_SHARED_TITLE_ROWS].sort());
  });
});

/**
 * Every `.ts`/`.tsx` under `app/` whose text contains `needle`, as repository-relative
 * paths. Used by one assertion below, which is a claim about *where a call appears* and
 * so cannot be made from the module's own exports.
 */
function sourceFilesContaining(needle: string): string[] {
  const root = path.join(import.meta.dirname, "..");
  const found: string[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && readFileSync(full, "utf8").includes(needle)) {
        found.push(path.relative(root, full));
      }
    }
  }

  walk(path.join(root, "app"));
  return found;
}

/**
 * The borrowed facts, and the two things they do differently — issue #225.
 *
 * Everything above is about facts that belong to an account. These four belong to a
 * title: a synopsis, a cast list, a watch-provider row, and the mirrored `title` and
 * `episode` metadata the unowned title page renders. They keep the account in the key,
 * and they move the tag onto the title, and this block is where that pair is held.
 */
describe("a borrowed fact is keyed by account and tagged by title", () => {
  const WINDOW_SECONDS = 6 * 60 * 60;

  /**
   * The shape assertion, on all four at once. It fails on any of the three ways this
   * could regress: an account leaving a key (one reader served another's entry the day a
   * region setting exists), a title leaving a tag (nothing the nightly sweep can bust),
   * and a window going missing (a fact TMDB changed pinned for the life of the process,
   * because no MediaSafe write observes it).
   */
  it("hands Next.js an account in every key and a title in every tag", async () => {
    await readEveryBorrowedFact(mine, SOLARIS);

    expect(cacheState.constructed).toEqual([
      {
        keyParts: ["titleSynopsis", mine],
        tags: ["borrowed-facts:film:1972"],
        revalidate: WINDOW_SECONDS,
      },
      {
        keyParts: ["titleCastAndCrew", mine],
        tags: ["borrowed-facts:film:1972"],
        revalidate: WINDOW_SECONDS,
      },
      {
        keyParts: ["titleWatchProviders", mine],
        tags: ["borrowed-facts:film:1972"],
        revalidate: WINDOW_SECONDS,
      },
      {
        keyParts: ["getUnownedTitleDetail", mine],
        tags: ["borrowed-facts:film:1972"],
        revalidate: WINDOW_SECONDS,
      },
    ]);
  });

  /**
   * The account is in the key parts and **not** in the arguments here — unlike the
   * library, where it is `listLibraryEntries`'s own first parameter and would keep two
   * readers apart on its own. `titleSynopsis(kind, tmdbId)` has no account to take, so
   * the key parts are the *only* thing separating two readers of one title, and this is
   * the test that fails if somebody simplifies them away.
   */
  it("never serves one account's borrowed entry to another", async () => {
    await cachedTitleSynopsis(mine, "film", 1972);
    await cachedTitleSynopsis(yours, "film", 1972);

    expect(tmdb.titleSynopsis).toHaveBeenCalledTimes(2);
  });

  /**
   * Four facts, four entries. The keyParts prefix is what does it: the three TMDB reads
   * are indistinguishable to `unstable_cache`'s key derivation by any other means under
   * this file's mocks, and in production they are distinguished only by the callback's
   * source text — which is a coincidence of the implementation rather than a property
   * anybody chose. The prefix is the property anybody chose.
   */
  it("gives each of the four its own entry rather than one shared one", async () => {
    await readEveryBorrowedFact(mine, SOLARIS);

    expect(tmdb.titleSynopsis).toHaveBeenCalledTimes(1);
    expect(tmdb.titleCastAndCrew).toHaveBeenCalledTimes(1);
    expect(tmdb.titleWatchProviders).toHaveBeenCalledTimes(1);
    expect(reads.getUnownedTitleDetail).toHaveBeenCalledTimes(1);
  });

  it("is a cache, and not merely four functions that read twice", async () => {
    await readEveryBorrowedFact(mine, SOLARIS);
    await readEveryBorrowedFact(mine, SOLARIS);

    expect(tmdb.titleSynopsis).toHaveBeenCalledTimes(1);
    expect(reads.getUnownedTitleDetail).toHaveBeenCalledTimes(1);
  });

  it("keeps two titles apart", async () => {
    expect(await cachedTitleSynopsis(mine, "film", 1972)).toBe("the synopsis of film 1972");
    expect(await cachedTitleSynopsis(mine, "show", 2001)).toBe("the synopsis of show 2001");
  });
});

/**
 * *One failed borrowed-fact read costs only its own region*, and *a cache miss is never
 * rendered as an empty region* — two of this ticket's criteria, and the same property
 * from two sides.
 *
 * The `catch` that turns a failure into an inline recovery lives in
 * `app/(signed-in)/library/live-facts.ts`, one layer **above** these functions, and it
 * cannot be exercised here: that file is `import "server-only"`. What can be exercised is
 * the half that decides whether the catch is reached at all and whether the failure is
 * remembered — which is this module, and which is the half a refactor could quietly
 * change by "making the cache resilient".
 */
describe("a failed borrowed read is not a stored empty region", () => {
  const unreachable = new Error("TMDB is unreachable");

  it("lets the rejection through instead of answering with a value", async () => {
    tmdb.titleSynopsis.mockRejectedValueOnce(unreachable);

    await expect(cachedTitleSynopsis(mine, "film", 1972)).rejects.toThrow(unreachable);
  });

  /**
   * The window is six hours, so an entry made out of a failure would be a section
   * reading *this did not load* until this evening, with the reader's own *Try again*
   * unable to clear it. Nothing is stored, so the retry is a real one.
   */
  it("stores nothing, so Try again is a real retry rather than a replay", async () => {
    tmdb.titleSynopsis.mockRejectedValueOnce(unreachable);
    await expect(cachedTitleSynopsis(mine, "film", 1972)).rejects.toThrow(unreachable);

    expect(cacheState.entries.size).toBe(0);
    expect(await cachedTitleSynopsis(mine, "film", 1972)).toBe("the synopsis of film 1972");
  });

  /** The three regions are three entries, so one failing leaves the other two answered. */
  it("costs the failing fact its own region and nothing else", async () => {
    tmdb.titleWatchProviders.mockRejectedValueOnce(unreachable);

    await expect(cachedTitleWatchProviders(mine, "film", 1972)).rejects.toThrow(unreachable);
    expect(await cachedTitleSynopsis(mine, "film", 1972)).toBe("the synopsis of film 1972");
    expect(await cachedTitleCastAndCrew(mine, "film", 1972)).toBe(
      "the cast and crew of film 1972",
    );
  });
});

/**
 * The nightly sweep's criterion: *a title refreshed by the nightly sweep is visible on
 * the next read, without waiting for a window.*
 */
describe("busting a title's borrowed facts", () => {
  /**
   * One tag per title, and **no profile** — which is the difference between *expire this*
   * and *serve it once more while you refresh it*. The `undefined` in this assertion is
   * the acceptance criterion in one token; see the test below for what it buys.
   */
  it("expires the named title's facts with one profile-less call", () => {
    invalidateBorrowedFactsFor([SOLARIS]);

    expect(cacheState.revalidated).toEqual([["borrowed-facts:film:1972", { expire: 0 }]]);
  });

  it("never uses updateTag, which the sweep's route handler could not call", () => {
    invalidateBorrowedFactsFor([SOLARIS, ANOTHER]);

    expect(cacheState.updated).toEqual([]);
    expect(cacheState.revalidated).toEqual([
      ["borrowed-facts:film:1972", { expire: 0 }],
      ["borrowed-facts:show:2001", { expire: 0 }],
    ]);
  });

  /**
   * One tag reaches all four entries. It is the reason a per-fact tag was dropped: every
   * caller busts all four, so four tags were three spellings nobody used.
   */
  it("takes all four of a title's facts down together", async () => {
    await readEveryBorrowedFact(mine, SOLARIS);
    for (const mock of [tmdb.titleSynopsis, tmdb.titleCastAndCrew, tmdb.titleWatchProviders]) {
      mock.mockClear();
    }
    reads.getUnownedTitleDetail.mockClear();

    invalidateBorrowedFactsFor([SOLARIS]);
    await readEveryBorrowedFact(mine, SOLARIS);

    expect(tmdb.titleSynopsis).toHaveBeenCalledTimes(1);
    expect(tmdb.titleCastAndCrew).toHaveBeenCalledTimes(1);
    expect(tmdb.titleWatchProviders).toHaveBeenCalledTimes(1);
    expect(reads.getUnownedTitleDetail).toHaveBeenCalledTimes(1);
  });

  /**
   * **The criterion, in the one assertion that can tell the difference.**
   *
   * *A title refreshed by the nightly sweep is visible on the next read* — the **next**
   * one. The first version of this ticket passed `"max"`, which is stale-while-revalidate:
   * the reader after the sweep would have been served last night's mirror and only the one
   * after that the refresh. Every test passed anyway, because the double deleted on both
   * calls. It no longer does, so this assertion is now load-bearing: swap the profile-less
   * call back to `"max"` and this line fails with last night's value in the message.
   */
  it("is visible on the next read, not the one after it", async () => {
    await cachedUnownedTitleDetail(mine, "film", 1972);
    reads.getUnownedTitleDetail.mockImplementation(async () => "the refreshed metadata");

    invalidateBorrowedFactsFor([SOLARIS]);

    expect(await cachedUnownedTitleDetail(mine, "film", 1972)).toBe("the refreshed metadata");
  });

  /**
   * **The test this whole tag shape exists for.** `yours` does not hold the title — which
   * is exactly who reads the unowned title page — so `accountsHoldingTitles` would not
   * return them and an account-scoped tag could never reach their entry. A title-scoped
   * one does, and the refreshed mirror is on their next read rather than at the end of
   * the six-hour window.
   */
  it("reaches an account the holders query could never have named", async () => {
    expect(await cachedUnownedTitleDetail(yours, "film", 1972)).toBe(
      "the mirrored metadata of film 1972",
    );

    reads.getUnownedTitleDetail.mockImplementation(async () => "the refreshed metadata");
    invalidateBorrowedFactsFor([SOLARIS]);

    expect(await cachedUnownedTitleDetail(yours, "film", 1972)).toBe("the refreshed metadata");
  });

  it("leaves a title the sweep did not touch exactly as it was", async () => {
    await cachedUnownedTitleDetail(mine, "show", 2001);
    reads.getUnownedTitleDetail.mockClear();

    invalidateBorrowedFactsFor([SOLARIS]);

    await cachedUnownedTitleDetail(mine, "show", 2001);
    expect(reads.getUnownedTitleDetail).not.toHaveBeenCalled();
  });
});

/**
 * The couplings this module cannot state in its types, held against the source of the
 * files that owe them. Both are silent failures: the code runs, the tests pass, and one
 * screen quietly disagrees with the database.
 */
describe("every shared-mirror write busts the borrowed facts too", () => {
  const CALL_SITES = [
    "app/(signed-in)/search/actions.ts",
    "app/(signed-in)/titles/actions.ts",
    "app/(signed-in)/import/actions.ts",
    "app/api/cron/nightly-sweep/route.ts",
  ];

  /**
   * `MIRRORS_SHARED_TITLE_ROWS` names the writes; the test above it holds that list
   * against `db/access.ts`. This holds the *call sites* — every file that busts other
   * accounts' libraries for a shared-mirror write also busts that title's borrowed facts,
   * because the two calls cover different populations and neither is the other's
   * shorthand (`invalidateBorrowedFactsFor`'s docblock). The add path was missed once on
   * the account-scoped bust and found in review; this is the same check for the second
   * one, before rather than after.
   */
  it.each(CALL_SITES)("%s makes both busts, not only the account one", (callSite) => {
    const source = readFileSync(path.join(import.meta.dirname, "..", callSite), "utf8");

    expect(source).toContain("invalidateForOtherAccounts(");
    expect(source).toContain("invalidateBorrowedFactsFor(");
  });

  /**
   * And nowhere else does. A bust from outside these four would mean a write that reaches
   * `mirrorTitle` from a path `MIRRORS_SHARED_TITLE_ROWS` does not name — which is the
   * thing that list exists to make impossible, so a new name here is a prompt to check it
   * rather than a failure in itself.
   */
  it("is called from those four files and no others", () => {
    const callers = sourceFilesContaining("invalidateBorrowedFactsFor(");

    expect(callers.sort()).toEqual([...CALL_SITES].sort());
  });
});

/**
 * *Search results are not served from a cache in a way that hides a title added moments
 * ago* — this ticket's last criterion, and the only one satisfied by something **not**
 * happening. Which is exactly why it needs a test: nothing else in the suite fails when a
 * fifth `unstable_cache` call appears around `searchCatalogue`.
 *
 * Read off the source rather than the behaviour, because there is no behaviour to read:
 * the assertion is that the module constructs cached reads over these five callbacks and
 * no sixth. `tmdb/catalogue.ts`'s own docblock carries the argument — a query string is a
 * fact about neither a title nor a reader, and a stored result set hides both a title
 * TMDB added this morning and one this account added a minute ago.
 */
describe("the reads that are cached, and the one that must never be", () => {
  /** Both files of `cache/`, because the claim is about the directory, not either half. */
  const source = ["tags.ts", "borrowed-facts.ts"]
    .map((file) => readFileSync(path.join(import.meta.dirname, "..", "cache", file), "utf8"))
    .join("\n");

  it("wraps exactly the fourteen reads it is meant to", () => {
    // `\s*` because several of these are formatted across lines. A regex that only
    // matched the single-line spelling silently found five of them and passed.
    const cached = [...source.matchAll(/unstable_cache\(\s*(\w+),/g)].map(([, name]) => name);

    expect(cached).toEqual([
      // `tags.ts` — the owned ten, in file order.
      "listLibraryEntries",
      "listUpNextRails",
      "listWatchlist",
      "listAbandoned",
      "listLists",
      "getListDetail",
      "getTitleDetail",
      "libraryEntryIdForTitle",
      "accountStats",
      "accountFigures",
      // `borrowed-facts.ts` — the four.
      "titleSynopsis",
      "titleCastAndCrew",
      "titleWatchProviders",
      "getUnownedTitleDetail",
    ]);
  });

  it("does not so much as name the catalogue search", () => {
    expect(source).not.toContain("searchCatalogue");
  });

  /**
   * And nothing outside `cache/` constructs one. `eslint.config.mjs` already restricts
   * `next/cache` to that directory, so this is the belt to the lint rule's braces — and it
   * is the assertion that would fail first if the exemption were ever widened to a second
   * directory for convenience.
   */
  it("is the only place in the repository that constructs a cached read", () => {
    expect(sourceFilesContaining("unstable_cache(")).toEqual([]);
  });
});
