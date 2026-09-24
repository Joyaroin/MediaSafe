import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addTitleToLibrary,
  applyImportChunk,
  asUserId,
  getTitleDetail,
  ownedBy,
  type ImportChunk,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import type { TitleMirror } from "@/tmdb/mirror";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `applyImportChunk`, against real Postgres — issue #72.
 *
 * ── Why this file carries the most assertions in step 3 ──────────────────────────────
 *
 * Everything else in import fails loudly and immediately to the one person using it.
 * This does not. The rule: *"`abandoned_at` is cleared only by the application write
 * path … import never clears it, and sets it only when it creates the library entry,
 * never on update."* Get that wrong and every re-seed of preview quietly resurrects the
 * abandonment on 155 titles that have since been un-abandoned, and nothing on any screen
 * says so.
 *
 * `UNIQUE (user_id, source, source_key)` makes the rest idempotent for free, which is why
 * the assertions below spend their weight on the one case it does not cover.
 *
 * ── No network, and nothing fetched ──────────────────────────────────────────────────
 *
 * Every mirror here is a literal. That is not a convenience of the test:
 * `applyImportChunk` takes the mirror **passed in** rather than fetching it, so there is
 * no TMDB call to stub and these run with the network unplugged. `setUpTestDatabase` and
 * `inTransaction` from issue #40's harness, and nothing else.
 */

