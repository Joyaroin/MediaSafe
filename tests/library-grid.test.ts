import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { asUserId, listLibraryEntries, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The one read behind the library grid (issue #56).
 *
 * ── Why the query is what gets tested ────────────────────────────────────────────────
 *
 * The grid itself is a server component with no branch in it a test could reach:
 * `vitest.config.mts` includes `tests/**` on the `node` environment, so there is no
 * renderer here, and adding one to assert on a class name would be a second harness
 * checking the wrong half. What is worth checking is everything the cell is built out of
 * — whose rows arrive, which of the five states each entry is in, what is next in it, and
 * in what order — and all of that is this function.
 *
 * ── The two that would not fail loudly ───────────────────────────────────────────────
 *
 * **Isolation**, because a missing `user_id` predicate returns *more* rows rather than an
 * error, and a library that quietly contains somebody else's shows looks exactly like a
 * library. And **the empty answer**, because `[]` here has to mean the query succeeded
 * and found nothing (`SPEC.md` §3.2). A failure arrives as a throw, which is why there is
 * no `try` anywhere in the function and no assertion here that a failure returns a list.
 */

setUpTestDatabase("mediasafe_library_grid_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);
const UNRELEASED = daysFromToday(30);

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
  /** `null` is TMDB not naming it — the case the *never numbered alone* rule turns on. */
  name?: string | null;
  airDate?: string | null;
}

interface ShowSpec {
  name?: string;
  releaseYear?: number | null;
  posterPath?: string | null;
  inProduction?: boolean | null;
  episodes?: EpisodeSpec[];
  abandonedAt?: Date;
}

interface Show {
  userId: UserId;
  titleId: string;
  entryId: string;
  episodeIds: string[];
}

async function seedShow(
  tx: Transaction,
  userId: UserId,
  spec: ShowSpec = {},
): Promise<Show> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: spec.name ?? `Show ${number}`,
      releaseYear: "releaseYear" in spec ? spec.releaseYear : 2022,
      posterPath: "posterPath" in spec ? spec.posterPath : `/poster-${number}.jpg`,
      inProduction: "inProduction" in spec ? spec.inProduction : true,
    })
    .returning({ id: title.id });

  const episodeIds: string[] = [];
  for (const one of spec.episodes ?? []) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: one.seasonNo,
        episodeNo: one.episodeNo,
        name: "name" in one ? one.name : `Episode ${one.seasonNo}-${one.episodeNo}`,
        airDate: one.airDate === undefined ? RELEASED : one.airDate,
      })
      .returning({ id: episode.id });
    episodeIds.push(inserted.id);
  }

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, abandonedAt: spec.abandonedAt })
    .returning({ id: libraryEntry.id });

  return { userId, titleId: row.id, entryId: entry.id, episodeIds };
}

interface Film {
  userId: UserId;
  titleId: string;
  entryId: string;
}

async function seedFilm(
  tx: Transaction,
  userId: UserId,
  spec: { name?: string } = {},
): Promise<Film> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "film",
      tmdbId: number,
      name: spec.name ?? `Film ${number}`,
      releaseYear: 2019,
      runtimeMins: 104,
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });

  return { userId, titleId: row.id, entryId: entry.id };
}

async function markWatched(tx: Transaction, show: Show, index: number): Promise<void> {
  await tx.insert(watch).values({
    userId: show.userId,
    libraryEntryId: show.entryId,
    titleId: show.titleId,
    episodeId: show.episodeIds[index],
    watchedAt: new Date(),
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });
}

async function markFilmWatched(tx: Transaction, film: Film): Promise<void> {
  await tx.insert(watch).values({
    userId: film.userId,
    libraryEntryId: film.entryId,
    titleId: film.titleId,
    watchedAt: new Date(),
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });
}

