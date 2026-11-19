import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  asUserId,
  listNotStartedShows,
  UP_NEXT_QUEUE_DEPTH,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Tonight's Not started group — the read behind it (issue #540). No UI is involved: the
 * rows are inserted through the harness's transaction and the read is called directly.
 *
 * `library_entry_up_next` has no row for an entry with no watches, so this read has its own
 * starting point (the first episode) and these cases are what hold its membership, its
 * first-episode rule, its queue and its order.
 */

setUpTestDatabase("mediasafe_not_started_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);
const UNRELEASED = daysFromToday(30);

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction): Promise<UserId> {
  const id = `reader-${nextNumber()}`;
  await tx.insert(user).values({ id, name: id, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  seasonNo: number;
  episodeNo: number;
  airDate?: string | null;
}

interface TitleSpec {
  name: string;
  kind?: "show" | "film";
  episodes?: EpisodeSpec[];
  abandonedAt?: Date;
  addedAt?: Date;
  /** The library entry's id, to pin the last tie-break. */
  entryId?: string;
}

interface Seeded {
  entryId: string;
  episodeIds: string[];
}

/** Episode 1 of season 1, released, unless the case says otherwise. */
const SEASON_ONE: EpisodeSpec[] = [
  { seasonNo: 1, episodeNo: 1 },
  { seasonNo: 1, episodeNo: 2 },
  { seasonNo: 1, episodeNo: 3 },
];

async function seed(tx: Transaction, userId: UserId, spec: TitleSpec): Promise<Seeded> {
  const number = nextNumber();
  const kind = spec.kind ?? "show";
  const [row] = await tx
    .insert(title)
    .values({ kind, tmdbId: number, name: spec.name, releaseYear: 2022 })
    .returning({ id: title.id });

  const episodeIds: string[] = [];
  for (const one of spec.episodes ?? (kind === "show" ? SEASON_ONE : [])) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: one.seasonNo,
        episodeNo: one.episodeNo,
        name: `Episode ${one.seasonNo}-${one.episodeNo}`,
        airDate: one.airDate === undefined ? RELEASED : one.airDate,
      })
      .returning({ id: episode.id });
    episodeIds.push(inserted.id);
  }

  const [entry] = await tx
    .insert(libraryEntry)
    .values({
      ...(spec.entryId ? { id: spec.entryId } : {}),
      userId,
      titleId: row.id,
      abandonedAt: spec.abandonedAt,
      addedAt: spec.addedAt,
    })
    .returning({ id: libraryEntry.id });

  return { entryId: entry.id, episodeIds };
}

async function markWatched(
  tx: Transaction,
  userId: UserId,
  titleId: string,
  seeded: Seeded,
  index: number,
): Promise<void> {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: seeded.entryId,
    titleId,
    episodeId: seeded.episodeIds[index],
    watchedAt: new Date(),
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });
}

async function titleIdOf(tx: Transaction, entryId: string): Promise<string> {
  const [row] = await tx
    .select({ titleId: libraryEntry.titleId })
    .from(libraryEntry)
    .where(eq(libraryEntry.id, entryId));
  return row.titleId;
}

async function names(tx: Transaction, userId: UserId, limit = 10): Promise<string[]> {
  return (await listNotStartedShows(userId, limit, tx)).map((entry) => entry.titleName);
}

describe("listNotStartedShows — membership", () => {
  it("returns a watchlist show whose first episode has aired", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const aired = await seed(tx, reader, { name: "Aired" });

      const [entry] = await listNotStartedShows(reader, 10, tx);

      expect(entry.libraryEntryId).toBe(aired.entryId);
      expect(entry.titleName).toBe("Aired");
      expect(entry.episodeId).toBe(aired.episodeIds[0]);
    });
  });

  it("leaves out a show whose first episode has not aired, or has no air date", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, {
        name: "Unaired",
        episodes: [{ seasonNo: 1, episodeNo: 1, airDate: UNRELEASED }],
      });
      await seed(tx, reader, {
        name: "Undated",
        episodes: [{ seasonNo: 1, episodeNo: 1, airDate: null }],
      });
      await seed(tx, reader, { name: "Aired" });

      expect(await names(tx, reader)).toEqual(["Aired"]);
    });
  });

  it("leaves out a show with any watch", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const started = await seed(tx, reader, { name: "Started" });
      await markWatched(tx, reader, await titleIdOf(tx, started.entryId), started, 1);
      await seed(tx, reader, { name: "Untouched" });

      expect(await names(tx, reader)).toEqual(["Untouched"]);
    });
  });

  it("leaves out an abandoned show with no watches", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, { name: "Dropped", abandonedAt: new Date() });
      await seed(tx, reader, { name: "Kept" });

      expect(await names(tx, reader)).toEqual(["Kept"]);
    });
  });

  it("leaves out a film", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, { name: "A film", kind: "film" });
      await seed(tx, reader, { name: "A show" });

      expect(await names(tx, reader)).toEqual(["A show"]);
    });
  });

  it("leaves out another reader's shows", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const other = await seedUser(tx);
      await seed(tx, other, { name: "Theirs" });

      expect(await names(tx, reader)).toEqual([]);
    });
  });
});

