import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { asUserId, ownedBy, type UserId } from "@/db/access";
import type { ExternalId } from "@/tmdb/mirror";
import type { Transaction } from "@/db/client";
import {
  episode,
  libraryEntry,
  libraryEntryProgress,
  libraryEntryState,
  libraryEntryUpNext,
  list,
  listMembership,
  title,
  user,
  watch,
} from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Build step 2's schema, and the three views that are the only place MediaSafe's five
 * states, progress and up next are defined.
 *
 * ── Why the tests are the verification ───────────────────────────────────────────────
 *
 * There is no UI in this ticket and there cannot be one: nothing writes a watch until
 * build step 4, so through the app every title would sit on the watchlist and four of the
 * five states would be unreachable. These fixtures are the only thing that exercises the
 * derivation rules at all before then.
 *
 * That matters because **a wrong derivation rule does not fail loudly.** A show that
 * never becomes *caught up* simply never appears on the surface that lists caught-up
 * shows, and the only person who could notice is the one assuming the app is right. Every
 * assertion below walks one rule from ADR-0001's *Derivation rules* — the states in their
 * order, the released-episode test, the specials exclusion, the high-water mark — against
 * real Postgres rather than a re-derivation of them in TypeScript.
 *
 * ── No new infrastructure ────────────────────────────────────────────────────────────
 *
 * `setUpTestDatabase` and `inTransaction` from issue #40's harness, and nothing else. The
 * helpers below build rows; they do not build a second harness. A real Postgres, the real
 * migration runner, one transaction per test, rolled back.
 */

setUpTestDatabase("mediasafe_schema_test");

/**
 * Postgres compares `air_date <= current_date` against the server's date. Fixtures sit a
 * month either side of it so that no assertion here can turn on which side of midnight
 * the suite happens to run.
 */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);
const UNRELEASED = daysFromToday(30);

/**
 * Unique-per-row values for the columns that carry a uniqueness constraint —
 * `(kind, tmdb_id)`, `tmdb_episode_id`, `(user_id, source, source_key)`.
 *
 * A counter rather than a random number, so a failure names the row it came from.
 */
let counter = 0;
const nextNumber = () => ++counter;

interface EpisodeSpec {
  seasonNo: number;
  episodeNo: number;
  /** Defaults to a month ago — released. `null` is TMDB not having dated it yet. */
  airDate?: string | null;
}

interface ShowSpec {
  /**
   * Shows only. `false` is what lets *finished* be reachable at all, and `null` — TMDB
   * not saying — is a state the derivation treats differently from both.
   */
  inProduction?: boolean | null;
  episodes: EpisodeSpec[];
  abandonedAt?: Date;
}

interface Show {
  userId: UserId;
  titleId: string;
  entryId: string;
  /** Parallel to the spec's `episodes`, so a test can say "watch the third one". */
  episodeIds: string[];
}

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

async function seedShow(
  tx: Transaction,
  userId: UserId,
  spec: ShowSpec,
): Promise<Show> {
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: nextNumber(),
      name: `Show ${counter}`,
      // Not `?? true`: that would turn an explicit `null` into `true` and make the
      // TMDB-did-not-say case unreachable through this helper.
      inProduction: "inProduction" in spec ? spec.inProduction : true,
    })
    .returning({ id: title.id });

  const episodeIds: string[] = [];
  for (const episodeSpec of spec.episodes) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: episodeSpec.seasonNo,
        episodeNo: episodeSpec.episodeNo,
        name: `Episode ${episodeSpec.seasonNo}-${episodeSpec.episodeNo}`,
        airDate: episodeSpec.airDate === undefined ? RELEASED : episodeSpec.airDate,
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

/**
 * A film in the catalogue and in nobody's library — the borrowed half of `seedFilm`, on
 * its own. Since amendment 7 a list may hold one of these, so it is a fixture in its own
 * right rather than only a step towards an entry.
 */
async function seedCatalogueFilm(tx: Transaction): Promise<string> {
  const [row] = await tx
    .insert(title)
    .values({
      kind: "film",
      tmdbId: nextNumber(),
      name: `Film ${counter}`,
      runtimeMins: 104,
    })
    .returning({ id: title.id });
  return row.id;
}

async function seedFilm(tx: Transaction, userId: UserId): Promise<Film> {
  const titleId = await seedCatalogueFilm(tx);

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId })
    .returning({ id: libraryEntry.id });

  return { userId, titleId, entryId: entry.id };
}

