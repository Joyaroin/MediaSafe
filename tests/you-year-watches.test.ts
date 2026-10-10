import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { asUserId, listWatchesSince, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `listWatchesSince` against a real Postgres, and the year section over it — issue #372.
 */

const { session } = vi.hoisted(() => ({ session: { requireTimezone: vi.fn() } }));
vi.mock("@/lib/session", () => session);

setUpTestDatabase("mediasafe_you_year_watches_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test`, timezone: "UTC" });
  return asUserId(id);
}

async function seedShow(tx: Transaction, userId: UserId, name: string) {
  const [titleRow] = await tx
    .insert(title)
    .values({ kind: "show", tmdbId: nextNumber(), name, releaseYear: 2020 })
    .returning({ id: title.id });
  const [episodeRow] = await tx
    .insert(episode)
    .values({
      titleId: titleRow.id,
      tmdbEpisodeId: nextNumber(),
      seasonNo: 1,
      episodeNo: 1,
      name: "Pilot",
      airDate: "2020-01-01",
    })
    .returning({ id: episode.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: titleRow.id })
    .returning({ id: libraryEntry.id });
  return { titleId: titleRow.id, entryId: entry.id, episodeId: episodeRow.id };
}

async function seedWatch(
  tx: Transaction,
  userId: UserId,
  show: { titleId: string; entryId: string; episodeId: string },
  watchedAt: Date | null,
) {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: show.entryId,
    titleId: show.titleId,
    episodeId: show.episodeId,
    watchedAt,
    source: "app",
    sourceKey: `year-${nextNumber()}`,
  });
}

const since = new Date("2025-10-01T00:00:00Z");

describe("listWatchesSince", () => {
  it("returns the dated watches at or after the bound, oldest first, with what they were", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const show = await seedShow(tx, me, "A Show");
      await seedWatch(tx, me, show, new Date("2026-05-01T20:00:00Z"));
      await seedWatch(tx, me, show, new Date("2025-11-01T20:00:00Z"));
      await seedWatch(tx, me, show, new Date("2025-09-30T23:59:00Z")); // before the bound
      await seedWatch(tx, me, show, null); // undated

      const rows = await listWatchesSince(me, since, tx);

      expect(rows.map((row) => row.watchedAt.toISOString())).toEqual([
        "2025-11-01T20:00:00.000Z",
        "2026-05-01T20:00:00.000Z",
      ]);
      expect(rows[0]).toMatchObject({
        libraryEntryId: show.entryId,
        titleName: "A Show",
        seasonNo: 1,
        episodeNo: 1,
        episodeName: "Pilot",
      });
    }));

  it("returns this account's watches and never another account's", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const you = await seedUser(tx, "you");
      await seedWatch(tx, me, await seedShow(tx, me, "Mine"), new Date("2026-01-01T12:00:00Z"));
      await seedWatch(tx, you, await seedShow(tx, you, "Yours"), new Date("2026-01-01T12:00:00Z"));

      expect((await listWatchesSince(me, since, tx)).map((row) => row.titleName)).toEqual(["Mine"]);
    }));

  it("throws on a failed read rather than answering with an empty year", async () => {
    await expect(
      inTransaction(async (tx) => {
        const me = await seedUser(tx, "me");
        await tx.execute(sql`alter table watch rename to watch_unreachable`);
        return listWatchesSince(me, since, tx);
      }),
    ).rejects.toThrow();
  });
});

describe("the year section over a failed read", () => {
  it("lets the rejection through to the read-failure boundary", async () => {
    // No harness executor here: the section reads through the application pool, which the
    // test environment refuses — a rejection, which is exactly the case under test.
    session.requireTimezone.mockResolvedValueOnce("UTC");
    const { YearOfWatching } = await import("@/app/(signed-in)/you/year-of-watching");

    await expect(YearOfWatching({ userId: asUserId("user_mine") })).rejects.toThrow();
  });
});
