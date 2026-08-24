import { describe, expect, it } from "vitest";

import { accountFigures, asUserId, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * You's six figures, against a real seeded account — issue #247.
 *
 * ── What this file is really guarding ────────────────────────────────────────────────
 *
 * Not "does `count(*)` count". Two failures, and both of them render as a perfectly
 * plausible page:
 *
 *  - **Shows completed counting films.** *Finished* is a state a film reaches on its first
 *    watch (`db/views.ts`), so a count of finished library entries with no per-kind filter
 *    is *titles finished* wearing the wrong label — and on the sort of library this app is
 *    built for, mostly films, it would be wrong by a lot while looking entirely healthy.
 *  - **Shows completed re-deriving `finished`.** The rule is ADR-0001's and the view is its
 *    one home. A `where in_production = false and not exists (…)` written into
 *    `db/access.ts` would be a second copy that agrees today and drifts on the next
 *    amendment, so the assertions below fix the *behaviour* the view defines — a show still
 *    in production is not completed however much of it you have watched.
 *
 * The watch-time and count assertions used to be thinner on purpose, because
 * the Stats page's own suite held the two statements underneath against a seeded library
 * and a
 * second copy here would have been the very thing this file is about not making. **Issue
 * #249 deleted that file with the page it tested**, so the cases over `libraryTotals` that
 * were not about a figure Stats alone reported are carried down here instead — *counts the
 * titles it has watched, by kind* and *counts episode watches including specials*. They are
 * the only two of #227's that outlived it: the rest asserted the streak, the activity
 * window, the averages, the decades, the recently finished and the five state counts, all
 * of which are figures `/you` does not report and statements `db/access.ts` no longer
 * makes.
 */

setUpTestDatabase("mediasafe_you_test");

let counter = 0;
const nextNumber = () => ++counter;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function airDate(days: number): string {
  return daysAgo(days).toISOString().slice(0, 10);
}

async function seedUser(tx: Transaction): Promise<UserId> {
  const id = `you-user-${nextNumber()}`;
  await tx.insert(user).values({ id, name: id, email: `${id}@example.test`, timezone: "UTC" });
  return asUserId(id);
}

interface SeededTitle {
  titleId: string;
  episodeIds: string[];
}

async function seedTitle(
  tx: Transaction,
  {
    kind,
    runtimeMins = null,
    inProduction = null,
    episodes = 0,
    episodeRuntime = 45,
    /** Days before today the episodes aired. Every seeded episode is released by default. */
    airedDaysAgo = 30,
    /**
     * Season zero is a special, and `db/views.ts` excludes it from *remaining* and so from
     * *finished*. `episodesWatched` counts watch rows and applies no such rule, which is
     * the difference the cases below turn on — so a seed has to be able to make one.
     */
    seasonNo = 1,
  }: {
    kind: "film" | "show";
    runtimeMins?: number | null;
    inProduction?: boolean | null;
    episodes?: number;
    episodeRuntime?: number | null;
    airedDaysAgo?: number;
    seasonNo?: number;
  },
): Promise<SeededTitle> {
  const tmdbId = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind,
      tmdbId,
      name: `Title ${tmdbId}`,
      releaseYear: 2019,
      posterPath: "/poster.jpg",
      runtimeMins,
      inProduction,
    })
    .returning({ id: title.id });

  const episodeIds: string[] = [];
  for (let index = 1; index <= episodes; index += 1) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo,
        episodeNo: index,
        name: `Episode ${index}`,
        airDate: airDate(airedDaysAgo),
        runtimeMins: episodeRuntime,
      })
      .returning({ id: episode.id });
    episodeIds.push(inserted.id);
  }

  return { titleId: row.id, episodeIds };
}

async function addToLibrary(
  tx: Transaction,
  userId: UserId,
  seeded: SeededTitle,
): Promise<string> {
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: seeded.titleId })
    .returning({ id: libraryEntry.id });
  return entry.id;
}

async function recordWatch(
  tx: Transaction,
  userId: UserId,
  seeded: SeededTitle,
  entryId: string,
  { episodeId = null, watchedAt = daysAgo(1) }: { episodeId?: string | null; watchedAt?: Date | null } = {},
): Promise<void> {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: entryId,
    titleId: seeded.titleId,
    episodeId,
    watchedAt,
    source: "app",
    sourceKey: `you-${nextNumber()}`,
  });
}

/** Watch every episode of a seeded show. */
async function watchWholeShow(
  tx: Transaction,
  userId: UserId,
  seeded: SeededTitle,
  entryId: string,
): Promise<void> {
  for (const episodeId of seeded.episodeIds) {
    await recordWatch(tx, userId, seeded, entryId, { episodeId });
  }
}