/**
 * A watch of the show's `index`-th episode.
 *
 * `watchedAt: null` is an **undated watch** — one you know happened but not when. Every
 * derivation that is not about dates has to count it like any other, which is what the
 * undated assertions below are for.
 */
async function markWatched(
  tx: Transaction,
  show: Show,
  index: number,
  { watchedAt = new Date() }: { watchedAt?: Date | null } = {},
): Promise<string> {
  const [row] = await tx
    .insert(watch)
    .values({
      userId: show.userId,
      libraryEntryId: show.entryId,
      titleId: show.titleId,
      episodeId: show.episodeIds[index],
      watchedAt,
      source: "app",
      sourceKey: `test-${nextNumber()}`,
    })
    .returning({ id: watch.id });
  return row.id;
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

/**
 * Asserts that `body` is rejected by one **named** constraint.
 *
 * Not `rejects.toThrow()`: "it threw" is also what a typo in the fixture does, and these
 * tests exist to prove that a specific key rejected a specific row. Drizzle wraps the
 * Postgres error — its own `message` is the failed query text, and the server's message,
 * the one naming the constraint, is on `cause` — so the whole chain is what gets read.
 */
async function violates(constraint: string, body: () => Promise<unknown>) {
  const thrown = await body().then(
    () => null,
    (error: unknown) => error,
  );

  expect(thrown, `expected ${constraint} to reject this`).not.toBeNull();

  // Bounded, because `cause` is an ordinary property and a cycle in it would hang the
  // suite rather than fail it. Nothing here nests more than a couple deep.
  const messages: string[] = [];
  let error = thrown;
  for (let depth = 0; depth < 10 && error instanceof Error; depth += 1) {
    messages.push(error.message);
    error = error.cause;
  }
  expect(messages.join("\n")).toContain(constraint);
}

async function stateOf(tx: Transaction, entryId: string): Promise<string> {
  const rows = await tx
    .select({ state: libraryEntryState.state })
    .from(libraryEntryState)
    .where(eq(libraryEntryState.libraryEntryId, entryId));
  expect(rows).toHaveLength(1);
  return rows[0].state;
}

/** `null` where there is no row — which is the answer, not a missing one. */
async function progressOf(tx: Transaction, entryId: string) {
  const rows = await tx
    .select({
      episodeId: libraryEntryProgress.episodeId,
      seasonNo: libraryEntryProgress.seasonNo,
      episodeNo: libraryEntryProgress.episodeNo,
    })
    .from(libraryEntryProgress)
    .where(eq(libraryEntryProgress.libraryEntryId, entryId));
  return rows[0] ?? null;
}

async function upNextOf(tx: Transaction, entryId: string) {
  const rows = await tx
    .select({
      episodeId: libraryEntryUpNext.episodeId,
      seasonNo: libraryEntryUpNext.seasonNo,
      episodeNo: libraryEntryUpNext.episodeNo,
    })
    .from(libraryEntryUpNext)
    .where(eq(libraryEntryUpNext.libraryEntryId, entryId));
  return rows[0] ?? null;
}

describe("the migration", () => {
  /**
   * SPEC.md §5 asks for the schema **whole, in one migration**, `list` and
   * `list_membership` included even though lists are not in v1. Asserted against the
   * committed SQL rather than against the database, because "the tables exist" is true of
   * six migrations as well as of one.
   */
  it("creates all six tables in one file", () => {
    const directory = path.join(import.meta.dirname, "..", "drizzle");
    const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));

    const tables = [
      "title",
      "episode",
      "library_entry",
      "watch",
      "list",
      "list_membership",
    ];
    const creating = files.filter((file) => {
      const sqlText = readFileSync(path.join(directory, file), "utf8");
      return tables.some((table) => sqlText.includes(`CREATE TABLE "${table}"`));
    });

    expect(creating).toHaveLength(1);

    const sqlText = readFileSync(path.join(directory, creating[0]), "utf8");
    for (const table of tables) {
      expect(sqlText).toContain(`CREATE TABLE "${table}"`);
    }
  });

  /**
   * The one thing in this ticket drizzle-kit cannot express, so the one thing that could
   * silently go missing. It was verified by reading the generated SQL and written in by
   * hand; this is what keeps it there.
   */
  it("makes the list-position constraint deferrable", async () => {
    await inTransaction(async (tx) => {
      const constraint = await tx.execute<{
        condeferrable: boolean;
        condeferred: boolean;
      }>(sql`
        select condeferrable, condeferred
        from pg_constraint
        where conname = 'list_membership_list_id_position_key'
      `);

      expect(constraint.rows).toHaveLength(1);
      expect(constraint.rows[0].condeferrable).toBe(true);
      expect(constraint.rows[0].condeferred).toBe(true);
    });
  });

  /**
   * The repoint (#143), asserted where it actually lives. `db/tables.ts` says the shape
   * and the migration applies it, and neither is evidence about the database that is
   * running — a regeneration that quietly re-derived the old composite key would leave
   * both files looking right.
   *
   * **`library_entry` must appear nowhere in this list.** Ownership is enforced on the
   * list, which is owned, plus a direct key to `user`; going through the library entry is
   * the thing that gated membership on owning the title.
   */
  it("points membership at the title, and ownership straight at the user", async () => {
    await inTransaction(async (tx) => {
      const keys = await tx.execute<{ conname: string; referenced: string }>(sql`
        select con.conname, target.relname as referenced
        from pg_constraint con
        join pg_class source on source.oid = con.conrelid
        join pg_class target on target.oid = con.confrelid
        where source.relname = 'list_membership' and con.contype = 'f'
        order by con.conname
      `);

      expect(keys.rows).toEqual([
        { conname: "list_membership_list_id_user_id_fk", referenced: "list" },
        { conname: "list_membership_title_id_title_id_fk", referenced: "title" },
        { conname: "list_membership_user_id_user_id_fk", referenced: "user" },
      ]);
    });
  });

  /**
   * Expand, not contract. `SPEC.md` §3.7 is forward-only and a column is not dropped in
   * the change that stops using it, so `library_entry_id` stays here — nullable, unread —
   * until #150 drops it. Nullable is what makes a membership writable at all now.
   */
  it("leaves the old library-entry column behind, nullable", async () => {
    await inTransaction(async (tx) => {
      const columns = await tx.execute<{ is_nullable: string }>(sql`
        select is_nullable
        from information_schema.columns
        where table_name = 'list_membership' and column_name = 'library_entry_id'
      `);

      expect(columns.rows).toEqual([{ is_nullable: "YES" }]);
    });
  });

  /**
   * `title_external_id_check`, both directions.
   *
   * The rule that an external id is `imdb:tt…` or `tvdb:…` is written twice — once as
   * `ExternalId` in `tmdb/mirror.ts`, once as this constraint — because TypeScript does
   * not reach Postgres and Postgres does not typecheck. Two spellings of one rule can
   * drift silently, and this is what stops them: the cast below is doing the job a future
   * reader's mistake would do for real, and the database has to refuse it.
   */
  it("refuses an external id nothing could look a title up by", async () => {
    await violates("title_external_id_check", () =>
      inTransaction(async (tx) => {
        await tx.insert(title).values({
          kind: "show",
          tmdbId: 999_001,
          // A bare IMDb id with no source on it — the exact shape `externalIdFrom` will
          // not mint and `ExternalId` will not accept, cast past the type on purpose.
          // Nothing can hand this to `/find/{id}?external_source=`.
          externalId: "tt0944947" as ExternalId,
          name: "Game of Thrones",
        });
      }),
    );
  });

  it("stores both spellings the mapping can mint", async () => {
    await inTransaction(async (tx) => {
      // The other direction: a constraint that rejected everything would pass the test
      // above and break every add.
      await tx.insert(title).values([
        { kind: "show", tmdbId: 999_002, externalId: "imdb:tt0944947", name: "Show" },
        { kind: "film", tmdbId: 999_003, externalId: "tvdb:121361", name: "Film" },
      ]);

      const rows = await tx
        .select({ tmdbId: title.tmdbId, externalId: title.externalId })
        .from(title)
        .where(and(eq(title.kind, "show"), eq(title.tmdbId, 999_002)));
      expect(rows[0].externalId).toBe("imdb:tt0944947");
    });
  });

  /**
   * ADR-0001's *Indexes* section, all five. Asserted because an index is the one thing in
   * that section that changes nothing observable when it goes missing — the queries still
   * return the right rows, slower, and nothing fails until the library is large.
   */
  it("creates ADR-0001's five indexes, the partial one included", async () => {
    await inTransaction(async (tx) => {
      const indexes = await tx.execute<{ indexname: string; indexdef: string }>(sql`
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'watch_library_entry_id_idx',
            'watch_episode_id_idx',
            'watch_user_id_watched_at_idx',
            'title_metadata_refreshed_at_idx',
            'library_entry_user_id_idx'
          )
        order by indexname
      `);

      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "library_entry_user_id_idx",
        "title_metadata_refreshed_at_idx",
        "watch_episode_id_idx",
        "watch_library_entry_id_idx",
        "watch_user_id_watched_at_idx",
      ]);

      // Streak and year in review both ignore undated watches, so the index they use
      // does too. A full index here would be the same rows plus the ones no query wants.
      const partial = indexes.rows.find(
        (row) => row.indexname === "watch_user_id_watched_at_idx",
      );
      expect(partial?.indexdef).toContain("WHERE (watched_at IS NOT NULL)");
    });
  });

  it("declares the three derived-state views as real views", async () => {
    await inTransaction(async (tx) => {
      const views = await tx.execute<{ relname: string; relkind: string }>(sql`
        select relname, relkind
        from pg_class
        where relname in (
          'library_entry_state', 'library_entry_progress', 'library_entry_up_next'
        )
        order by relname
      `);

      // `v` is a view. A table would be `r` and a materialised view `m` — and a
      // materialised view is the stored copy of derived state ADR-0001 rejected.
      expect(views.rows).toEqual([
        { relname: "library_entry_progress", relkind: "v" },
        { relname: "library_entry_state", relkind: "v" },
        { relname: "library_entry_up_next", relkind: "v" },
      ]);
    });
  });
});

