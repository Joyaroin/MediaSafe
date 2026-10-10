import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { asUserId, listRecentWatches, RECENT_WATCHES, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `listRecentWatches` against a real Postgres — issue #371. Every test runs in a
 * transaction the harness rolls back.
 */

setUpTestDatabase("mediasafe_you_recent_watches_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test`, timezone: "UTC" });
  return asUserId(id);
}

/** A show with `episodes` episodes, or a film when `episodes` is 0, in `userId`'s library. */
async function seedEntry(tx: Transaction, userId: UserId, name: string, episodes = 0) {
  const tmdbId = nextNumber();
  const [titleRow] = await tx
    .insert(title)
    .values({ kind: episodes === 0 ? "film" : "show", tmdbId, name, releaseYear: 2020 })
    .returning({ id: title.id });

  const episodeIds: string[] = [];
  for (let index = 1; index <= episodes; index += 1) {
    const [row] = await tx
      .insert(episode)
      .values({
        titleId: titleRow.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: 1,
        episodeNo: index,
        name: index === 1 ? "Pilot" : null,
        airDate: "2020-01-01",
      })
      .returning({ id: episode.id });
    episodeIds.push(row.id);
  }

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: titleRow.id })
    .returning({ id: libraryEntry.id });

  return { titleId: titleRow.id, entryId: entry.id, episodeIds };
}

async function seedWatch(
  tx: Transaction,
  userId: UserId,
  seeded: { titleId: string; entryId: string },
  watchedAt: Date | null,
  episodeId: string | null = null,
) {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: seeded.entryId,
    titleId: seeded.titleId,
    episodeId,
    watchedAt,
    source: "app",
    sourceKey: `recent-${nextNumber()}`,
  });
}

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 20, 0, 0));

describe("listRecentWatches", () => {
  it("returns the newest dated watches first, a film's and an episode's", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const show = await seedEntry(tx, me, "A Show", 2);
      const film = await seedEntry(tx, me, "A Film");
      await seedWatch(tx, me, show, day(1), show.episodeIds[0]);
      await seedWatch(tx, me, film, day(3));
      await seedWatch(tx, me, show, day(2), show.episodeIds[1]);

      const rows = await listRecentWatches(me, tx);

      expect(rows.map((row) => row.watchedAt.toISOString())).toEqual([
        day(3).toISOString(),
        day(2).toISOString(),
        day(1).toISOString(),
      ]);
      expect(rows[0]).toMatchObject({
        titleName: "A Film",
        libraryEntryId: film.entryId,
        seasonNo: null,
        episodeNo: null,
        episodeName: null,
      });
      expect(rows[1]).toMatchObject({ titleName: "A Show", seasonNo: 1, episodeNo: 2, episodeName: null });
      expect(rows[2]).toMatchObject({ seasonNo: 1, episodeNo: 1, episodeName: "Pilot" });
    }));

  it("stops at ten", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const film = await seedEntry(tx, me, "Rewatched");
      for (let n = 1; n <= RECENT_WATCHES + 3; n += 1) await seedWatch(tx, me, film, day(n));

      const rows = await listRecentWatches(me, tx);

      expect(rows).toHaveLength(RECENT_WATCHES);
      expect(rows[0].watchedAt.toISOString()).toBe(day(RECENT_WATCHES + 3).toISOString());
    }));

  it("leaves out a watch with no date", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const film = await seedEntry(tx, me, "Imported");
      await seedWatch(tx, me, film, null);

      expect(await listRecentWatches(me, tx)).toEqual([]);
    }));

  it("returns this account's watches and never another account's", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const you = await seedUser(tx, "you");
      const mine = await seedEntry(tx, me, "Mine");
      const yours = await seedEntry(tx, you, "Yours");
      await seedWatch(tx, me, mine, day(1));
      await seedWatch(tx, you, yours, day(2));

      expect((await listRecentWatches(me, tx)).map((row) => row.titleName)).toEqual(["Mine"]);
      expect((await listRecentWatches(you, tx)).map((row) => row.titleName)).toEqual(["Yours"]);
    }));

  it("throws on a failed read rather than answering with no watches", async () => {
    await expect(
      inTransaction(async (tx) => {
        const me = await seedUser(tx, "me");
        await tx.execute(sql`alter table watch rename to watch_unreachable`);
        return listRecentWatches(me, tx);
      }),
    ).rejects.toThrow();
  });
});