/**
 * `titles`, `filmsWatched` and `showsWatched` — the three figures that say what the library
 * holds and how much of it has been started. Carried down from the Stats page's suite when
 * issue #249 deleted it; the statement underneath is `libraryTotals`, unchanged.
 */
describe("what the library holds, and how much of it has been watched", () => {
  it("counts films and shows it has watched separately, and never the unwatched", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const watchedFilm = await seedTitle(tx, { kind: "film", runtimeMins: 100 });
      const unwatchedFilm = await seedTitle(tx, { kind: "film", runtimeMins: 100 });
      const watchedShow = await seedTitle(tx, { kind: "show", episodes: 2 });
      const unwatchedShow = await seedTitle(tx, { kind: "show", episodes: 2 });

      const watchedFilmEntry = await addToLibrary(tx, userId, watchedFilm);
      await addToLibrary(tx, userId, unwatchedFilm);
      const watchedShowEntry = await addToLibrary(tx, userId, watchedShow);
      await addToLibrary(tx, userId, unwatchedShow);

      await recordWatch(tx, userId, watchedFilm, watchedFilmEntry);
      // One episode of two: **watched, not finished**. A part-watched show counts here,
      // which is the whole difference between this figure and *shows completed* above.
      await recordWatch(tx, userId, watchedShow, watchedShowEntry, {
        episodeId: watchedShow.episodeIds[0],
      });

      const figures = await accountFigures(userId, tx);

      expect(figures.titles).toBe(4);
      expect(figures.filmsWatched).toBe(1);
      expect(figures.showsWatched).toBe(1);
    });
  });

  /**
   * `episodesWatched` counts watch rows and nothing else, so a watched **special** is one
   * of them. `db/views.ts` excludes season zero from *remaining* and therefore from
   * *finished*; this figure applies no such rule and must not learn one. A pass here that
   * counted 1 would mean the aggregate had grown a `season_no > 0` of its own.
   */
  it("counts a watched special, because a special is a thing you watched", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const show = await seedTitle(tx, { kind: "show", episodes: 1 });
      const specials = await seedTitle(tx, { kind: "show", episodes: 1, seasonNo: 0 });
      const film = await seedTitle(tx, { kind: "film", runtimeMins: 90 });

      const showEntry = await addToLibrary(tx, userId, show);
      const specialsEntry = await addToLibrary(tx, userId, specials);
      const filmEntry = await addToLibrary(tx, userId, film);

      await recordWatch(tx, userId, show, showEntry, { episodeId: show.episodeIds[0] });
      await recordWatch(tx, userId, specials, specialsEntry, {
        episodeId: specials.episodeIds[0],
      });
      // The film's watch carries no episode, so it is not one of these.
      await recordWatch(tx, userId, film, filmEntry);

      const figures = await accountFigures(userId, tx);

      expect(figures.episodesWatched).toBe(2);
    });
  });

  it("counts one account's library and never another's", async () => {
    await inTransaction(async (tx) => {
      const mine = await seedUser(tx);
      const yours = await seedUser(tx);

      const film = await seedTitle(tx, { kind: "film", runtimeMins: 100 });
      const mineEntry = await addToLibrary(tx, mine, film);
      await recordWatch(tx, mine, film, mineEntry);

      const theirs = await seedTitle(tx, { kind: "film", runtimeMins: 100 });
      const yoursEntry = await addToLibrary(tx, yours, theirs);
      await recordWatch(tx, yours, theirs, yoursEntry);

      const figures = await accountFigures(mine, tx);

      expect(figures.titles).toBe(1);
      expect(figures.filmsWatched).toBe(1);
      expect(figures.watchTime.filmMinutes).toBe(100);
    });
  });
});

