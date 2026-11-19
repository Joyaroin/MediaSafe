import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  accountFigures,
  asUserId,
  entryEpisodeFacts,
  lastWatchedTitle,
  listWatchesSince,
  markWatchedUndated,
  markWatchedUpTo,
  ownedBy,
  recordWatch,
  undoMarkWatchedUpTo,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Search's undated *Seen it all* / *Seen it* (issue #537), against real Postgres.
 *
 * What fails silently here is the same as for `markWatchedUpTo`: a wrong rule writes rows
 * that look like history. So the assertions spend their weight on which episodes are
 * covered (aired, above season zero), that the rows carry **no date** and so stay off every
 * dated surface, that a retry of one press writes no second set, that the switch back
 * (`undoMarkWatchedUpTo`, reused) removes exactly that press's rows on a show and on a
 * film, and that another reader's entry is out of reach.
 */

setUpTestDatabase("mediasafe_mark_watched_undated_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const AIRED = daysFromToday(-30);
const UNAIRED = daysFromToday(30);

let counter = 0;
const nextNumber = () => ++counter;
/** One per press, as the browser mints one per tap. */
const nextKey = () => `press-${nextNumber()}`;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  readonly seasonNo: number;
  readonly episodeNo: number;
  readonly airDate?: string | null;
}

async function seedShow(
  tx: Transaction,
  userId: UserId,
  episodes: readonly EpisodeSpec[],
  overrides: { releaseDate?: string | null; pending?: boolean } = {},
): Promise<{ entryId: string; titleId: string; episodeIds: Record<string, string> }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: `Show ${number}`,
      releaseYear: 2022,
      releaseDate: overrides.releaseDate ?? null,
      inProduction: true,
      ...(overrides.pending === true ? { episodesMirroredAt: null } : {}),
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
        airDate: one.airDate === undefined ? AIRED : one.airDate,
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

async function watchRowsOf(tx: Transaction, userId: UserId, entryId: string) {
  return tx
    .select()
    .from(watch)
    .where(and(ownedBy(userId, watch), eq(watch.libraryEntryId, entryId)))
    .orderBy(asc(watch.sourceKey));
}

/** Specials, a released run, and one episode that has not aired, one with no date. */
const SHOW: readonly EpisodeSpec[] = [
  { seasonNo: 0, episodeNo: 1 },
  { seasonNo: 1, episodeNo: 1 },
  { seasonNo: 1, episodeNo: 2 },
  { seasonNo: 2, episodeNo: 1 },
  { seasonNo: 2, episodeNo: 2, airDate: UNAIRED },
  { seasonNo: 2, episodeNo: 3, airDate: null },
];

