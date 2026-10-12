import { sql } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  asUserId,
  listLibraryEntries,
  type LibraryEntryRow,
  type LibraryState,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import type { TitleKind } from "@/tmdb/mirror";
import { LibraryEntryCell } from "@/app/(signed-in)/library/library-entry-cell";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `selectable-entry.tsx` wraps every cell's button in `useRouter()`, which throws outside
 * a mounted Next.js app router — `tests/library-surface.test.ts`'s own stub, needed here
 * too now that this file renders `LibraryEntryCell` rather than only querying for it.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

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
 * and found nothing. A failure arrives as a throw, which is why there is
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
  /** `undefined` leaves `library_entry.added_at` on its own `default now()`. */
  addedAt?: Date;
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
    .values({
      userId,
      titleId: row.id,
      abandonedAt: spec.abandonedAt,
      addedAt: spec.addedAt,
    })
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
  spec: { name?: string; releaseYear?: number | null; addedAt?: Date } = {},
): Promise<Film> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "film",
      tmdbId: number,
      name: spec.name ?? `Film ${number}`,
      releaseYear: "releaseYear" in spec ? spec.releaseYear : 2019,
      runtimeMins: 104,
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, addedAt: spec.addedAt })
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

      const rows = await listLibraryEntries(reader, "title", tx);

      expect(rows.map((row) => row.name)).toEqual(["Mine"]);
      expect(rows[0].libraryEntryId).toBe(mine.entryId);
    });
  });

  it("answers an account with no entries with an empty list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      // Somebody else's library is full; this one is genuinely empty.
      await seedShow(tx, await seedUser(tx, "stranger"));

      expect(await listLibraryEntries(reader, "title", tx)).toEqual([]);
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

      const [row] = await listLibraryEntries(reader, "title", tx);

      expect(row.name).toBe("Severance");
      expect(row.releaseYear).toBe(2022);
      expect(row.posterPath).toBe("/severance.jpg");
    });
  });

  it("carries a title TMDB has neither dated nor illustrated", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { releaseYear: null, posterPath: null });

      const [row] = await listLibraryEntries(reader, "title", tx);

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

      const rows = await listLibraryEntries(reader, "title", tx);

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

      const [row] = await listLibraryEntries(reader, "title", tx);

      expect(row.upNext).toEqual({ episodeName: "Hands", seasonNo: 1, episodeNo: 2 });
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

      // Something is next and it has no name. The cell's state line reads `S1 E2 up next`
      // for it (issue #402), so these two cases may never arrive as the same value.
      const unnamedNext = await seedShow(tx, reader, {
        name: "B Unnamed next",
        episodes: [
          { seasonNo: 1, episodeNo: 1, name: "Pilot" },
          { seasonNo: 1, episodeNo: 2, name: null },
        ],
      });
      await markWatched(tx, unnamedNext, 0);

      const rows = await listLibraryEntries(reader, "title", tx);

      expect(rows[0].upNext).toBeNull();
      expect(rows[1].upNext).toEqual({ episodeName: null, seasonNo: 1, episodeNo: 2 });
    });
  });

  it("has nothing up next for a title you have not started", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { episodes: [{ seasonNo: 1, episodeNo: 1 }] });

      const [row] = await listLibraryEntries(reader, "title", tx);

      expect(row.upNext).toBeNull();
    });
  });

  it("has nothing up next for a film", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const film = await seedFilm(tx, reader);
      await markFilmWatched(tx, film);

      const [row] = await listLibraryEntries(reader, "title", tx);

      expect(row.state).toBe("finished");
      expect(row.upNext).toBeNull();
    });
  });

  /**
   * Issue #324: the two counts the library card's bar is filled from — joined here
   * rather than read per cell, and matching `library_entry_release_progress`
   * (`db/views.ts`) exactly, the same way `upNext` above matches `library_entry_up_next`.
   */
  it("carries watched and released counts for a show, counting only what has aired", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx, reader, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 }, // released, watched
          { seasonNo: 1, episodeNo: 2 }, // released, watched
          { seasonNo: 1, episodeNo: 3 }, // released, not watched
          { seasonNo: 1, episodeNo: 4, airDate: UNRELEASED }, // unreleased
        ],
      });
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 1);

      const [row] = await listLibraryEntries(reader, "title", tx);

      // Three released episodes, not four: the unreleased fourth counts toward neither
      // number, which is `libraryProgressFraction`'s whole reason for existing.
      expect(row.progress).toEqual({ watched: 2, released: 3 });
    });
  });

  it("carries no progress for a film", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedFilm(tx, reader);

      const [row] = await listLibraryEntries(reader, "title", tx);

      expect(row.progress).toBeNull();
    });
  });

  it("carries a real zero, not an absence, for a show with nothing released yet", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, {
        episodes: [{ seasonNo: 1, episodeNo: 1, airDate: UNRELEASED }],
      });

      const [row] = await listLibraryEntries(reader, "title", tx);

      // Not null: a film is the only case that reads as no progress at all
      // (`db/access.ts`'s own docblock). This show gets a real `{ watched: 0, released:
      // 0 }`, which is what lets `libraryProgressFraction` tell the two apart.
      expect(row.progress).toEqual({ watched: 0, released: 0 });
    });
  });

  it("issues one query whether the account holds one entry or many", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { name: "A", episodes: [{ seasonNo: 1, episodeNo: 1 }] });
      await seedShow(tx, reader, { name: "B", episodes: [{ seasonNo: 1, episodeNo: 1 }] });
      await seedFilm(tx, reader, { name: "C" });
      await seedFilm(tx, reader, { name: "D" });

      const selectSpy = vi.spyOn(tx, "select");
      const rows = await listLibraryEntries(reader, "title", tx);

      // Four entries and one statement: the counts a bar per card needs come from the
      // join this test proves is still the only one, not from a query per row.
      expect(rows).toHaveLength(4);
      expect(selectSpy).toHaveBeenCalledTimes(1);
      selectSpy.mockRestore();
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

      const once = await listLibraryEntries(reader, "title", tx);
      const again = await listLibraryEntries(reader, "title", tx);

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

      await expect(listLibraryEntries(reader, "title", tx)).rejects.toThrow(/martian/);
    });
  });
});

