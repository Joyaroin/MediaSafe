import { readFileSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  asUserId,
  listUpNext,
  UP_NEXT_PAGE_SIZE,
  type UpNextEntry,
  type UpNextPage,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The one read behind both Up next surfaces (issue #98) — which titles, in what order.
 *
 * ── Why this file is where the ordering is checked ───────────────────────────────────
 *
 * `SPEC.md` §7's ordering is the last read rule in the product that nothing checks, and
 * its failure is silent: a wrong order does not throw, it puts the wrong show at the top
 * of the screen whose whole job is to be trusted at half attention. Neither surface can
 * catch it — the phone deck and the desktop row both render whatever arrives, in the
 * order it arrives — so the assertion has to live against the query.
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
      releaseYear: 2022,
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

/** Every entry, walked page by page, which is the only way this read is offered. */
async function wholeDeck(tx: Transaction, userId: UserId): Promise<UpNextEntry[]> {
  const entries: UpNextEntry[] = [];
  let page: UpNextPage = await listUpNext(userId, null, tx);
  entries.push(...page.entries);

  while (page.nextCursor !== null) {
    page = await listUpNext(userId, page.nextCursor, tx);
    entries.push(...page.entries);
  }
  return entries;
}

async function deckNames(tx: Transaction, userId: UserId): Promise<string[]> {
  return (await wholeDeck(tx, userId)).map((entry) => entry.titleName);
}

describe("listUpNext — the ordering", () => {
  it("puts your most recent watch of the title first, descending", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedWatching(tx, reader, { name: "Three days", watchedAt: daysAgo(3) });
      await seedWatching(tx, reader, { name: "Yesterday", watchedAt: daysAgo(1) });
      await seedWatching(tx, reader, { name: "Ten days", watchedAt: daysAgo(10) });

      expect(await deckNames(tx, reader)).toEqual([
        "Yesterday",
        "Three days",
        "Ten days",
      ]);
    });
  });

  it("ranks a title by its most recent watch, not its first", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const stale = await seedWatching(tx, reader, {
        name: "Returned to",
        watchedAt: daysAgo(90),
        remaining: 3,
      });
      await seedWatching(tx, reader, { name: "Steady", watchedAt: daysAgo(5) });

      // A second, newer watch of the same title — episode 2, which moves progress on.
      await markWatched(tx, stale, 1, daysAgo(1));

      expect(await deckNames(tx, reader)).toEqual(["Returned to", "Steady"]);
    });
  });

  it("ignores an undated watch on a title that also has a dated one", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const mixed = await seedWatching(tx, reader, {
        name: "Mixed",
        watchedAt: daysAgo(2),
        remaining: 3,
      });
      await markWatched(tx, mixed, 2, null);
      await seedWatching(tx, reader, { name: "Older", watchedAt: daysAgo(4) });

      // The undated watch adds nothing to `max(watched_at)`, so recency still decides.
      expect(await deckNames(tx, reader)).toEqual(["Mixed", "Older"]);
    });
  });

  it("falls back to the next episode's air date for an undated title, newest first", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedWatching(tx, reader, {
        name: "Aired recently",
        watchedAt: null,
        nextAirDate: daysFromToday(-5),
      });
      await seedWatching(tx, reader, {
        name: "Aired long ago",
        watchedAt: null,
        nextAirDate: daysFromToday(-400),
      });
      await seedWatching(tx, reader, { name: "Dated", watchedAt: daysAgo(3000) });

      // Even a watch from eight years ago outranks the whole fallback group: the rule is
      // a cascade, not one comparison between a watch date and an air date.
      expect(await deckNames(tx, reader)).toEqual([
        "Dated",
        "Aired recently",
        "Aired long ago",
      ]);
    });
  });

  it("sinks a next episode with no air date below both groups", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedWatching(tx, reader, {
        name: "Undatable",
        watchedAt: null,
        nextAirDate: null,
      });
      await seedWatching(tx, reader, {
        name: "Fallback",
        watchedAt: null,
        nextAirDate: daysFromToday(-400),
      });
      await seedWatching(tx, reader, { name: "Recency", watchedAt: daysAgo(3000) });

      expect(await deckNames(tx, reader)).toEqual([
        "Recency",
        "Fallback",
        "Undatable",
      ]);
    });
  });

  it("keeps a dated title in the recency group however undated its next episode is", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedWatching(tx, reader, {
        name: "Watched yesterday",
        watchedAt: daysAgo(1),
        nextAirDate: null,
      });
      await seedWatching(tx, reader, {
        name: "Watched last week",
        watchedAt: daysAgo(7),
      });

      expect(await deckNames(tx, reader)).toEqual([
        "Watched yesterday",
        "Watched last week",
      ]);
    });
  });

  it("breaks a remaining tie by closest to finishing", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const sameMoment = daysAgo(2);

      await seedWatching(tx, reader, {
        name: "Five left",
        watchedAt: sameMoment,
        remaining: 5,
      });
      await seedWatching(tx, reader, {
        name: "Two left",
        watchedAt: sameMoment,
        remaining: 2,
      });
      await seedWatching(tx, reader, {
        name: "Three left",
        watchedAt: sameMoment,
        remaining: 3,
      });

      expect(await deckNames(tx, reader)).toEqual([
        "Two left",
        "Three left",
        "Five left",
      ]);
    });
  });

  it("gives two identical loads an identical order", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const sameMoment = daysAgo(2);

      // Everything ties: the same last watch and the same remainder, and two of them
      // share a name, so only the entry id underneath can separate the last pair.
      for (const name of ["Bell", "Anvil", "Anvil", "Cinder"]) {
        await seedWatching(tx, reader, { name, watchedAt: sameMoment });
      }

      const first = await wholeDeck(tx, reader);
      const second = await wholeDeck(tx, reader);

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

describe("listUpNext — what the deck contains", () => {
  it("holds watching titles and leaves out the other four states", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedWatching(tx, reader, { name: "Watching", watchedAt: daysAgo(1) });

      // Caught up: every released episode watched, and the next one has not aired.
      const caughtUp = await seedShow(tx, reader, {
        name: "Caught up",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, airDate: UNRELEASED },
        ],
      });
      await markWatched(tx, caughtUp, 0, daysAgo(1));

      // Finished: every episode watched and the show is off the air.
      const finished = await seedShow(tx, reader, {
        name: "Finished",
        inProduction: false,
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await markWatched(tx, finished, 0, daysAgo(1));

      // Watchlist: no watches at all, so no progress and nothing next.
      await seedShow(tx, reader, {
        name: "Watchlist",
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });

      expect(await deckNames(tx, reader)).toEqual(["Watching"]);
    });
  });

  it("leaves out an abandoned title whatever its watches say", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Watched yesterday, part-way through, and abandoned: on watches alone this would
      // be the head of the deck. Abandoned outranks every derived state.
      const abandoned = await seedShow(tx, reader, {
        name: "Abandoned",
        abandonedAt: daysAgo(30),
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      await markWatched(tx, abandoned, 0, daysAgo(1));
      await seedWatching(tx, reader, { name: "Watching", watchedAt: daysAgo(9) });

      expect(await deckNames(tx, reader)).toEqual(["Watching"]);
    });
  });

  it("brings a caught-up show back once its next episode's air date has passed", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const returning = await seedShow(tx, reader, {
        name: "Returning",
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, airDate: UNRELEASED },
        ],
      });
      await markWatched(tx, returning, 0, daysAgo(1));

      expect(await deckNames(tx, reader)).toEqual([]);

      await tx
        .update(episode)
        .set({ airDate: daysFromToday(-1) })
        .where(eq(episode.id, returning.episodeIds[1]));

      expect(await deckNames(tx, reader)).toEqual(["Returning"]);
    });
  });

  it("leaves out a watching title that has nothing next", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Progress is a high-water mark, so watching the last episode and skipping the
      // first two leaves this *watching* with no episode after it. There is no entry to
      // render, which is the one place the deck is a strict subset of Library's
      // *Watching* chip rather than the same set.
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

      expect(await deckNames(tx, reader)).toEqual(["In order"]);
    });
  });

  it("returns this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");

      await seedWatching(tx, reader, { name: "Mine", watchedAt: daysAgo(5) });
      await seedWatching(tx, stranger, { name: "Theirs", watchedAt: daysAgo(1) });

      expect(await deckNames(tx, reader)).toEqual(["Mine"]);
    });
  });

  it("answers an account with nothing to watch with an empty page", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedWatching(tx, await seedUser(tx, "stranger"), {
        name: "Theirs",
        watchedAt: daysAgo(1),
      });

      const page = await listUpNext(reader, null, tx);

      expect(page.entries).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });
  });
});