describe("markWatchedUndated", () => {
  it("writes one undated watch per aired episode, and none for a special or an unaired one", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, SHOW);

      const outcome = await markWatchedUndated(
        userId,
        { libraryEntryId: entryId, sourceKey: nextKey() },
        tx,
      );

      const rows = await watchRowsOf(tx, userId, entryId);
      expect(outcome.recorded).toBe(3);
      expect(rows.map((one) => one.episodeId).sort()).toEqual(
        [episodeIds["1-1"], episodeIds["1-2"], episodeIds["2-1"]].sort(),
      );
      // The point of the write: undated, and the app's own source.
      expect(rows.every((one) => one.watchedAt === null)).toBe(true);
      expect(rows.every((one) => one.source === "app")).toBe(true);
    }));

  it("keys each episode `${sourceKey}:${episodeId}`", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, SHOW);
      const sourceKey = nextKey();

      await markWatchedUndated(userId, { libraryEntryId: entryId, sourceKey }, tx);

      const rows = await watchRowsOf(tx, userId, entryId);
      expect(rows.map((one) => one.sourceKey).sort()).toEqual(
        [episodeIds["1-1"], episodeIds["1-2"], episodeIds["2-1"]]
          .map((id) => `${sourceKey}:${id}`)
          .sort(),
      );
    }));

  it("stays off the dated surfaces and in the totals", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedShow(tx, userId, SHOW);

      await markWatchedUndated(userId, { libraryEntryId: entryId, sourceKey: nextKey() }, tx);

      expect(await listWatchesSince(userId, new Date(0), tx)).toEqual([]);
      expect(await lastWatchedTitle(userId, tx)).toBeNull();
      // Counted by the all-time totals, and by You's "N watches carry no date" line.
      const figures = await accountFigures(userId, tx);
      expect(figures.episodesWatched).toBe(3);
      expect(figures.undatedWatches).toBe(3);
      expect(figures.showsWatched).toBe(1);
    }));

  it("writes no second set when the same press is retried", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedShow(tx, userId, SHOW);
      const params = { libraryEntryId: entryId, sourceKey: nextKey() };

      await markWatchedUndated(userId, params, tx);
      const retry = await markWatchedUndated(userId, params, tx);

      expect(retry.recorded).toBe(0);
      expect(await watchRowsOf(tx, userId, entryId)).toHaveLength(3);
    }));

  it("skips an episode the entry already has a watch of", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, SHOW);
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );

      const outcome = await markWatchedUndated(
        userId,
        { libraryEntryId: entryId, sourceKey: nextKey() },
        tx,
      );

      expect(outcome.recorded).toBe(2);
    }));

  it("writes a film's watch as `${sourceKey}:film`, undated", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedFilm(tx, userId);
      const sourceKey = nextKey();

      const outcome = await markWatchedUndated(userId, { libraryEntryId: entryId, sourceKey }, tx);

      const rows = await watchRowsOf(tx, userId, entryId);
      expect(outcome.recorded).toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].sourceKey).toBe(`${sourceKey}:film`);
      expect(rows[0].episodeId).toBeNull();
      expect(rows[0].watchedAt).toBeNull();

      // A retry of the same press, and a second press on a watched film: nothing new.
      expect((await markWatchedUndated(userId, { libraryEntryId: entryId, sourceKey }, tx)).recorded).toBe(0);
      expect(
        (await markWatchedUndated(userId, { libraryEntryId: entryId, sourceKey: nextKey() }, tx))
          .recorded,
      ).toBe(0);
      expect(await watchRowsOf(tx, userId, entryId)).toHaveLength(1);
    }));

  it("throws for an entry that is not this reader's, and writes nothing to it", () =>
    inTransaction(async (tx) => {
      const mine = await seedUser(tx, "adham");
      const theirs = await seedUser(tx, "stranger");
      const show = await seedShow(tx, theirs, SHOW);
      const film = await seedFilm(tx, theirs);

      for (const entryId of [show.entryId, film.entryId]) {
        await expect(
          markWatchedUndated(mine, { libraryEntryId: entryId, sourceKey: nextKey() }, tx),
        ).rejects.toThrow(/not found in this account's library/);
        expect(await watchRowsOf(tx, theirs, entryId)).toEqual([]);
      }
    }));
});

