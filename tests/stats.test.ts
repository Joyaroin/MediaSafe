import { describe, expect, it } from "vitest";

import {
  ACTIVITY_MONTHS,
  accountStats,
  asUserId,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The Stats page's numbers, against a real seeded account — issue #227.
 *
 * Every aggregate on `/stats` is here, and so are the three shapes the ticket names as the
 * ones that break a page like this: **an empty library**, **an account whose watches are
 * entirely undated**, and **the reader's timezone**, which is a read-time lens over history
 * rather than a stamp on it (`SPEC.md` §5).
 *
 * ── What this file is really guarding ────────────────────────────────────────────────
 *
 * Not "does `count(*)` count". The failures worth catching here are the silent ones:
 *
 *  - a rule from `db/views.ts` **restated** in the aggregate and then drifting from it, so
 *    that *episodes remaining* stops agreeing with the grid the reader was just looking at;
 *  - an average or a streak that reads `0` when the honest answer is *there is nothing to
 *    average* — the same collapse `AGENTS.md` opens on, in numeric clothing;
 *  - a day boundary computed in UTC, which is invisible from a UTC test machine and wrong
 *    for every reader who is not on one.
 *
 * The last of those is why `Pacific/Honolulu` appears below rather than a zone offset by an
 * hour: a ten-hour offset makes the wrong answer differ from the right one by a whole day
 * on a fixed instant, so the assertion cannot pass by luck of when the suite ran.
 */

setUpTestDatabase("mediasafe_stats_test");

let counter = 0;
const nextNumber = () => ++counter;

/** Midnight-safe relative days. The seeded accounts are on `UTC` unless a test says
 *  otherwise, and UTC has no daylight saving, so *n days ago* is n local days ago. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** The local day an instant falls on for a reader on `UTC` — what `finishedOn` should say. */
function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function airDate(days: number): string {
  return utcDay(daysAgo(days));
}

async function seedUser(tx: Transaction, timezone = "UTC"): Promise<UserId> {
  const id = `stats-user-${nextNumber()}`;
  await tx.insert(user).values({ id, name: id, email: `${id}@example.test`, timezone });
  return asUserId(id);
}

interface EpisodeSpec {
  seasonNo: number;
  episodeNo: number;
  runtimeMins?: number | null;
  /** Days before today. Every seeded episode is released unless a test asks otherwise. */
  airedDaysAgo?: number;
}

interface SeededTitle {
  titleId: string;
  episodeIds: Record<string, string>;
}

async function seedTitle(
  tx: Transaction,
  {
    kind,
    releaseYear = 2019,
    runtimeMins = null,
    inProduction = null,
    episodes = [],
  }: {
    kind: "film" | "show";
    releaseYear?: number | null;
    runtimeMins?: number | null;
    inProduction?: boolean | null;
    episodes?: EpisodeSpec[];
  },
): Promise<SeededTitle> {
  const tmdbId = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind,
      tmdbId,
      name: `Title ${tmdbId}`,
      releaseYear,
      posterPath: "/poster.jpg",
      runtimeMins,
      inProduction,
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
        name: `Episode ${one.seasonNo}-${one.episodeNo}`,
        airDate: airDate(one.airedDaysAgo ?? 30),
        runtimeMins: one.runtimeMins ?? null,
      })
      .returning({ id: episode.id });
    episodeIds[`${one.seasonNo}-${one.episodeNo}`] = inserted.id;
  }

  return { titleId: row.id, episodeIds };
}

async function addToLibrary(
  tx: Transaction,
  userId: UserId,
  seeded: SeededTitle,
  { abandoned = false }: { abandoned?: boolean } = {},
): Promise<string> {
  const [entry] = await tx
    .insert(libraryEntry)
    .values({
      userId,
      titleId: seeded.titleId,
      abandonedAt: abandoned ? new Date() : null,
    })
    .returning({ id: libraryEntry.id });
  return entry.id;
}

async function recordWatch(
  tx: Transaction,
  userId: UserId,
  seeded: SeededTitle,
  entryId: string,
  { episodeKey = null, watchedAt }: { episodeKey?: string | null; watchedAt: Date | null },
): Promise<void> {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: entryId,
    titleId: seeded.titleId,
    episodeId: episodeKey === null ? null : seeded.episodeIds[episodeKey],
    watchedAt,
    source: "app",
    sourceKey: `stats-${nextNumber()}`,
  });
}

