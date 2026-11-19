import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  asUserId,
  listLibrarySection,
  listLibrarySections,
  type LibraryEntryRow,
  type LibrarySectionEntry,
  type LibraryState,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { LIBRARY_SECTIONS, type LibrarySection } from "@/db/library-section";
import type { LibrarySort } from "@/db/library-sort";
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
 * The row a Library cell is built from (issue #56), read through the section reads that
 * #541 and #552 put behind the Library (`listLibrarySection`, `listLibrarySections`).
 * `tests/library-sections.test.ts` holds which section an entry is in and the section
 * orders; this file holds what is on the row, and the sort control's four orders.
 *
 * ── Why the query is what gets tested ────────────────────────────────────────────────
 *
 * The grid itself is a server component with no branch in it a test could reach:
 * `vitest.config.mts` includes `tests/**` on the `node` environment, so there is no
 * renderer here, and adding one to assert on a class name would be a second harness
 * checking the wrong half. What is worth checking is everything the cell is built out of
 * — whose rows arrive, which of the five states each entry is in, what is next in it, and
 * in what order — and all of that is these reads.
 *
 * ── The two that would not fail loudly ───────────────────────────────────────────────
 *
 * **Isolation**, because a missing `user_id` predicate returns *more* rows rather than an
 * error, and a library that quietly contains somebody else's shows looks exactly like a
 * library. And **the empty answer**, because `[]` here has to mean the query succeeded
 * and found nothing. A failure arrives as a throw, which is why there is
 * no `try` anywhere in the reads and no assertion here that a failure returns a list.
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

/** Every entry in the account, whichever section holds it, by name — so a test about one
 *  row's facts reads the row without caring which of the nine sections it landed in. */
async function readAll(tx: Transaction, userId: UserId): Promise<LibrarySectionEntry[]> {
  const sections = await Promise.all(
    LIBRARY_SECTIONS.map((section) => listLibrarySection(userId, section, null, tx)),
  );
  return sections.flat().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const SHOW = (slug: Extract<LibrarySection, { kind: "show" }>["slug"]): LibrarySection => ({
  kind: "show",
  slug,
});

async function namesIn(
  tx: Transaction,
  userId: UserId,
  section: LibrarySection,
  sort: LibrarySort,
): Promise<string[]> {
  return (await listLibrarySection(userId, section, sort, tx)).map((row) => row.name);
}

describe("the Library section reads' row", () => {
  it("returns this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");

      const mine = await seedShow(tx, reader, { name: "Mine" });
      await seedShow(tx, stranger, { name: "Theirs" });

      const rows = await readAll(tx, reader);

      expect(rows.map((row) => row.name)).toEqual(["Mine"]);
      expect(rows[0].libraryEntryId).toBe(mine.entryId);
    });
  });

  it("answers an account with no entries with an empty list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      // Somebody else's library is full; this one is genuinely empty.
      await seedShow(tx, await seedUser(tx, "stranger"));

      expect(await readAll(tx, reader)).toEqual([]);
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

      const [row] = await readAll(tx, reader);

      expect(row.name).toBe("Severance");
      expect(row.releaseYear).toBe(2022);
      expect(row.posterPath).toBe("/severance.jpg");
    });
  });

  it("carries a title TMDB has neither dated nor illustrated", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { releaseYear: null, posterPath: null });

      const [row] = await readAll(tx, reader);

      expect(row.releaseYear).toBeNull();
      expect(row.posterPath).toBeNull();
    });
  });

  it("gives every entry one of the five states", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedShow(tx, reader, {
        name: "A Not started",
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
        name: "C Waiting",
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

      const rows = await readAll(tx, reader);

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

      const [row] = await readAll(tx, reader);

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

      const rows = await readAll(tx, reader);

      expect(rows[0].upNext).toBeNull();
      expect(rows[1].upNext).toEqual({ episodeName: null, seasonNo: 1, episodeNo: 2 });
    });
  });

  it("has nothing up next for a title you have not started", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { episodes: [{ seasonNo: 1, episodeNo: 1 }] });

      const [row] = await readAll(tx, reader);

      expect(row.upNext).toBeNull();
    });
  });

  it("has nothing up next for a film", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const film = await seedFilm(tx, reader);
      await markFilmWatched(tx, film);

      const [row] = await readAll(tx, reader);

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

      const [row] = await readAll(tx, reader);

      // Three released episodes, not four: the unreleased fourth counts toward neither
      // number, which is `libraryProgressFraction`'s whole reason for existing.
      expect(row.progress).toEqual({ watched: 2, released: 3 });
    });
  });

  it("carries no progress for a film", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedFilm(tx, reader);

      const [row] = await readAll(tx, reader);

      expect(row.progress).toBeNull();
    });
  });

  it("carries a real zero, not an absence, for a show with nothing released yet", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, {
        episodes: [{ seasonNo: 1, episodeNo: 1, airDate: UNRELEASED }],
      });

      const [row] = await readAll(tx, reader);

      // Not null: a film is the only case that reads as no progress at all
      // (`db/access.ts`'s own docblock). This show gets a real `{ watched: 0, released:
      // 0 }`, which is what lets `libraryProgressFraction` tell the two apart.
      expect(row.progress).toEqual({ watched: 0, released: 0 });
    });
  });

  it("issues the same queries whether the account holds one entry or many", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedShow(tx, reader, { name: "A", episodes: [{ seasonNo: 1, episodeNo: 1 }] });

      const selectSpy = vi.spyOn(tx, "select");
      const one = await listLibrarySections(reader, tx);
      const queriesForOne = selectSpy.mock.calls.length;
      selectSpy.mockClear();

      await seedShow(tx, reader, { name: "B", episodes: [{ seasonNo: 1, episodeNo: 1 }] });
      await seedFilm(tx, reader, { name: "C" });
      await seedFilm(tx, reader, { name: "D" });
      const many = await listLibrarySections(reader, tx);

      // One statement per section, whatever the section holds: the counts a bar per card
      // needs come from the join, not from a query per row.
      expect(one.reduce((total, section) => total + section.count, 0)).toBe(1);
      expect(many.reduce((total, section) => total + section.count, 0)).toBe(4);
      expect(queriesForOne).toBe(LIBRARY_SECTIONS.length);
      expect(selectSpy).toHaveBeenCalledTimes(LIBRARY_SECTIONS.length);
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

      const once = await listLibrarySection(reader, SHOW("not-started"), "title", tx);
      const again = await listLibrarySection(reader, SHOW("not-started"), "title", tx);

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
});

