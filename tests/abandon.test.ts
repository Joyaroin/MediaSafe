import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { abandonTitle, asUserId, unabandonTitle, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, libraryEntryState, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `abandonTitle` and `unabandonTitle`, against real Postgres — issue #87, `SPEC.md` §7's
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

  it("outranks the state the watches would give, and un-abandon returns to it — SPEC.md §7", () =>
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
