import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  asUserId,
  markWatchedThrough,
  ownedBy,
  recordWatch,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  episode,
  libraryEntry,
  libraryEntryState,
  title,
  user,
  watch,
} from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `markWatchedThrough`, against real Postgres — issue #196.
 *
 * ── Why this write earns a test where a single mark would not ────────────────────────
 *
 * `tests/watch-idempotency.test.ts` argues the case for `recordWatch`: a wrong
 * idempotency rule does not crash, it writes a row that looks exactly like history. Every
 * word of that applies here and then some, because this write is **sixty-two rows a
 * reader never inspects one by one**. A rule that is off by one episode, that catches a
 * special, that duplicates a watch already recorded, or that leaves half a season behind
 * on a failure produces a library that is quietly wrong — and the reader's only evidence
 * would be a state chip reading *caught up* where they expected *finished*, months later,
 * with nothing left to reconstruct what happened.
 *
 * So the assertions below spend their weight on the four things that fail silently: which
 * episodes are covered, which are excluded, what a second press does, and what a failure
 * leaves behind. The state the show lands in afterwards is checked through
 * `library_entry_state` itself rather than by re-deriving the rule here — the view is the
 * definition (`db/views.ts`), and a test that re-implemented it would agree with itself.
 *
 * ── No network ───────────────────────────────────────────────────────────────────────
 *
 * The same as `tests/watch-idempotency.test.ts`: this takes ids the caller already
 * resolved, so nothing here calls TMDB.
 */

setUpTestDatabase("mediasafe_mark_watched_through_test");

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

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
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

interface ShowOverrides {
  readonly inProduction?: boolean;
  readonly abandoned?: boolean;
}

interface SeededShow {
  readonly entryId: string;
  readonly titleId: string;
  /** Keyed `season-episode`, so a test names an episode the way a reader would. */
  readonly episodeIds: Record<string, string>;
}

async function seedShow(
  tx: Transaction,
  userId: UserId,
  episodes: readonly EpisodeSpec[],
  overrides: ShowOverrides = {},
): Promise<SeededShow> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: `Show ${number}`,
      releaseYear: 2022,
      inProduction: overrides.inProduction ?? true,
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
        name: `S${one.seasonNo}E${one.episodeNo}`,
        airDate: one.airDate === undefined ? RELEASED : one.airDate,
      })
      .returning({ id: episode.id });
    episodeIds[`${one.seasonNo}-${one.episodeNo}`] = inserted.id;
  }

  const [entry] = await tx
    .insert(libraryEntry)
    .values({
      userId,
      titleId: row.id,
      abandonedAt: overrides.abandoned === true ? new Date() : null,
    })
    .returning({ id: libraryEntry.id });

  return { entryId: entry.id, titleId: row.id, episodeIds };
}

async function seedFilm(tx: Transaction, userId: UserId): Promise<{ entryId: string }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({ kind: "film", tmdbId: number, name: `Film ${number}`, runtimeMins: 100 })
    .returning({ id: title.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });
  return { entryId: entry.id };
}

/** Which episodes of this entry carry a watch, named `season-episode` and in order — the
 *  shape a reader would describe the answer in, rather than a bag of uuids. */
async function watchedEpisodes(
  tx: Transaction,
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

async function watchRowsOf(tx: Transaction, userId: UserId, entryId: string) {
  return tx
    .select()
    .from(watch)
    .where(and(ownedBy(userId, watch), eq(watch.libraryEntryId, entryId)));
}

async function stateOf(tx: Transaction, entryId: string): Promise<string> {
  const [row] = await tx
    .select({ state: libraryEntryState.state })
    .from(libraryEntryState)
    .where(eq(libraryEntryState.libraryEntryId, entryId));
  return row.state;
}

async function abandonedAtOf(tx: Transaction, entryId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ abandonedAt: libraryEntry.abandonedAt })
    .from(libraryEntry)
    .where(eq(libraryEntry.id, entryId));
  return row.abandonedAt;
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

