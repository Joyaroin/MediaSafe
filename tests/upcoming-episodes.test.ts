import { describe, expect, it } from "vitest";

import { asUserId, listUpcomingEpisodes, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * **What Upcoming reads** — issue #251, against a real seeded database.
 *
 * The membership rule is the thing worth asserting here, because getting it wrong is
 * silent in both directions: too wide and the page announces episodes of shows the reader
 * has never started, too narrow and a show they are in the middle of simply is not there.
 * Nothing throws either way and every row on screen looks correct. `tests/up-next.test.ts`
 * is the prior art and makes the same argument about the rails' own memberships.
 *
 * The cases seeded are the ones the parent ticket names as the ones that make a screen
 * lie: a show with no future episodes, an episode with no still, an episode TMDB has not
 * named, and a show in each of the five states.
 *
 * **The grouping is not here and must not be.** What day a row falls under is
 * `upcoming-grouping.ts`'s, driven directly in `tests/upcoming-grouping.test.ts` across a
 * real timezone boundary. This file asks only what the database returns.
 */

setUpTestDatabase("mediasafe_upcoming_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);
const FUTURE = daysFromToday(5);

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
  airDate?: string | null;
  stillPath?: string | null;
  watched?: boolean;
}

interface Seeded {
  entryId: string;
  titleId: string;
  episodeIds: string[];
}

/**
 * One show, its episodes, and a watch on each episode marked `watched` — which is all
 * `library_entry_state` needs to derive where the title stands. The state is never
 * inserted, because it is a view and there is nothing to insert.
 */
async function seedShow(
  tx: Transaction,
  userId: UserId,
  spec: {
    name?: string;
    kind?: "show" | "film";
    inProduction?: boolean;
    abandonedAt?: Date;
    episodes: EpisodeSpec[];
  },
): Promise<Seeded> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: spec.kind ?? "show",
      tmdbId: number,
      name: spec.name ?? `Show ${number}`,
      releaseYear: 2022,
      inProduction: spec.inProduction ?? true,
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, abandonedAt: spec.abandonedAt })
    .returning({ id: libraryEntry.id });

  const episodeIds: string[] = [];
  for (const one of spec.episodes) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: one.seasonNo,
        episodeNo: one.episodeNo,
        name: "name" in one ? one.name : `Episode ${one.seasonNo}-${one.episodeNo}`,
        airDate: one.airDate === undefined ? RELEASED : one.airDate,
        stillPath: "stillPath" in one ? one.stillPath : null,
      })
      .returning({ id: episode.id });
    episodeIds.push(inserted.id);

    if (one.watched) {
      await tx.insert(watch).values({
        userId,
        libraryEntryId: entry.id,
        titleId: row.id,
        episodeId: inserted.id,
        watchedAt: new Date(),
        source: "app",
        sourceKey: `test-${nextNumber()}`,
      });
    }
  }

  return { entryId: entry.id, titleId: row.id, episodeIds };
}

/** *Watching*: a released episode left unwatched, and a dated one still to come. */
function watchingWithFutureEpisode(name: string, airDate = FUTURE) {
  return {
    name,
    episodes: [
      { seasonNo: 1, episodeNo: 1, watched: true },
      { seasonNo: 1, episodeNo: 2 },
      { seasonNo: 1, episodeNo: 3, airDate },
    ] satisfies EpisodeSpec[],
  };
}

/** *Caught up*: every released episode watched, and a dated one still to come. */
function caughtUpWithFutureEpisode(name: string, airDate = FUTURE) {
  return {
    name,
    episodes: [
      { seasonNo: 1, episodeNo: 1, watched: true },
      { seasonNo: 1, episodeNo: 2, watched: true },
      { seasonNo: 1, episodeNo: 3, airDate },
    ] satisfies EpisodeSpec[],
  };
}