describe("listUpNext — what an entry carries", () => {
  it("carries everything both surfaces render", async () => {
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

      const [entry] = (await listUpNext(reader, null, tx)).entries;

      expect(entry).toEqual({
        libraryEntryId: show.entryId,
        titleId: show.titleId,
        titleName: "Severance",
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
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, name: null },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      await markWatched(tx, show, 0, daysAgo(1));

      const [entry] = (await listUpNext(reader, null, tx)).entries;

      // Null is the honest answer; the surface's own rule is that it never degrades to
      // "S1 E2" instead, and it cannot follow that rule from a name this read invented.
      expect(entry.episodeName).toBeNull();
      expect(entry.posterPath).toBeNull();
    });
  });
});

describe("listUpNext — paging", () => {
  it("pages at the fetch size and stops when the deck runs out", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const total = UP_NEXT_PAGE_SIZE + 5;

      for (let index = 0; index < total; index += 1) {
        await seedWatching(tx, reader, {
          name: `Show ${String(index).padStart(3, "0")}`,
          watchedAt: daysAgo(index + 1),
        });
      }

      const first = await listUpNext(reader, null, tx);
      expect(first.entries).toHaveLength(UP_NEXT_PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();

      const second = await listUpNext(reader, first.nextCursor, tx);
      expect(second.entries).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
    });
  });

  it("gives page two nothing page one already had, and skips nothing between them", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const total = UP_NEXT_PAGE_SIZE + 5;

      // Every one of them ties on the last watch and on the remainder, so paging can
      // only be stable if the cursor carries the whole sort key down to the entry id.
      const sameMoment = daysAgo(2);
      for (let index = 0; index < total; index += 1) {
        await seedWatching(tx, reader, { name: "Identical", watchedAt: sameMoment });
      }

      const first = await listUpNext(reader, null, tx);
      const second = await listUpNext(reader, first.nextCursor, tx);
      const walked = [...first.entries, ...second.entries].map(
        (entry) => entry.libraryEntryId,
      );

      expect(second.nextCursor).toBeNull();
      expect(new Set(walked).size).toBe(total);
      expect(walked).toHaveLength(total);
    });
  });

  it("pages through the group that has no date to sort by at all", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const total = UP_NEXT_PAGE_SIZE + 3;

      // Every one of these is rank 2: no dated watch, and no air date on the next
      // episode either. Their sort timestamp is the constant that stands in for having
      // none, so this is the one shape of cursor that has to survive the round trip
      // through Postgres's own rendering of it.
      for (let index = 0; index < total; index += 1) {
        await seedWatching(tx, reader, {
          name: `Undatable ${String(index).padStart(3, "0")}`,
          watchedAt: null,
          nextAirDate: null,
        });
      }

      const walked = await wholeDeck(tx, reader);

      expect(walked).toHaveLength(total);
      expect(new Set(walked.map((entry) => entry.libraryEntryId)).size).toBe(total);
    });
  });

  it("walks the whole deck in the order one unbounded read would have given", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const total = UP_NEXT_PAGE_SIZE * 2 + 3;

      for (let index = 0; index < total; index += 1) {
        await seedWatching(tx, reader, {
          name: `Show ${String(index).padStart(3, "0")}`,
          // Two groups tie on the last watch, so the walk crosses a tie boundary and a
          // page boundary in the same read.
          watchedAt: daysAgo((index % 7) + 1),
          remaining: 2 + (index % 3),
        });
      }

      const walked = await wholeDeck(tx, reader);

      expect(walked).toHaveLength(total);
      expect(new Set(walked.map((entry) => entry.libraryEntryId)).size).toBe(total);
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
 */
interface SeedFixture {
  readonly titles: readonly { tmdb_id: number; kind: string; abandoned: boolean }[];
  readonly watches: readonly {
    tmdb_id: number;
    tmdb_episode_id: number;
    watched_at: string | null;
    key: string;
  }[];
}

/** Kept clear of the fixture's own ids, which top out well below this. */
const SYNTHETIC_EPISODE_BASE = 100_000_000;

function readSeedFixture(): SeedFixture {
  const file = path.join(import.meta.dirname, "..", "fixtures", "mediasafe-seed.json");
  return JSON.parse(readFileSync(file, "utf8")) as SeedFixture;
}

async function seedWholeFixture(
  tx: Transaction,
  userId: UserId,
  fixture: SeedFixture,
): Promise<void> {
  const watchedEpisodes = new Map<number, number[]>();
  for (const one of fixture.watches) {
    const seen = watchedEpisodes.get(one.tmdb_id) ?? [];
    if (!seen.includes(one.tmdb_episode_id)) seen.push(one.tmdb_episode_id);
    watchedEpisodes.set(one.tmdb_id, seen);
  }

  const titleIds = new Map<number, string>();
  const titleRows = await tx
    .insert(title)
    .values(
      fixture.titles.map((one) => ({
        kind: one.kind,
        tmdbId: one.tmdb_id,
        name: `Title ${one.tmdb_id}`,
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
    const titleId = titleIds.get(one.tmdb_id)!;
    const watched = [...(watchedEpisodes.get(one.tmdb_id) ?? [])].sort((a, b) => a - b);
    watched.forEach((tmdbEpisodeId, index) => {
      episodeValues.push({
        titleId,
        tmdbEpisodeId,
        seasonNo: 1,
        episodeNo: index + 1,
        airDate: RELEASED,
      });
    });
    // Two unwatched episodes after them: one to be up next, one to keep the title
    // *watching* rather than *caught up* whatever the first one's air date says.
    for (let offset = 0; offset < 2; offset += 1) {
      episodeValues.push({
        titleId,
        tmdbEpisodeId: SYNTHETIC_EPISODE_BASE + one.tmdb_id * 4 + offset,
        seasonNo: 1,
        episodeNo: watched.length + offset + 1,
        airDate: daysFromToday(-((one.tmdb_id % 900) + 1)),
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
        titleId: titleIds.get(one.tmdb_id)!,
        abandonedAt: one.abandoned ? daysAgo(400) : undefined,
      })),
    )
    .returning({ id: libraryEntry.id, titleId: libraryEntry.titleId });
  const entryByTitleId = new Map(entryRows.map((row) => [row.titleId, row.id]));
  for (const one of fixture.titles) {
    entryIds.set(one.tmdb_id, entryByTitleId.get(titleIds.get(one.tmdb_id)!)!);
  }

  const watchValues = fixture.watches.map((one) => ({
    userId,
    libraryEntryId: entryIds.get(one.tmdb_id)!,
    titleId: titleIds.get(one.tmdb_id)!,
    episodeId: episodeIds.get(one.tmdb_episode_id)!,
    watchedAt: one.watched_at === null ? null : new Date(one.watched_at),
    source: "tvtracker",
    sourceKey: one.key,
  }));
  for (let start = 0; start < watchValues.length; start += 2_000) {
    await tx.insert(watch).values(watchValues.slice(start, start + 2_000));
  }
}

describe("listUpNext — against the whole fixture", () => {
  it("orders all 284 of the fixture's watching titles, in one walk", async () => {
    await inTransaction(async (tx) => {
      const fixture = readSeedFixture();
      const reader = await seedUser(tx, "adham");
      await seedWholeFixture(tx, reader, fixture);

      const abandoned = new Set(
        fixture.titles.filter((one) => one.abandoned).map((one) => one.tmdb_id),
      );
      const lastWatch = new Map<number, string | null>();
      for (const one of fixture.watches) {
        if (one.watched_at === null) {
          if (!lastWatch.has(one.tmdb_id)) lastWatch.set(one.tmdb_id, null);
          continue;
        }
        const held = lastWatch.get(one.tmdb_id) ?? null;
        if (held === null || one.watched_at > held) {
          lastWatch.set(one.tmdb_id, one.watched_at);
        }
      }

      const expected = [...lastWatch.keys()]
        .filter((tmdbId) => !abandoned.has(tmdbId))
        .sort((a, b) => {
          const left = lastWatch.get(a) ?? null;
          const right = lastWatch.get(b) ?? null;
          if (left === null) return 1;
          if (right === null) return -1;
          return left < right ? 1 : left > right ? -1 : 0;
        })
        .map((tmdbId) => `Title ${tmdbId}`);

      // 439 titles carry a watch and 155 of them are abandoned; the remainder is the deck.
      expect(expected).toHaveLength(284);
      // Exactly one of the fixture's titles has no dated watch at all, so exactly one
      // reaches the air-date fallback — and it therefore sorts below all 283 others.
      expect([...lastWatch.values()].filter((at) => at === null)).toHaveLength(1);

      const walked = await wholeDeck(tx, reader);

      expect(walked.map((entry) => entry.titleName)).toEqual(expected);
      expect(new Set(walked.map((entry) => entry.libraryEntryId)).size).toBe(284);
      expect(walked.at(-1)!.titleName).toBe("Title 292144");
    });
  }, 120_000);
});
