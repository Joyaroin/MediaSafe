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

const { cacheState, listLibraryEntriesMock } = vi.hoisted(() => ({
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
  listLibraryEntriesMock: vi.fn(),
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
  listLibraryEntries: listLibraryEntriesMock,
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

/** Two accounts, named so that a leak between them reads as a leak in the failure. */
const mine = asUserId("user_mine");
const yours = asUserId("user_yours");

/** One row apiece, so *whose library came back* is answerable from the value alone. */
function libraryOf(userId: string) {
  return [{ libraryEntryId: `entry-${userId}`, name: `A title only ${userId} has` }];
}

beforeEach(() => {
  cacheState.entries.clear();
  cacheState.tags.clear();
  cacheState.updated.length = 0;
  cacheState.revalidated.length = 0;
  cacheState.constructed.length = 0;

  listLibraryEntriesMock.mockReset();
  listLibraryEntriesMock.mockImplementation(async (userId: string) => libraryOf(userId));
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
      { keyParts: ["library", mine], tags: [`library:${mine}`] },
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