describe("shows completed", () => {
  it("counts a finished show and not a finished film", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      // A film with a watch is `finished` the moment it is watched — the case that makes
      // an unfiltered count of finished entries wrong.
      const film = await seedTitle(tx, { kind: "film", runtimeMins: 120 });
      const filmEntry = await addToLibrary(tx, userId, film);
      await recordWatch(tx, userId, film, filmEntry);

      // An ended show with every episode watched.
      const show = await seedTitle(tx, { kind: "show", inProduction: false, episodes: 3 });
      const showEntry = await addToLibrary(tx, userId, show);
      await watchWholeShow(tx, userId, show, showEntry);

      const figures = await accountFigures(userId, tx);

      expect(figures.showsCompleted).toBe(1);
      expect(figures.filmsWatched).toBe(1);
      expect(figures.showsWatched).toBe(1);
    });
  });

  it("does not count a show still in production, however much of it is watched", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const show = await seedTitle(tx, { kind: "show", inProduction: true, episodes: 3 });
      const entry = await addToLibrary(tx, userId, show);
      await watchWholeShow(tx, userId, show, entry);

      const figures = await accountFigures(userId, tx);

      // Caught up, not completed — `db/views.ts`'s rule, asked of the view rather than
      // restated here.
      expect(figures.showsCompleted).toBe(0);
      expect(figures.showsWatched).toBe(1);
    });
  });

  it("does not count a show with an episode left", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const show = await seedTitle(tx, { kind: "show", inProduction: false, episodes: 3 });
      const entry = await addToLibrary(tx, userId, show);
      await recordWatch(tx, userId, show, entry, { episodeId: show.episodeIds[0] });

      const figures = await accountFigures(userId, tx);

      expect(figures.showsCompleted).toBe(0);
      expect(figures.showsWatched).toBe(1);
    });
  });

  it("is zero for a library nobody has watched, rather than counting what is in it", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const show = await seedTitle(tx, { kind: "show", inProduction: false, episodes: 2 });
      await addToLibrary(tx, userId, show);

      const figures = await accountFigures(userId, tx);

      expect(figures.titles).toBe(1);
      expect(figures.showsCompleted).toBe(0);
      expect(figures.showsWatched).toBe(0);
    });
  });

  it("counts only this account's shows", async () => {
    await inTransaction(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);

      const show = await seedTitle(tx, { kind: "show", inProduction: false, episodes: 2 });
      const theirEntry = await addToLibrary(tx, theirs, show);
      await watchWholeShow(tx, theirs, show, theirEntry);

      const figures = await accountFigures(mine, tx);

      expect(figures.titles).toBe(0);
      expect(figures.showsCompleted).toBe(0);
    });
  });
});

describe("the watch times, and what they are short by", () => {
  it("keeps film and television apart, and counts the watches carrying no runtime", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const film = await seedTitle(tx, { kind: "film", runtimeMins: 120 });
      const filmEntry = await addToLibrary(tx, userId, film);
      await recordWatch(tx, userId, film, filmEntry);

      const filmWithoutRuntime = await seedTitle(tx, { kind: "film", runtimeMins: null });
      const secondEntry = await addToLibrary(tx, userId, filmWithoutRuntime);
      await recordWatch(tx, userId, filmWithoutRuntime, secondEntry);

      const show = await seedTitle(tx, {
        kind: "show",
        inProduction: false,
        episodes: 2,
        episodeRuntime: 45,
      });
      const showEntry = await addToLibrary(tx, userId, show);
      await watchWholeShow(tx, userId, show, showEntry);

      const figures = await accountFigures(userId, tx);

      expect(figures.watchTime.filmMinutes).toBe(120);
      expect(figures.watchTime.televisionMinutes).toBe(90);
      expect(figures.watchTime.watchesWithoutRuntime).toBe(1);
      expect(figures.episodesWatched).toBe(2);
    });
  });

  it("counts an undated watch in every figure, and reports how many there are", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const show = await seedTitle(tx, {
        kind: "show",
        inProduction: false,
        episodes: 2,
        episodeRuntime: 45,
      });
      const entry = await addToLibrary(tx, userId, show);
      for (const episodeId of show.episodeIds) {
        await recordWatch(tx, userId, show, entry, { episodeId, watchedAt: null });
      }

      const figures = await accountFigures(userId, tx);

      // `CONTEXT.md`, Watch time: *a watch with no date still counts: this is derived from
      // what you watched, not when.* The page's qualification line says so too, and this
      // is the half of that claim the database is responsible for.
      expect(figures.undatedWatches).toBe(2);
      expect(figures.episodesWatched).toBe(2);
      expect(figures.watchTime.televisionMinutes).toBe(90);
      expect(figures.showsCompleted).toBe(1);
    });
  });
});

describe("an empty library", () => {
  it("comes back as zeroes on a read that succeeded, which the page renders as a sentence", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const figures = await accountFigures(userId, tx);

      expect(figures).toEqual({
        titles: 0,
        filmsWatched: 0,
        showsWatched: 0,
        showsCompleted: 0,
        episodesWatched: 0,
        watchTime: { filmMinutes: 0, televisionMinutes: 0, watchesWithoutRuntime: 0 },
        undatedWatches: 0,
      });
    });
  });
});
