import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { asUserId, getTitleDetail, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The one read behind title detail (issue #58) — the programme note on desktop, and the
 * phone route.
 *
 * `tests/library-grid.test.ts` covers the grid's read; this covers the one that has to
 * answer three questions the grid's row never asks: which episodes exist, which of
 * *this account's* watches lands on each of them, and which one is next. All three are
 * ways of getting the mirrored half of the page wrong that a render would not catch —
 * the render only ever sees what the query already decided.
 */

setUpTestDatabase("mediasafe_title_detail_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  seasonNo: number;
  episodeNo: number;
  name?: string | null;
}

async function seedShow(
  tx: Transaction,
  userId: UserId,
  episodes: EpisodeSpec[] = [],
  /**
   * `episodesMirroredAt: null` is a show whose episodes have not arrived — issue #272's
   * pending case. Left out, the column's own `DEFAULT now()` stamps the row, so every
   * other case in this file seeds a complete show without saying so.
   */
  spec: { episodesMirroredAt?: Date | null } = {},
): Promise<{ entryId: string; episodeIds: Record<string, string> }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: `Show ${number}`,
      releaseYear: 2022,
      inProduction: true,
      episodesMirroredAt: spec.episodesMirroredAt,
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
        name: "name" in one ? one.name : `Episode ${one.seasonNo}-${one.episodeNo}`,
        airDate: RELEASED,
      })
      .returning({ id: episode.id });
    episodeIds[`${one.seasonNo}-${one.episodeNo}`] = inserted.id;
  }

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });

  return { entryId: entry.id, episodeIds };
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
    sourceKey: `test-${nextNumber()}`,
  });
}

async function entryTitleId(tx: Transaction, entryId: string): Promise<string> {
  const [row] = await tx
    .select({ titleId: libraryEntry.titleId })
    .from(libraryEntry)
    .where(eq(libraryEntry.id, entryId));
  return row.titleId;
}

describe("getTitleDetail", () => {
  it("returns a show's mirrored fields, episodes in season/episode order, and its state", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 2, name: "The Kingsroad" },
        { seasonNo: 1, episodeNo: 1, name: "Winter Is Coming" },
      ]);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.kind).toBe("show");
      expect(detail.state).toBe("watchlist");
      expect(detail.episodes.map((one) => one.name)).toEqual([
        "Winter Is Coming",
        "The Kingsroad",
      ]);
    }));

  it("never falls back to a bare number for an episode TMDB has not named", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1, name: null },
      ]);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodes[0].name).toBeNull();
    }));

  it("says a show with nothing mirrored has no episode data, rather than an empty season", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedShow(tx, userId, []);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodes).toEqual([]);
    }));

  it("marks exactly the episode a watch lands on as watched, and no other", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
      ]);
      const titleId = await entryTitleId(tx, entryId);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodes.find((one) => one.episodeNo === 1)?.watched).toBe(true);
      expect(detail.episodes.find((one) => one.episodeNo === 2)?.watched).toBe(false);
    }));

  it("does not duplicate an episode a rewatch has two watches on", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const titleId = await entryTitleId(tx, entryId);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodes).toHaveLength(1);
      expect(detail.episodes[0].watched).toBe(true);
    }));

  it("marks the episode after progress as up next, and nothing else", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
        { seasonNo: 1, episodeNo: 3 },
      ]);
      const titleId = await entryTitleId(tx, entryId);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodes.find((one) => one.episodeNo === 2)?.upNext).toBe(true);
      expect(detail.episodes.find((one) => one.episodeNo === 1)?.upNext).toBe(false);
      expect(detail.episodes.find((one) => one.episodeNo === 3)?.upNext).toBe(false);
    }));

  it("has no up-next episode once every mirrored episode is watched", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const titleId = await entryTitleId(tx, entryId);
      await markWatched(tx, userId, entryId, titleId, episodeIds["1-1"]);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodes.every((one) => !one.upNext)).toBe(true);
    }));

  it("returns a film with no episodes at all", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const number = nextNumber();
      const [row] = await tx
        .insert(title)
        .values({ kind: "film", tmdbId: number, name: `Film ${number}`, runtimeMins: 121 })
        .returning({ id: title.id });
      const [entry] = await tx
        .insert(libraryEntry)
        .values({ userId, titleId: row.id })
        .returning({ id: libraryEntry.id });

      const detail = await getTitleDetail(userId, entry.id, tx);

      expect(detail.kind).toBe("film");
      expect(detail.runtimeMins).toBe(121);
      expect(detail.episodes).toEqual([]);
    }));

  it("reads as abandoned once given up on", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedShow(tx, userId, []);
      await tx
        .update(libraryEntry)
        .set({ abandonedAt: new Date() })
        .where(eq(libraryEntry.id, entryId));

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.state).toBe("abandoned");
    }));

  /**
   * Pending on the title's own page — issue #272.
   *
   * The page has drawn one sentence for two states since #58: *No episode data yet*, for a
   * show whose episodes had not mirrored **and** for a show TMDB genuinely lists none for.
   * The column that tells them apart exists now (#271), so the row carries the answer and
   * the surface stops guessing. **The failure is silent in the worst direction**: a reader
   * whose mirror is still running is told their show has no episodes, which is the same lie
   * `AGENTS.md` opens on wearing a third hat.
   */
  it("reads a show whose episodes have not mirrored as pending", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedShow(tx, userId, [], { episodesMirroredAt: null });

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodesPending).toBe(true);
      // And the season list is genuinely empty, not filled with anything invented to stand
      // in for what has not arrived.
      expect(detail.episodes).toEqual([]);
    }));

  it("reads a show TMDB lists no episodes for as empty rather than pending", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedShow(tx, userId, []);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodesPending).toBe(false);
      expect(detail.episodes).toEqual([]);
    }));

  it("reads a show whose episodes have landed as not pending", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);

      const detail = await getTitleDetail(userId, entryId, tx);

      expect(detail.episodesPending).toBe(false);
    }));

  it("never reads a film as pending, whatever its stamp says", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const [row] = await tx
        .insert(title)
        .values({
          kind: "film",
          tmdbId: nextNumber(),
          name: "Unstamped film",
          releaseYear: 2019,
          runtimeMins: 121,
          episodesMirroredAt: null,
        })
        .returning({ id: title.id });
      const [entry] = await tx
        .insert(libraryEntry)
        .values({ userId, titleId: row.id })
        .returning({ id: libraryEntry.id });

      const detail = await getTitleDetail(userId, entry.id, tx);

      // A film has nothing to wait for, so there is no region on its page for a pending
      // line to stand in — and it must never be told there is one.
      expect(detail.episodesPending).toBe(false);
    }));

  it("refuses another account's library entry — a missing row and someone else's row are the same case", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "owner");
      const stranger = await seedUser(tx, "stranger");
      const { entryId } = await seedShow(tx, owner, []);

      await expect(getTitleDetail(stranger, entryId, tx)).rejects.toThrow();
    }));

  it("throws on a library entry id that does not exist", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");

      await expect(
        getTitleDetail(userId, "00000000-0000-0000-0000-000000000000", tx),
      ).rejects.toThrow();
    }));
});
