import { readFileSync } from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  asUserId,
  listUpNextRails,
  ONGOING_RAIL_SIZE,
  type UpNextEntry,
  type UpNextRails,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { readNativeImportFile, type NativeImportFile } from "@/import/native-format";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The one read behind every Up next surface (issue #98) — which titles, in what order.
 *
 * ── Why this file is where the ordering is checked ───────────────────────────────────
 *
 * `SPEC.md` §7's ordering is the last read rule in the product that nothing checks, and
 * its failure is silent: a wrong order does not throw, it puts the wrong show at the top
 * of the screen whose whole job is to be trusted at half attention. No surface can catch
 * it — every one of them renders whatever arrives, in the order it arrives — so the
 * assertion has to live against the query.
 *
 * ── The rails, and why they share these assertions rather than copying them ───────────
 *
 * Issue #137 made Up next three rails over one definition, and the same argument applies a
 * second time: a rail that held a *different* order would be a silently wrong screen, and
 * three copies of one expectation are three places for one rule to drift. So the ordering
 * cases below are written once and run against three readers — ONGOING, OLD FRIENDS and
 * COMING BACK — through `OrderReader`, and the rails' own *membership* rules are asserted
 * separately at the foot of this file.
 *
 * ── No network, and nothing mocked ───────────────────────────────────────────────────
 *
 * Every row below is inserted directly through the harness's transaction. Nothing here
 * calls TMDB, and the full-fixture test at the foot of the file deliberately does **not**
 * go through `scripts/db-seed.ts`, which needs `TMDB_READ_ACCESS_TOKEN` and thousands of
 * requests to turn `fixtures/mediasafe-seed.json` into rows. What that fixture actually
 * settles about the ordering — 462 titles, 439 of them watched, 155 abandoned, and
 * exactly one title whose every watch is undated — is all carried by the file itself, so
 * the episodes it does not name are synthesised here rather than fetched.
 */

setUpTestDatabase("mediasafe_up_next_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
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

/** `watchedAt: null` is an undated watch — it happened, you do not know when. */
async function markWatched(
  tx: Transaction,
  show: Show,
  index: number,
  watchedAt: Date | null,
): Promise<void> {
  await tx.insert(watch).values({
    userId: show.userId,
    libraryEntryId: show.entryId,
    titleId: show.titleId,
    episodeId: show.episodeIds[index],
    watchedAt,
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });
}

interface WatchingSpec {
  name: string;
  /**
   * The title's most recent watch. `null` seeds one undated watch and no dated one —
   * the case the air-date fallback exists for.
   */
  watchedAt: Date | null;
  /** The air date of the next episode. `null` is TMDB not having dated it. */
  nextAirDate?: string | null;
  /** How many `season_no > 0` episodes carry no watch. Two is the minimum. */
  remaining?: number;
}

/**
 * A show in *watching*, built so that its three sort keys are each set by hand: the
 * title's last watch, the next episode's air date, and the remainder.
 *
 * Episode 1 is watched, episode 2 is what is up next, and episodes 3 upwards are
 * released and unwatched. The third episode is what keeps the show *watching* rather than
 * *caught up* when the next one is unreleased or undated — "every released episode has a
 * watch" has to stay false whatever the next episode's air date says.
 */
async function seedWatching(
  tx: Transaction,
  userId: UserId,
  spec: WatchingSpec,
): Promise<Show> {
  const remaining = spec.remaining ?? 2;
  if (remaining < 2) {
    throw new Error("A watching show needs at least two unwatched episodes.");
  }

  const episodes: EpisodeSpec[] = [
    { seasonNo: 1, episodeNo: 1 },
    {
      seasonNo: 1,
      episodeNo: 2,
      airDate: "nextAirDate" in spec ? spec.nextAirDate : RELEASED,
    },
  ];
  for (let number = 3; number <= remaining + 1; number += 1) {
    episodes.push({ seasonNo: 1, episodeNo: number });
  }

  const show = await seedShow(tx, userId, { name: spec.name, episodes });
  await markWatched(tx, show, 0, spec.watchedAt);
  return show;
}

/**
 * A caught-up show that has something dated still to come — **COMING BACK's own membership,
 * as a seeder shaped exactly like `seedWatching`** so the ordering assertions below can be
 * run against that rail without being written a second time.
 *
 * Episode 1 is released and watched, which is what makes *every released episode has a
 * watch* true; episodes 2 upwards are unreleased, which is what keeps the show out of
 * *finished* and gives `library_entry_up_next` a future-dated episode to point at.
 * `nextAirDate` defaults to `UNRELEASED` rather than `RELEASED` — that one default is the
 * whole difference between this seeder and `seedWatching`.
 */
async function seedComingBack(
  tx: Transaction,
  userId: UserId,
  spec: WatchingSpec,
): Promise<Show> {
  const remaining = spec.remaining ?? 2;
  if (remaining < 2) {
    throw new Error("A coming-back show needs at least two unwatched episodes.");
  }

  const episodes: EpisodeSpec[] = [
    { seasonNo: 1, episodeNo: 1 },
    {
      seasonNo: 1,
      episodeNo: 2,
      airDate: "nextAirDate" in spec ? spec.nextAirDate : UNRELEASED,
    },
  ];
  for (let number = 3; number <= remaining + 1; number += 1) {
    episodes.push({ seasonNo: 1, episodeNo: number, airDate: UNRELEASED });
  }

  const show = await seedShow(tx, userId, { name: spec.name, episodes });
  await markWatched(tx, show, 0, spec.watchedAt);
  return show;
}

/** The rails, read the one way they are offered — three arrays from one call. */
async function railNames(
  tx: Transaction,
  userId: UserId,
  rail: (rails: UpNextRails) => readonly UpNextEntry[],
): Promise<string[]> {
  const rails = await listUpNextRails(userId, tx);
  return rail(rails).map((entry) => entry.titleName);
}

/**
 * One reader of `SPEC.md` §7's order — one of #137's three rails — and everything a case
 * needs in order to be run against it unchanged.
 *
 * **This exists so that §7's ordering is asserted once and checked three times.** The rule
 * is a five-term cascade, its failure is silent, and #137's own acceptance criterion is
 * that each rail holds it *"reusing the existing assertions rather than restating them"*.
 * Three copies of `expect(...).toEqual(["Yesterday", "Three days", "Ten days"])` would be
 * three places for one rule to drift, which is the same argument `db/access.ts`'s
 * `upNextRead` makes about the `ORDER BY` itself, one layer up.
 *
 * `displace` is what makes OLD FRIENDS reachable at all: it is *watching* minus ONGOING, so
 * a case that seeds three titles would put all three on ONGOING and leave the rail under
 * test empty. Seeding `ONGOING_RAIL_SIZE` titles watched *now* fills ONGOING exactly, and
 * every case below watches its own titles at `daysAgo(1)` or older — so the titles under
 * test land on OLD FRIENDS in the same relative order they would have held anywhere else.
 * For the other two readers it does nothing.
 */
interface OrderReader {
  readonly label: string;
  /** The seeder whose membership this reader's rail holds. */
  readonly seed: (tx: Transaction, userId: UserId, spec: WatchingSpec) => Promise<Show>;
  readonly displace: (tx: Transaction, userId: UserId) => Promise<void>;
  readonly names: (tx: Transaction, userId: UserId) => Promise<string[]>;
  readonly entries: (
    tx: Transaction,
    userId: UserId,
  ) => Promise<readonly UpNextEntry[]>;
}

async function displaceNothing(): Promise<void> {}

/** `ONGOING_RAIL_SIZE` titles watched now — the newest thing in the library, every time. */
async function fillOngoing(tx: Transaction, userId: UserId): Promise<void> {
  for (let number = 1; number <= ONGOING_RAIL_SIZE; number += 1) {
    await seedWatching(tx, userId, {
      name: `Displaced ${number}`,
      watchedAt: daysAgo(0),
    });
  }
}

const ONGOING: OrderReader = {
  label: "listUpNextRails — ONGOING",
  seed: seedWatching,
  displace: displaceNothing,
  names: (tx, userId) => railNames(tx, userId, (rails) => rails.ongoing),
  entries: async (tx, userId) => (await listUpNextRails(userId, tx)).ongoing,
};

const OLD_FRIENDS: OrderReader = {
  label: "listUpNextRails — OLD FRIENDS",
  seed: seedWatching,
  displace: fillOngoing,
  names: (tx, userId) => railNames(tx, userId, (rails) => rails.oldFriends),
  entries: async (tx, userId) => (await listUpNextRails(userId, tx)).oldFriends,
};

const COMING_BACK: OrderReader = {
  label: "listUpNextRails — COMING BACK",
  seed: seedComingBack,
  displace: displaceNothing,
  names: (tx, userId) => railNames(tx, userId, (rails) => rails.comingBack),
  entries: async (tx, userId) => (await listUpNextRails(userId, tx)).comingBack,
};

/**
 * The three terms of §7's order that every reader holds, whatever its membership is:
 * recency descending, closest-to-finishing as the tiebreak, and the total order underneath
 * both.
 *
 * The cascade's other two ranks — the air-date fallback and the group with no date at all —
 * are asserted in `describeTheCascade` below instead, against the *watching* readers only.
 * They are not shared because COMING BACK's membership forbids the states they turn on: a
 * next episode with no air date, or one whose air date has passed, is not a title coming
 * back, and a case that seeded one would be asserting that the rail is empty.
 */
function describeTheSharedTerms(reader: OrderReader): void {
  describe(`${reader.label} — the ordering`, () => {
    it("puts your most recent watch of the title first, descending", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);

        await reader.seed(tx, user, { name: "Three days", watchedAt: daysAgo(3) });
        await reader.seed(tx, user, { name: "Yesterday", watchedAt: daysAgo(1) });
        await reader.seed(tx, user, { name: "Ten days", watchedAt: daysAgo(10) });

        expect(await reader.names(tx, user)).toEqual([
          "Yesterday",
          "Three days",
          "Ten days",
        ]);
      });
    });

    it("breaks a remaining tie by closest to finishing", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);
        const sameMoment = daysAgo(2);

        await reader.seed(tx, user, {
          name: "Five left",
          watchedAt: sameMoment,
          remaining: 5,
        });
        await reader.seed(tx, user, {
          name: "Two left",
          watchedAt: sameMoment,
          remaining: 2,
        });
        await reader.seed(tx, user, {
          name: "Three left",
          watchedAt: sameMoment,
          remaining: 3,
        });

        expect(await reader.names(tx, user)).toEqual([
          "Two left",
          "Three left",
          "Five left",
        ]);
      });
    });

    it("gives two identical loads an identical order", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);
        const sameMoment = daysAgo(2);

        // Everything ties: the same last watch and the same remainder, and two of them
        // share a name, so only the entry id underneath can separate the last pair.
        for (const name of ["Bell", "Anvil", "Anvil", "Cinder"]) {
          await reader.seed(tx, user, { name, watchedAt: sameMoment });
        }

        const first = await reader.entries(tx, user);
        const second = await reader.entries(tx, user);

        expect(first).toEqual(second);
        expect(first.map((entry) => entry.titleName)).toEqual([
          "Anvil",
          "Anvil",
          "Bell",
          "Cinder",
        ]);
      });
    });
  });
}