describe("the membership: watching or caught up, and nothing else", () => {
  it("lists a future episode of a show being watched", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "watching");
      await seedShow(tx, userId, watchingWithFutureEpisode("Severance"));

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows.map((row) => row.titleName)).toEqual(["Severance"]);
      expect(rows[0].airDate).toBe(FUTURE);
    });
  });

  it("lists a future episode of a show that is caught up", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "caught-up");
      await seedShow(tx, userId, caughtUpWithFutureEpisode("Shogun"));

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows.map((row) => row.titleName)).toEqual(["Shogun"]);
    });
  });

  /**
   * The narrowing this ticket makes, and the one the glossary was amended for. A title on
   * the watchlist has a dated episode coming exactly as a watching one does — the older
   * definition (*shows you have not abandoned*) would have listed it, and *what is coming
   * that I am waiting for* is not a question about a show never started.
   */
  it("leaves out a show on the watchlist", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "watchlist");
      await seedShow(tx, userId, {
        name: "Never started",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, airDate: FUTURE },
        ],
      });

      expect(await listUpcomingEpisodes(userId, tx)).toEqual([]);
    });
  });

  it("leaves out an abandoned show", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "abandoned");
      await seedShow(tx, userId, {
        ...watchingWithFutureEpisode("Dropped"),
        abandonedAt: new Date(),
      });

      expect(await listUpcomingEpisodes(userId, tx)).toEqual([]);
    });
  });

  /** A finished show is one that has ended and been watched to the end, so a future
   *  episode of it is a contradiction the state itself resolves — a show with one coming
   *  back is not finished. Seeded as finished for completeness, and it has none. */
  it("leaves out a finished show", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "finished");
      await seedShow(tx, userId, {
        name: "Over",
        inProduction: false,
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2, watched: true },
        ],
      });

      expect(await listUpcomingEpisodes(userId, tx)).toEqual([]);
    });
  });

  it("leaves out another account's show entirely", async () => {
    await inTransaction(async (tx) => {
      const mine = await seedUser(tx, "mine");
      const yours = await seedUser(tx, "yours");
      await seedShow(tx, yours, watchingWithFutureEpisode("Yours"));

      expect(await listUpcomingEpisodes(mine, tx)).toEqual([]);
    });
  });
});

describe("which episodes are upcoming", () => {
  /** The screen's whole premise: what has already aired is on the next-episodes rail, and
   *  putting it here too would be two surfaces answering *what can I watch now*. */
  it("leaves out episodes that have already aired", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "aired");
      await seedShow(tx, userId, watchingWithFutureEpisode("Severance"));

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows).toHaveLength(1);
      expect(rows[0].episodeNo).toBe(3);
    });
  });

  /**
   * The window is one day wider than the server's own, because no zone on earth is more
   * than a day from UTC — the reader in Honolulu for whom the server's yesterday is still
   * this evening is exactly who a bare `>= current_date` shows an empty *Today* to.
   * `upcoming-grouping.ts` is what narrows it back, in the reader's own zone.
   */
  it("reads one day earlier than the server's own day, so no zone is cut off", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "window");
      await seedShow(tx, userId, {
        name: "Wide",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3, airDate: daysFromToday(-1) },
          { seasonNo: 1, episodeNo: 4, airDate: daysFromToday(-2) },
        ],
      });

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows.map((row) => row.airDate)).toEqual([daysFromToday(-1)]);
    });
  });

  /** An undated episode is not upcoming: *upcoming* is a statement about a date, and an
   *  announced-but-undated episode has nothing to be grouped under. */
  it("leaves out an episode TMDB has not dated", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "undated");
      await seedShow(tx, userId, {
        name: "Undated",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3, airDate: null },
        ],
      });

      expect(await listUpcomingEpisodes(userId, tx)).toEqual([]);
    });
  });

  /** `season_no > 0` is `db/views.ts`'s own domain for *released*, kept so that *upcoming*
   *  is the exact complement of it rather than a second, wider idea of an episode. */
  it("leaves out a special", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "special");
      await seedShow(tx, userId, {
        name: "Specials",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 0, episodeNo: 1, airDate: FUTURE },
        ],
      });

      expect(await listUpcomingEpisodes(userId, tx)).toEqual([]);
    });
  });

  /** A show with nothing coming contributes nothing, rather than a row with no date —
   *  the case that would otherwise put an empty group on the screen. */
  it("returns nothing for a show with no future episodes", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "none-coming");
      await seedShow(tx, userId, {
        name: "Nothing coming",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });

      expect(await listUpcomingEpisodes(userId, tx)).toEqual([]);
    });
  });

  /** Every future episode, not only the next one. The page groups by day, so a show with
   *  three announced dates is three rows across three headings. */
  it("lists every future episode of one show", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "several");
      await seedShow(tx, userId, {
        name: "Weekly",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3, airDate: daysFromToday(1) },
          { seasonNo: 1, episodeNo: 4, airDate: daysFromToday(8) },
          { seasonNo: 1, episodeNo: 5, airDate: daysFromToday(15) },
        ],
      });

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows.map((row) => row.episodeNo)).toEqual([3, 4, 5]);
    });
  });
});