/**
 * The library every assertion in *a library with things in it* is made against, seeded once
 * per test because the harness rolls each one back.
 *
 * Six titles, chosen so that all five derived states are occupied and every aggregate has
 * something to disagree about: a film with a runtime and a film without, a part-watched
 * ended show carrying a watched **special**, a caught-up show still in production, an
 * abandoned title, and a title on the watchlist with no release year.
 */
async function seedLibrary(tx: Transaction, userId: UserId) {
  const filmWithRuntime = await seedTitle(tx, {
    kind: "film",
    releaseYear: 1999,
    runtimeMins: 120,
  });
  const filmWithoutRuntime = await seedTitle(tx, {
    kind: "film",
    releaseYear: 1994,
    runtimeMins: null,
  });
  const partWatchedShow = await seedTitle(tx, {
    kind: "show",
    releaseYear: 2005,
    inProduction: false,
    episodes: [
      { seasonNo: 0, episodeNo: 1, runtimeMins: 10 },
      { seasonNo: 1, episodeNo: 1, runtimeMins: 30 },
      { seasonNo: 1, episodeNo: 2, runtimeMins: 30 },
      { seasonNo: 1, episodeNo: 3, runtimeMins: 45 },
    ],
  });
  const caughtUpShow = await seedTitle(tx, {
    kind: "show",
    releaseYear: 2019,
    inProduction: true,
    episodes: [{ seasonNo: 1, episodeNo: 1, runtimeMins: 50 }],
  });
  const abandonedShow = await seedTitle(tx, {
    kind: "show",
    releaseYear: 1999,
    inProduction: true,
  });
  const unwatchedFilm = await seedTitle(tx, {
    kind: "film",
    releaseYear: null,
    runtimeMins: 90,
  });

  const filmWithRuntimeEntry = await addToLibrary(tx, userId, filmWithRuntime);
  const filmWithoutRuntimeEntry = await addToLibrary(tx, userId, filmWithoutRuntime);
  const partWatchedEntry = await addToLibrary(tx, userId, partWatchedShow);
  const caughtUpEntry = await addToLibrary(tx, userId, caughtUpShow);
  await addToLibrary(tx, userId, abandonedShow, { abandoned: true });
  await addToLibrary(tx, userId, unwatchedFilm);

  /** Four consecutive days ending today, so the streak is a run rather than a coincidence. */
  await recordWatch(tx, userId, filmWithRuntime, filmWithRuntimeEntry, {
    watchedAt: daysAgo(3),
  });
  await recordWatch(tx, userId, filmWithoutRuntime, filmWithoutRuntimeEntry, {
    watchedAt: daysAgo(2),
  });
  await recordWatch(tx, userId, partWatchedShow, partWatchedEntry, {
    episodeKey: "1-1",
    watchedAt: daysAgo(1),
  });
  await recordWatch(tx, userId, partWatchedShow, partWatchedEntry, {
    episodeKey: "1-2",
    watchedAt: daysAgo(0),
  });
  await recordWatch(tx, userId, partWatchedShow, partWatchedEntry, {
    episodeKey: "0-1",
    watchedAt: daysAgo(0),
  });
  await recordWatch(tx, userId, caughtUpShow, caughtUpEntry, {
    episodeKey: "1-1",
    watchedAt: daysAgo(0),
  });

  return { filmWithRuntime, filmWithoutRuntime };
}

