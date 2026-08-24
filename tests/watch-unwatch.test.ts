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
 * `unwatch`, against real Postgres — issue #89, with its central rule inverted by #145.
 *
 * ── The assertion that turned over ───────────────────────────────────────────────────
 *
 * #89 removed **only watches this application recorded**, and this file proved it the one
 * way worth proving: a `source = 'tvtracker'` row was seeded, unwatch was called, and the
 * row was read back **still standing**. That is the assertion #145 inverts. The same row
 * is seeded by the same helper, and it must now be **gone**.
 *
 * The reason is not that the old rule was badly built — it is that it was built on a
 * false premise. All 19,558 of the watches in the real library are imported (`SPEC.md`
 * §7; 19,391 is the *dated* subset that #89 quoted as the total), so a control that
 * refuses them renders on essentially nothing its only reader owns, and *unwatch* meant
 * *unwatch unless I happened to import it*. It now means unwatched.
 *
 * It is still asserted **directly** rather than inferred from the shape of the query.
 * A predicate dropped from a `where` clause still reads like one in a diff; only the row
 * being gone proves that it went.
 *
 * ── What is left to get wrong, and why those assertions grew ─────────────────────────
 *
 * `source` was never doing the isolation work. `ownedBy(userId, watch)`, the library
 * entry and the episode are what keep one press off everything else — and they now carry
 * it with nothing behind them, so the questions this file asks about isolation went from
 * two to four. #89 already asked *not another episode of this title* and *not another
 * account's library entry*; #145 adds **not another title of mine**, and **not another
 * account's watch of the very same episode**. That last one is the case worth having:
 * `episode` is global (ADR-0001), so two accounts hold watches against one episode id,
 * and a missing owner predicate would delete somebody else's history with nothing on this
 * screen or in the other three tests to notice.
 *
 * ── Nothing here is about which watch goes ───────────────────────────────────────────
 *
 * #89 needed a `source = 'app'` watch seeded at a stated instant, because *the most
 * recent one this account recorded* was a choice a query had to make and a test had to
 * pin. There is no choice left: every watch of the episode goes, so ordering is not a
 * property this file has an opinion about and there is no hand-seeded app watch here any
 * more. A rewatch is seeded the way the browser makes one — two clicks, two keys.
 *
 * ── No network ───────────────────────────────────────────────────────────────────────
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

  const entryId = await addToLibrary(tx, userId, row.id);

  return { entryId, titleId: row.id, episodeIds };
}

/**
 * A second account's copy of a title somebody else already has. `title` and `episode` are
 * global (ADR-0001), so this is one row and not a second show — which is exactly what
 * makes the cross-account assertion below able to fail.
 */
async function addToLibrary(
  tx: Transaction,
  userId: UserId,
  titleId: string,
): Promise<string> {
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId })
    .returning({ id: libraryEntry.id });
  return entry.id;
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
  const entryId = await addToLibrary(tx, userId, row.id);
  return { entryId, titleId: row.id };
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