describe("ownership", () => {
  it("leaves title and episode unowned, with no user_id to scope by", async () => {
    await inTransaction(async (tx) => {
      const columns = await tx.execute<{ table_name: string }>(sql`
        select table_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('title', 'episode')
          and column_name = 'user_id'
      `);

      // A Title is a fact about the world, not about an account: one row per TMDB id,
      // shared, so three accounts adding the same show store one copy of its episodes.
      expect(columns.rows).toEqual([]);
    });
  });

  it("cascades an account's owned rows away, and leaves the borrowed ones behind", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await markWatched(tx, show, 0);

      await tx.delete(user).where(eq(user.id, userId));

      // `watch` has no direct foreign key to `user`; it cascades through
      // `library_entry`, which is the composite key doing its second job.
      const watches = await tx.select().from(watch).where(eq(watch.userId, userId));
      const entries = await tx
        .select()
        .from(libraryEntry)
        .where(eq(libraryEntry.userId, userId));
      expect(watches).toEqual([]);
      expect(entries).toEqual([]);

      // Borrowed rows survive: they are not that account's data, and they are shared.
      const titles = await tx.select().from(title).where(eq(title.id, show.titleId));
      const episodes = await tx
        .select()
        .from(episode)
        .where(eq(episode.titleId, show.titleId));
      expect(titles).toHaveLength(1);
      expect(episodes).toHaveLength(1);
    });
  });

  it("rejects a watch attributed to the wrong account", async () => {
    await violates("watch_library_entry_id_user_id_title_id_fk", () =>
      inTransaction(async (tx) => {
        const alice = await seedUser(tx, "alice");
        const bob = await seedUser(tx, "bob");
        const show = await seedShow(tx, alice, {
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });

        // Alice's library entry, Bob's user id. The composite foreign key is what makes
        // this a Postgres error rather than a row nobody notices.
        await tx.insert(watch).values({
          userId: bob,
          libraryEntryId: show.entryId,
          titleId: show.titleId,
          episodeId: show.episodeIds[0],
          source: "app",
          sourceKey: "cross-account",
        });
      }),
    );
  });

  it("rejects a watch of an episode belonging to a different title", async () => {
    await violates("watch_episode_id_title_id_fk", () =>
      inTransaction(async (tx) => {
        const userId = await seedUser(tx, "alice");
        const watched = await seedShow(tx, userId, {
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });
        const other = await seedShow(tx, userId, {
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });

        await tx.insert(watch).values({
          userId,
          libraryEntryId: watched.entryId,
          titleId: watched.titleId,
          episodeId: other.episodeIds[0],
          source: "app",
          sourceKey: "cross-title",
        });
      }),
    );
  });
});

