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
const { INVALIDATED_BY, READS, cachedLibraryEntries, invalidateFor, invalidateForBackgroundWrite } =
  await import("@/cache/tags");

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
  it("uses stale-while-revalidate for a write nobody is watching", async () => {
    invalidateForBackgroundWrite("refreshTitleMirror", yours);

    expect(cacheState.revalidated).toEqual([[`library:${yours}`, "max"]]);
    expect(cacheState.updated).toEqual([]);
  });
});

/**
 * The map is only worth having if it is complete, and *complete* is a claim about a file
 * that changes — `db/access.ts` gains a write every few tickets. So it is checked rather
 * than asserted: every `export async function` in that module is either a write with the
 * reads it invalidates, or a read. A new one is a failing test with the new name printed
 * in it, which is the smallest possible nudge to think about the cache once.
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
    const classified = new Set<string>([...Object.keys(INVALIDATED_BY), ...READS]);

    expect(exported.filter((name) => !classified.has(name))).toEqual([]);
  });

  it("classifies nothing that db/access.ts does not export", () => {
    const known = new Set(exported);

    expect(
      [...Object.keys(INVALIDATED_BY), ...READS].filter((name) => !known.has(name)),
    ).toEqual([]);
  });

  it("does not call the same function both a write and a read", () => {
    const writes = new Set<string>(Object.keys(INVALIDATED_BY));

    expect(READS.filter((name) => writes.has(name))).toEqual([]);
  });
});