describe("what a row carries", () => {
  it("carries the poster, the still, the name and the entry the row navigates through", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "row");
      const seeded = await seedShow(tx, userId, {
        name: "The Bear",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
          {
            seasonNo: 2,
            episodeNo: 4,
            name: "Doors",
            airDate: FUTURE,
            stillPath: "/still.jpg",
          },
        ],
      });

      const [row] = await listUpcomingEpisodes(userId, tx);

      expect(row).toEqual({
        episodeId: seeded.episodeIds[2],
        libraryEntryId: seeded.entryId,
        titleName: "The Bear",
        seasonNo: 2,
        episodeNo: 4,
        episodeName: "Doors",
        /**
         * The **show's** poster, which is what the row draws.
         *
         * Every episode on this surface is unaired, and TMDB nearly always has no still
         * for an episode nobody has seen — so the row was drawing an empty frame on every
         * row of the list. `title` was already joined here for the name; this is the
         * column that gives the row a picture in the case that is the only case.
         *
         * `null` here because `seedShow` sets no poster. What matters is that the field is
         * read from `title` and reaches the surface, not what this fixture happens to hold.
         */
        posterPath: null,
        // Still on the type and still read: a real fact about the episode, for the day
        // TMDB publishes stills ahead of air. The upcoming row no longer draws it.
        stillPath: "/still.jpg",
        airDate: FUTURE,
      });
    });
  });

  /** An episode TMDB has announced without naming, and one with no frame. Both are
   *  ordinary and both must reach the surface, which holds the row's shape rather than
   *  collapsing it — #245's user story 48. */
  it("carries nulls for a nameless episode with no still", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "bare");
      await seedShow(tx, userId, {
        name: "Bare",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3, name: null, airDate: FUTURE },
        ],
      });

      const [row] = await listUpcomingEpisodes(userId, tx);

      expect(row.episodeName).toBeNull();
      expect(row.stillPath).toBeNull();
    });
  });
});

describe("the order", () => {
  /** By date first, because the page is a calendar and the groups come out of this order.
   *  Get it wrong and the groups arrive interleaved — which the grouping module would
   *  faithfully render as two *Today* headings with something else between them. */
  it("is by air date, soonest first", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "order");
      await seedShow(tx, userId, watchingWithFutureEpisode("Later", daysFromToday(9)));
      await seedShow(tx, userId, watchingWithFutureEpisode("Sooner", daysFromToday(2)));

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows.map((row) => row.titleName)).toEqual(["Sooner", "Later"]);
    });
  });

  /** Two shows on one day are ordered by name, so two loads give the same page. */
  it("breaks a shared date by title", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "tie");
      await seedShow(tx, userId, watchingWithFutureEpisode("Zulu"));
      await seedShow(tx, userId, watchingWithFutureEpisode("alpha"));

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows.map((row) => row.titleName)).toEqual(["alpha", "Zulu"]);
    });
  });

  /** A double bill of one show on one day is in broadcast order, not insertion order. */
  it("breaks a shared date and title by season and episode", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "double");
      await seedShow(tx, userId, {
        name: "Double bill",
        episodes: [
          { seasonNo: 1, episodeNo: 1, watched: true },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 2, episodeNo: 2, airDate: FUTURE },
          { seasonNo: 2, episodeNo: 1, airDate: FUTURE },
        ],
      });

      const rows = await listUpcomingEpisodes(userId, tx);

      expect(rows.map((row) => row.episodeNo)).toEqual([1, 2]);
    });
  });
});
