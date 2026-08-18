import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { asUserId, getTitleDetail, ownedBy, recordWatch, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `recordWatch`, against real Postgres — issue #85, `SPEC.md` §6's test 3.
 *
 * ── Why this is the one test step 4 earns ────────────────────────────────────────────
 *
 * Every other step fails loudly and immediately to the one person using it. This does
 * not: a wrong idempotency rule does not crash, it adds a row that looks exactly like
 * history, and 1,156 real rewatches already in the database (issue #84) mean an inflated
 * one is invisible on every screen. `UNIQUE (user_id, source, source_key)` carries the
 * guarantee; the assertions below spend their weight proving the write actually leans on
 * it, and on the one thing the constraint cannot cover by itself — `abandoned_at`.
 *
 * ── No network ────────────────────────────────────────────────────────────────────────
 *
 * `recordWatch` takes ids the caller already resolved — a library entry and, for a show,
 * an episode. Nothing here calls TMDB, so this runs with the network unplugged, exactly
 * like `tests/import-chunk.test.ts`. `setUpTestDatabase` and `inTransaction` from issue
 * #40's harness, and nothing else — the harness's own comment names this file.
 */

setUpTestDatabase("mediasafe_watch_idempotency_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);

let counter = 0;
const nextNumber = () => ++counter;
/** A fresh `source_key` — one per click, exactly as the browser mints one per tap. */
const nextKey = () => `click-${nextNumber()}`;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  readonly seasonNo: number;
  readonly episodeNo: number;
}

interface ShowOverrides {
  readonly inProduction?: boolean;
  readonly abandoned?: boolean;
}

async function seedShow(
  tx: Transaction,
  userId: UserId,
  episodes: readonly EpisodeSpec[],
  overrides: ShowOverrides = {},
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
    .values({
      userId,
      titleId: row.id,
      abandonedAt: overrides.abandoned === true ? new Date() : null,
    })
    .returning({ id: libraryEntry.id });

  return { entryId: entry.id, titleId: row.id, episodeIds };
}

async function seedFilm(tx: Transaction, userId: UserId): Promise<{ entryId: string }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({ kind: "film", tmdbId: number, name: `Film ${number}`, runtimeMins: 100 })
    .returning({ id: title.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });
  return { entryId: entry.id };
}

/**
 * What import writes, directly against the table — never through `recordWatch`, which is
 * the application path and the one path that clears `abandoned_at`. `watchedAt: null` is
 * the undated case `SPEC.md` §7 says 19,391 of these are not, and 18 of them still are.
 */
async function importedWatch(
  tx: Transaction,
  userId: UserId,
  entryId: string,
  titleId: string,
  episodeId: string,
  watchedAt: Date | null,
): Promise<void> {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: entryId,
    titleId,
    episodeId,
    watchedAt,
    source: "tvtracker",
    sourceKey: `import-${nextNumber()}`,
  });
}

async function watchesOnEpisode(tx: Transaction, userId: UserId, episodeId: string) {
  return tx
    .select()
    .from(watch)
    .where(and(ownedBy(userId, watch), eq(watch.episodeId, episodeId)));
}

async function abandonedAtOf(tx: Transaction, entryId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ abandonedAt: libraryEntry.abandonedAt })
    .from(libraryEntry)
    .where(eq(libraryEntry.id, entryId));
  return row.abandonedAt;
}

