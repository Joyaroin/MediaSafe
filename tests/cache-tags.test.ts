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

const {
  cacheState,
  listLibraryEntriesMock,
  unownedTitleDetailMock,
  synopsisMock,
  castAndCrewMock,
  watchProvidersMock,
} = vi.hoisted(() => ({
  cacheState: {
    /** Cached values by invocation key, exactly as `unstable_cache` would hold them. */
    entries: new Map<string, unknown>(),
    /** The tags each entry carries, so a bust can find the entries it names. */
    tags: new Map<string, readonly string[]>(),
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
  listLibraryEntriesMock: vi.fn(),
  unownedTitleDetailMock: vi.fn(),
  synopsisMock: vi.fn(),
  castAndCrewMock: vi.fn(),
  watchProvidersMock: vi.fn(),
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
  listLibraryEntries: listLibraryEntriesMock,
  getUnownedTitleDetail: unownedTitleDetailMock,
}));

/**
 * Mocked **whole**, with no `importOriginal` — and that is a constraint rather than a
 * shortcut. `tmdb/catalogue.ts` is `import "server-only"`, which is a no-op inside Next's
 * build and a hard throw under plain Node module resolution, so loading the real module
 * here would fail the file before a single test ran (`tests/nightly-sweep-route.test.ts`
 * and `run-sweep.ts` document the same wall from the other side). Since issue #225
 * `cache/tags.ts` imports it, so this mock is what keeps the module importable at all.
 *
 * Nothing is lost by it. The three functions are a URL, a header and a `fetch`, and are
 * deliberately untested there for that reason; what this file is about is the keys, the
 * tags and the window wrapped around them.
 */
vi.mock("@/tmdb/catalogue", () => ({
  titleSynopsis: synopsisMock,
  titleCastAndCrew: castAndCrewMock,
  titleWatchProviders: watchProvidersMock,
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
  INVALIDATES,
  MIRRORS_SHARED_TITLE_ROWS,
  READS,
  cachedLibraryEntries,
  invalidateFor,
  invalidateForOtherAccounts,
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

/** Two titles, so *which title's entry was busted* is answerable from the value alone. */
const SOLARIS = { kind: "film", tmdbId: 1972 } as const;
const ANOTHER = { kind: "show", tmdbId: 2001 } as const;

/** What a borrowed read answers, said so the title is legible in a failure. */
function borrowedFrom(prefix: string) {
  return async (kind: string, tmdbId: number) => `${prefix} of ${kind} ${tmdbId}`;
}

/** The four borrowed reads of one title, all of them, in one call. */
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
  cacheState.updated.length = 0;
  cacheState.revalidated.length = 0;
  cacheState.constructed.length = 0;

  listLibraryEntriesMock.mockReset();
  listLibraryEntriesMock.mockImplementation(async (userId: string) => libraryOf(userId));

  for (const [mock, prefix] of [
    [synopsisMock, "the synopsis"],
    [castAndCrewMock, "the cast and crew"],
    [watchProvidersMock, "the watch providers"],
    [unownedTitleDetailMock, "the mirrored metadata"],
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
      // `revalidate: undefined` is the assertion, not a filler: an owned fact is correct
      // until a write says otherwise, so a window on this entry would only be a way for
      // the library to be wrong. It is the one thing borrowed facts have that this does
      // not (`cache/tags.ts`), which makes it worth failing on rather than omitting.
      { keyParts: ["library", mine], tags: [`library:${mine}`], revalidate: undefined },
    ]);
  });

  /**
   * The one that would have caught it. Drop the account from the key parts and from the
   * arguments and this fails twice over: `yours` is served `mine`'s row, and the read it
   * should have made never happens.
   */
  it("never serves one account's library to another", async () => {
    expect(await cachedLibraryEntries(mine)).toEqual(libraryOf(mine));
    expect(await cachedLibraryEntries(yours)).toEqual(libraryOf(yours));

    expect(listLibraryEntriesMock.mock.calls.map(([userId]) => userId)).toEqual([
      mine,
      yours,
    ]);
  });

  it("is a cache, and not merely a function that reads twice", async () => {
    await cachedLibraryEntries(mine);
    await cachedLibraryEntries(mine);

    expect(listLibraryEntriesMock).toHaveBeenCalledTimes(1);
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

    expect(listLibraryEntriesMock).toHaveBeenCalledTimes(2);
    expect(await cachedLibraryEntries(yours, "title")).toEqual(libraryOf(yours));
  });
});