describe("episode identity", () => {
  /**
   * The reason the watch references `episode.id` rather than `(show, season, episode)`.
   * TMDB inserting a special renumbers a season, and history has to survive that.
   */
  it("keeps a watch pointed at its episode when TMDB renumbers the season", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: false,
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      const watchId = await markWatched(tx, show, 0);

      await tx
        .update(episode)
        .set({ seasonNo: 2, episodeNo: 7 })
        .where(eq(episode.id, show.episodeIds[0]));

      const rows = await tx
        .select({ episodeId: watch.episodeId })
        .from(watch)
        .where(eq(watch.id, watchId));
      expect(rows[0].episodeId).toBe(show.episodeIds[0]);

      // And the derived numbers follow the episode rather than the watch.
      expect(await progressOf(tx, show.entryId)).toMatchObject({
        seasonNo: 2,
        episodeNo: 7,
      });
    });
  });

  /**
   * `NO ACTION`, deliberately. A cascade here would make TMDB dropping an episode delete
   * somebody's history quietly; this makes the refresh fail instead.
   */
  it("refuses to delete a watched episode rather than deleting the watch with it", async () => {
    await violates("watch_episode_id_title_id_fk", () =>
      inTransaction(async (tx) => {
        const userId = await seedUser(tx, "alice");
        const show = await seedShow(tx, userId, {
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });
        await markWatched(tx, show, 0);

        await tx.delete(episode).where(eq(episode.id, show.episodeIds[0]));
      }),
    );
  });
});