/**
 * The other three of the four settled orders (#22, #57). Title A-Z's own
 * ordering and its tie already live above, because it is the query's default and was
 * `listLibraryEntries`'s whole `ORDER BY` before this ticket.
 *
 * Each order gets the same shape of proof: the order itself, and the one rule that would
 * fail *silently* if it regressed — a reshuffle nobody would notice without loading the
 * page twice, or a naive ascending sort that opens on the titles that are actually done.
 */
describe("listLibraryEntries sort orders", () => {
  it("orders recently added newest first, and breaks a many-way tie by title", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      // The production shape this rule exists for: 457 titles land on one `added_at`
      // after import, because it is the timestamp the import run wrote, not a real date.
      const importRun = new Date("2026-01-01T00:00:00Z");

      await seedShow(tx, reader, {
        name: "Newest",
        addedAt: new Date("2026-03-01T00:00:00Z"),
      });
      await seedShow(tx, reader, { name: "Bravo Tie", addedAt: importRun });
      await seedShow(tx, reader, { name: "Alpha Tie", addedAt: importRun });
      await seedShow(tx, reader, {
        name: "Oldest",
        addedAt: new Date("2025-01-01T00:00:00Z"),
      });

      const once = await listLibraryEntries(reader, "recently-added", tx);
      const again = await listLibraryEntries(reader, "recently-added", tx);

      expect(once.map((row) => row.name)).toEqual([
        "Newest",
        "Alpha Tie",
        "Bravo Tie",
        "Oldest",
      ]);
      // Without the tiebreak, two loads of the same import run are free to answer this
      // pair in either order — which is exactly the reshuffle #22 measured.
      expect(once.map((row) => row.libraryEntryId)).toEqual(
        again.map((row) => row.libraryEntryId),
      );
    });
  });

  it("orders release year newest first, and sinks an undated title to the bottom", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedShow(tx, reader, { name: "New Show", releaseYear: 2024 });
      await seedFilm(tx, reader, { name: "Mid Film", releaseYear: 2020 });
      await seedShow(tx, reader, { name: "Old Show", releaseYear: 2010 });
      // Named so the alphabetical tiebreak and the insertion order disagree — a pass
      // here cannot be an accident of the order these were seeded in.
      await seedFilm(tx, reader, { name: "Alpha Undated", releaseYear: null });
      await seedShow(tx, reader, { name: "Bravo Undated", releaseYear: null });

      const rows = await listLibraryEntries(reader, "release-year", tx);

      expect(rows.map((row) => row.name)).toEqual([
        "New Show",
        "Mid Film",
        "Old Show",
        "Alpha Undated",
        "Bravo Undated",
      ]);
    });
  });

  it(
    "orders closest to finishing ascending, and sinks both the finished and the " +
      "not-applicable to the bottom rather than opening on them",
    async () => {
      await inTransaction(async (tx) => {
        const reader = await seedUser(tx, "reader");

        const almostThere = await seedShow(tx, reader, {
          name: "Almost There",
          episodes: [1, 2, 3, 4].map((episodeNo) => ({ seasonNo: 1, episodeNo })),
        });
        await markWatched(tx, almostThere, 0);
        await markWatched(tx, almostThere, 1);
        await markWatched(tx, almostThere, 2); // 1 left.

        const halfway = await seedShow(tx, reader, {
          name: "Halfway",
          episodes: [1, 2, 3, 4].map((episodeNo) => ({ seasonNo: 1, episodeNo })),
        });
        await markWatched(tx, halfway, 0);
        await markWatched(tx, halfway, 1); // 2 left.

        const justStarted = await seedShow(tx, reader, {
          name: "Just Started",
          episodes: [1, 2, 3, 4].map((episodeNo) => ({ seasonNo: 1, episodeNo })),
        });
        await markWatched(tx, justStarted, 0); // 3 left.

        // Two genuinely finished shows, named against insertion order — same purpose as
        // the release-year test's undated pair — and a film, which has no episodes and
        // so no row in `library_entry_remaining` at all.
        const bravoFinished = await seedShow(tx, reader, {
          name: "Bravo Finished",
          inProduction: false,
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });
        await markWatched(tx, bravoFinished, 0);

        const alphaFinished = await seedShow(tx, reader, {
          name: "Alpha Finished",
          inProduction: false,
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });
        await markWatched(tx, alphaFinished, 0);

        await seedFilm(tx, reader, { name: "Zulu Movie" });

        const rows = await listLibraryEntries(reader, "closest-to-finishing", tx);

        expect(rows.map((row) => row.name)).toEqual([
          "Almost There",
          "Halfway",
          "Just Started",
          // The naive ascending read of `remaining` would put these two first, not
          // last, because 0 is the smallest value it sees (#22's own example of the
          // bug). Tied at 0, so Title A-Z decides between them.
          "Alpha Finished",
          "Bravo Finished",
          // A film is `remaining IS NULL` — a different bottom case from a real 0 —
          // and sorts after both finished shows rather than interleaving with them.
          "Zulu Movie",
        ]);
      });
    },
  );

  it("counts a caught-up show's unaired episodes, so it is not swept in with the finished", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Every *released* episode watched, one more not yet aired — caught up, and per
      // amendment 3 still one remaining episode, because closest-to-finishing
      // asks how much of the whole series is left, not how much of it airs today.
      const caughtUp = await seedShow(tx, reader, {
        name: "Caught Up",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, airDate: UNRELEASED },
        ],
      });
      await markWatched(tx, caughtUp, 0);

      const finished = await seedShow(tx, reader, {
        name: "Actually Finished",
        inProduction: false,
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await markWatched(tx, finished, 0);

      const rows = await listLibraryEntries(reader, "closest-to-finishing", tx);

      // If the unaired episode were ignored, both would read as 0 remaining and this
      // order would be a coin flip rather than a fact about the two shows.
      expect(rows.map((row) => row.name)).toEqual(["Caught Up", "Actually Finished"]);
      expect(rows[0].state).toBe("caught_up");
    });
  });
});