/**
 * The cascade's other two ranks — the air-date fallback, and the group with no date to sort
 * by at all — against every reader over the *watching* set.
 */
function describeTheCascade(reader: OrderReader): void {
  describe(`${reader.label} — the ordering cascade`, () => {
    it("ranks a title by its most recent watch, not its first", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);

        const stale = await reader.seed(tx, user, {
          name: "Returned to",
          watchedAt: daysAgo(90),
          remaining: 3,
        });
        await reader.seed(tx, user, { name: "Steady", watchedAt: daysAgo(5) });

        // A second, newer watch of the same title — episode 2, which moves progress on.
        await markWatched(tx, stale, 1, daysAgo(1));

        expect(await reader.names(tx, user)).toEqual(["Returned to", "Steady"]);
      });
    });

    it("ignores an undated watch on a title that also has a dated one", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);

        const mixed = await reader.seed(tx, user, {
          name: "Mixed",
          watchedAt: daysAgo(2),
          remaining: 3,
        });
        await markWatched(tx, mixed, 2, null);
        await reader.seed(tx, user, { name: "Older", watchedAt: daysAgo(4) });

        // The undated watch adds nothing to `max(watched_at)`, so recency still decides.
        expect(await reader.names(tx, user)).toEqual(["Mixed", "Older"]);
      });
    });

    it("falls back to the next episode's air date for an undated title, newest first", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);

        await reader.seed(tx, user, {
          name: "Aired recently",
          watchedAt: null,
          nextAirDate: daysFromToday(-5),
        });
        await reader.seed(tx, user, {
          name: "Aired long ago",
          watchedAt: null,
          nextAirDate: daysFromToday(-400),
        });
        await reader.seed(tx, user, { name: "Dated", watchedAt: daysAgo(3000) });

        // Even a watch from eight years ago outranks the whole fallback group: the rule is
        // a cascade, not one comparison between a watch date and an air date.
        expect(await reader.names(tx, user)).toEqual([
          "Dated",
          "Aired recently",
          "Aired long ago",
        ]);
      });
    });

    it("sinks a next episode with no air date below both groups", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);

        await reader.seed(tx, user, {
          name: "Undatable",
          watchedAt: null,
          nextAirDate: null,
        });
        await reader.seed(tx, user, {
          name: "Fallback",
          watchedAt: null,
          nextAirDate: daysFromToday(-400),
        });
        await reader.seed(tx, user, { name: "Recency", watchedAt: daysAgo(3000) });

        expect(await reader.names(tx, user)).toEqual([
          "Recency",
          "Fallback",
          "Undatable",
        ]);
      });
    });

    it("keeps a dated title in the recency group however undated its next episode is", async () => {
      await inTransaction(async (tx) => {
        const user = await seedUser(tx, "reader");
        await reader.displace(tx, user);

        await reader.seed(tx, user, {
          name: "Watched yesterday",
          watchedAt: daysAgo(1),
          nextAirDate: null,
        });
        await reader.seed(tx, user, {
          name: "Watched last week",
          watchedAt: daysAgo(7),
        });

        expect(await reader.names(tx, user)).toEqual([
          "Watched yesterday",
          "Watched last week",
        ]);
      });
    });
  });
}