describe("the five states", () => {
  it("puts a title with no watches on the watchlist", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });

      expect(await stateOf(tx, show.entryId)).toBe("watchlist");
    });
  });

  it("calls a show watching when some but not all released episodes have a watch", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      await markWatched(tx, show, 0);

      expect(await stateOf(tx, show.entryId)).toBe("watching");
    });
  });

  it("calls a show caught up when every released episode has a watch and it is still in production", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: true,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3, airDate: UNRELEASED },
        ],
      });
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 1);

      expect(await stateOf(tx, show.entryId)).toBe("caught_up");
    });
  });

  it("calls a show finished when every episode has a watch and it has ended", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: false,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 1);

      expect(await stateOf(tx, show.entryId)).toBe("finished");
    });
  });

  it("calls a watched film finished", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const film = await seedFilm(tx, userId);

      expect(await stateOf(tx, film.entryId)).toBe("watchlist");

      await markFilmWatched(tx, film);
      expect(await stateOf(tx, film.entryId)).toBe("finished");
    });
  });

  /**
   * Abandoned is tested first and outranks every derived state — a re-run import can add
   * watches to a title you gave up on without resurrecting it.
   */
  it("keeps an abandoned title abandoned, whatever its watches would say", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        abandonedAt: new Date(),
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      await markWatched(tx, show, 0);

      expect(await stateOf(tx, show.entryId)).toBe("abandoned");

      // The same rows without the flag say watching, which is what makes the assertion
      // above about ordering rather than about an accident of the fixture.
      await tx
        .update(libraryEntry)
        .set({ abandonedAt: null })
        .where(eq(libraryEntry.id, show.entryId));
      expect(await stateOf(tx, show.entryId)).toBe("watching");
    });
  });

  it("separates caught up from finished on in_production and nothing else", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: true,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 1);

      expect(await stateOf(tx, show.entryId)).toBe("caught_up");

      await tx
        .update(title)
        .set({ inProduction: false })
        .where(eq(title.id, show.titleId));
      expect(await stateOf(tx, show.entryId)).toBe("finished");
    });
  });

  /**
   * The one that needs no extra machinery, and the reason `finished` is not a stored
   * flag: a show that returns falls out of it on its own.
   */
  it("drops a finished show back to caught up when an unreleased episode appears", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: false,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 1);
      expect(await stateOf(tx, show.entryId)).toBe("finished");

      // A refresh finds a new season, dated next month.
      await tx.insert(episode).values({
        titleId: show.titleId,
        tmdbEpisodeId: nextNumber(),
        seasonNo: 2,
        episodeNo: 1,
        name: "The one after the gap",
        airDate: UNRELEASED,
      });

      expect(await stateOf(tx, show.entryId)).toBe("caught_up");
    });
  });

  /**
   * TMDB's season 0 is trailers, recaps and promotional clips. Without this exclusion
   * *finished* would come to mean "has no promotional clips".
   */
  it("reaches finished with an unwatched season 0", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: false,
        episodes: [
          { seasonNo: 0, episodeNo: 1 },
          { seasonNo: 0, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 1 },
        ],
      });
      await markWatched(tx, show, 2);

      expect(await stateOf(tx, show.entryId)).toBe("finished");
    });
  });

  it("counts neither an unreleased episode nor an undated one against being caught up", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: true,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          // Dated next month: announced, not out.
          { seasonNo: 1, episodeNo: 2, airDate: UNRELEASED },
          // TMDB has not dated it at all, which is not the same as it being out.
          { seasonNo: 1, episodeNo: 3, airDate: null },
        ],
      });
      await markWatched(tx, show, 0);

      expect(await stateOf(tx, show.entryId)).toBe("caught_up");
    });
  });

  /**
   * The rule is `in_production = false`, and `NULL = false` is NULL — so a show TMDB has
   * not told us about cannot reach *finished*, however completely it has been watched.
   *
   * Pinned rather than left to be discovered, because it is the one place the derivation
   * and CONTEXT.md read differently: the glossary calls caught up "a show that is still
   * in production", which an unknown is not. Treating unknown as *ended* would be worse —
   * it would call a show finished on missing data — and the mirror should never produce
   * this: `in_production` is null for films, and every show TMDB returns carries it.
   */
  it("keeps a show whose production status is unknown out of finished", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: null,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 1);

      expect(await stateOf(tx, show.entryId)).toBe("caught_up");

      // The same rows with the status known say finished, which is what makes the
      // assertion above about the null rather than about the fixture.
      await tx
        .update(title)
        .set({ inProduction: false })
        .where(eq(title.id, show.titleId));
      expect(await stateOf(tx, show.entryId)).toBe("finished");
    });
  });

  it("counts an undated watch towards the state like any other", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: false,
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      // Both imported: they happened, nobody knows when.
      await markWatched(tx, show, 0, { watchedAt: null });
      await markWatched(tx, show, 1, { watchedAt: null });

      expect(await stateOf(tx, show.entryId)).toBe("finished");
    });
  });

  it("gives every library entry exactly one state", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      const film = await seedFilm(tx, userId);

      const rows = await tx
        .select({ state: libraryEntryState.state })
        .from(libraryEntryState)
        .where(ownedBy(userId, libraryEntryState));

      // Two entries, two rows: the view is per library entry, and a title with no
      // episodes and no watches still has somewhere to stand.
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.state === "watchlist")).toBe(true);
      expect(show.entryId).not.toBe(film.entryId);
    });
  });

  it("scopes to one account, and does not leak another's entries", async () => {
    await inTransaction(async (tx) => {
      const alice = await seedUser(tx, "alice");
      const bob = await seedUser(tx, "bob");
      const hers = await seedShow(tx, alice, {
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await seedShow(tx, bob, { episodes: [{ seasonNo: 1, episodeNo: 1 }] });

      const rows = await tx
        .select({ libraryEntryId: libraryEntryState.libraryEntryId })
        .from(libraryEntryState)
        .where(ownedBy(alice, libraryEntryState));

      // The views carry `user_id` precisely so the choke point can do this. A read of
      // one of them without it is the same mistake as an unscoped read of the table.
      expect(rows).toEqual([{ libraryEntryId: hers.entryId }]);
    });
  });
});

