import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addTitleToLibrary,
  addTitleToLibraryWatched,
  asUserId,
  ownedBy,
  type Executor,
  recordWatch,
  type UserId,
} from "@/db/access";
import {
  episode,
  libraryEntry,
  libraryEntryState,
  title,
  user,
  watch,
} from "@/db/schema";
import type { TitleMirror } from "@/tmdb/mirror";
import { database, inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `addTitleToLibraryWatched`, against real Postgres — issue #222.
 *
 * ── Why this write earns a test ──────────────────────────────────────────────────────
 *
 * `tests/mark-watched-up-to.test.ts` makes the argument and every word of it holds here:
 * this is **a whole show's worth of rows a reader never inspects one by one**, written by
 * one tap on a screen that shows them no episode list at all. A rule that is off by an
 * air date, that catches a special, or that duplicates history already recorded produces
 * a library that is quietly wrong, and the reader's only evidence would be a state chip
 * reading *caught up* months later where they expected *finished*.
 *
 * It is also the one write in the application that **adds and records in the same
 * transaction**, so the all-or-nothing guarantee spans two tables that were never before
 * written together — a half-landed press here is a library entry whose state is a lie.
 *
 * The state each show lands in is checked through `library_entry_state` itself rather
 * than by re-deriving the rule, exactly as `tests/mark-watched-up-to.test.ts` does: the
 * view is the definition (`db/views.ts`), and a test that re-implemented it would only
 * agree with itself.
 *
 * ── No network ───────────────────────────────────────────────────────────────────────
 *
 * The mirror is passed in, as it is to `addTitleToLibrary` — the fixtures below are the
 * shape `tmdb/mirror.ts` produces, so nothing here calls TMDB.
 */

setUpTestDatabase("mediasafe_add_watched_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);
const UNRELEASED = daysFromToday(30);

let counter = 0;
const nextNumber = () => ++counter;
/** A fresh `source_key` — one per press, exactly as the browser mints one per tap. */
const nextKey = () => `press-${nextNumber()}`;

async function seedUser(tx: Executor, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  readonly seasonNo: number;
  readonly episodeNo: number;
  /** Defaults to released 30 days ago. */
  readonly airDate?: string | null;
}

/** A show mirror in the shape `tmdb/mirror.ts` produces. */
function showMirror(
  episodes: readonly EpisodeSpec[],
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
    inProduction: true,
    runtimeMins: null,
    episodes: episodes.map((one) => ({
      tmdbEpisodeId: nextNumber() + 900_000,
      seasonNo: one.seasonNo,
      episodeNo: one.episodeNo,
      name: `S${one.seasonNo}E${one.episodeNo}`,
      airDate: one.airDate === undefined ? RELEASED : one.airDate,
      runtimeMins: 45,
      stillPath: `/still-${one.seasonNo}-${one.episodeNo}.jpg`,
    })),
    ...overrides,
  };
}

function filmMirror(): TitleMirror {
  const tmdbId = nextNumber();
  return {
    kind: "film",
    tmdbId,
    externalId: null,
    name: `Film ${tmdbId}`,
    releaseYear: 1977,
    releaseDate: "1977-05-25",
    posterPath: "/film.jpg",
    inProduction: null,
    runtimeMins: 121,
    episodes: [],
  };
}

/** A whole show, two seasons of three, with a special in front of them. */
const TWO_SEASONS: readonly EpisodeSpec[] = [
  { seasonNo: 0, episodeNo: 1 },
  { seasonNo: 1, episodeNo: 1 },
  { seasonNo: 1, episodeNo: 2 },
  { seasonNo: 1, episodeNo: 3 },
  { seasonNo: 2, episodeNo: 1 },
  { seasonNo: 2, episodeNo: 2 },
  { seasonNo: 2, episodeNo: 3 },
];

async function entryIdFor(
  tx: Executor,
  userId: UserId,
  mirror: TitleMirror,
): Promise<string> {
  const [row] = await tx
    .select({ id: libraryEntry.id })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .where(
      and(
        ownedBy(userId, libraryEntry),
        eq(title.kind, mirror.kind),
        eq(title.tmdbId, mirror.tmdbId),
      ),
    );
  return row.id;
}

/** Which episodes of this entry carry a watch, named `season-episode` and in order. */
async function watchedEpisodes(
  tx: Executor,
  userId: UserId,
  entryId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ seasonNo: episode.seasonNo, episodeNo: episode.episodeNo })
    .from(watch)
    .innerJoin(episode, eq(episode.id, watch.episodeId))
    .where(and(ownedBy(userId, watch), eq(watch.libraryEntryId, entryId)))
    .orderBy(asc(episode.seasonNo), asc(episode.episodeNo));
  return rows.map((one) => `${one.seasonNo}-${one.episodeNo}`);
}