describe("listNotStartedShows — the first episode", () => {
  it("is S1 E1 for a show with specials, and its queue starts there", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const show = await seed(tx, reader, {
        name: "With specials",
        episodes: [
          { seasonNo: 0, episodeNo: 1 },
          { seasonNo: 0, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
          { seasonNo: 2, episodeNo: 1 },
        ],
      });

      const [entry] = await listNotStartedShows(reader, 10, tx);

      expect(entry.episodeId).toBe(show.episodeIds[2]);
      expect([entry.seasonNo, entry.episodeNo]).toEqual([1, 1]);
      expect(entry.seasonWatched).toBe(0);
      expect(entry.seasonReleased).toBe(3);
      expect(entry.queue.episodes.map((one) => [one.seasonNo, one.episodeNo])).toEqual([
        [1, 1],
        [1, 2],
        [1, 3],
        [2, 1],
      ]);
      expect(entry.queue.more).toBe(false);
    });
  });

  it("is episode 1 of the lowest season above 0, not season 1 by name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const show = await seed(tx, reader, {
        name: "Starts at two",
        episodes: [
          { seasonNo: 2, episodeNo: 1 },
          { seasonNo: 2, episodeNo: 2 },
          { seasonNo: 3, episodeNo: 1 },
        ],
      });

      const [entry] = await listNotStartedShows(reader, 10, tx);

      expect(entry.episodeId).toBe(show.episodeIds[0]);
      expect([entry.seasonNo, entry.episodeNo]).toEqual([2, 1]);
    });
  });

  it("stops the queue at the first unaired episode and counts only aired ones in the season", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, {
        name: "Airing",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3, airDate: UNRELEASED },
          { seasonNo: 1, episodeNo: 4 },
        ],
      });

      const [entry] = await listNotStartedShows(reader, 10, tx);

      expect(entry.queue.episodes.map((one) => one.episodeNo)).toEqual([1, 2]);
      expect(entry.queue.more).toBe(false);
      expect(entry.seasonReleased).toBe(3);
    });
  });

  it("caps the queue at the same depth as other entries and sets `more`", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const episodes = Array.from({ length: UP_NEXT_QUEUE_DEPTH + 3 }, (_, index) => ({
        seasonNo: 1,
        episodeNo: index + 1,
      }));
      await seed(tx, reader, { name: "Long", episodes });

      const [entry] = await listNotStartedShows(reader, 10, tx);

      expect(entry.queue.episodes).toHaveLength(UP_NEXT_QUEUE_DEPTH);
      expect(entry.queue.more).toBe(true);
    });
  });
});

describe("listNotStartedShows — limit and order", () => {
  it("returns the newest added first, then by lower-cased name, then by entry id", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const older = new Date("2026-01-01T00:00:00Z");
      const newer = new Date("2026-02-01T00:00:00Z");

      await seed(tx, reader, { name: "Oldest", addedAt: older });
      await seed(tx, reader, { name: "zulu", addedAt: newer });
      await seed(tx, reader, { name: "Alpha", addedAt: newer });
      await seed(tx, reader, { name: "mike", addedAt: newer });

      expect(await names(tx, reader)).toEqual(["Alpha", "mike", "zulu", "Oldest"]);
    });
  });

  it("breaks a tie on added_at and name by entry id", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const same = new Date("2026-03-01T00:00:00Z");
      // Entry ids are known and the greater one is inserted first, so neither insertion order
      // nor a lucky random pair can produce the expected order without the id tie-break.
      const lowId = "00000000-0000-4000-8000-000000000000";
      const highId = "ffffffff-0000-4000-8000-000000000000";
      const high = await seed(tx, reader, { name: "Twin", addedAt: same, entryId: highId });
      const low = await seed(tx, reader, { name: "Twin", addedAt: same, entryId: lowId });
      expect([high.entryId, low.entryId]).toEqual([highId, lowId]);

      const returned = (await listNotStartedShows(reader, 10, tx)).map(
        (entry) => entry.libraryEntryId,
      );

      expect(returned).toEqual([lowId, highId]);
    });
  });

  it("returns at most `limit`, taking the first by that order — three with one added_at", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const same = new Date("2026-03-01T00:00:00Z");
      await seed(tx, reader, { name: "Charlie", addedAt: same });
      await seed(tx, reader, { name: "Alpha", addedAt: same });
      await seed(tx, reader, { name: "Bravo", addedAt: same });
      await seed(tx, reader, { name: "Older", addedAt: new Date("2025-01-01T00:00:00Z") });

      expect(await names(tx, reader, 3)).toEqual(["Alpha", "Bravo", "Charlie"]);
      expect(await names(tx, reader, 2)).toEqual(["Alpha", "Bravo"]);
      expect(await names(tx, reader, 10)).toEqual(["Alpha", "Bravo", "Charlie", "Older"]);
    });
  });

  it("returns every entry its own queue, not a neighbour's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, {
        name: "Two episodes",
        addedAt: new Date("2026-02-01T00:00:00Z"),
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await seed(tx, reader, {
        name: "Three episodes",
        addedAt: new Date("2026-01-01T00:00:00Z"),
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });

      const entries = await listNotStartedShows(reader, 10, tx);

      expect(entries.map((entry) => [entry.titleName, entry.queue.episodes.length])).toEqual([
        ["Two episodes", 2],
        ["Three episodes", 3],
      ]);
    });
  });

  it("returns nothing for a limit of zero", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, { name: "Anything" });

      expect(await names(tx, reader, 0)).toEqual([]);
    });
  });
});