describe("progress and up next", () => {
  /**
   * A high-water mark, not a count of episodes watched. Skipping one passes it
   * permanently — MediaSafe never sends you backwards.
   */
  it("takes progress past a skipped episode and never back to it", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
          { seasonNo: 1, episodeNo: 4 },
          { seasonNo: 1, episodeNo: 5 },
        ],
      });
      await markWatched(tx, show, 0);
      // Episode 2 and 3 skipped.
      await markWatched(tx, show, 3);

      expect(await progressOf(tx, show.entryId)).toMatchObject({
        episodeId: show.episodeIds[3],
        seasonNo: 1,
        episodeNo: 4,
      });

      // And up next is the one after the high-water mark, not the first gap.
      expect(await upNextOf(tx, show.entryId)).toMatchObject({
        episodeId: show.episodeIds[4],
        seasonNo: 1,
        episodeNo: 5,
      });
    });
  });

  it("carries up next across a season boundary", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 2, episodeNo: 1 },
        ],
      });
      await markWatched(tx, show, 1);

      expect(await upNextOf(tx, show.entryId)).toMatchObject({
        episodeId: show.episodeIds[2],
        seasonNo: 2,
        episodeNo: 1,
      });
    });
  });

  it("has no up next when nothing follows", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        inProduction: false,
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });
      await markWatched(tx, show, 0);

      // Absence is the answer. Nothing is invented to fill the gap.
      expect(await upNextOf(tx, show.entryId)).toBeNull();
    });
  });

  it("counts an undated watch towards progress", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
          { seasonNo: 1, episodeNo: 3 },
        ],
      });
      // Progress is derived from *what* you watched, not when.
      await markWatched(tx, show, 1, { watchedAt: null });

      expect(await progressOf(tx, show.entryId)).toMatchObject({
        seasonNo: 1,
        episodeNo: 2,
      });
      expect(await upNextOf(tx, show.entryId)).toMatchObject({
        seasonNo: 1,
        episodeNo: 3,
      });
    });
  });

  it("leaves a special out of progress and out of up next", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 0, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 1);

      // A watched special is a real watch — it is markable — and it is not progress.
      expect(await progressOf(tx, show.entryId)).toMatchObject({
        episodeId: show.episodeIds[1],
        seasonNo: 1,
        episodeNo: 1,
      });
      expect(await upNextOf(tx, show.entryId)).toMatchObject({
        episodeId: show.episodeIds[2],
      });
    });
  });

  it("gives a special-only watcher no progress at all", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 0, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 1 },
        ],
      });
      await markWatched(tx, show, 0);

      expect(await progressOf(tx, show.entryId)).toBeNull();
      expect(await upNextOf(tx, show.entryId)).toBeNull();
    });
  });

  it("gives a film no progress and no up next", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const film = await seedFilm(tx, userId);
      await markFilmWatched(tx, film);

      // A film's watch carries no episode, so there is nothing to be part-way through.
      expect(await progressOf(tx, film.entryId)).toBeNull();
      expect(await upNextOf(tx, film.entryId)).toBeNull();
    });
  });

  it("gives progress one row per entry however many watches an episode has", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });
      // A rewatch is a second row, not a counter — and it must not double the view.
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 0);

      const rows = await tx
        .select()
        .from(libraryEntryProgress)
        .where(eq(libraryEntryProgress.libraryEntryId, show.entryId));
      expect(rows).toHaveLength(1);
    });
  });
});