/**
 * The grid cell's rendered bar — issue #324's four cases. `tests/library-surface.test.ts`
 * covers everything else about `LibraryEntryCell`'s markup; this covers only what that
 * suite does not, on the same `entry()`-and-`renderToStaticMarkup` pattern it established.
 *
 * `progress-fill` is the fill and only appears when a bar is drawn at all — asserted on
 * directly, so "no bar" and "an empty bar" stay two different, checkable outcomes rather
 * than one absence a missing `style` attribute could also explain.
 */
describe("LibraryEntryCell's progress bar", () => {
  function entry(overrides: Partial<LibraryEntryRow> = {}): LibraryEntryRow {
    return {
      libraryEntryId: "entry-1",
      titleId: "title-1",
      name: "Severance",
      releaseYear: 2022,
      posterPath: "/severance.jpg",
      posterColour: null,
      kind: "show" as TitleKind,
      state: "watching" as LibraryState,
      upNext: null,
      progress: { watched: 2, released: 4 },
      ...overrides,
    };
  }

  const cell = (overrides: Partial<LibraryEntryRow> = {}) =>
    renderToStaticMarkup(
      createElement(LibraryEntryCell, { entry: entry(overrides) }),
    );

  it("draws a thin bar for a show, filled watched against released", () => {
    const markup = cell({ progress: { watched: 2, released: 4 } });

    expect(markup).toContain("progress-fill");
    expect(markup).toContain('style="transform:translateX(-50%)"');
  });

  it("draws no bar at all for a film", () => {
    const markup = cell({ kind: "film" as TitleKind, progress: null });

    expect(markup).not.toContain("progress-fill");
  });

  it("draws no bar at all for a show with nothing released — not an empty one", () => {
    const markup = cell({ progress: { watched: 0, released: 0 } });

    expect(markup).not.toContain("progress-fill");
  });

  it("draws an empty bar for a show with something released and nothing watched", () => {
    const markup = cell({ progress: { watched: 0, released: 4 } });

    // The bar is present — not the same absence as nothing released — sitting at 0%.
    expect(markup).toContain("progress-fill");
    expect(markup).toContain('style="transform:translateX(-100%)"');
  });

  it("never prints a numeral on or beside the bar, whichever case draws it", () => {
    for (const progress of [
      { watched: 2, released: 4 },
      { watched: 0, released: 4 },
    ] as const) {
      // `upNext: null`, so the state line reads *Watching* — the numbers *S1 E2 up next*
      // carries belong to the line, not to the bar, and are covered in
      // `tests/library-surface.test.ts`.
      const markup = cell({ progress });
      // A digit rendered as text sits between a `>` and a `<`; the width percentage
      // lives inside a `style="…"` attribute instead, which this does not match.
      expect(markup).not.toMatch(/>[^<]*\d[^<]*</);
    }
  });
});