for (const reader of [ONGOING, OLD_FRIENDS, COMING_BACK]) {
  describeTheSharedTerms(reader);
}

for (const reader of [ONGOING, OLD_FRIENDS]) {
  describeTheCascade(reader);
}

/**
 * A show with nothing left — *finished*, and the state ONGOING has to exclude however
 * recently it was watched. Every `season_no > 0` episode carries a watch and
 * `in_production` is `false`, which is `library_entry_state`'s finished branch for a show.
 */
async function seedFinished(
  tx: Transaction,
  userId: UserId,
  name: string,
  watchedAt: Date,
): Promise<Show> {
  const show = await seedShow(tx, userId, {
    name,
    inProduction: false,
    episodes: [
      { seasonNo: 1, episodeNo: 1 },
      { seasonNo: 1, episodeNo: 2 },
    ],
  });
  await markWatched(tx, show, 0, watchedAt);
  await markWatched(tx, show, 1, watchedAt);
  return show;
}

/** Every name on every rail, so a case can assert what is nowhere as well as what is where. */
function everyRailName(rails: UpNextRails): string[] {
  return [...rails.ongoing, ...rails.comingBack, ...rails.oldFriends].map(
    (entry) => entry.titleName,
  );
}

describe("listUpNextRails — what each rail contains", () => {
  it("holds watching titles on ONGOING and never a finished one, however recently watched", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Finished today, watching a fortnight ago: recency alone would put the finished
      // show first. Membership is checked before the order is, so it is on no rail at all.
      await seedFinished(tx, reader, "Finished last night", daysAgo(0));
      await seedWatching(tx, reader, { name: "Watching", watchedAt: daysAgo(14) });

      const rails = await listUpNextRails(reader, tx);

      expect(rails.ongoing.map((entry) => entry.titleName)).toEqual(["Watching"]);
      expect(everyRailName(rails)).toEqual(["Watching"]);
    });
  });

  it("caps ONGOING at twelve, and the twelve are the most recently watched", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Fourteen watching titles, one day apart, seeded oldest-first so that insertion
      // order is the reverse of the order the rails must produce.
      const oldestFirst = ONGOING_RAIL_SIZE + 2;
      for (let days = oldestFirst; days >= 1; days -= 1) {
        await seedWatching(tx, reader, {
          name: `Watched ${days} days ago`,
          watchedAt: daysAgo(days),
        });
      }

      const rails = await listUpNextRails(reader, tx);

      expect(rails.ongoing).toHaveLength(ONGOING_RAIL_SIZE);
      expect(rails.ongoing.map((entry) => entry.titleName)).toEqual([
        "Watched 1 days ago",
        "Watched 2 days ago",
        "Watched 3 days ago",
        "Watched 4 days ago",
        "Watched 5 days ago",
        "Watched 6 days ago",
        "Watched 7 days ago",
        "Watched 8 days ago",
        "Watched 9 days ago",
        "Watched 10 days ago",
        "Watched 11 days ago",
        "Watched 12 days ago",
      ]);
      expect(rails.oldFriends.map((entry) => entry.titleName)).toEqual([
        "Watched 13 days ago",
        "Watched 14 days ago",
      ]);
    });
  });

  it("fills ONGOING from the rest of the cascade when there are not twelve dated watches", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Two dated watches and twelve undated ones. *The twelve most recently watched* is
      // the head of §7's order, and that order does not stop after rank 0 — so the rail is
      // full rather than two long, and what fills it is the air-date fallback group in its
      // own order. A library with no dated watch at all still gets a full ONGOING, which is
      // the same choice held consistently.
      await seedWatching(tx, reader, { name: "Dated recent", watchedAt: daysAgo(1) });
      await seedWatching(tx, reader, { name: "Dated old", watchedAt: daysAgo(900) });
      for (let days = 1; days <= 12; days += 1) {
        await seedWatching(tx, reader, {
          name: `Undated, aired ${days}`,
          watchedAt: null,
          nextAirDate: daysFromToday(-days),
        });
      }

      const rails = await listUpNextRails(reader, tx);

      expect(rails.ongoing).toHaveLength(ONGOING_RAIL_SIZE);
      expect(rails.ongoing.map((entry) => entry.titleName)).toEqual([
        "Dated recent",
        "Dated old",
        "Undated, aired 1",
        "Undated, aired 2",
        "Undated, aired 3",
        "Undated, aired 4",
        "Undated, aired 5",
        "Undated, aired 6",
        "Undated, aired 7",
        "Undated, aired 8",
        "Undated, aired 9",
        "Undated, aired 10",
      ]);
      expect(rails.oldFriends.map((entry) => entry.titleName)).toEqual([
        "Undated, aired 11",
        "Undated, aired 12",
      ]);
    });
  });

  it("puts every watching title in exactly one of ONGOING and OLD FRIENDS", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const watching: string[] = [];
      for (let days = 1; days <= ONGOING_RAIL_SIZE + 5; days += 1) {
        const name = `Watching ${days}`;
        watching.push(name);
        await seedWatching(tx, reader, { name, watchedAt: daysAgo(days) });
      }

      const rails = await listUpNextRails(reader, tx);
      const ongoing = rails.ongoing.map((entry) => entry.libraryEntryId);
      const oldFriends = rails.oldFriends.map((entry) => entry.libraryEntryId);

      // Exactly one: the union is the whole watching set, and the intersection is empty.
      // Asserted on ids rather than names, because an id is the thing a rail hands the
      // panel and two titles are allowed to share a name.
      expect(new Set([...ongoing, ...oldFriends]).size).toBe(watching.length);
      expect(ongoing.filter((id) => oldFriends.includes(id))).toEqual([]);
      expect(ongoing).toHaveLength(ONGOING_RAIL_SIZE);
      expect(oldFriends).toHaveLength(watching.length - ONGOING_RAIL_SIZE);
    });
  });

  it("holds a caught-up title on COMING BACK while its next episode is still to air", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedComingBack(tx, reader, { name: "Returning", watchedAt: daysAgo(30) });

      const rails = await listUpNextRails(reader, tx);

      expect(rails.comingBack.map((entry) => entry.titleName)).toEqual(["Returning"]);
      expect(rails.ongoing).toEqual([]);
      expect(rails.oldFriends).toEqual([]);
    });
  });

  it("drops a title off COMING BACK once its next episode's air date has passed", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const returning = await seedComingBack(tx, reader, {
        name: "Returning",
        watchedAt: daysAgo(30),
      });

      await tx
        .update(episode)
        .set({ airDate: daysFromToday(-1) })
        .where(eq(episode.id, returning.episodeIds[1]));

      const rails = await listUpNextRails(reader, tx);

      // The same read on a different day, and nothing was written to move it: the episode
      // has aired, so *caught up* is no longer true and COMING BACK's predicate no longer
      // holds. `library_entry_state` says *watching*, which is ONGOING.
      expect(rails.comingBack).toEqual([]);
      expect(rails.ongoing.map((entry) => entry.titleName)).toEqual(["Returning"]);
    });
  });

  it("never puts a title with no future air date on COMING BACK", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Caught up — every *released* episode is watched, because a null air date is not
      // released — with a next episode TMDB has not dated. There is no day to come back
      // on, so the rail cannot say there is one.
      await seedComingBack(tx, reader, {
        name: "Undated return",
        watchedAt: daysAgo(30),
        nextAirDate: null,
      });

      const rails = await listUpNextRails(reader, tx);

      expect(everyRailName(rails)).toEqual([]);
    });
  });

  it("never puts an abandoned or a watchlist title on any of the three", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Abandoned outranks every derived state: its watches say *watching* and it is out
      // anyway.
      const abandoned = await seedShow(tx, reader, {
        name: "Given up on",
        abandonedAt: daysAgo(2),
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      await markWatched(tx, abandoned, 0, daysAgo(1));

      // A watchlist title has no watches, so no progress and no episode after it.
      await seedShow(tx, reader, {
        name: "Not started",
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });

      await seedWatching(tx, reader, { name: "Watching", watchedAt: daysAgo(9) });

      expect(everyRailName(await listUpNextRails(reader, tx))).toEqual(["Watching"]);
    });
  });

  it("returns an empty rail rather than erroring when it has no members", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // A library that is entirely finished: nothing is watching, nothing is coming back.
      // Every rail is empty, which is the state the surface renders as *absent* — and it is
      // reachable only from a read that succeeded, which is what lets it mean that.
      await seedFinished(tx, reader, "Done with", daysAgo(5));
      await seedWatching(tx, await seedUser(tx, "stranger"), {
        name: "Theirs",
        watchedAt: daysAgo(1),
      });

      const rails = await listUpNextRails(reader, tx);

      expect(rails).toEqual({ ongoing: [], comingBack: [], oldFriends: [] });
    });
  });

  it("reads this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");

      await seedWatching(tx, reader, { name: "Mine", watchedAt: daysAgo(5) });
      await seedComingBack(tx, reader, { name: "Mine, returning", watchedAt: daysAgo(6) });
      await seedWatching(tx, stranger, { name: "Theirs", watchedAt: daysAgo(1) });
      await seedComingBack(tx, stranger, {
        name: "Theirs, returning",
        watchedAt: daysAgo(1),
      });

      expect(everyRailName(await listUpNextRails(reader, tx))).toEqual([
        "Mine",
        "Mine, returning",
      ]);
    });
  });

  it("leaves out a watching title that has nothing next", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Progress is a high-water mark, so watching the last episode and skipping the first
      // two leaves this *watching* with no episode after it — no tile to draw, on any rail.
      const skipped = await seedShow(tx, reader, {
        name: "Skipped ahead",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      await markWatched(tx, skipped, 2, daysAgo(1));
      await seedWatching(tx, reader, { name: "In order", watchedAt: daysAgo(2) });

      expect(everyRailName(await listUpNextRails(reader, tx))).toEqual(["In order"]);
    });
  });

  it("carries on a rail tile everything the tile renders", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx, reader, {
        name: "Severance",
        posterPath: "/severance.jpg",
        episodes: [
          { seasonNo: 2, episodeNo: 9, name: "Sweet Vitriol" },
          { seasonNo: 2, episodeNo: 10, name: "Cold Harbor" },
          { seasonNo: 3, episodeNo: 1, name: "Unknown" },
        ],
      });
      await markWatched(tx, show, 0, daysAgo(1));

      const [entry] = (await listUpNextRails(reader, tx)).ongoing;

      expect(entry).toEqual({
        libraryEntryId: show.entryId,
        titleId: show.titleId,
        titleName: "Severance",
        releaseYear: 2022,
        posterPath: "/severance.jpg",
        episodeId: show.episodeIds[1],
        episodeName: "Cold Harbor",
        seasonNo: 2,
        episodeNo: 10,
      });
    });
  });

  it("carries a next episode TMDB has not named, and a title it has not illustrated", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx, reader, {
        posterPath: null,
        releaseYear: null,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, name: null },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      await markWatched(tx, show, 0, daysAgo(1));

      const [entry] = (await listUpNextRails(reader, tx)).ongoing;

      // Null is the honest answer; the tile's own rule is that it never degrades to
      // "S1 E2" instead, and it cannot follow that rule from a name this read invented.
      expect(entry.episodeName).toBeNull();
      expect(entry.posterPath).toBeNull();
      // Same rule for a title TMDB has not dated: the tile prints no year line at all
      // rather than a placeholder, which it cannot do from a year this read invented.
      expect(entry.releaseYear).toBeNull();
    });
  });
});