describe("unwatch", () => {
  it("removes the watch the application recorded", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      await recordWatch(userId, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      expect(outcome).toEqual({ removed: true });
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(0);
    }));

  it("removes an imported watch — the row is read back, not inferred", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      const imported = await importedWatch(tx, userId, entryId, titleId, episodeId);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      // The inversion, and the whole of issue #145 in three lines. #89 asserted this row
      // survived; all 19,558 watches in the real library look exactly like it, so an
      // unwatch that spared it was an unwatch nobody could reach. `npm run db:seed` is
      // what puts it back — the raw export and the seed are both committed, import is
      // idempotent, and `62085:1` is always the same row.
      expect(await watchExists(tx, imported)).toBe(false);
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(0);
      expect(outcome).toEqual({ removed: true });
    }));

  it("removes an imported watch and an app watch of the same episode together", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      const imported = await importedWatch(tx, userId, entryId, titleId, episodeId);
      await recordWatch(userId, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      expect(outcome).toEqual({ removed: true });
      expect(await watchExists(tx, imported)).toBe(false);
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(0);
    }));

  it("removes both halves of a rewatch, because unwatched means unwatched", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      // Two clicks, two keys — a genuine rewatch, which is two rows (ADR-0001).
      await recordWatch(userId, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);
      await recordWatch(userId, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(2);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId }, tx);

      // #89 took one row and left the other, so the episode stayed struck and the reader
      // pressed again. One press, one meaning: the episode is unwatched.
      expect(outcome).toEqual({ removed: true });
      expect(await watchesOnEpisode(tx, userId, episodeId)).toHaveLength(0);
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

  it("touches no other title in the same library", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const one = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      const other = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      for (const show of [one, other]) {
        await recordWatch(
          userId,
          {
            libraryEntryId: show.entryId,
            episodeId: show.episodeIds["1-1"],
            sourceKey: nextKey(),
          },
          tx,
        );
      }

      await unwatch(
        userId,
        { libraryEntryId: one.entryId, episodeId: one.episodeIds["1-1"] },
        tx,
      );

      expect(await watchesOnEpisode(tx, userId, one.episodeIds["1-1"])).toHaveLength(0);
      expect(await watchesOnEpisode(tx, userId, other.episodeIds["1-1"])).toHaveLength(1);
    }));

  it("touches no other account's watch of the very same episode", () =>
    inTransaction(async (tx) => {
      const mine = await seedUser(tx, "adham");
      const theirs = await seedUser(tx, "somebody-else");
      const { entryId, titleId, episodeIds } = await seedShow(tx, mine, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      const episodeId = episodeIds["1-1"];
      // One global episode, two libraries — the shape `ownedBy` exists for.
      const theirEntry = await addToLibrary(tx, theirs, titleId);
      await recordWatch(mine, { libraryEntryId: entryId, episodeId, sourceKey: nextKey() }, tx);
      await recordWatch(
        theirs,
        { libraryEntryId: theirEntry, episodeId, sourceKey: nextKey() },
        tx,
      );

      await unwatch(mine, { libraryEntryId: entryId, episodeId }, tx);

      expect(await watchesOnEpisode(tx, mine, episodeId)).toHaveLength(0);
      expect(await watchesOnEpisode(tx, theirs, episodeId)).toHaveLength(1);
    }));

  it("removes nothing from an episode that was never watched, and does not throw", () =>
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

      // A row that was out of date, not a lost write. Nothing to remove is an answer.
      expect(outcome).toEqual({ removed: false });
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
      // the views, which is the only place any of this is defined. Nothing is stored, so
      // nothing was recalculated.
      expect(second?.upNext).toBe(true);
    }));

  it("moves progress back even when the watch it removes was imported", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(
        tx,
        userId,
        [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
        { inProduction: false },
      );
      for (const key of ["1-1", "1-2"]) {
        await importedWatch(tx, userId, entryId, titleId, episodeIds[key]);
      }
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("finished");

      await unwatch(userId, { libraryEntryId: entryId, episodeId: episodeIds["1-2"] }, tx);

      const detail = await getTitleDetail(userId, entryId, tx);
      expect(detail.state).toBe("watching");
      expect(detail.episodes.find((one) => one.episodeNo === 2)?.upNext).toBe(true);
    }));

  it("returns a show to the watchlist when its last watch goes", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2 },
      ]);
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("watching");

      await unwatch(userId, { libraryEntryId: entryId, episodeId: episodeIds["1-1"] }, tx);

      // Not a fourth thing that happens on unwatch — it is what the state view already
      // says about a title with no watches (`db/views.ts`).
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("watchlist");
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

      expect(outcome).toEqual({ removed: true });
      expect((await getTitleDetail(userId, entryId, tx)).state).toBe("watchlist");
    }));

  it("removes a film's imported watch too", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId } = await seedFilm(tx, userId);
      const imported = await importedWatch(tx, userId, entryId, titleId, null);

      const outcome = await unwatch(userId, { libraryEntryId: entryId, episodeId: null }, tx);

      // No surface draws this yet — `film-watch-row.tsx` offers no unwatch control — but
      // the write does not know that, and a film's imported watch is not a different rule.
      expect(outcome).toEqual({ removed: true });
      expect(await watchExists(tx, imported)).toBe(false);
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
      // watch back is not a statement about it in either direction. ADR-0001 clears it
      // only in the same transaction as a watch *insert*.
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

describe("getTitleDetail's watched episodes", () => {
  /**
   * There is no longer a second flag beside `watched` saying whether the row may offer an
   * unwatch. #89 had one — `unwatchable`, *this account has a watch of this episode that
   * the application recorded* — and #145 removes it rather than setting it to `watched`,
   * because two fields that can only ever agree are two fields that can come to disagree.
   * What is left to assert is that an imported watch is not a lesser kind of watched.
   */
  it("reads an episode whose only watch is imported as watched, like any other", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, titleId, episodeIds } = await seedShow(tx, userId, [
        { seasonNo: 1, episodeNo: 1 },
      ]);
      await importedWatch(tx, userId, entryId, titleId, episodeIds["1-1"]);

      const [one] = (await getTitleDetail(userId, entryId, tx)).episodes;

      expect(one.watched).toBe(true);
    }));

  it("reads an unwatched episode as unwatched", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);

      const [one] = (await getTitleDetail(userId, entryId, tx)).episodes;

      expect(one.watched).toBe(false);
    }));
});