async function watchRowsOf(tx: Executor, userId: UserId, entryId: string) {
  return tx
    .select()
    .from(watch)
    .where(and(ownedBy(userId, watch), eq(watch.libraryEntryId, entryId)));
}

async function stateOf(tx: Executor, entryId: string): Promise<string> {
  const [row] = await tx
    .select({ state: libraryEntryState.state })
    .from(libraryEntryState)
    .where(eq(libraryEntryState.libraryEntryId, entryId));
  return row.state;
}

async function abandonedAtOf(tx: Executor, entryId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ abandonedAt: libraryEntry.abandonedAt })
    .from(libraryEntry)
    .where(eq(libraryEntry.id, entryId));
  return row.abandonedAt;
}

describe("addTitleToLibraryWatched", () => {
  it("adds a film and records the one watch it has", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = filmMirror();

      const outcome = await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      expect(outcome).toMatchObject({ added: true, recorded: 1 });

      /**
       * The **global** row, not this account's entry — the distinction is the whole point
       * of reporting it (issue #219). This write mirrors the title like the plain add
       * does, so its caller busts every other holder's cached library from this id, and an
       * entry id here would bust nobody.
       */
      const [titleRow] = await tx
        .select({ id: title.id })
        .from(title)
        .where(and(eq(title.kind, mirror.kind), eq(title.tmdbId, mirror.tmdbId)));
      expect(outcome.titleId).toBe(titleRow.id);

      const entryId = await entryIdFor(tx, userId, mirror);
      const rows = await watchRowsOf(tx, userId, entryId);
      // A film's watch carries no episode — the shape the schema gives it, and the one
      // `recordWatch` already writes for the same title.
      expect(rows).toHaveLength(1);
      expect(rows[0].episodeId).toBeNull();
      expect(await stateOf(tx, entryId)).toBe("finished");
    }));

  it("records every released episode above season zero of an ended show, and takes it to finished", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror(TWO_SEASONS, { inProduction: false });

      const outcome = await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      const entryId = await entryIdFor(tx, userId, mirror);
      // Six numbered episodes, and not the special in front of them.
      expect(outcome).toMatchObject({ added: true, recorded: 6 });
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual([
        "1-1",
        "1-2",
        "1-3",
        "2-1",
        "2-2",
        "2-3",
      ]);
      // The special is still unwatched, and that is the whole point of excluding it:
      // *finished* must not come to mean "has no promotional clips" (`db/views.ts`).
      expect(await stateOf(tx, entryId)).toBe("finished");
    }));

  it("takes a show still in production to caught up, leaving what has not aired alone", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror(
        [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 2, episodeNo: 1, airDate: UNRELEASED },
        ],
        { inProduction: true },
      );

      const outcome = await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      const entryId = await entryIdFor(tx, userId, mirror);
      expect(outcome.recorded).toBe(2);
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual(["1-1", "1-2"]);
      expect(await stateOf(tx, entryId)).toBe("caught_up");
    }));

  it("leaves an episode with no air date alone, which is not the same as an old one", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([
        { seasonNo: 1, episodeNo: 1 },
        { seasonNo: 1, episodeNo: 2, airDate: null },
        { seasonNo: 1, episodeNo: 3 },
      ]);

      await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      const entryId = await entryIdFor(tx, userId, mirror);
      // `db/views.ts`'s released test is `air_date IS NOT NULL AND air_date <=
      // current_date`, and a null is not released. Announced-but-undated is a real TMDB
      // state, and recording it would claim a watch of something that has not happened.
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual(["1-1", "1-3"]);
    }));

  it("records an episode that aired today", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([{ seasonNo: 1, episodeNo: 1, airDate: daysFromToday(0) }]);

      await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      // The boundary is `<=`, the same `<=` the views make, so the write and the state
      // that reads it cannot disagree about what today's episode is.
      expect(await watchedEpisodes(tx, userId, await entryIdFor(tx, userId, mirror))).toEqual(
        ["1-1"],
      );
    }));

  it("adds nothing the second time, whether the key is the same or a fresh one", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror(TWO_SEASONS);
      const key = nextKey();

      const first = await addTitleToLibraryWatched(userId, mirror, key, tx);
      const retried = await addTitleToLibraryWatched(userId, mirror, key, tx);
      const pressedAgain = await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      expect(first).toMatchObject({ added: true, recorded: 6 });
      // A retry is caught by `UNIQUE (user_id, source, source_key)`; a genuinely new
      // press is caught by the already-watched filter. Both are needed, and neither
      // stands in for the other.
      expect(retried).toMatchObject({ added: false, recorded: 0 });
      expect(pressedAgain).toMatchObject({ added: false, recorded: 0 });
      expect(await watchedEpisodes(tx, userId, await entryIdFor(tx, userId, mirror))).toEqual([
        "1-1",
        "1-2",
        "1-3",
        "2-1",
        "2-2",
        "2-3",
      ]);
    }));

  it("adds nothing the second time for a film either", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = filmMirror();

      await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);
      const pressedAgain = await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      // A second row against a film is a **rewatch**, and one
      // tap on *Add — watched* has no business claiming the reader saw it twice.
      expect(pressedAgain).toMatchObject({ added: false, recorded: 0 });
      expect(
        await watchRowsOf(tx, userId, await entryIdFor(tx, userId, mirror)),
      ).toHaveLength(1);
    }));

  it("adds only what was missing on a show already partly watched", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror(TWO_SEASONS);

      await addTitleToLibrary(userId, mirror, tx);
      const entryId = await entryIdFor(tx, userId, mirror);
      const [alreadySeen] = await tx
        .select({ id: episode.id })
        .from(episode)
        .innerJoin(libraryEntry, eq(libraryEntry.titleId, episode.titleId))
        .where(
          and(
            eq(libraryEntry.id, entryId),
            eq(episode.seasonNo, 1),
            eq(episode.episodeNo, 2),
          ),
        );
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: alreadySeen.id, sourceKey: nextKey() },
        tx,
      );

      const outcome = await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      // Five written, not six: `1-2` already had a watch, and a second row against it
      // would be a rewatch the reader never asked for.
      expect(outcome).toMatchObject({ added: false, recorded: 5 });
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual([
        "1-1",
        "1-2",
        "1-3",
        "2-1",
        "2-2",
        "2-3",
      ]);
    }));

  it("stamps every backfilled row with the time it was written, not with nothing", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror(TWO_SEASONS);

      await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      const rows = await watchRowsOf(tx, userId, await entryIdFor(tx, userId, mirror));
      // Issue #222's stated divergence from what the import writes for the same
      // situation, and the reason the rails reorder afterwards. Undated here would be
      // the other choice, and it was not made.
      expect(rows.every((one) => one.watchedAt !== null)).toBe(true);
      // One instant for the whole press — `now()` is the transaction's, so adding a show
      // you finished years ago is one event in the record rather than sixty-two.
      expect(new Set(rows.map((one) => one.watchedAt?.toISOString())).size).toBe(1);
      expect(rows.every((one) => one.source === "app")).toBe(true);
    }));

  it("does not give a title back that was given up on", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror(TWO_SEASONS, { inProduction: false });

      await addTitleToLibrary(userId, mirror, tx);
      const entryId = await entryIdFor(tx, userId, mirror);
      await tx
        .update(libraryEntry)
        .set({ abandonedAt: new Date() })
        .where(eq(libraryEntry.id, entryId));

      await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      // `recordWatch` clears `abandoned_at`; a backfill does not — amendment 9,
      // which `markWatchedUpTo` already stands on and this write joins.
      expect(await abandonedAtOf(tx, entryId)).not.toBeNull();
      expect(await stateOf(tx, entryId)).toBe("abandoned");
    }));

  it("writes nothing at all — not even the library entry — when the write fails part-way", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror(TWO_SEASONS);

      /**
       * A real failure inside the write, from Postgres rather than from a stub — the
       * device `tests/mark-watched-up-to.test.ts` uses, for the reason it gives there:
       * the insert is one statement over every row, so a part-way failure has to be
       * manufactured rather than argued about.
       *
       * What this file asserts that that one cannot is the **add**: the rollback has to
       * reach `library_entry` too, or a lost press leaves a watchlist entry for a show
       * the reader said they had finished.
       */
      await tx.execute(sql`
        create function refuse_one_episode() returns trigger as $$
        begin
          if exists (
            select 1 from episode e
            where e.id = new.episode_id and e.season_no = 1 and e.episode_no = 2
          ) then
            raise exception 'refused';
          end if;
          return new;
        end
        $$ language plpgsql
      `);
      await tx.execute(sql`
        create trigger refuse_one_episode_trigger
        before insert on watch
        for each row execute function refuse_one_episode()
      `);

      await expect(
        addTitleToLibraryWatched(userId, mirror, nextKey(), tx),
      ).rejects.toThrow();

      await tx.execute(sql`drop trigger refuse_one_episode_trigger on watch`);

      const entries = await tx
        .select()
        .from(libraryEntry)
        .where(ownedBy(userId, libraryEntry));
      // Not "the title added and half its watches" — none of it. The reader who saw a
      // toast and reloaded finds their library exactly as they left it.
      expect(entries).toEqual([]);
    }));

  it("records into this account and never into another one holding the same title", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "adham");
      const stranger = await seedUser(tx, "someone-else");
      const mirror = showMirror(TWO_SEASONS);

      await addTitleToLibrary(stranger, mirror, tx);
      await addTitleToLibraryWatched(owner, mirror, nextKey(), tx);

      // `title` and `episode` are global; `watch` and `library_entry` are not,
      // and this is the write where the two meet in one transaction.
      expect(await watchedEpisodes(tx, owner, await entryIdFor(tx, owner, mirror))).toEqual([
        "1-1",
        "1-2",
        "1-3",
        "2-1",
        "2-2",
        "2-3",
      ]);
      expect(
        await watchedEpisodes(tx, stranger, await entryIdFor(tx, stranger, mirror)),
      ).toEqual([]);
    }));

  /**
   * Not `inTransaction`, because a race cannot happen inside one transaction — see
   * `support/database.ts`'s `database()` for what that costs and why it is worth it here.
   */
  it("records a show once when two surfaces press it at the same moment", async () => {
    const db = database();
    const userId = await seedUser(db, "concurrent");
    const mirror = showMirror(TWO_SEASONS);

    /**
     * Two presses with **two keys**, which is what makes this a race rather than a
     * retry: the browser holds one key per press, so a second tap on one control
     * carries the first one's key and is caught by `UNIQUE (user_id, source,
     * source_key)`. Two *surfaces* — the search row in one tab, the unowned title page
     * in another — mint two, and neither guard in the write can see the other's rows
     * until it commits.
     *
     * What stops them is `mirrorTitle`'s `ON CONFLICT DO UPDATE` against `title`, which
     * locks that row for the rest of the transaction, so the two presses queue and the
     * second reads `watch` after the first has committed. That is a property of the
     * mirror refresh rather than of the write under test, which is exactly why it is
     * asserted here — the day something skips the refresh, this fails.
     */
    const [first, second] = await Promise.all([
      addTitleToLibraryWatched(userId, mirror, nextKey(), db),
      addTitleToLibraryWatched(userId, mirror, nextKey(), db),
    ]);

    const entryId = await entryIdFor(db, userId, mirror);
    // Six rows, not twelve. A duplicate here is a **rewatch**, and a
    // phantom one is indistinguishable on every screen from one the reader made —
    // There are 1,156 real ones already in the library.
    expect(await watchedEpisodes(db, userId, entryId)).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "2-1",
      "2-2",
      "2-3",
    ]);
    // And the two presses agree about who wrote them: one recorded the six, the other
    // found nothing left to do. Not both reporting six.
    expect(first.recorded + second.recorded).toBe(6);
    expect(await watchRowsOf(db, userId, entryId)).toHaveLength(6);
  });

  /**
   * The same race with the entry **already there** — the half the test above cannot
   * reach, and the one where the cheaper explanation runs out.
   *
   * On a new title `library_entry`'s own unique index would serialize the two anyway: the
   * second `INSERT … ON CONFLICT DO NOTHING` waits on the first's uncommitted row. An
   * entry that already exists conflicts with nothing, so that particular queue never
   * forms, and what holds the property up is the `title` lock alone. Both cases are here
   * because a change could take away either one.
   *
   * Reachable from two stale tabs: the controls only render for a title you do not own,
   * so both surfaces have to have been drawn before either add landed.
   */
  it("records a show once when two presses land on an entry that already exists", async () => {
    const db = database();
    const userId = await seedUser(db, "concurrent-existing");
    const mirror = showMirror(TWO_SEASONS);

    await addTitleToLibrary(userId, mirror, db);

    const [first, second] = await Promise.all([
      addTitleToLibraryWatched(userId, mirror, nextKey(), db),
      addTitleToLibraryWatched(userId, mirror, nextKey(), db),
    ]);

    const entryId = await entryIdFor(db, userId, mirror);
    expect(await watchedEpisodes(db, userId, entryId)).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "2-1",
      "2-2",
      "2-3",
    ]);
    expect(first.recorded + second.recorded).toBe(6);
  });

  it("adds a show with nothing released yet and records nothing", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirror([{ seasonNo: 1, episodeNo: 1, airDate: UNRELEASED }]);

      const outcome = await addTitleToLibraryWatched(userId, mirror, nextKey(), tx);

      // The add still lands. There is nothing to record, and that is the honest answer
      // for a show whose first episode has not aired — not a failure, and not a watch.
      expect(outcome).toMatchObject({ added: true, recorded: 0 });
      const entryId = await entryIdFor(tx, userId, mirror);
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual([]);
      // *Watchlist*, because `db/views.ts` reaches "no watches" before it reaches any
      // derived rule — which is the honest answer for a show whose first episode has not
      // aired, and is what the plain add would have produced. Nothing special-cases it.
      expect(await stateOf(tx, entryId)).toBe("watchlist");
    }));
});
