import { describe, expect, it } from "vitest";

import {
  asUserId,
  listAbandoned,
  listWatchlist,
  type LibraryStateGroupEntry,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `listWatchlist` and `listAbandoned` (issue #138) — the phone home's fourth and fifth
 * groups, and the two states the desktop rails never show.
 *
 * ── Why this is not `up-next.test.ts` ─────────────────────────────────────────────────
 *
 * Neither group carries `SPEC.md` §7's ordering — that rule is about *up next*, and
 * nothing here has one; a watchlist title has no progress to be up next from, and an
 * abandoned one is excluded from Up next entirely. So this file checks a different,
 * smaller thing: which titles each group holds, ordered Title A–Z, and that a film — which
 * `up-next.test.ts`'s membership never has to reason about, because no film is ever
 * *watching* or *caught up* — is not silently dropped by a query that assumed a show.
 *
 * ── No network, and nothing mocked ───────────────────────────────────────────────────
 *
 * Every row below is inserted directly through the harness's transaction, the same way
 * `up-next.test.ts` and `library-grid.test.ts` do.
 */

setUpTestDatabase("mediasafe_library_state_groups_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface Entry {
  userId: UserId;
  titleId: string;
  entryId: string;
}

interface EntrySpec {
  name?: string;
  kind?: "film" | "show";
  releaseYear?: number | null;
  posterPath?: string | null;
  abandonedAt?: Date;
}

/** A library entry with no episodes — nothing here needs one to be *watchlist*. */
async function seedEntry(tx: Transaction, userId: UserId, spec: EntrySpec = {}): Promise<Entry> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: spec.kind ?? "show",
      tmdbId: number,
      name: spec.name ?? `Title ${number}`,
      releaseYear: "releaseYear" in spec ? spec.releaseYear : 2019,
      posterPath: "posterPath" in spec ? spec.posterPath : `/poster-${number}.jpg`,
      runtimeMins: spec.kind === "film" ? 104 : null,
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, abandonedAt: spec.abandonedAt })
    .returning({ id: libraryEntry.id });

  return { userId, titleId: row.id, entryId: entry.id };
}

async function markWatched(tx: Transaction, entry: Entry): Promise<void> {
  await tx.insert(watch).values({
    userId: entry.userId,
    libraryEntryId: entry.entryId,
    titleId: entry.titleId,
    episodeId: null,
    watchedAt: new Date(),
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });
}

function names(entries: readonly LibraryStateGroupEntry[]): string[] {
  return entries.map((entry) => entry.titleName);
}

describe("listWatchlist", () => {
  it("holds a show and a film with no watches at all", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Unstarted show", kind: "show" });
      await seedEntry(tx, reader, { name: "Unstarted film", kind: "film" });

      expect(names(await listWatchlist(reader, tx))).toEqual([
        "Unstarted film",
        "Unstarted show",
      ]);
    });
  });

  it("leaves out a title the moment it has any watch", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const started = await seedEntry(tx, reader, { name: "Started" });
      await markWatched(tx, started);
      await seedEntry(tx, reader, { name: "Unstarted" });

      expect(names(await listWatchlist(reader, tx))).toEqual(["Unstarted"]);
    });
  });

  it("leaves out an abandoned title that has never been watched", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      // No watches at all, but abandoned outranks *watchlist* — the same precedence
      // `library_entry_state` gives every other derived state (`db/views.ts`).
      await seedEntry(tx, reader, { name: "Given up cold", abandonedAt: new Date() });
      await seedEntry(tx, reader, { name: "Unstarted" });

      expect(names(await listWatchlist(reader, tx))).toEqual(["Unstarted"]);
    });
  });

  it("returns this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");
      await seedEntry(tx, reader, { name: "Mine" });
      await seedEntry(tx, stranger, { name: "Theirs" });

      expect(names(await listWatchlist(reader, tx))).toEqual(["Mine"]);
    });
  });

  it("answers an account with nothing on the watchlist with an empty array", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const started = await seedEntry(tx, reader, { name: "Started" });
      await markWatched(tx, started);

      expect(await listWatchlist(reader, tx)).toEqual([]);
    });
  });

  it("orders Title A–Z, and gives two identical loads an identical order", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Zebra" });
      await seedEntry(tx, reader, { name: "anvil" });
      // Two share a name, so only the entry id underneath can separate them — the same
      // tiebreak `db/library-sort.ts`'s Title A–Z sort carries.
      await seedEntry(tx, reader, { name: "Bell" });
      await seedEntry(tx, reader, { name: "Bell" });

      const first = await listWatchlist(reader, tx);
      const second = await listWatchlist(reader, tx);

      expect(first).toEqual(second);
      expect(names(first)).toEqual(["anvil", "Bell", "Bell", "Zebra"]);
    });
  });

  it("carries everything a group tile renders, and nothing an episode would", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const entry = await seedEntry(tx, reader, {
        name: "Person of Interest",
        releaseYear: 2011,
        posterPath: "/poi.jpg",
      });

      const [row] = await listWatchlist(reader, tx);

      expect(row).toEqual({
        libraryEntryId: entry.entryId,
        titleId: entry.titleId,
        titleName: "Person of Interest",
        releaseYear: 2011,
        posterPath: "/poi.jpg",
      });
    });
  });
});

describe("listAbandoned", () => {
  it("holds a title given up on with no watches at all", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Given up cold", abandonedAt: new Date() });

      expect(names(await listAbandoned(reader, tx))).toEqual(["Given up cold"]);
    });
  });

  it("holds a title given up on after watching some of it", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const abandoned = await seedEntry(tx, reader, {
        name: "Given up part-way",
        abandonedAt: new Date(),
      });
      await markWatched(tx, abandoned);

      expect(names(await listAbandoned(reader, tx))).toEqual(["Given up part-way"]);
    });
  });

  it("leaves out a title with no `abandoned_at`, however untouched it is", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Unstarted" });

      expect(await listAbandoned(reader, tx)).toEqual([]);
    });
  });

  it("returns this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");
      await seedEntry(tx, reader, { name: "Mine", abandonedAt: new Date() });
      await seedEntry(tx, stranger, { name: "Theirs", abandonedAt: new Date() });

      expect(names(await listAbandoned(reader, tx))).toEqual(["Mine"]);
    });
  });

  it("orders Title A–Z", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Zebra", abandonedAt: new Date() });
      await seedEntry(tx, reader, { name: "anvil", abandonedAt: new Date() });

      expect(names(await listAbandoned(reader, tx))).toEqual(["anvil", "Zebra"]);
    });
  });
});