describe("a library with things in it", () => {
  it("counts the titles it has watched, by kind", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.titles).toBe(6);
      // Watched, not finished: a part-watched show counts, and so does a film on the
      // watchlist's opposite side. The unwatched film and the abandoned show do not.
      expect(stats.filmsWatched).toBe(2);
      expect(stats.showsWatched).toBe(2);
    });
  });

  /**
   * The two episode figures, and the thing that makes them two figures rather than two
   * halves of one. `episodesWatched` counts watch rows — the watched **special** is one of
   * them — while `episodesRemaining` comes off `library_entry_remaining`, which excludes
   * season zero. A pass here that counted 3 would mean the aggregate had grown a
   * `season_no > 0` of its own.
   */
  it("counts episode watches including specials, and remaining without them", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.episodesWatched).toBe(4);
      expect(stats.episodesRemaining).toBe(1);
    });
  });

  it("reports all five derived states, zeroes included", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.states).toEqual([
        { state: "watching", titles: 1 },
        { state: "caught_up", titles: 1 },
        { state: "finished", titles: 2 },
        { state: "watchlist", titles: 1 },
        { state: "abandoned", titles: 1 },
      ]);
    });
  });

  /**
   * Watch time, and the number that keeps it from being read as exact. The film with no
   * runtime contributes nothing to either sum and one to the count, which is the whole
   * point: a total assembled from partial runtimes is a floor, and the page says so.
   */
  it("splits watch time and says how much of it is missing", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.watchTime).toEqual({
        filmMinutes: 120,
        televisionMinutes: 10 + 30 + 30 + 50,
        watchesWithoutRuntime: 1,
      });
    });
  });

  it("counts the streak as the unbroken run of days ending today", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.streakDays).toBe(4);
    });
  });

  /**
   * Four dated episode watches over four days: seven a week, and a mean Gregorian month of
   * them a month. Asserted to a tolerance because the month is `365.2425 / 12` rather than
   * a whole number of days.
   */
  it("averages episodes over the days they are spread across", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.episodesPerWeek).toBeCloseTo(7, 5);
      expect(stats.episodesPerMonth).toBeCloseTo(30.436875, 5);
    });
  });

  /**
   * The window is fixed and every month in it is a row, so a reader who watched nothing in
   * March sees March. The six watches are asserted as a total rather than pinned to one
   * month, because *three days ago* can be last month and the window holds both.
   */
  it("reports one row per month of the window, including empty ones", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.activity).toHaveLength(ACTIVITY_MONTHS);
      expect(stats.activity.every(({ month }) => /^\d{4}-\d{2}$/.test(month))).toBe(true);
      expect(stats.activity.reduce((total, { watches }) => total + watches, 0)).toBe(6);
      expect(stats.activity.at(-1)?.month).toBe(utcDay(new Date()).slice(0, 7));
    });
  });

  /**
   * Decades come off `title.release_year` for every title in the library, watched or not —
   * the abandoned 1999 show is in the 1990s count. The title with no release year is in
   * none of them and is reported separately rather than dropped.
   */
  it("ranks decades by release year and names what has none", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.topDecades).toEqual([
        { decade: 1990, titles: 3 },
        { decade: 2010, titles: 1 },
        { decade: 2000, titles: 1 },
      ]);
      expect(stats.titlesWithoutReleaseYear).toBe(1);
    });
  });

  /** Most recent last watch first, and only titles the view calls *finished*. */
  it("lists recently finished titles, newest first", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      const { filmWithRuntime, filmWithoutRuntime } = await seedLibrary(tx, userId);

      const stats = await accountStats(userId, tx);

      expect(stats.recentlyFinished.map((one) => one.libraryEntryId)).toHaveLength(2);
      expect(stats.recentlyFinished.map((one) => one.finishedOn)).toEqual([
        utcDay(daysAgo(2)),
        utcDay(daysAgo(3)),
      ]);
      // The two films are the only finished titles; the part-watched show is not one.
      const finishedTitles = [filmWithoutRuntime.titleId, filmWithRuntime.titleId];
      expect(finishedTitles).toHaveLength(2);
      expect(stats.recentlyFinished.every((one) => one.posterPath === "/poster.jpg")).toBe(
        true,
      );
    });
  });

  it("has no date missing from anything, so the undated count is zero", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);
      await seedLibrary(tx, userId);

      expect((await accountStats(userId, tx)).undatedWatches).toBe(0);
    });
  });

  /**
   * The scoping assertion. Every read in `db/access.ts` goes through `ownedBy`, and the one
   * that would not is the correlated `exists` behind *films watched* — so a second account
   * with a library of its own is seeded here, and every figure must still be the first
   * account's alone.
   */
  it("counts one account's library and never another's", async () => {
    await inTransaction(async (tx) => {
      const mine = await seedUser(tx);
      const yours = await seedUser(tx);
      await seedLibrary(tx, mine);
      await seedLibrary(tx, yours);

      const stats = await accountStats(mine, tx);

      expect(stats.titles).toBe(6);
      expect(stats.episodesWatched).toBe(4);
      expect(stats.watchTime.filmMinutes).toBe(120);
      expect(stats.recentlyFinished).toHaveLength(2);
    });
  });
});

