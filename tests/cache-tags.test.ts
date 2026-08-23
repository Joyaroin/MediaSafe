import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The read cache's two properties, held against the module that is supposed to have them
 * — issue #219, `cache/tags.ts`.
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

const { cacheState, reads } = vi.hoisted(() => ({
  cacheState: {
    /** Cached values by invocation key, exactly as `unstable_cache` would hold them. */
    entries: new Map<string, unknown>(),
    /** The tags each entry carries, so a bust can find the entries it names. */
    tags: new Map<string, readonly string[]>(),
    /** Every tag `updateTag` was called with, in order. */
    updated: [] as string[],
    /** Every `[tag, profile]` pair `revalidateTag` was called with, in order. */
    revalidated: [] as [string, unknown][],
    /** The key parts and tags of every cached read that was constructed, in order. */
    constructed: [] as { keyParts: string[]; tags: readonly string[] }[],
  },
  /**
   * Every read `cache/tags.ts` wraps, faked — one `vi.fn()` apiece rather than one shared
   * spy, because *which* read the module reached for is half of what several assertions
   * below are about. A `cachedWatchlist` that quietly called `listAbandoned` would satisfy
   * a shared spy's call count and would be showing the reader the wrong group.
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
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache(
    callback: (...args: never[]) => Promise<unknown>,
    keyParts?: string[],
    options?: { tags?: string[] },
  ) {
    const fixedKey = `${callback.toString()}-${Array.isArray(keyParts) && keyParts.join(",")}`;
    cacheState.constructed.push({
      keyParts: keyParts ?? [],
      tags: options?.tags ?? [],
    });

    return async (...args: never[]) => {
      const invocationKey = `${fixedKey}-${JSON.stringify(args)}`;
      if (cacheState.entries.has(invocationKey)) {
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
    bust(tag);
  },

  revalidateTag(tag: string, profile: unknown) {
    cacheState.revalidated.push([tag, profile]);
    bust(tag);
  },
}));

vi.mock("@/db/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/access")>()),
  ...reads,
}));

function bust(tag: string): void {
  for (const [key, tags] of cacheState.tags) {
    if (!tags.includes(tag)) continue;
    cacheState.entries.delete(key);
    cacheState.tags.delete(key);
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
} as const;

/** What the fake behind `read` answers `userId` with. The library's is a list of rows,
 *  because the assertions that predate #226 are about rows; the rest need only to name
 *  the account they were read for. */
function answerFor(read: keyof typeof CACHED, userId: string) {
  return read === "listLibraryEntries" ? libraryOf(userId) : ownedBy(userId);
}

beforeEach(() => {
  cacheState.entries.clear();
  cacheState.tags.clear();
  cacheState.updated.length = 0;
  cacheState.revalidated.length = 0;
  cacheState.constructed.length = 0;

  for (const read of Object.values(reads)) {
    read.mockReset();
    read.mockImplementation(async (userId: string) => ownedBy(userId));
  }
  reads.listLibraryEntries.mockImplementation(async (userId: string) => libraryOf(userId));
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
      { keyParts: ["listLibraryEntries", mine, serverDay()], tags: [`library:${mine}`] },
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
    ]);
  });

  /**
   * The bug this pair of calls exists for, end to end: `mine` adds a title `yours`
   * already holds, which upserts the shared `title` row and so changes what `yours` sees.
   * Without the second call `yours` keeps the old mirror for ever — there is no expiry
   * behind the entry to save it.
   */
  it("gives the other holders of a re-mirrored title a fresh read", async () => {
    await cachedLibraryEntries(yours);
    reads.listLibraryEntries.mockClear();

    invalidateFor("addTitleToLibrary", mine);
    invalidateForOtherAccounts("addTitleToLibrary", [mine, yours], mine);

    await cachedLibraryEntries(yours);
    expect(reads.listLibraryEntries.mock.calls.map(([userId]) => userId)).toEqual([yours]);
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