/**
 * The fixture, at its real size: 462 titles, 19,558 watches, 155 of them abandoned.
 *
 * `fixtures/mediasafe-seed.json` names a `tmdb_id`, a kind, a judgement and a watch's
 * `tmdb_episode_id` and date — never a season, an episode number, an air date or a name,
 * because the conversion deliberately borrows none of those (`import/native-format.ts`).
 * Those are synthesised below, deterministically: each title's watched episodes are
 * numbered in ascending TMDB order as one season, and one dated, unwatched episode is
 * appended so that every watched title is *watching* with something after it.
 *
 * What that leaves genuinely from the fixture is exactly what the ordering reads — which
 * titles carry a watch, which of those are abandoned, and the date on every watch. So the
 * assertions below are about the fixture's own numbers, not the synthesis'.
 *
 * ── What this proves, and what it does not ───────────────────────────────────────────
 *
 * It proves the primary path and the membership predicate at real size: 439 watched
 * titles, 155 of them abandoned and 45 more caught up, ordered by recency across 22 pages
 * with no entry repeated or skipped, and the air-date fallback firing for the one title
 * §7's measurement said it eventually would.
 *
 * It does **not** prove the tiebreak cascade, and cannot: the real library has 238
 * distinct last-watch instants across its 238 dated deck titles, so `remaining`,
 * `lower(name)` and the entry id are never consulted. Nor does it reach rank 2 — every
 * synthesised next episode is dated. Those are the small tests above, and this one is not
 * a substitute for them.
 */