/**
 * The streak on its own, because it is the one figure whose definition is contestable and
 * the one whose query has a shape that can be subtly wrong.
 *
 * `CONTEXT.md`: *the number of consecutive days **up to today** on which at least one dated
 * watch happened*. Transcribed literally, which has a consequence worth pinning rather than
 * discovering: **a run that ended yesterday is a streak of zero.** The obvious kindness — let
 * yesterday still count until midnight — is a different definition, and if it is ever wanted
 * it should change the glossary and then this test, in that order.
 */
describe("the streak", () => {
  async function seedWatchesOn(tx: Transaction, days: readonly number[]): Promise<UserId> {
    const userId = await seedUser(tx);
    const film = await seedTitle(tx, { kind: "film", runtimeMins: 90 });
    const entry = await addToLibrary(tx, userId, film);

    for (const day of days) {
      await recordWatch(tx, userId, film, entry, { watchedAt: daysAgo(day) });
    }
    return userId;
  }

  it("stops at the first day with nothing on it", async () => {
    await inTransaction(async (tx) => {
      // Today, yesterday, the day before — then a gap at 3, and a run before it that must
      // not be reached. A query that counted *all* days with watches would answer 5.
      const userId = await seedWatchesOn(tx, [0, 1, 2, 4, 5]);

      expect((await accountStats(userId, tx)).streakDays).toBe(3);
    });
  });

  it("is zero when nothing was watched today, however long yesterday's run was", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedWatchesOn(tx, [1, 2, 3, 4, 5]);

      expect((await accountStats(userId, tx)).streakDays).toBe(0);
    });
  });

  it("counts one day once, however many watches landed on it", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedWatchesOn(tx, [0, 0, 0, 1]);

      expect((await accountStats(userId, tx)).streakDays).toBe(2);
    });
  });

  it("is zero for an account that has never watched anything", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      expect((await accountStats(userId, tx)).streakDays).toBe(0);
    });
  });
});

/**
 * The empty library, which the page turns into a sentence rather than a grid of zeroes. The
 * read still has to answer, and every answer has to be structurally present — the page's own
 * branch is on `titles`, and a read that threw or returned a half-built object would be a
 * failure wearing an empty state's clothes.
 */
describe("an account with an empty library", () => {
  it("answers with zeroes and empty lists, and no nulls where a count belongs", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const stats = await accountStats(userId, tx);

      expect(stats.titles).toBe(0);
      expect(stats.filmsWatched).toBe(0);
      expect(stats.showsWatched).toBe(0);
      expect(stats.episodesWatched).toBe(0);
      expect(stats.episodesRemaining).toBe(0);
      expect(stats.streakDays).toBe(0);
      expect(stats.undatedWatches).toBe(0);
      expect(stats.titlesWithoutReleaseYear).toBe(0);
      expect(stats.recentlyFinished).toEqual([]);
      expect(stats.topDecades).toEqual([]);
      expect(stats.watchTime).toEqual({
        filmMinutes: 0,
        televisionMinutes: 0,
        watchesWithoutRuntime: 0,
      });
    });
  });

  it("still reports every state, at zero", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const stats = await accountStats(userId, tx);

      expect(stats.states.map(({ state }) => state)).toEqual([
        "watching",
        "caught_up",
        "finished",
        "watchlist",
        "abandoned",
      ]);
      expect(stats.states.every(({ titles }) => titles === 0)).toBe(true);
    });
  });

  /**
   * The distinction the whole ticket turns on in miniature: **no average is not an average
   * of zero.** An account with nothing to average gets `null`, which the page renders as a
   * sentence, rather than `0.0`, which is a claim about how much they watch.
   */
  it("has no average, rather than an average of zero", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const stats = await accountStats(userId, tx);

      expect(stats.episodesPerWeek).toBeNull();
      expect(stats.episodesPerMonth).toBeNull();
    });
  });

  it("still draws the whole activity window, empty", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      const stats = await accountStats(userId, tx);

      expect(stats.activity).toHaveLength(ACTIVITY_MONTHS);
      expect(stats.activity.every(({ watches }) => watches === 0)).toBe(true);
    });
  });
});