describe("recordWatch", () => {
  it("is a no-op on a retry — the same key twice is one row", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      const key = nextKey();

      const first = await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId, sourceKey: key },
        tx,
      );
      const retried = await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId, sourceKey: key },
        tx,
      );

      expect(first.recorded).toBe(true);
      expect(retried.recorded).toBe(false);
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(1);
    }));

  it("writes a genuine rewatch as a second row — a different key against the same episode", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];

      await recordWatch(userId, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);
      const rewatch = await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId, sourceKey: nextKey() },
        tx,
      );

      expect(rewatch.recorded).toBe(true);
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(2);
    }));

  it("does not move progress backwards on a rewatch of an earlier episode, and up next holds", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
        { seasonNo: 1, episodeNo: 3 },
      ]);
      for (const key of ["1-1", "1-2", "1-3"]) {
        await recordWatch(
          userId,
          { libraryEntryId: entryId, episodeId: episodeIds[key], sourceKey: nextKey() },
          tx,
        );
      }

      // The rewatch: a new key against the episode furthest behind progress.
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      expect(await watchesOnEpisode(tx, userId, episodeIds["1-1"])).toHaveLength(2);
      const detail = await getTitleDetail(userId, entryId, tx);
      // Every released episode already had a watch; a rewatch of episode 1 changes none
      // of that, so nothing is up next either — the property this test exists to prove.
      expect(detail.episodes.every((one) => !one.upNext)).toBe(true);
    }));

  it("clears abandoned_at in the same transaction as the insert", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(
        tx,
        userId,
        [{ seasonNo: 1, episodeNo: 1 }],
        { abandoned: true },
      );
      expect(await abandonedAtOf(tx, entryId)).not.toBeNull();

      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      expect(await abandonedAtOf(tx, entryId)).toBeNull();
    }));

  it("stays abandoned when import adds a watch to it — only the application write clears it", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(
        tx,
        userId,
        [{ seasonNo: 1, episodeNo: 1 }],
        { abandoned: true },
      );

      await importedWatch(tx, userId, entryId, titleId, episodeIds["1-1"], null);

      // The whole reason #85 is its own ticket, restated at the write it protects:
      // a watch existing is not what clears abandonment, the application writing one is.
      expect(await abandonedAtOf(tx, entryId)).not.toBeNull();
    }));

  it("moves a title from watchlist to watching on a first watch", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
      ]);
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("watchlist");

      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("watching");
    }));

  it("takes a show in production to caught up on its last released episode", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(
        tx,
        userId,
        [{ seasonNo: 1, episodeNo: 1 }],
        { inProduction: true },
      );

      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("caught_up");
    }));

  it("takes a show that has ended to finished on its last episode", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(
        tx,
        userId,
        [{ seasonNo: 1, episodeNo: 1 }],
        { inProduction: false },
      );

      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("finished");
    }));

  it("never lets a special change a state — unwatched season 0 still reaches finished", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(
        tx,
        userId,
        [
          { seasonNo: 0, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 1 },
        ],
        { inProduction: false },
      );

      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      const detail = await getTitleDetail(userId, entryId, tx);
      expect(detail.state).toBe("finished");
      expect(detail.episodes.find((one) => one.seasonNo === 0)?.watched).toBe(false);

      // Marking the special itself is recordable and still changes nothing about it.
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["0-1"], sourceKey: nextKey() },
        tx,
      );
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("finished");
    }));

  it("takes a film to finished with a watch that carries a null episode", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedFilm(tx, userId);

      const outcome = await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: null, sourceKey: nextKey() },
        tx,
      );

      expect(outcome.recorded).toBe(true);
      const rows = await tx
        .select()
        .from(watch)
        .where(and(ownedBy(userId, watch), eq(watch.libraryEntryId, entryId)));
      expect(rows).toHaveLength(1);
      expect(rows[0].episodeId).toBeNull();
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("finished");
    }));

  it("counts an undated imported watch and a dated app watch towards progress alike", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
      ]);

      // The undated half: what import writes. 18 of 19,558 real watches are exactly this.
      await importedWatch(tx, userId, entryId, titleId, episodeIds["1-1"], null);
      const afterImport = await getTitleDetail(userId, entryId, tx);
      expect(afterImport.episodes.find((one) => one.episodeNo === 1)?.watched).toBe(true);
      expect(afterImport.episodes.find((one) => one.episodeNo === 2)?.upNext).toBe(true);

      // The dated half: this ticket's own write.
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-2"], sourceKey: nextKey() },
        tx,
      );
      const afterAppWatch = await getTitleDetail(userId, entryId, tx);
      expect(afterAppWatch.episodes.every((one) => !one.upNext)).toBe(true);
      expect(afterAppWatch.state).toBe("caught_up");
    }));

  it("refuses another account's library entry", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "owner");
      const stranger = await seedUser(tx, "stranger");
      const { entryId, episodeIds } = await seedShow(tx, owner, [
        { seasonNo: 1, episodeNo: 1 },
      ]);

      await expect(
        recordWatch(
          stranger,
          { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
          tx,
        ),
      ).rejects.toThrow();

      expect(await watchesOnEpisode(tx, owner, episodeIds["1-1"])).toHaveLength(0);
    }));
});