setUpTestDatabase("mediasafe_import_chunk_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

/**
 * A show mirror carrying exactly the `[season, episode]` pairs asked for, in the shape
 * `tmdb/mirror.ts` produces. Season 0 is spelled by the caller, because whether specials
 * are present is the thing several of these tests turn on.
 */
function showMirror(
  episodes: readonly (readonly [seasonNo: number, episodeNo: number])[],
  overrides: Partial<TitleMirror> = {},
): TitleMirror {
  const tmdbId = nextNumber();
  return {
    kind: "show",
    tmdbId,
    externalId: `tvdb:${tmdbId}`,
    name: `Show ${tmdbId}`,
    releaseYear: 2011,
    releaseDate: "2011-04-17",
    posterPath: "/poster.jpg",
    inProduction: false,
    runtimeMins: null,
    episodes: episodes.map(([seasonNo, episodeNo]) => ({
      tmdbEpisodeId: nextNumber() + 900_000,
      seasonNo,
      episodeNo,
      name: `S${seasonNo}E${episodeNo}`,
      airDate: "2011-04-17",
      runtimeMins: 62,
      stillPath: `/still-${seasonNo}-${episodeNo}.jpg`,
    })),
    ...overrides,
  };
}

/** The chunk one page of a file becomes. `source` is the file's, never invented here. */
function chunkOf(
  titles: readonly { mirror: TitleMirror; abandoned: boolean }[],
  watches: ImportChunk["watches"] = [],
): ImportChunk {
  return { source: "tvtracker", titles, watches };
}

/** Every episode of a mirror, watched, keyed the way import keys them. */
function watchesOf(mirror: TitleMirror, watchedAt: string | null = null) {
  return mirror.episodes.map((one) => ({
    tmdbId: mirror.tmdbId,
    tmdbEpisodeId: one.tmdbEpisodeId,
    watchedAt,
    key: `${one.tmdbEpisodeId}:1`,
  }));
}

async function entriesFor(tx: Transaction, userId: UserId) {
  return tx.select().from(libraryEntry).where(ownedBy(userId, libraryEntry));
}

async function watchesFor(tx: Transaction, userId: UserId) {
  return tx.select().from(watch).where(ownedBy(userId, watch));
}

describe("applyImportChunk", () => {
  it("writes the titles, their episodes, the entries and the watches, and reports what it wrote", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const watched = showMirror([
        [1, 1],
        [1, 2],
      ]);
      const unwatched = showMirror([[1, 1]]);

      const outcome = await applyImportChunk(
        userId,
        chunkOf(
          [
            { mirror: watched, abandoned: false },
            { mirror: unwatched, abandoned: true },
          ],
          watchesOf(watched),
        ),
        tx,
      );

      // The three counters the progress line prints...
      expect(outcome).toMatchObject({
        titlesAdded: 2,
        watchesAdded: 2,
        arrivedAbandoned: 1,
      });
      // ...and the one thing that is not a counter and never reaches a screen: every
      // global `title` row this chunk re-mirrored, which the action busts the other
      // holders' cached libraries from (issue #219). Both titles, because both were
      // mirrored, whether or not this account already had them.
      expect(outcome.mirroredTitleIds).toHaveLength(2);

      expect(await entriesFor(tx, userId)).toHaveLength(2);
      expect(await watchesFor(tx, userId)).toHaveLength(2);

      const [row] = await tx
        .select()
        .from(title)
        .where(eq(title.tmdbId, watched.tmdbId));
      expect(row.name).toBe(watched.name);
      expect(
        await tx.select().from(episode).where(eq(episode.titleId, row.id)),
      ).toHaveLength(2);
    }));

  it("writes nothing the second time — no duplicate entries, no duplicate watches", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([
        [1, 1],
        [1, 2],
      ]);
      const chunk = chunkOf([{ mirror, abandoned: false }], watchesOf(mirror));

      await applyImportChunk(userId, chunk, tx);
      const second = await applyImportChunk(userId, chunk, tx);

      // Nothing written the second time — and one title still re-mirrored, because a
      // re-run of the same chunk upserts the shared `title` row again (issue #219).
      expect(second).toMatchObject({
        titlesAdded: 0,
        watchesAdded: 0,
        arrivedAbandoned: 0,
      });
      expect(second.mirroredTitleIds).toHaveLength(1);
      expect(await entriesFor(tx, userId)).toHaveLength(1);
      expect(await watchesFor(tx, userId)).toHaveLength(2);
      expect(
        await tx.select().from(title).where(eq(title.tmdbId, mirror.tmdbId)),
      ).toHaveLength(1);
    }));

  it("stamps abandoned_at when it creates the entry, at the same instant as added_at", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([[1, 1]]);

      await applyImportChunk(userId, chunkOf([{ mirror, abandoned: true }]), tx);

      const [entry] = await entriesFor(tx, userId);
      expect(entry.abandonedAt).not.toBeNull();
      /**
       * The rule: *"import mints the stamp and the `abandoned_at == added_at`
       * identity holds in every environment that runs the file."* It holds because both
       * are `now()`, which is the transaction's start, not two wall-clock readings.
       */
      expect(entry.abandonedAt).toEqual(entry.addedAt);
    }));

  it("does not re-set abandoned_at on a second run against an entry since un-abandoned", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([[1, 1]]);
      const chunk = chunkOf([{ mirror, abandoned: true }], watchesOf(mirror));

      await applyImportChunk(userId, chunk, tx);
      // What the application write path does when you watch the title again.
      await tx
        .update(libraryEntry)
        .set({ abandonedAt: null })
        .where(ownedBy(userId, libraryEntry));

      await applyImportChunk(userId, chunk, tx);

      const [entry] = await entriesFor(tx, userId);
      // The whole reason this ticket is its own ticket.
      expect(entry.abandonedAt).toBeNull();
    }));

  it("never clears abandoned_at, even while adding watches to the title", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([
        [1, 1],
        [1, 2],
      ]);

      await applyImportChunk(userId, chunkOf([{ mirror, abandoned: true }]), tx);
      const outcome = await applyImportChunk(
        userId,
        chunkOf([{ mirror, abandoned: false }], watchesOf(mirror)),
        tx,
      );

      expect(outcome.watchesAdded).toBe(2);
      const [entry] = await entriesFor(tx, userId);
      expect(entry.abandonedAt).not.toBeNull();
      expect((await getTitleDetail(userId, entry.id, tx)).state).toBe("abandoned");
    }));

  it("makes a title with no watches a watchlist entry", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([[1, 1]]);

      await applyImportChunk(userId, chunkOf([{ mirror, abandoned: false }]), tx);

      const [entry] = await entriesFor(tx, userId);
      expect((await getTitleDetail(userId, entry.id, tx)).state).toBe("watchlist");
    }));

  it("leaves a title already in the library alone — added_at, rating and abandoned_at all survive", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([[1, 1]]);

      await addTitleToLibrary(userId, mirror, tx);
      const abandonedAt = new Date("2024-01-02T03:04:05.000Z");
      const addedAt = new Date("2023-11-12T13:14:15.000Z");
      await tx
        .update(libraryEntry)
        .set({ rating: 8, abandonedAt, addedAt })
        .where(ownedBy(userId, libraryEntry));

      const outcome = await applyImportChunk(
        userId,
        chunkOf([{ mirror, abandoned: false }], watchesOf(mirror)),
        tx,
      );

      expect(outcome.titlesAdded).toBe(0);
      expect(outcome.arrivedAbandoned).toBe(0);
      const [entry] = await entriesFor(tx, userId);
      expect(entry.rating).toBe(8);
      expect(entry.abandonedAt).toEqual(abandonedAt);
      expect(entry.addedAt).toEqual(addedAt);
    }));

  it("writes specials and excludes them from every derived state", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([
        [0, 1],
        [1, 1],
        [1, 2],
      ]);
      // Every season-1 episode watched; the special left alone, as an import leaves it.
      const specialId = mirror.episodes.find((one) => one.seasonNo === 0)?.tmdbEpisodeId;
      const watches = watchesOf(mirror).filter(
        (one) => one.tmdbEpisodeId !== specialId,
      );

      await applyImportChunk(
        userId,
        chunkOf([{ mirror, abandoned: false }], watches),
        tx,
      );

      const [entry] = await entriesFor(tx, userId);
      const detail = await getTitleDetail(userId, entry.id, tx);

      // Mirrored and markable — the special is a real row on the programme note …
      expect(detail.episodes.map((one) => one.seasonNo)).toEqual([0, 1, 1]);
      expect(detail.episodes.find((one) => one.seasonNo === 0)?.watched).toBe(false);
      // … and excluded from every derived state, so unwatched season 0 still reads finished.
      expect(detail.state).toBe("finished");
      expect(detail.episodes.some((one) => one.upNext)).toBe(false);
    }));

  it("counts an undated watch towards progress", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([
        [1, 1],
        [1, 2],
      ]);
      const [first] = mirror.episodes;

      await applyImportChunk(
        userId,
        chunkOf(
          [{ mirror, abandoned: false }],
          [
            {
              tmdbId: mirror.tmdbId,
              tmdbEpisodeId: first.tmdbEpisodeId,
              watchedAt: null,
              key: `${first.tmdbEpisodeId}:1`,
            },
          ],
        ),
        tx,
      );

      const [watchRow] = await watchesFor(tx, userId);
      expect(watchRow.watchedAt).toBeNull();

      const [entry] = await entriesFor(tx, userId);
      const detail = await getTitleDetail(userId, entry.id, tx);
      // 18 of ~18,715 imported watches are dated; progress cannot depend on the date.
      expect(detail.state).toBe("watching");
      expect(detail.episodes.find((one) => one.upNext)?.name).toBe("S1E2");
    }));

  it("keeps a dated watch's date", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([[1, 1]]);
      const watchedAt = "2024-03-02T21:15:00.000Z";

      await applyImportChunk(
        userId,
        chunkOf([{ mirror, abandoned: false }], watchesOf(mirror, watchedAt)),
        tx,
      );

      const [watchRow] = await watchesFor(tx, userId);
      expect(watchRow.watchedAt).toEqual(new Date(watchedAt));
    }));

  it("lands watches on the episodes another account already created, without duplicating them", () =>
    inTransaction(async (tx) => {
      const other = await seedUser(tx, "someone-else");
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([
        [1, 1],
        [1, 2],
      ]);

      // The global rows exist before this import ever runs.
      await addTitleToLibrary(other, mirror, tx);
      const [titleRow] = await tx
        .select()
        .from(title)
        .where(eq(title.tmdbId, mirror.tmdbId));
      const existing = await tx
        .select()
        .from(episode)
        .where(eq(episode.titleId, titleRow.id));

      await applyImportChunk(
        userId,
        chunkOf([{ mirror, abandoned: false }], watchesOf(mirror)),
        tx,
      );

      // No second title row, no second set of episodes.
      expect(
        await tx.select().from(title).where(eq(title.tmdbId, mirror.tmdbId)),
      ).toHaveLength(1);
      expect(
        await tx.select().from(episode).where(eq(episode.titleId, titleRow.id)),
      ).toHaveLength(2);

      const written = await watchesFor(tx, userId);
      expect(written.map((one) => one.episodeId).sort()).toEqual(
        existing.map((one) => one.id).sort(),
      );
      expect(written.every((one) => one.titleId === titleRow.id)).toBe(true);
    }));

  it("refuses a watch whose episode the chunk does not carry, rather than dropping it", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([[1, 1]]);

      await expect(
        applyImportChunk(
          userId,
          chunkOf(
            [{ mirror, abandoned: false }],
            [
              {
                tmdbId: mirror.tmdbId,
                tmdbEpisodeId: 404_404,
                watchedAt: null,
                key: "404404:1",
              },
            ],
          ),
          tx,
        ),
      ).rejects.toThrow(/404404/);

      expect(await entriesFor(tx, userId)).toHaveLength(0);
    }));

  it("refuses a watch whose title disagrees with the episode it names", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const named = showMirror([[1, 1]]);
      const owning = showMirror([[1, 1]]);

      await expect(
        applyImportChunk(
          userId,
          chunkOf(
            [
              { mirror: named, abandoned: false },
              { mirror: owning, abandoned: false },
            ],
            [
              {
                tmdbId: named.tmdbId,
                tmdbEpisodeId: owning.episodes[0].tmdbEpisodeId,
                watchedAt: null,
                key: "disagreeing:1",
              },
            ],
          ),
          tx,
        ),
      ).rejects.toThrow(/belongs to/);
    }));

  it("writes one row for a title and a watch the same chunk names twice", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([[1, 1]]);

      /**
       * A chunk is a page of a file, and nothing between the file and here dedupes it.
       * The two conflicts resolve within the one statement rather than raising — worth an
       * assertion, because `ON CONFLICT DO UPDATE` would refuse the same input outright
       * and this would then fail on a real file with an error nobody could read.
       */
      const outcome = await applyImportChunk(
        userId,
        chunkOf(
          [
            { mirror, abandoned: false },
            { mirror, abandoned: false },
          ],
          [...watchesOf(mirror), ...watchesOf(mirror)],
        ),
        tx,
      );

      expect(outcome).toMatchObject({
        titlesAdded: 1,
        watchesAdded: 1,
        arrivedAbandoned: 0,
      });
      // One title, named once: the chunk carried the same mirror twice and `mirrorTitle`
      // upserts on `(kind, tmdb_id)`, so there is one global row to bust holders of.
      expect(new Set(outcome.mirroredTitleIds).size).toBe(1);
      expect(await watchesFor(tx, userId)).toHaveLength(1);
    }));

  it("writes an empty chunk without touching anything", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");

      expect(await applyImportChunk(userId, chunkOf([]), tx)).toEqual({
        titlesAdded: 0,
        watchesAdded: 0,
        arrivedAbandoned: 0,
        mirroredTitleIds: [],
      });
      expect(await entriesFor(tx, userId)).toHaveLength(0);
    }));

  it("rolls the whole chunk back when one row in it fails", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const good = showMirror([[1, 1]]);

      await expect(
        applyImportChunk(
          userId,
          chunkOf(
            [{ mirror: good, abandoned: false }],
            [
              ...watchesOf(good),
              {
                tmdbId: good.tmdbId,
                tmdbEpisodeId: 404_404,
                watchedAt: null,
                key: "404404:1",
              },
            ],
          ),
          tx,
        ),
      ).rejects.toThrow();

      // A library entry pointing at a half-written show has wrong derived states.
      expect(await entriesFor(tx, userId)).toHaveLength(0);
      expect(
        await tx.select().from(title).where(eq(title.tmdbId, good.tmdbId)),
      ).toHaveLength(0);
    }));
});