/**
 * An imported library, before anything has been watched in the app: real watches, no dates
 * on any of them. `SPEC.md`'s parent rejected backfilling them to the import date outright —
 * *it would put a spike of a thousand episodes on one day and make every chart a lie* — so
 * this is the shape the page has to report honestly rather than the shape it gets to avoid.
 */
describe("an account whose watches are entirely undated", () => {
  async function seedUndated(tx: Transaction) {
    const userId = await seedUser(tx);
    const show = await seedTitle(tx, {
      kind: "show",
      releaseYear: 2005,
      inProduction: false,
      episodes: [
        { seasonNo: 1, episodeNo: 1, runtimeMins: 30 },
        { seasonNo: 1, episodeNo: 2, runtimeMins: 30 },
      ],
    });
    const film = await seedTitle(tx, {
      kind: "film",
      releaseYear: 1999,
      runtimeMins: 100,
    });

    const showEntry = await addToLibrary(tx, userId, show);
    const filmEntry = await addToLibrary(tx, userId, film);

    await recordWatch(tx, userId, show, showEntry, {
      episodeKey: "1-1",
      watchedAt: null,
    });
    await recordWatch(tx, userId, show, showEntry, {
      episodeKey: "1-2",
      watchedAt: null,
    });
    await recordWatch(tx, userId, film, filmEntry, { watchedAt: null });

    return userId;
  }

  it("counts the watches, which happened, and says how many carry no date", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUndated(tx);

      const stats = await accountStats(userId, tx);

      expect(stats.episodesWatched).toBe(2);
      expect(stats.filmsWatched).toBe(1);
      expect(stats.showsWatched).toBe(1);
      expect(stats.undatedWatches).toBe(3);
      expect(stats.watchTime.televisionMinutes).toBe(60);
      expect(stats.watchTime.filmMinutes).toBe(100);
    });
  });

  /**
   * The four time-based figures, none of which an undated history can answer. Every one of
   * them says *nothing here* rather than *zero happened*: no streak to be on, no average to
   * take, no month to put a watch in, and no way to order a finished title by when it
   * finished.
   */
  it("has no streak, no average, no activity, and no recently finished", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUndated(tx);

      const stats = await accountStats(userId, tx);

      expect(stats.streakDays).toBe(0);
      expect(stats.episodesPerWeek).toBeNull();
      expect(stats.episodesPerMonth).toBeNull();
      expect(stats.activity.every(({ watches }) => watches === 0)).toBe(true);
      // Both titles are finished — the film has a watch, and the show is ended with every
      // episode watched — and neither can be placed in an order built out of dates it does
      // not have. *Finished* and *recently finished* are different questions, and this is
      // the account that makes the difference visible.
      expect(stats.states).toContainEqual({ state: "finished", titles: 2 });
      expect(stats.recentlyFinished).toEqual([]);
    });
  });
});

/**
 * `SPEC.md` §5's rule, exercised on the one instant where it shows: the zone is a lens over
 * history, so two accounts holding the same watch at the same instant put it on different
 * days.
 *
 * The instant is fixed rather than relative — `2026-03-01T04:00:00Z` is 1 March in London
 * and 28 February in Honolulu, whenever the suite happens to run. A day boundary computed in
 * UTC would give both accounts the same answer, which is the regression this catches and the
 * one a UTC test machine otherwise cannot see.
 */
describe("the reader's timezone is the lens on their history", () => {
  const instant = new Date("2026-03-01T04:00:00Z");

  async function seedFinishedFilm(tx: Transaction, timezone: string): Promise<UserId> {
    const userId = await seedUser(tx, timezone);
    const film = await seedTitle(tx, { kind: "film", releaseYear: 2001, runtimeMins: 90 });
    const entry = await addToLibrary(tx, userId, film);
    await recordWatch(tx, userId, film, entry, { watchedAt: instant });
    return userId;
  }

  it("dates the same watch differently on either side of the date line", async () => {
    await inTransaction(async (tx) => {
      const inLondon = await seedFinishedFilm(tx, "Europe/London");
      const inHonolulu = await seedFinishedFilm(tx, "Pacific/Honolulu");

      const london = await accountStats(inLondon, tx);
      const honolulu = await accountStats(inHonolulu, tx);

      expect(london.recentlyFinished.at(0)?.finishedOn).toBe("2026-03-01");
      expect(honolulu.recentlyFinished.at(0)?.finishedOn).toBe("2026-02-28");
    });
  });
});
