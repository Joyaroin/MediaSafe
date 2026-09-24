import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  abandonTitle,
  abandonTitles,
  asUserId,
  unabandonTitle,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, libraryEntryState, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `abandonTitle` and `unabandonTitle`, against real Postgres — issue #87, and
 * "abandoned outranks the state the watches would give, and un-abandon returns to it."
 *
 * Mirrors `tests/watch-idempotency.test.ts`'s harness rather than inventing a second one:
 * a fresh user and title per test, seeded directly against the tables so the write under
 * test is the only thing exercised.
 */

setUpTestDatabase("mediasafe_abandon_test");

const RELEASED = daysFromToday(-30);

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  readonly seasonNo: number;
  readonly episodeNo: number;
}

async function seedShow(
  tx: Transaction,
  userId: UserId,
  episodes: readonly EpisodeSpec[],
  overrides: { inProduction?: boolean } = {},
): Promise<{ entryId: string; titleId: string; episodeIds: Record<string, string> }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: `Show ${number}`,
      releaseYear: 2022,
      inProduction: overrides.inProduction ?? true,
    })
    .returning({ id: title.id });

  const episodeIds: Record<string, string> = {};
  for (const one of episodes) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: one.seasonNo,
        episodeNo: one.episodeNo,
        name: `S${one.seasonNo}E${one.episodeNo}`,
        airDate: RELEASED,
      })
      .returning({ id: episode.id });
    episodeIds[`${one.seasonNo}-${one.episodeNo}`] = inserted.id;
  }

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });

  return { entryId: entry.id, titleId: row.id, episodeIds };
}

async function markWatched(
  tx: Transaction,
  userId: UserId,
  entryId: string,
  titleId: string,
  episodeId: string,
): Promise<void> {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: entryId,
    titleId,
    episodeId,
    watchedAt: new Date(),
    source: "app",
    sourceKey: `watch-${nextNumber()}`,
  });
}

async function abandonedAtOf(tx: Transaction, entryId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ abandonedAt: libraryEntry.abandonedAt })
    .from(libraryEntry)
    .where(eq(libraryEntry.id, entryId));
  return row.abandonedAt;
}

async function watchCountFor(tx: Transaction, entryId: string): Promise<number> {
  const rows = await tx.select().from(watch).where(eq(watch.libraryEntryId, entryId));
  return rows.length;
}

async function stateOf(tx: Transaction, entryId: string): Promise<string> {
  const [row] = await tx
    .select({ state: libraryEntryState.state })
    .from(libraryEntryState)
    .where(eq(libraryEntryState.libraryEntryId, entryId));
  return row.state;
}

describe("abandonTitle", () => {
  it("sets abandoned_at and touches no watch", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
      ]);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);
      const before = await watchCountFor(tx, entryId);

      expect(await abandonedAtOf(tx, entryId)).toBeNull();

      await abandonTitle(userId, entryId, tx);

      expect(await abandonedAtOf(tx, entryId)).not.toBeNull();
      expect(await watchCountFor(tx, entryId)).toBe(before);
    }));

  it("outranks the state the watches would give, and un-abandon returns to it", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(
        tx,
        userId,
        [{ seasonNo: 1, episodeNo: 1 }],
        { inProduction: false },
      );
      // Every released episode watched: the watches alone say *finished*.
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);
      expect(await stateOf(tx, entryId)).toBe("finished");

      await abandonTitle(userId, entryId, tx);
      expect(await stateOf(tx, entryId)).toBe("abandoned");

      const outcome = await unabandonTitle(userId, entryId, tx);
      expect(outcome.state).toBe("finished");
      expect(await stateOf(tx, entryId)).toBe("finished");
    }));

  it("throws on a library entry id that does not exist", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      await expect(
        abandonTitle(userId, "00000000-0000-0000-0000-000000000000", tx),
      ).rejects.toThrow();
    }));

  it("throws on another account's library entry", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "adham");
      const stranger = await seedUser(tx, "someone-else");
      const { entryId } = await seedShow(tx, owner, [{ seasonNo: 1, episodeNo: 1 }]);

      await expect(abandonTitle(stranger, entryId, tx)).rejects.toThrow();
      expect(await abandonedAtOf(tx, entryId)).toBeNull();
    }));
});

describe("unabandonTitle", () => {
  it("clears abandoned_at and touches no watch", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      await abandonTitle(userId, entryId, tx);
      const before = await watchCountFor(tx, entryId);

      const outcome = await unabandonTitle(userId, entryId, tx);

      expect(outcome.state).toBe("watchlist");
      expect(await abandonedAtOf(tx, entryId)).toBeNull();
      expect(await watchCountFor(tx, entryId)).toBe(before);
    }));

  it("restores the derived state the entry's watches imply, with nothing re-marked by hand", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
      ]);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);

      await abandonTitle(userId, entryId, tx);
      const outcome = await unabandonTitle(userId, entryId, tx);

      // Watching: one of two released episodes has a watch — exactly what the watches
      // already implied before abandonment ever touched the row.
      expect(outcome.state).toBe("watching");
    }));

  it("throws on a library entry id that does not exist", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      await expect(
        unabandonTitle(userId, "00000000-0000-0000-0000-000000000000", tx),
      ).rejects.toThrow();
    }));

  it("throws on another account's library entry, and leaves it abandoned", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "adham");
      const stranger = await seedUser(tx, "someone-else");
      const { entryId } = await seedShow(tx, owner, [{ seasonNo: 1, episodeNo: 1 }]);
      await abandonTitle(owner, entryId, tx);

      await expect(unabandonTitle(stranger, entryId, tx)).rejects.toThrow();
      expect(await abandonedAtOf(tx, entryId)).not.toBeNull();
    }));
});