/**
 * The other three of the four settled orders (#22, #57), as the sort control applies them to
 * one section's grid (`listLibrarySection`'s `sort`). Title A-Z's own ordering and its tie
 * live above. Every test here reads one section, because that is the only place a sort is
 * applied: it replaces that section's own order.
 *
 * Each order gets the same shape of proof: the order itself, and the one rule that would
 * fail *silently* if it regressed — a reshuffle nobody would notice without loading the
 * page twice, or a naive ascending sort that opens on the titles that are actually done.
 */
describe("the sort control's orders within a section", () => {
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

      const once = await listLibrarySection(reader, SHOW("not-started"), "recently-added", tx);
      const again = await listLibrarySection(reader, SHOW("not-started"), "recently-added", tx);

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

      // All shows, so all in Not started: a sort applies inside one section.
      await seedShow(tx, reader, { name: "New Show", releaseYear: 2024 });
      await seedShow(tx, reader, { name: "Mid Show", releaseYear: 2020 });
      await seedShow(tx, reader, { name: "Old Show", releaseYear: 2010 });
      // Named so the alphabetical tiebreak and the insertion order disagree — a pass
      // here cannot be an accident of the order these were seeded in.
      await seedShow(tx, reader, { name: "Bravo Undated", releaseYear: null });
      await seedShow(tx, reader, { name: "Alpha Undated", releaseYear: null });

      expect(await namesIn(tx, reader, SHOW("not-started"), "release-year")).toEqual([
        "New Show",
        "Mid Show",
        "Old Show",
        "Alpha Undated",
        "Bravo Undated",
      ]);
    });
  });

  it(
    "orders closest to finishing ascending, and sinks the finished to the bottom " +
      "rather than opening on them",
    async () => {
      await inTransaction(async (tx) => {
        const reader = await seedUser(tx, "reader");
        // A sort applies inside one section, and Dropped is the one section that holds
        // shows at every remaining count, finished or not, so every show here is dropped.
        const abandonedAt = new Date();
        const four = [1, 2, 3, 4].map((episodeNo) => ({ seasonNo: 1, episodeNo }));

        const almostThere = await seedShow(tx, reader, {
          name: "Almost There",
          abandonedAt,
          episodes: four,
        });
        await markWatched(tx, almostThere, 0);
        await markWatched(tx, almostThere, 1);
        await markWatched(tx, almostThere, 2); // 1 left.

        const halfway = await seedShow(tx, reader, { name: "Halfway", abandonedAt, episodes: four });
        await markWatched(tx, halfway, 0);
        await markWatched(tx, halfway, 1); // 2 left.

        const justStarted = await seedShow(tx, reader, {
          name: "Just Started",
          abandonedAt,
          episodes: four,
        });
        await markWatched(tx, justStarted, 0); // 3 left.

        // Two shows with nothing left, named against insertion order — same purpose as
        // the release-year test's undated pair.
        const bravoFinished = await seedShow(tx, reader, {
          name: "Bravo Finished",
          abandonedAt,
          inProduction: false,
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });
        await markWatched(tx, bravoFinished, 0);

        const alphaFinished = await seedShow(tx, reader, {
          name: "Alpha Finished",
          abandonedAt,
          inProduction: false,
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });
        await markWatched(tx, alphaFinished, 0);

        expect(await namesIn(tx, reader, SHOW("dropped"), "closest-to-finishing")).toEqual([
          "Almost There",
          "Halfway",
          "Just Started",
          // The naive ascending read of `remaining` would put these two first, not
          // last, because 0 is the smallest value it sees (#22's own example of the
          // bug). Tied at 0, so Title A-Z decides between them.
          "Alpha Finished",
          "Bravo Finished",
        ]);
      });
    },
  );

  it("counts an unaired episode as remaining, so a show with one is not swept in with the finished", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const abandonedAt = new Date();

      // Every *released* episode watched, one more not yet aired — and per amendment 3
      // still one remaining episode, because closest-to-finishing asks how much of the
      // whole series is left, not how much of it airs today.
      const unaired = await seedShow(tx, reader, {
        name: "Has One Unaired",
        abandonedAt,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, airDate: UNRELEASED },
        ],
      });
      await markWatched(tx, unaired, 0);

      // Named so that A-Z would put it first: the order below is the remaining count's.
      const finished = await seedShow(tx, reader, {
        name: "Actually Finished",
        abandonedAt,
        inProduction: false,
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await markWatched(tx, finished, 0);

      // If the unaired episode were ignored, both would read as 0 remaining and A-Z
      // would put "Actually Finished" first.
      expect(await namesIn(tx, reader, SHOW("dropped"), "closest-to-finishing")).toEqual([
        "Has One Unaired",
        "Actually Finished",
      ]);
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