describe("markWatchedThrough", () => {
  it("records the episode pressed and every earlier one, and nothing after it", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS);

      const outcome = await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["2-1"],
          sourceKey: nextKey(),
        },
        tx,
      );

      // Across the season boundary, because "earlier" is the show's own order and not
      // this season's: everything up to and including S2E1.
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual([
        "1-1",
        "1-2",
        "1-3",
        "2-1",
      ]);
      expect(outcome.recorded).toBe(4);
    }));

  it("leaves specials alone, and leaves a special's own mark standing", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS);

      // The reader marked the special themselves, one press at a time, before this.
      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["0-1"], sourceKey: nextKey() },
        tx,
      );

      await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["2-3"],
          sourceKey: nextKey(),
        },
        tx,
      );

      // `0-1` is here because the reader put it there and nothing took it away; no other
      // special was written, and the one that was is not duplicated.
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual([
        "0-1",
        "1-1",
        "1-2",
        "1-3",
        "2-1",
        "2-2",
        "2-3",
      ]);
    }));

  it("takes a show whose episodes have all aired to finished, over its unwatched special", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS, {
        inProduction: false,
      });

      await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["2-3"],
          sourceKey: nextKey(),
        },
        tx,
      );

      // The special is still unwatched, and that is the whole point of excluding it:
      // *finished* must not come to mean "has no promotional clips" (`db/views.ts`).
      expect(await stateOf(tx, entryId)).toBe("finished");
    }));

  it("takes a show still in production to caught up, not finished", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(
        tx,
        userId,
        [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 2, episodeNo: 1, airDate: UNRELEASED },
        ],
        { inProduction: true },
      );

      await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["1-2"],
          sourceKey: nextKey(),
        },
        tx,
      );

      expect(await stateOf(tx, entryId)).toBe("caught_up");
    }));

  it("adds only what was missing on a show already partly watched", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS);

      await recordWatch(
        userId,
        { libraryEntryId: entryId, episodeId: episodeIds["1-2"], sourceKey: nextKey() },
        tx,
      );

      const outcome = await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["1-3"],
          sourceKey: nextKey(),
        },
        tx,
      );

      // Two written, not three: `1-2` already had a watch, and a second row against it
      // would be a rewatch the reader never asked for — invisible on every screen next to
      // the genuine ones (`docs/adr/0001-watch-identity-and-derived-state.md`).
      expect(outcome.recorded).toBe(2);
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual(["1-1", "1-2", "1-3"]);
    }));

  it("is a no-op pressed twice — the same key, and then nothing left to write", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS);
      const key = nextKey();

      const first = await markWatchedThrough(
        userId,
        { libraryEntryId: entryId, throughEpisodeId: episodeIds["1-3"], sourceKey: key },
        tx,
      );
      const retried = await markWatchedThrough(
        userId,
        { libraryEntryId: entryId, throughEpisodeId: episodeIds["1-3"], sourceKey: key },
        tx,
      );

      expect(first.recorded).toBe(3);
      expect(retried.recorded).toBe(0);
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual(["1-1", "1-2", "1-3"]);
    }));

  it("stamps every backfilled row with the time it was written, not with nothing", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS);

      await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["1-3"],
          sourceKey: nextKey(),
        },
        tx,
      );

      const rows = await watchRowsOf(tx, userId, entryId);
      // Issue #196's stated divergence from what the import writes for the same
      // situation, and the reason the rails reorder afterwards. Undated here would be
      // the other choice, and it was not made.
      expect(rows.every((one) => one.watchedAt !== null)).toBe(true);
      // One instant for the whole press — `now()` is the transaction's, so a backfill is
      // one event in the record rather than sixty-two microseconds apart.
      expect(new Set(rows.map((one) => one.watchedAt?.toISOString())).size).toBe(1);
      expect(rows.every((one) => one.source === "app")).toBe(true);
    }));

  it("does not give a title back that was given up on", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS, {
        abandoned: true,
        inProduction: false,
      });

      await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["2-3"],
          sourceKey: nextKey(),
        },
        tx,
      );

      // `recordWatch` clears `abandoned_at`; this does not, and the state chip is where
      // the difference shows. `db/access.ts`'s own docblock carries the argument.
      expect(await abandonedAtOf(tx, entryId)).not.toBeNull();
      expect(await stateOf(tx, entryId)).toBe("abandoned");
    }));

  it("writes nothing at all when the write fails part-way", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS);

      /**
       * A real failure inside the write, from Postgres rather than from a stub: a trigger
       * that refuses one episode of the several this press covers — the second, so the
       * refusal lands after rows the write had already produced rather than on the first
       * one it tried. It is created inside the test's own transaction and vanishes with
       * the rollback, the same device `tests/data-access.test.ts` uses for its fixture
       * table.
       *
       * The episode is named by its position rather than by its id, because a `create
       * function` is DDL and carries no bind parameters — an interpolated id would arrive
       * as one and be refused by the protocol before Postgres ever read the body.
       *
       * Nothing else can produce a part-way failure here — the insert is one statement
       * over every row — which is exactly why the guarantee needs a test that manufactures
       * one rather than an argument that it cannot happen.
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
        markWatchedThrough(
          userId,
          {
            libraryEntryId: entryId,
            throughEpisodeId: episodeIds["2-3"],
            sourceKey: nextKey(),
          },
          tx,
        ),
      ).rejects.toThrow();

      await tx.execute(sql`drop trigger refuse_one_episode_trigger on watch`);

      // Not "five of six" — none. A reader who saw a toast and reloaded finds the show
      // exactly as they left it, which is what makes retrying safe.
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual([]);
    }));

  it("refuses an entry that is not this account's", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "adham");
      const stranger = await seedUser(tx, "someone-else");
      const { entryId, episodeIds } = await seedShow(tx, owner, TWO_SEASONS);

      await expect(
        markWatchedThrough(
          stranger,
          {
            libraryEntryId: entryId,
            throughEpisodeId: episodeIds["1-3"],
            sourceKey: nextKey(),
          },
          tx,
        ),
      ).rejects.toThrow(/not found in this account's library/);

      expect(await watchedEpisodes(tx, owner, entryId)).toEqual([]);
    }));

  it("refuses an episode that belongs to a different title", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mine = await seedShow(tx, userId, TWO_SEASONS);
      const other = await seedShow(tx, userId, TWO_SEASONS);

      await expect(
        markWatchedThrough(
          userId,
          {
            libraryEntryId: mine.entryId,
            throughEpisodeId: other.episodeIds["1-3"],
            sourceKey: nextKey(),
          },
          tx,
        ),
      ).rejects.toThrow(/not an episode of/);

      expect(await watchedEpisodes(tx, userId, mine.entryId)).toEqual([]);
    }));

  it("writes nothing for a special, which has no numbered episode before it", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId, episodeIds } = await seedShow(tx, userId, TWO_SEASONS);

      const outcome = await markWatchedThrough(
        userId,
        {
          libraryEntryId: entryId,
          throughEpisodeId: episodeIds["0-1"],
          sourceKey: nextKey(),
        },
        tx,
      );

      // The control never offers this (`programme-note-episodes.tsx`), so this is what a
      // hand-made request gets: the rule applied literally, rather than a special case.
      expect(outcome.recorded).toBe(0);
      expect(await watchedEpisodes(tx, userId, entryId)).toEqual([]);
    }));

  it("refuses a film, which has no episode to mark through", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const { entryId } = await seedFilm(tx, userId);
      const show = await seedShow(tx, userId, TWO_SEASONS);

      await expect(
        markWatchedThrough(
          userId,
          {
            libraryEntryId: entryId,
            throughEpisodeId: show.episodeIds["1-3"],
            sourceKey: nextKey(),
          },
          tx,
        ),
      ).rejects.toThrow(/not an episode of/);
    }));
});