describe("lists", () => {
  async function seedList(tx: Transaction, userId: UserId, titleIds: string[]) {
    const [row] = await tx
      .insert(list)
      .values({ userId, name: `List ${nextNumber()}` })
      .returning({ id: list.id });

    for (const [index, titleId] of titleIds.entries()) {
      await tx.insert(listMembership).values({
        listId: row.id,
        titleId,
        userId,
        position: index + 1,
      });
    }
    return row.id;
  }

  /**
   * The repoint, stated as the one row it makes representable. A list is your own
   * grouping, not a view of your library, so *"anything in the catalogue"* has to include
   * things you have never added.
   */
  it("holds a title that is in nobody's library", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const unowned = await seedCatalogueFilm(tx);
      const listId = await seedList(tx, userId, [unowned]);

      const rows = await tx
        .select({ titleId: listMembership.titleId })
        .from(listMembership)
        .where(eq(listMembership.listId, listId));

      expect(rows).toEqual([{ titleId: unowned }]);
      expect(
        await tx.select().from(libraryEntry).where(eq(libraryEntry.titleId, unowned)),
      ).toEqual([]);
    });
  });

  it("rejects a membership whose list belongs to another account", async () => {
    await violates("list_membership_list_id_user_id_fk", () =>
      inTransaction(async (tx) => {
        const alice = await seedUser(tx, "alice");
        const bob = await seedUser(tx, "bob");
        const film = await seedCatalogueFilm(tx);
        const [his] = await tx
          .insert(list)
          .values({ userId: bob, name: `List ${nextNumber()}` })
          .returning({ id: list.id });

        // Alice's user id, Bob's list. Ownership no longer travels through the library
        // entry, so this composite key is the only thing making a list that quietly
        // holds another account's rows unrepresentable.
        await tx.insert(listMembership).values({
          listId: his.id,
          titleId: film,
          userId: alice,
          position: 1,
        });
      }),
    );
  });

  it("rejects a membership pointing at a title that does not exist", async () => {
    await violates("list_membership_title_id_title_id_fk", () =>
      inTransaction(async (tx) => {
        const userId = await seedUser(tx, "alice");
        const [row] = await tx
          .insert(list)
          .values({ userId, name: `List ${nextNumber()}` })
          .returning({ id: list.id });

        await tx.insert(listMembership).values({
          listId: row.id,
          titleId: "00000000-0000-0000-0000-000000000000",
          userId,
          position: 1,
        });
      }),
    );
  });

  /** What the primary key says now that it is `(list_id, title_id)`. */
  it("keeps a title in a list at most once", async () => {
    await violates("list_membership_list_id_title_id_pk", () =>
      inTransaction(async (tx) => {
        const userId = await seedUser(tx, "alice");
        const film = await seedCatalogueFilm(tx);
        const listId = await seedList(tx, userId, [film]);

        await tx
          .insert(listMembership)
          .values({ listId, titleId: film, userId, position: 2 });
      }),
    );
  });

  /**
   * The whole reason the constraint is deferred. An immediate one rejects the first
   * update of a swap, because the position it moves into has not been vacated yet.
   */
  it("lets a whole reorder happen inside one transaction", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const first = await seedCatalogueFilm(tx);
      const second = await seedCatalogueFilm(tx);
      const listId = await seedList(tx, userId, [first, second]);

      await tx
        .update(listMembership)
        .set({ position: 2 })
        .where(and(eq(listMembership.listId, listId), eq(listMembership.titleId, first)));
      await tx
        .update(listMembership)
        .set({ position: 1 })
        .where(
          and(eq(listMembership.listId, listId), eq(listMembership.titleId, second)),
        );

      // The harness rolls back rather than committing, so this is what forces the
      // deferred check to happen at all. Without it the assertion would pass even if
      // the reorder had left two rows at the same position.
      await tx.execute(sql`set constraints all immediate`);

      const rows = await tx
        .select({
          titleId: listMembership.titleId,
          position: listMembership.position,
        })
        .from(listMembership)
        .where(eq(listMembership.listId, listId));

      expect(rows.sort((a, b) => a.position - b.position)).toEqual([
        { titleId: second, position: 1 },
        { titleId: first, position: 2 },
      ]);
    });
  });

  it("still refuses two entries at the same position", async () => {
    await violates("list_membership_list_id_position_key", () =>
      inTransaction(async (tx) => {
        const userId = await seedUser(tx, "alice");
        const first = await seedCatalogueFilm(tx);
        const second = await seedCatalogueFilm(tx);
        const listId = await seedList(tx, userId, [first, second]);

        await tx
          .update(listMembership)
          .set({ position: 1 })
          .where(
            and(eq(listMembership.listId, listId), eq(listMembership.titleId, second)),
          );

        // Deferred, not absent. The collision is caught here instead of at the update.
        await tx.execute(sql`set constraints all immediate`);
      }),
    );
  });
});