describe("listLibraryEntries", () => {
  it("returns this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");

      const mine = await seedShow(tx, reader, { name: "Mine" });
      await seedShow(tx, stranger, { name: "Theirs" });

      const rows = await listLibraryEntries(reader, tx);

      expect(rows.map((row) => row.name)).toEqual(["Mine"]);
      expect(rows[0].libraryEntryId).toBe(mine.entryId);
    });
  });

  it("answers an account with no entries with an empty list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      // Somebody else's library is full; this one is genuinely empty.
      await seedShow(tx, await seedUser(tx, "stranger"));

      expect(await listLibraryEntries(reader, tx)).toEqual([]);
    });
  });

  it("carries the borrowed facts the cell prints", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, {
        name: "Severance",
        releaseYear: 2022,
        posterPath: "/severance.jpg",
      });

      const [row] = await listLibraryEntries(reader, tx);

      expect(row.name).toBe("Severance");
      expect(row.releaseYear).toBe(2022);
      expect(row.posterPath).toBe("/severance.jpg");
    });
  });

  it("carries a title TMDB has neither dated nor illustrated", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { releaseYear: null, posterPath: null });

      const [row] = await listLibraryEntries(reader, tx);

      expect(row.releaseYear).toBeNull();
      expect(row.posterPath).toBeNull();
    });
  });

  it("gives every entry one of the five states", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedShow(tx, reader, {
        name: "A Watchlist",
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });

      const watching = await seedShow(tx, reader, {
        name: "B Watching",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await markWatched(tx, watching, 0);

      const caughtUp = await seedShow(tx, reader, {
        name: "C Caught up",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, airDate: UNRELEASED },
        ],
      });
      await markWatched(tx, caughtUp, 0);

      const finished = await seedShow(tx, reader, {
        name: "D Finished",
        inProduction: false,
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await markWatched(tx, finished, 0);

      const abandoned = await seedShow(tx, reader, {
        name: "E Abandoned",
        abandonedAt: new Date(),
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await markWatched(tx, abandoned, 0);

      const rows = await listLibraryEntries(reader, tx);

      expect(rows.map((row) => row.state)).toEqual([
        "watchlist",
        "watching",
        "caught_up",
        "finished",
        "abandoned",
      ]);
    });
  });

  it("names the episode that is up next", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx, reader, {
        episodes: [
          { seasonNo: 1, episodeNo: 1, name: "Half Loop" },
          { seasonNo: 1, episodeNo: 2, name: "Hands" },
        ],
      });
      await markWatched(tx, show, 0);

      const [row] = await listLibraryEntries(reader, tx);

      expect(row.upNext).toEqual({ episodeName: "Hands" });
    });
  });

  it("separates nothing-is-next from a next episode TMDB has not named", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Nothing after the last watch: there is no second episode mirrored.
      const nothingNext = await seedShow(tx, reader, {
        name: "A Nothing next",
        inProduction: false,
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await markWatched(tx, nothingNext, 0);

      // Something is next and it has no name. The cell may not fall back to `S1 E2`
      // alone (#4), so these two cases may never arrive as the same value.
      const unnamedNext = await seedShow(tx, reader, {
        name: "B Unnamed next",
        episodes: [
          { seasonNo: 1, episodeNo: 1, name: "Pilot" },
          { seasonNo: 1, episodeNo: 2, name: null },
        ],
      });
      await markWatched(tx, unnamedNext, 0);

      const rows = await listLibraryEntries(reader, tx);

      expect(rows[0].upNext).toBeNull();
      expect(rows[1].upNext).toEqual({ episodeName: null });
    });
  });

  it("has nothing up next for a title you have not started", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { episodes: [{ seasonNo: 1, episodeNo: 1 }] });

      const [row] = await listLibraryEntries(reader, tx);

      expect(row.upNext).toBeNull();
    });
  });

  it("has nothing up next for a film", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const film = await seedFilm(tx, reader);
      await markFilmWatched(tx, film);

      const [row] = await listLibraryEntries(reader, tx);

      expect(row.state).toBe("finished");
      expect(row.upNext).toBeNull();
    });
  });

  it("orders by title A-Z whatever the case, and never reshuffles a tie", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedShow(tx, reader, { name: "banshees" });
      await seedShow(tx, reader, { name: "Andor" });
      await seedShow(tx, reader, { name: "Chernobyl" });
      const firstTie = await seedShow(tx, reader, { name: "Dark" });
      const secondTie = await seedShow(tx, reader, { name: "Dark" });

      const once = await listLibraryEntries(reader, tx);
      const again = await listLibraryEntries(reader, tx);

      expect(once.map((row) => row.name)).toEqual([
        "Andor",
        "banshees",
        "Chernobyl",
        "Dark",
        "Dark",
      ]);
      // Two identical names must land in the same order on every load, or the grid
      // reshuffles under a reader between two loads that read the same rows.
      expect(once.map((row) => row.libraryEntryId)).toEqual(
        again.map((row) => row.libraryEntryId),
      );
      expect(
        once
          .slice(3)
          .map((row) => row.libraryEntryId)
          .sort(),
      ).toEqual([firstTie.entryId, secondTie.entryId].sort());
    });
  });

  it("refuses a state the view does not define rather than rendering it", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader);

      // The harness rolls DDL back with everything else, so this view lives for one test.
      // A state nothing can render is a broken read, not a cell with a blank label.
      await tx.execute(sql`
        create or replace view library_entry_state as
        select le.id as library_entry_id, le.user_id as user_id,
               le.title_id as title_id, 'martian'::text as state
        from library_entry le
      `);

      await expect(listLibraryEntries(reader, tx)).rejects.toThrow(/martian/);
    });
  });
});