/** Kept clear of the fixture's own ids, which top out well below this. */
const SYNTHETIC_EPISODE_BASE = 100_000_000;

/**
 * Which of the fixture's titles are given an unaired next episode, and so read as *caught
 * up* rather than *watching*. Deterministic, and declared here because the seeding and the
 * expectation both have to agree on it.
 */
function isCaughtUpInFixture(tmdbId: number): boolean {
  return tmdbId % 7 === 0;
}

/**
 * Through `readNativeImportFile`, never `JSON.parse` — `import/native-format.ts` is the
 * one place the shape is declared, and every reader of a native file goes through it
 * (`scripts/db-seed.ts` is the other one). A second declaration here would be a second
 * thing to keep in step with the format.
 */
function readSeedFixture(): NativeImportFile {
  const file = path.join(import.meta.dirname, "..", "fixtures", "mediasafe-seed.json");
  return readNativeImportFile(readFileSync(file, "utf8"));
}

async function seedWholeFixture(
  tx: Transaction,
  userId: UserId,
  fixture: NativeImportFile,
): Promise<void> {
  const watchedEpisodes = new Map<number, number[]>();
  for (const one of fixture.watches) {
    const seen = watchedEpisodes.get(one.tmdbId) ?? [];
    if (!seen.includes(one.tmdbEpisodeId)) seen.push(one.tmdbEpisodeId);
    watchedEpisodes.set(one.tmdbId, seen);
  }

  const titleIds = new Map<number, string>();
  const titleRows = await tx
    .insert(title)
    .values(
      fixture.titles.map((one) => ({
        kind: one.kind,
        tmdbId: one.tmdbId,
        name: `Title ${one.tmdbId}`,
        inProduction: true,
      })),
    )
    .returning({ id: title.id, tmdbId: title.tmdbId });
  for (const row of titleRows) titleIds.set(row.tmdbId, row.id);

  const episodeValues: {
    titleId: string;
    tmdbEpisodeId: number;
    seasonNo: number;
    episodeNo: number;
    airDate: string;
  }[] = [];
  for (const one of fixture.titles) {
    const titleId = titleIds.get(one.tmdbId)!;
    const watched = [...(watchedEpisodes.get(one.tmdbId) ?? [])].sort((a, b) => a - b);
    watched.forEach((tmdbEpisodeId, index) => {
      episodeValues.push({
        titleId,
        tmdbEpisodeId,
        seasonNo: 1,
        episodeNo: index + 1,
        airDate: RELEASED,
      });
    });
    /**
     * Two unwatched episodes after them, and their air dates are what decide the title's
     * state. Released, and the title is *watching* with the first of them up next;
     * unreleased, and every episode that has aired is watched, so the title is *caught
     * up* and the deck must leave it out.
     *
     * One title in every seven is put in that second group — deterministically, off the
     * TMDB id, so the split is the same on every run. It is what makes the membership
     * predicate mean something at fixture scale instead of only in the small tests above:
     * without it, all 284 non-abandoned watched titles are *watching* and a query that
     * had no state filter at all would pass this test.
     */
    const caughtUp = isCaughtUpInFixture(one.tmdbId);
    for (let offset = 0; offset < 2; offset += 1) {
      episodeValues.push({
        titleId,
        tmdbEpisodeId: SYNTHETIC_EPISODE_BASE + one.tmdbId * 4 + offset,
        seasonNo: 1,
        episodeNo: watched.length + offset + 1,
        airDate: caughtUp ? UNRELEASED : daysFromToday(-((one.tmdbId % 900) + 1)),
      });
    }
  }

  const episodeIds = new Map<number, string>();
  for (let start = 0; start < episodeValues.length; start += 2_000) {
    const rows = await tx
      .insert(episode)
      .values(episodeValues.slice(start, start + 2_000))
      .returning({ id: episode.id, tmdbEpisodeId: episode.tmdbEpisodeId });
    for (const row of rows) episodeIds.set(row.tmdbEpisodeId, row.id);
  }

  const entryIds = new Map<number, string>();
  const entryRows = await tx
    .insert(libraryEntry)
    .values(
      fixture.titles.map((one) => ({
        userId,
        titleId: titleIds.get(one.tmdbId)!,
        abandonedAt: one.abandoned ? daysAgo(400) : undefined,
      })),
    )
    .returning({ id: libraryEntry.id, titleId: libraryEntry.titleId });
  const entryByTitleId = new Map(entryRows.map((row) => [row.titleId, row.id]));
  for (const one of fixture.titles) {
    entryIds.set(one.tmdbId, entryByTitleId.get(titleIds.get(one.tmdbId)!)!);
  }

  const watchValues = fixture.watches.map((one) => ({
    userId,
    libraryEntryId: entryIds.get(one.tmdbId)!,
    titleId: titleIds.get(one.tmdbId)!,
    episodeId: episodeIds.get(one.tmdbEpisodeId)!,
    watchedAt: one.watchedAt === null ? null : new Date(one.watchedAt),
    source: "tvtracker",
    sourceKey: one.key,
  }));
  for (let start = 0; start < watchValues.length; start += 2_000) {
    await tx.insert(watch).values(watchValues.slice(start, start + 2_000));
  }

  /**
   * **Not an optimisation — without it this test measures the planner, not the query.**
   *
   * The three derived-state views are correlated `NOT EXISTS` subqueries over `episode`
   * and `watch`, and forty thousand rows have just arrived in tables Postgres has no
   * statistics for. Worse, the statistics it does have are actively wrong: every test
   * above this one inserted and rolled back, which leaves dead tuples behind and can
   * trigger an autoanalyze that records these tables as empty. The planner then picks
   * nested loops sized for nothing against rows numbering in the thousands, and the same
   * test that passes in two seconds on its own runs for minutes after its neighbours.
   *
   * `ANALYZE` inside the transaction is rolled back with everything else, and it is what
   * any real database this query runs against would have. What is being asserted below
   * is the *order*, and the order must not be reached through a plan no deployment would
   * ever use.
   */
  await tx.execute(sql`analyze title, episode, library_entry, watch`);
}