/**
 * The constraint this migration creates, not the write path that will lean on it.
 *
 * SPEC.md §6's test 3 — that a retried click is a no-op and a genuine rewatch is a second
 * row — belongs to build step 4, where there is a write to retry. What is checkable now
 * is the thing step 4 will stand on: that the database, not the application, is what
 * makes two facts with one origin impossible.
 */
describe("watch identity", () => {
  it("refuses a second watch with the same source and key", async () => {
    await violates("watch_user_id_source_source_key_key", () =>
      inTransaction(async (tx) => {
        const userId = await seedUser(tx, "alice");
        const show = await seedShow(tx, userId, {
          episodes: [{ seasonNo: 1, episodeNo: 1 }],
        });

        const values = {
          userId,
          libraryEntryId: show.entryId,
          titleId: show.titleId,
          episodeId: show.episodeIds[0],
          source: "app",
          sourceKey: "one-click",
        };

        await tx.insert(watch).values(values);
        // A different instant, the same origin. Identity comes from where the fact came
        // from, so this is the same fact and the key says so.
        await tx.insert(watch).values({ ...values, watchedAt: new Date() });
      }),
    );
  });

  it("takes a second watch of the same episode under a different key", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "alice");
      const show = await seedShow(tx, userId, {
        episodes: [{ seasonNo: 1, episodeNo: 1 }],
      });

      // A rewatch is a second row, never a counter — so `(user, episode)` must not be
      // unique, and this is the assertion that says so.
      await markWatched(tx, show, 0);
      await markWatched(tx, show, 0);

      const rows = await tx
        .select()
        .from(watch)
        .where(eq(watch.libraryEntryId, show.entryId));
      expect(rows).toHaveLength(2);
    });
  });
});