/**
 * `abandonTitles` — issue #199's *abandon several at once*, and the half of the ticket
 * `tests/bulk-selection.test.ts` deliberately cannot prove.
 *
 * That suite proves the browser asks for one write and asks for the right titles. This one
 * proves what the write does when it arrives: that the set is one transaction, that an
 * entry already given up on keeps the `abandoned_at` it had, and that a bad id in the set
 * leaves every good one untouched. Both are needed, and neither substitutes for the other.
 */
describe("abandonTitles", () => {
  it("abandons every entry in the set in one write", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const first = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      const second = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      const third = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);

      const outcome = await abandonTitles(
        userId,
        [first.entryId, second.entryId, third.entryId],
        tx,
      );

      expect(outcome.abandoned).toBe(3);
      expect(await stateOf(tx, first.entryId)).toBe("abandoned");
      expect(await stateOf(tx, second.entryId)).toBe("abandoned");
      expect(await stateOf(tx, third.entryId)).toBe("abandoned");
    }));

  it("touches no watch, exactly as the single-title write does not", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);
      const before = await watchCountFor(tx, entryId);

      await abandonTitles(userId, [entryId], tx);

      expect(await watchCountFor(tx, entryId)).toBe(before);
    }));

  it("leaves an already-abandoned entry exactly as it was, down to when", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const watching = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      const given = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);

      await abandonTitle(userId, given.entryId, tx);
      const originally = await abandonedAtOf(tx, given.entryId);

      const outcome = await abandonTitles(userId, [watching.entryId, given.entryId], tx);

      // One of the two was written, and it is the one that was not already abandoned.
      expect(outcome.abandoned).toBe(1);
      expect(await stateOf(tx, watching.entryId)).toBe("abandoned");
      // Still abandoned, and abandoned *then* — a re-stamped `now()` would keep the state
      // right while quietly moving a date the reader's own press set.
      expect(await abandonedAtOf(tx, given.entryId)).toEqual(originally);
    }));

  it("never un-abandons: a set that is entirely abandoned already writes nothing", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const first = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      const second = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      await abandonTitle(userId, first.entryId, tx);
      await abandonTitle(userId, second.entryId, tx);
      const stamps = [
        await abandonedAtOf(tx, first.entryId),
        await abandonedAtOf(tx, second.entryId),
      ];

      const outcome = await abandonTitles(userId, [first.entryId, second.entryId], tx);

      expect(outcome.abandoned).toBe(0);
      expect(await stateOf(tx, first.entryId)).toBe("abandoned");
      expect(await stateOf(tx, second.entryId)).toBe("abandoned");
      expect([
        await abandonedAtOf(tx, first.entryId),
        await abandonedAtOf(tx, second.entryId),
      ]).toEqual(stamps);
    }));

  it("counts an entry named twice once", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);

      const outcome = await abandonTitles(userId, [entryId, entryId], tx);

      expect(outcome.abandoned).toBe(1);
      expect(await stateOf(tx, entryId)).toBe("abandoned");
    }));

  it("writes nothing and opens no transaction for an empty set", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");

      expect(await abandonTitles(userId, [], tx)).toEqual({ abandoned: 0 });
    }));

  it("abandons none of the set when one id does not exist", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const first = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      const second = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);

      await expect(
        abandonTitles(
          userId,
          [first.entryId, "00000000-0000-0000-0000-000000000000", second.entryId],
          tx,
        ),
      ).rejects.toThrow();

      // All-or-nothing, and it is what makes the toast's *nothing changed* true: the two
      // real entries are exactly as they were.
      expect(await abandonedAtOf(tx, first.entryId)).toBeNull();
      expect(await abandonedAtOf(tx, second.entryId)).toBeNull();
    }));

  it("abandons none of the set when one entry belongs to another account", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "adham");
      const stranger = await seedUser(tx, "someone-else");
      const mine = await seedShow(tx, owner, [{ seasonNo: 1, episodeNo: 1 }]);
      const theirs = await seedShow(tx, stranger, [{ seasonNo: 1, episodeNo: 1 }]);

      await expect(
        abandonTitles(owner, [mine.entryId, theirs.entryId], tx),
      ).rejects.toThrow();

      // Neither the entry that was never this account's, nor the one that was.
      expect(await abandonedAtOf(tx, theirs.entryId)).toBeNull();
      expect(await abandonedAtOf(tx, mine.entryId)).toBeNull();
    }));

  it("outranks the state the watches would give, over a whole set", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const finished = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }], {
        inProduction: false,
      });
      const untouched = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      await markWatched(
        tx,
        userId,
        finished.entryId,
        finished.titleId,
        finished.episodeIds["1-1"],
      );
      expect(await stateOf(tx, finished.entryId)).toBe("finished");
      expect(await stateOf(tx, untouched.entryId)).toBe("watchlist");

      await abandonTitles(userId, [finished.entryId, untouched.entryId], tx);

      // `library_entry_state` tests `abandoned_at` first, so both read the same way
      // afterwards however differently they read before — the surfaces that show state
      // need nothing told to them beyond the write itself.
      expect(await stateOf(tx, finished.entryId)).toBe("abandoned");
      expect(await stateOf(tx, untouched.entryId)).toBe("abandoned");
    }));
});