describe("listUpNextRails — against the whole fixture", () => {
  it("orders all 239 of the fixture's watching titles, across ONGOING and OLD FRIENDS", async () => {
    await inTransaction(async (tx) => {
      const fixture = readSeedFixture();
      const reader = await seedUser(tx, "adham");
      await seedWholeFixture(tx, reader, fixture);

      const abandoned = new Set(
        fixture.titles.filter((one) => one.abandoned).map((one) => one.tmdbId),
      );
      const lastWatch = new Map<number, string | null>();
      for (const one of fixture.watches) {
        if (one.watchedAt === null) {
          if (!lastWatch.has(one.tmdbId)) lastWatch.set(one.tmdbId, null);
          continue;
        }
        const held = lastWatch.get(one.tmdbId) ?? null;
        if (held === null || one.watchedAt > held) {
          lastWatch.set(one.tmdbId, one.watchedAt);
        }
      }

      const expected = [...lastWatch.keys()]
        .filter((tmdbId) => !abandoned.has(tmdbId) && !isCaughtUpInFixture(tmdbId))
        .sort((a, b) => {
          const left = lastWatch.get(a) ?? null;
          const right = lastWatch.get(b) ?? null;
          // The undated title sinks to the fallback group; nothing else here reaches it.
          if (left === null !== (right === null)) return left === null ? 1 : -1;
          if (left !== null && right !== null && left !== right) {
            return left < right ? 1 : -1;
          }
          /**
           * The rank-0 tiebreak, and only that. Two titles reach this line by tying on
           * the last watch, and every synthesised title carries the same two unwatched
           * episodes, so *closest to finishing* cannot separate them and the name is what
           * comes next.
           *
           * **Nothing in this fixture ties** — 238 distinct watch instants across its 238
           * dated deck titles — so the query's `remaining` and entry-id terms are not what
           * this test covers; the small tests above are. This exists so that a fixture
           * which one day does tie is still compared against a total order rather than
           * against whatever order this array happened to be built in.
           *
           * It is deliberately not the whole rule: two *undated* titles would also land
           * here, and the query would separate those by their next episode's air date
           * descending, not by name. The fixture has exactly one undated title, so that
           * pair cannot occur — a second one arriving means adding the air-date term here
           * rather than trusting this line.
           */
          return `title ${a}` < `title ${b}` ? -1 : 1;
        })
        .map((tmdbId) => `Title ${tmdbId}`);

      // 439 titles carry a watch. 155 are abandoned and 45 more are caught up, so the
      // *watching* set is 239 — and every one of the 200 excluded is excluded by the
      // state predicate, not by having nothing next.
      expect(expected).toHaveLength(239);
      // Exactly one of the fixture's titles has no dated watch at all, so exactly one
      // reaches the air-date fallback — and it therefore sorts below all 238 others.
      expect([...lastWatch.values()].filter((at) => at === null)).toHaveLength(1);

      // ONGOING then OLD FRIENDS, in that order, is the same walk a `listUpNext` deck
      // once offered one page at a time: the two rails are one read over *watching*,
      // sliced at `ONGOING_RAIL_SIZE`, and every watching title is in exactly one of them
      // (`listUpNextRails — what each rail contains`, above).
      const rails = await listUpNextRails(reader, tx);
      const walked = [...rails.ongoing, ...rails.oldFriends];

      expect(walked.map((entry) => entry.titleName)).toEqual(expected);
      expect(new Set(walked.map((entry) => entry.libraryEntryId)).size).toBe(239);
      expect(walked.at(-1)!.titleName).toBe("Title 292144");
    });
  }, 120_000);
});
