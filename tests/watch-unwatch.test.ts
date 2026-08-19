import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  asUserId,
  getTitleDetail,
  ownedBy,
  recordWatch,
  unwatch,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `unwatch`, against real Postgres — issue #89.
 *
 * ── Why this file exists rather than more of `watch-idempotency.test.ts` ─────────────
 *
 * That file proves a write cannot become two. This one proves a *delete* cannot become
 * the wrong one, and the two rules it guards are not the same rule:
 *
 *  1. **Exactly one watch goes.** Unwatching a rewatch leaves the earlier watch standing.
 *  2. **An imported watch never goes.** `source = 'tvtracker'` rows are not editable from
 *     the application, and there are 19,391 of them in the real database reconstructed
 *     from an archive that no longer has a live source (issue #89).
 *
 * The second is asserted **directly** — a `source = 'tvtracker'` row is seeded, unwatch is
 * called, and the row is read back — rather than inferred from the shape of the query.
 * A predicate that has been dropped from a `where` clause still reads like one in a diff;
 * only the row surviving proves it ran.
 *
 * ── No network ────────────────────────────────────────────────────────────────────────
 *
 * Ids in, rows out. Nothing here calls TMDB, exactly as `watch-idempotency.test.ts`.
 */

setUpTestDatabase("mediasafe_watch_unwatch_test");

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

async function seedShow(
  tx: Transaction,
  userId: UserId,
  episodes: readonly EpisodeSpec[],
  overrides: { readonly inProduction?: boolean } = {},
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

async function seedFilm(
  tx: Transaction,
  userId: UserId,
): Promise<{ entryId: string; titleId: string }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({ kind: "film", tmdbId: number, name: `Film ${number}`, runtimeMins: 100 })
    .returning({ id: title.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });
  return { entryId: entry.id, titleId: row.id };
}

/** What import writes — never through `recordWatch`, which only ever writes `'app'`. */
async function importedWatch(
  tx: Transaction,
  userId: UserId,
  entryId: string,
  titleId: string,
  episodeId: string | null,
  watchedAt: Date | null = null,
): Promise<string> {
  const [row] = await tx
    .insert(watch)
    .values({
      userId,
      libraryEntryId: entryId,
      titleId,
      episodeId,
      watchedAt,
      source: "tvtracker",
      sourceKey: `import-${nextNumber()}`,
    })
    .returning({ id: watch.id });
  return row.id;
}

/**
 * An application watch written at a stated instant.
 *
 * `recordWatch` cannot be used where the *order* of two app watches is the thing under
 * test: it writes `now()`, which inside one transaction is the transaction's own start
 * time, so two clicks seeded through it are indistinguishable by timestamp here in a way
 * they never are in production. Seeding the two instants by hand is what makes "the most
 * recent one" a question this harness can actually ask.
 */
async function appWatch(
  tx: Transaction,
  userId: UserId,
  entryId: string,
  titleId: string,
  episodeId: string | null,
  at: Date,
): Promise<string> {
  const [row] = await tx
    .insert(watch)
    .values({
      userId,
      libraryEntryId: entryId,
      titleId,
      episodeId,
      watchedAt: at,
      createdAt: at,
      source: "app",
      sourceKey: nextKey(),
    })
    .returning({ id: watch.id });
  return row.id;
}

async function watchesOnEpisode(tx: Transaction, userId: UserId, episodeId: string) {
  return tx
    .select()
    .from(watch)
    .where(and(ownedBy(userId, watch), eq(watch.episodeId, episodeId)));
}

async function watchExists(tx: Transaction, watchId: string): Promise<boolean> {
  const rows = await tx.select({ id: watch.id }).from(watch).where(eq(watch.id, watchId));
  return rows.length > 0;
}

const EARLIER = new Date("2026-01-01T20:00:00Z");
const LATER = new Date("2026-02-01T20:00:00Z");

describe("unwatch", () => {
  it("removes the one watch the application recorded", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      await recordWatch(userId, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      expect(outcome).toEqual({ removed: true, watched: false, unwatchable: false });
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(0);
    }));

  it("never removes an imported watch — the row is read back, not inferred", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      const imported = await importedWatch(tx, userId, entryId, titleId, episodeId);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      // 19,391 rows somebody reconstructed once from an archive with no live source
      // behind it. A v1 that lets a mis-tap delete one has become an editor of history
      // it did not write.
      expect(await watchExists(tx, imported)).toBe(true);
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(1);
      // Nothing was removed, and the episode is still watched — so the row must not go
      // back to reading unwatched either.
      expect(outcome).toEqual({ removed: false, watched: true, unwatchable: false });
    }));

  it("leaves an imported watch standing underneath the app watch it removes", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      const imported = await importedWatch(tx, userId, entryId, titleId, episodeId, LATER);
      const recorded = await appWatch(tx, userId, entryId, titleId, episodeId, EARLIER);

      // The imported watch is the *more recent* of the two, so a rule that only looked at
      // the timestamps would take it. Source is the filter, not recency.
      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      expect(outcome).toEqual({ removed: true, watched: true, unwatchable: false });
      expect(await watchExists(tx, recorded)).toBe(false);
      expect(await watchExists(tx, imported)).toBe(true);
    }));

  it("removes the most recent app watch and leaves the earlier one standing", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      const first = await appWatch(tx, userId, entryId, titleId, episodeId, EARLIER);
      const rewatch = await appWatch(tx, userId, entryId, titleId, episodeId, LATER);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      expect(outcome).toEqual({ removed: true, watched: true, unwatchable: true });
      expect(await watchExists(tx, rewatch)).toBe(false);
      expect(await watchExists(tx, first)).toBe(true);
    }));

  it("removes exactly one watch, never the pair", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      await appWatch(tx, userId, entryId, titleId, episodeId, EARLIER);
      await appWatch(tx, userId, entryId, titleId, episodeId, LATER);

      await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(1);
    }));

  it("touches no other episode of the same title", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
      ]);
      for (const key of ["1-1", "1-2"]) {
        await recordWatch(
          userId,
          { libraryEntryId: entryId, episodeId: episodeIds[key], sourceKey: nextKey() },
          tx,
        );
      }

      await unwatch(userId, { libraryEntryId: entryId, episodeId: episodeIds["1-2"] }, tx);

      expect(await watchesOnEpisode(tx, userId, episodeIds["1-1"])).toHaveLength(1);
      expect(await watchesOnEpisode(tx, userId, episodeIds["1-2"])).toHaveLength(0);
    }));

  it("removes nothing from an episode that was never watched", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);

      const outcome = await unwatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"] },
        tx,
      );

      expect(outcome).toEqual({ removed: false, watched: false, unwatchable: false });
    }));

  it("takes the state, progress and up next with it", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(
        tx,
        userId,
        [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
        { inProduction: false },
      );
      for (const key of ["1-1", "1-2"]) {
        await recordWatch(
          userId,
          { libraryEntryId: entryId, episodeId: episodeIds[key], sourceKey: nextKey() },
          tx,
        );
      }
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("finished");

      await unwatch(userId, { libraryEntryId: entryId, episodeId: episodeIds["1-2"] }, tx);

      const detail = await getTitleDetail(userId, entryId, tx);
      expect(detail.state).toBe("watching");
      const second = detail.episodes.find((one) => one.episodeNo === 2);
      expect(second?.watched).toBe(false);
      // Progress fell back to episode 1, so episode 2 is what is next again — read out of
      // the views, which is the only place any of this is defined.
      expect(second?.upNext).toBe(true);
    }));

  it("removes a film's watch, which carries no episode", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedFilm(tx, userId);
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: null, sourceKey: nextKey() },
        tx,
      );
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("finished");

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId: null }, tx);

      expect(outcome).toEqual({ removed: true, watched: false, unwatchable: false });
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("watchlist");
    }));

  it("leaves a film's imported watch alone", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId } = await seedFilm(tx, userId);
      const imported = await importedWatch(tx, userId, entryId, titleId, null);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId: null }, tx);

      expect(outcome).toEqual({ removed: false, watched: true, unwatchable: false });
      expect(await watchExists(tx, imported)).toBe(true);
    }));

  it("does not clear an abandonment, or set one", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );
      const abandonedAt = new Date("2026-03-01T20:00:00Z");
      await tx.update(libraryEntry).set({ abandonedAt }).where(eq(libraryEntry.id, entryId));

      await unwatch(userId, { libraryEntryId: entryId, episodeId: episodeIds["1-1"] }, tx);

      // Abandonment is the one hand-set state in the model (`CONTEXT.md`), and taking a
      // watch back is not a statement about it in either direction.
      const [row] = await tx
        .select({ abandonedAt: libraryEntry.abandonedAt })
        .from(libraryEntry)
        .where(eq(libraryEntry.id, entryId));
      expect(row.abandonedAt).toEqual(abandonedAt);
    }));

  it("refuses another account's library entry", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "owner");
      const stranger = await seedUser(tx, "stranger");
      const { entryId, episodeIds } = await seedShow(tx, owner, [{ seasonNo: 1, episodeNo: 1 }]);
      const episodeId = episodeIds["1-1"];
      await recordWatch(owner, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);

      await expect(
        unwatch(stranger, { libraryEntryId: entryId, episodeId }, tx),
      ).rejects.toThrow();

      expect(await watchesOnEpisode(tx, owner, episodeId)).toHaveLength(1);
    }));
});

describe("getTitleDetail's unwatchable", () => {
  it("offers no unwatch on an episode whose only watch is imported", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      await importedWatch(tx, userId, entryId, titleId, episodeIds["1-1"]);

      const [one] = (await getTitleDetail(userId, entryId, tx)).episodes;

      expect(one.watched).toBe(true);
      expect(one.unwatchable).toBe(false);
    }));

  it("offers unwatch on an episode the application recorded", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      const [one] = (await getTitleDetail(userId, entryId, tx)).episodes;

      expect(one.unwatchable).toBe(true);
    }));

  it("offers unwatch where an app watch sits on top of an imported one", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      await importedWatch(tx, userId, entryId, titleId, episodeIds["1-1"]);
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      const [one] = (await getTitleDetail(userId, entryId, tx)).episodes;

      expect(one.unwatchable).toBe(true);
    }));

  it("offers no unwatch on an unwatched episode", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);

      const [one] = (await getTitleDetail(userId, entryId, tx)).episodes;

      expect(one.watched).toBe(false);
      expect(one.unwatchable).toBe(false);
    }));
});