describe("switching back with undoMarkWatchedUpTo", () => {
  it("removes exactly that press's watches on a show, and leaves a dated one and an earlier press alone", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, SHOW);
      // A dated watch of S1E1 that was there first, and an earlier dated press.
      const dated = await markWatchedUpTo(
        userId,
        { libraryEntryId: entryId, upToEpisodeId: episodeIds["1-1"], sourceKey: nextKey() },
        tx,
      );
      expect(dated.recorded).toBe(1);

      const press = nextKey();
      const marked = await markWatchedUndated(userId, { libraryEntryId: entryId, sourceKey: press }, tx);
      expect(marked.recorded).toBe(2);
      expect(await watchRowsOf(tx, userId, entryId)).toHaveLength(3);

      const outcome = await undoMarkWatchedUpTo(
        userId,
        { libraryEntryId: entryId, sourceKey: press },
        tx,
      );

      expect(outcome.removed).toBe(2);
      const left = await watchRowsOf(tx, userId, entryId);
      expect(left).toHaveLength(1);
      expect(left[0].episodeId).toBe(episodeIds["1-1"]);
      expect(left[0].watchedAt).not.toBeNull();
    }));

  it("removes a film's watch, so Seen it on then off leaves none, and a dated watch is untouched", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedFilm(tx, userId);
      const press = nextKey();

      await markWatchedUndated(userId, { libraryEntryId: entryId, sourceKey: press }, tx);
      expect(await watchRowsOf(tx, userId, entryId)).toHaveLength(1);

      const outcome = await undoMarkWatchedUpTo(
        userId,
        { libraryEntryId: entryId, sourceKey: press },
        tx,
      );

      expect(outcome.removed).toBe(1);
      expect(await watchRowsOf(tx, userId, entryId)).toEqual([]);

      // A film watched with a date by somebody else's write is not this press's to take.
      const other = await seedFilm(tx, userId);
      await recordWatch(
        userId,
        { libraryEntryId: other.entryId, episodeId: null, sourceKey: nextKey() },
        tx,
      );
      await markWatchedUndated(userId, { libraryEntryId: other.entryId, sourceKey: press }, tx);
      await undoMarkWatchedUpTo(userId, { libraryEntryId: other.entryId, sourceKey: press }, tx);
      expect(await watchRowsOf(tx, userId, other.entryId)).toHaveLength(1);
    }));

  it("does not reach another reader's entry", () =>
    inTransaction(async (tx) => {
      const mine = await seedUser(tx, "adham");
      const theirs = await seedUser(tx, "stranger");
      const { entryId } = await seedFilm(tx, theirs);
      const press = nextKey();
      await markWatchedUndated(theirs, { libraryEntryId: entryId, sourceKey: press }, tx);

      await expect(
        undoMarkWatchedUpTo(mine, { libraryEntryId: entryId, sourceKey: press }, tx),
      ).rejects.toThrow(/not found in this account's library/);
      expect(await watchRowsOf(tx, theirs, entryId)).toHaveLength(1);
    }));
});

describe("entryEpisodeFacts", () => {
  it("says whether a mirrored show has an aired episode, true and false", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const aired = await seedShow(tx, userId, [{ seasonNo: 1, episodeNo: 1 }]);
      const onlySpecialsAndFuture = await seedShow(tx, userId, [
        { seasonNo: 0, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 1, airDate: UNAIRED },
        { seasonNo: 1, episodeNo: 2, airDate: null },
      ]);

      expect((await entryEpisodeFacts(userId, aired.entryId, tx))?.hasAiredEpisode).toBe(true);
      expect(
        (await entryEpisodeFacts(userId, onlySpecialsAndFuture.entryId, tx))?.hasAiredEpisode,
      ).toBe(false);
    }));

  it("answers a show whose seasons are still arriving from its first air date", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const started = await seedShow(tx, userId, [], { pending: true, releaseDate: AIRED });
      const upcoming = await seedShow(tx, userId, [], { pending: true, releaseDate: UNAIRED });
      const undated = await seedShow(tx, userId, [], { pending: true });

      const facts = await entryEpisodeFacts(userId, started.entryId, tx);
      expect(facts?.episodesPending).toBe(true);
      expect(facts?.hasAiredEpisode).toBe(true);
      expect((await entryEpisodeFacts(userId, upcoming.entryId, tx))?.hasAiredEpisode).toBe(false);
      expect((await entryEpisodeFacts(userId, undated.entryId, tx))?.hasAiredEpisode).toBe(false);
    }));

  it("is false for a film, and null for an entry that is not this reader's", () =>
    inTransaction(async (tx) => {
      const mine = await seedUser(tx, "adham");
      const theirs = await seedUser(tx, "stranger");
      const film = await seedFilm(tx, mine);
      const other = await seedFilm(tx, theirs);

      expect(await entryEpisodeFacts(mine, film.entryId, tx)).toMatchObject({
        kind: "film",
        hasAiredEpisode: false,
        episodesPending: false,
      });
      expect(await entryEpisodeFacts(mine, other.entryId, tx)).toBeNull();
    }));
});