describe("every write busts its tags", () => {
  it("gives the reader the library their own write landed in", async () => {
    expect(await cachedLibraryEntries(mine)).toEqual(libraryOf(mine));

    listLibraryEntriesMock.mockImplementation(async () => [
      ...libraryOf(mine),
      { libraryEntryId: "entry-just-added", name: "The one I just added" },
    ]);
    invalidateFor("addTitleToLibrary", mine);

    expect(await cachedLibraryEntries(mine)).toHaveLength(2);
  });

  it("busts the writer's library and leaves everybody else's alone", async () => {
    await cachedLibraryEntries(mine);
    await cachedLibraryEntries(yours);
    listLibraryEntriesMock.mockClear();

    invalidateFor("recordWatch", mine);

    expect(cacheState.updated).toEqual([`library:${mine}`]);
    await cachedLibraryEntries(mine);
    await cachedLibraryEntries(yours);
    expect(listLibraryEntriesMock.mock.calls.map(([userId]) => userId)).toEqual([mine]);
  });

  it("busts nothing for a write no cached read shows", async () => {
    await cachedLibraryEntries(mine);
    listLibraryEntriesMock.mockClear();

    invalidateFor("markImportOfferAnswered", mine);

    expect(cacheState.updated).toEqual([]);
    await cachedLibraryEntries(mine);
    expect(listLibraryEntriesMock).not.toHaveBeenCalled();
  });

  /**
   * The nightly sweep's path. `revalidateTag` with a profile rather than `updateTag`, and
   * the profile is the whole point: without it Next.js logs a deprecation warning and
   * takes the immediate-expiry branch, which is `updateTag` wearing another name and is
   * not what a background write should be doing.
   */
  it("uses stale-while-revalidate for a write nobody is watching", () => {
    invalidateForOtherAccounts("refreshTitleMirror", [yours]);

    expect(cacheState.revalidated).toEqual([[`library:${yours}`, "max"]]);
    expect(cacheState.updated).toEqual([]);
  });

  /**
   * The writer is in `accountsHoldingTitles`' answer after their own add, and their tag
   * has already been busted with the stronger promise. Marking it stale again here would
   * be a second pending entry for the same tag under a different profile.
   */
  it("skips the writer when busting the other holders of a shared title", () => {
    invalidateForOtherAccounts("addTitleToLibrary", [mine, yours], mine);

    expect(cacheState.revalidated).toEqual([[`library:${yours}`, "max"]]);
  });

  /**
   * The bug this pair of calls exists for, end to end: `mine` adds a title `yours`
   * already holds, which upserts the shared `title` row and so changes what `yours` sees.
   * Without the second call `yours` keeps the old mirror for ever — there is no expiry
   * behind the entry to save it.
   */
  it("gives the other holders of a re-mirrored title a fresh read", async () => {
    await cachedLibraryEntries(yours);
    listLibraryEntriesMock.mockClear();

    invalidateFor("addTitleToLibrary", mine);
    invalidateForOtherAccounts("addTitleToLibrary", [mine, yours], mine);

    await cachedLibraryEntries(yours);
    expect(listLibraryEntriesMock.mock.calls.map(([userId]) => userId)).toEqual([yours]);
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
    listLibraryEntriesMock.mockRejectedValueOnce(unreachable);

    await expect(cachedLibraryEntries(mine)).rejects.toThrow(unreachable);
  });

  it("stores nothing, so the next read is a real read", async () => {
    listLibraryEntriesMock.mockRejectedValueOnce(unreachable);
    await expect(cachedLibraryEntries(mine)).rejects.toThrow(unreachable);

    expect(cacheState.entries.size).toBe(0);
    expect(await cachedLibraryEntries(mine)).toEqual(libraryOf(mine));
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
        keyParts: ["title-synopsis", mine],
        tags: ["title-synopsis:film:1972"],
        revalidate: WINDOW_SECONDS,
      },
      {
        keyParts: ["title-cast-crew", mine],
        tags: ["title-cast-crew:film:1972"],
        revalidate: WINDOW_SECONDS,
      },
      {
        keyParts: ["title-watch-providers", mine],
        tags: ["title-watch-providers:film:1972"],
        revalidate: WINDOW_SECONDS,
      },
      {
        keyParts: ["title-mirror", mine],
        tags: ["title-mirror:film:1972"],
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

    expect(synopsisMock).toHaveBeenCalledTimes(2);
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

    expect(synopsisMock).toHaveBeenCalledTimes(1);
    expect(castAndCrewMock).toHaveBeenCalledTimes(1);
    expect(watchProvidersMock).toHaveBeenCalledTimes(1);
    expect(unownedTitleDetailMock).toHaveBeenCalledTimes(1);
  });

  it("is a cache, and not merely four functions that read twice", async () => {
    await readEveryBorrowedFact(mine, SOLARIS);
    await readEveryBorrowedFact(mine, SOLARIS);

    expect(synopsisMock).toHaveBeenCalledTimes(1);
    expect(unownedTitleDetailMock).toHaveBeenCalledTimes(1);
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
    synopsisMock.mockRejectedValueOnce(unreachable);

    await expect(cachedTitleSynopsis(mine, "film", 1972)).rejects.toThrow(unreachable);
  });

  /**
   * The window is six hours, so an entry made out of a failure would be a section
   * reading *this did not load* until this evening, with the reader's own *Try again*
   * unable to clear it. Nothing is stored, so the retry is a real one.
   */
  it("stores nothing, so Try again is a real retry rather than a replay", async () => {
    synopsisMock.mockRejectedValueOnce(unreachable);
    await expect(cachedTitleSynopsis(mine, "film", 1972)).rejects.toThrow(unreachable);

    expect(cacheState.entries.size).toBe(0);
    expect(await cachedTitleSynopsis(mine, "film", 1972)).toBe("the synopsis of film 1972");
  });

  /** The three regions are three entries, so one failing leaves the other two answered. */
  it("costs the failing fact its own region and nothing else", async () => {
    watchProvidersMock.mockRejectedValueOnce(unreachable);

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
  it("expires all four facts of the named title and no others", () => {
    invalidateBorrowedFactsFor([SOLARIS]);

    expect(cacheState.revalidated).toEqual([
      ["title-synopsis:film:1972", "max"],
      ["title-cast-crew:film:1972", "max"],
      ["title-watch-providers:film:1972", "max"],
      ["title-mirror:film:1972", "max"],
    ]);
  });

  it("never uses updateTag, which the sweep's route handler could not call", () => {
    invalidateBorrowedFactsFor([SOLARIS, ANOTHER]);

    expect(cacheState.updated).toEqual([]);
    expect(cacheState.revalidated).toHaveLength(8);
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

    unownedTitleDetailMock.mockImplementation(async () => "the refreshed metadata");
    invalidateBorrowedFactsFor([SOLARIS]);

    expect(await cachedUnownedTitleDetail(yours, "film", 1972)).toBe("the refreshed metadata");
  });

  it("leaves a title the sweep did not touch exactly as it was", async () => {
    await cachedUnownedTitleDetail(mine, "show", 2001);
    unownedTitleDetailMock.mockClear();

    invalidateBorrowedFactsFor([SOLARIS]);

    await cachedUnownedTitleDetail(mine, "show", 2001);
    expect(unownedTitleDetailMock).not.toHaveBeenCalled();
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

  it("wraps exactly the five reads it is meant to", () => {
    const cached = [...source.matchAll(/unstable_cache\((\w+),/g)].map(([, name]) => name);

    expect(cached).toEqual([
      "listLibraryEntries",
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
