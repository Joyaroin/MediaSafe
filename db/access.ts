import { and, eq, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { type Executor, getDb } from "./client";
import { episode, libraryEntry, title } from "./tables";
import { libraryEntryState, libraryEntryUpNext } from "./views";
/**
 * The direction is deliberate: `tmdb/mirror.ts` knows nothing about the database, and
 * what it produces is *rows*, so the shapes belong to the mapping that derives them
 * rather than being restated here. `tmdb/mirror.ts` is pure and imports nothing, which is
 * what makes it importable from both sides of this application — `db/` here, and the
 * search screen in the browser. `tmdb/catalogue.ts`, which has the network in it, is
 * `server-only` and is never reachable from either.
 */
import {
  catalogueKeyOf,
  type CatalogueKey,
  type TitleMirror,
} from "@/tmdb/mirror";

/**
 * The data-access choke point: the only module that reads or writes owned rows.
 *
 * ── Why one place ────────────────────────────────────────────────────────────────────
 *
 * There is no row-level security. SPEC.md §6 rules it out for a reason `tvtracker` had
 * to learn twice: Neon's connection owns the tables, so it bypasses policies, and a
 * policy that is bypassed is worse than no policy because it reads like protection.
 *
 * So **one filtered column, in one place, is the entire isolation mechanism.** Every
 * owned table carries `user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE`
 * (ADR-0001), and the only thing standing between one account's library and another's is
 * that the predicate is actually there.
 *
 * ── What that is, exactly, and what it is not ────────────────────────────────────────
 *
 * Be precise about the guarantee, because overstating it is how it stops being checked.
 * Inside this module a bare `eq(watch.userId, …)`, or a `where` left off entirely, still
 * compiles. Nothing makes the filter unforgettable.
 *
 * What is enforced is narrower and still worth having: **ESLint confines every query in
 * the codebase to this file** (`eslint.config.mjs` — no other module may import
 * `db/client`, `db/driver` or `drizzle-orm`, by any specifier). So the surface on which a
 * `user_id` filter can be forgotten is one short module that exists to be read for that,
 * rather than every server component in the app. `ownedBy` then makes the filter one
 * greppable expression, and makes pointing it at an unowned table a type error.
 *
 * A gate that genuinely could not be got past would have to own every query shape build
 * step 2 needs — joins, `and()`, partial column lists, the derived-state views. Written
 * now it would be bypassed by the third real query and would then be worse than this,
 * because it would still read like a gate.
 *
 * ── The shape, which is the deliverable ──────────────────────────────────────────────
 *
 * 1. **Every exported function takes the user id as its first argument.** Never a
 *    session, never a request, never `headers()`. A function that resolves its own
 *    caller cannot be called for a different user in a test, an import, or a nightly
 *    job — and, worse, it is a second place where "who is this" gets decided.
 * 2. **Session-to-user-id resolution happens once, at the boundary**, in
 *    `lib/session.ts`. Nothing here imports it. The direction of that dependency is the
 *    property: auth knows about the database, the database knows nothing about auth.
 * 3. **The executor is the last argument and defaults to the pool** —
 *    `(userId, …, executor: Executor = getDb())`. A caller already inside a transaction
 *    passes it; everyone else ignores it. A default argument is evaluated per call, so
 *    importing this module still never opens a connection, and there is no ambient
 *    context to forget to enter.
 *
 *    That default is the production path and is deliberately never exercised by a test:
 *    `getDb()` throws under vitest, and the harness always passes its transaction. A
 *    test that trips the default has found a function that ignored the executor it was
 *    given, which is the bug the throw exists to name.
 *
 * `ownedBy` was the whole module at build step 1, because there were no library entries
 * and no watches to read. It was built anyway (issue #40) on the argument that a later
 * step finding no module here reaches for the database directly; issue #55 is that later
 * step, and the two functions at the foot of this file are the first real queries.
 *
 * `title` and `episode` are global and unowned — one row per TMDB id, shared across
 * accounts (ADR-0001). Reads of those take no user id and cannot be scoped, which is why
 * `ownedBy` will not typecheck against them. **That does not put them outside this
 * module.** `addTitleToLibrary` writes both, and it is here for the reason the module
 * exists: it is one transaction that writes global rows *and* an owned one, and splitting
 * it so that only the owned half lived behind the choke point would mean the unowned half
 * lived nowhere.
 */

declare const userIdBrand: unique symbol;

/**
 * Better Auth's `user.id` — `text`, not a uuid — and branded, so that it is not
 * interchangeable with the other strings this app is about to be full of.
 *
 * ADR-0001 gives `library_entry`, `watch`, `list` and `list_membership` a uuid `id` of
 * their own alongside `user_id`, and `watch` carries a `source_key`. Read into variables,
 * those are all `string`, and so is a user id — so `readWatches(entryId)` against a
 * signature expecting a user id compiles clean and scopes to nobody's rows, which is the
 * benign half of that mistake.
 *
 * The cost is one cast, in `lib/session.ts`, at the boundary that mints the value. That
 * is the trade: one cast where a human is looking, in exchange for the compiler checking
 * every call site build steps 2-4 add.
 */
export type UserId = string & { readonly [userIdBrand]: true };

/**
 * Marks a string as a user id. The one honest use is `lib/session.ts`, on the id Better
 * Auth just resolved from a session; tests use it on their own fixtures. Anywhere else
 * it is a cast wearing a function's clothes.
 */
export function asUserId(id: string): UserId {
  return id as UserId;
}

/**
 * Any table with a `user_id` column: `library_entry`, `watch`, `list`,
 * `list_membership`. Structural on purpose — a table gains ownership by carrying the
 * column, not by being added to a list here that could fall out of date.
 */
export interface OwnedTable {
  userId: PgColumn;
}

/**
 * The predicate that scopes a query to one account, and the single expression the whole
 * isolation model rests on.
 *
 * Every read and write of an owned table goes through this rather than writing
 * `eq(table.userId, userId)` at the call site. That buys two things: the filter is
 * greppable in one place, and passing an unowned table (`title`, `episode`) is a type
 * error rather than a query that quietly returns everybody's rows.
 *
 * It is not a `where` clause on its own — a query that needs more conditions combines it
 * with `and()`. What it is is the condition that may never be the one left out.
 *
 * One thing it does not check: `table` is not tied to the table the query selects from,
 * so `ownedBy(userId, watch)` on a select from `library_entry` builds a predicate against
 * a table that is not in the FROM clause. Postgres rejects that outright — it is a loud
 * error at the first run, not a silent leak — which is why the fix is not a signature
 * that could only bind them by owning the whole query builder.
 */
export function ownedBy(userId: UserId, table: OwnedTable): SQL {
  return eq(table.userId, userId);
}

/**
 * Which of these catalogue results are already in this account's library.
 *
 * The search screen's *a result already in your library says so rather than offering to
 * add it twice*, and it is a per-account question about global rows — the same show is in
 * one library and not another — which is why it takes a user id like everything else here
 * and joins through `library_entry` rather than reading `title` alone.
 *
 * **An empty `keys` returns without querying**, and that guard is load-bearing rather than
 * an optimisation: `or()` over nothing is `undefined`, `and(ownedBy(…), undefined)` is
 * just `ownedBy(…)`, and the query would quietly widen from *these twenty* to *the whole
 * library*. Nothing would look wrong; it would simply be a bigger read every time somebody
 * cleared the field.
 */
export async function libraryCatalogueKeys(
  userId: UserId,
  keys: readonly CatalogueKey[],
  executor: Executor = getDb(),
): Promise<ReadonlySet<string>> {
  if (keys.length === 0) return new Set();

  const rows = await executor
    .select({ kind: title.kind, tmdbId: title.tmdbId })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .where(
      and(
        ownedBy(userId, libraryEntry),
        or(
          ...keys.map((key) =>
            and(eq(title.kind, key.kind), eq(title.tmdbId, key.tmdbId)),
          ),
        ),
      ),
    );

  /**
   * The keys come back out of the rows rather than out of `keys`, so the answer is what
   * the database found rather than what was asked — and `title.kind` is a `text` column
   * with a `CHECK`, which Drizzle types as `string`. Rather than cast it, each row is
   * matched against the key that produced it: the set then contains only keys the caller
   * already holds, and a `kind` the database somehow had that is neither `film` nor
   * `show` matches nothing instead of being asserted into the type.
   */
  const held = new Set(rows.map((row) => `${row.kind}:${row.tmdbId}`));
  return new Set(keys.map(catalogueKeyOf).filter((key) => held.has(key)));
}

/** Whether the add created a library entry, or found one already there. */
export interface AddOutcome {
  readonly added: boolean;
}

/**
 * Put one title in this account's library, mirroring it on the way in.
 *
 * ── The sharpest edge in build step 2 ────────────────────────────────────────────────
 *
 * This writes three tables and **two of them are global**. `title` and `episode` are
 * unowned, one row per TMDB id, shared by every account (ADR-0001) — so one person adding
 * a show creates the rows every other person reads, and re-adding one refreshes what they
 * see. That is the intended design, not an accident of normalisation: a Title is a fact
 * about the world (`CONTEXT.md`), and MediaSafe owns none of it.
 *
 * It is also why the mapping that produces `mirror` is a tested pure function
 * (`tmdb/mirror.ts`) rather than a few lines inline here. This function does no
 * interpreting at all; it writes what it is handed.
 *
 * ── One transaction, and why the executor still comes last ───────────────────────────
 *
 * The three writes are one transaction because a `library_entry` pointing at a half-written
 * show is a library entry whose *finished* and *caught up* states are wrong. It is opened
 * here rather than by the caller because `eslint.config.mjs` confines the connection to
 * this module — a caller cannot open one. Passing an executor that is already a
 * transaction still works: Drizzle nests it as a savepoint, which is what the test harness
 * relies on when it rolls everything back.
 *
 * ── The three conflicts, each resolved differently on purpose ────────────────────────
 *
 *  - **`title`** upserts. Adding is the natural refresh point for a title somebody else
 *    added months ago, and `metadata_refreshed_at` moves with it so the nightly sweep
 *    (ADR-0001) does not immediately do the work again.
 *  - **`episode`** upserts on `tmdb_episode_id`, which is identity; season and episode
 *    numbers are borrowed attributes and are updated, never matched on. If TMDB has
 *    renumbered a season since the last add, the *other* unique — `(title_id, season_no,
 *    episode_no)` — can still reject the batch, and it should: that is a genuine upstream
 *    renumbering, it is `SPEC.md` §11.3's open question arriving early, and ADR-0001's
 *    standing answer is that it fails loudly rather than quietly repointing history.
 *  - **`library_entry`** does nothing on conflict and reports it. A title already in your
 *    library is not added twice, and the caller is told which of the two happened rather
 *    than being left to assume.
 */
export async function addTitleToLibrary(
  userId: UserId,
  mirror: TitleMirror,
  executor: Executor = getDb(),
): Promise<AddOutcome> {
  return executor.transaction(async (tx) => {
    const [mirrored] = await tx
      .insert(title)
      .values({
        kind: mirror.kind,
        tmdbId: mirror.tmdbId,
        name: mirror.name,
        releaseYear: mirror.releaseYear,
        posterPath: mirror.posterPath,
        inProduction: mirror.inProduction,
        runtimeMins: mirror.runtimeMins,
      })
      .onConflictDoUpdate({
        target: [title.kind, title.tmdbId],
        set: {
          name: sql`excluded.name`,
          releaseYear: sql`excluded.release_year`,
          posterPath: sql`excluded.poster_path`,
          inProduction: sql`excluded.in_production`,
          runtimeMins: sql`excluded.runtime_mins`,
          metadataRefreshedAt: sql`now()`,
        },
      })
      .returning({ id: title.id });

    if (mirror.episodes.length > 0) {
      await tx
        .insert(episode)
        .values(
          mirror.episodes.map((one) => ({
            titleId: mirrored.id,
            tmdbEpisodeId: one.tmdbEpisodeId,
            seasonNo: one.seasonNo,
            episodeNo: one.episodeNo,
            name: one.name,
            airDate: one.airDate,
            runtimeMins: one.runtimeMins,
          })),
        )
        .onConflictDoUpdate({
          target: episode.tmdbEpisodeId,
          set: {
            titleId: sql`excluded.title_id`,
            seasonNo: sql`excluded.season_no`,
            episodeNo: sql`excluded.episode_no`,
            name: sql`excluded.name`,
            airDate: sql`excluded.air_date`,
            runtimeMins: sql`excluded.runtime_mins`,
          },
        });
    }

    const created = await tx
      .insert(libraryEntry)
      .values({ userId, titleId: mirrored.id })
      .onConflictDoNothing({ target: [libraryEntry.userId, libraryEntry.titleId] })
      .returning({ id: libraryEntry.id });

    return { added: created.length > 0 };
  });
}

/**
 * The five states `library_entry_state` can return, and the list `stateFrom` matches
 * against. Order carries no meaning — nothing reads it, and nothing should: the library's
 * order is the query's `ORDER BY`.
 *
 * These are the strings the view emits, not labels. What a reader sees is the surface's to
 * write; what is stored is snake_case because `db/views.ts` says so.
 */
export const LIBRARY_STATES = [
  "watching",
  "caught_up",
  "finished",
  "watchlist",
  "abandoned",
] as const;

/** Where one title stands. Derived in `db/views.ts`, never stored (ADR-0001). */
export type LibraryState = (typeof LIBRARY_STATES)[number];

/**
 * The episode after your progress, when there is one.
 *
 * **A named episode and an unnamed one are the same case; nothing next is a different
 * one.** `episodeName` is `null` where TMDB has not named the episode, and the whole
 * object is `null` where there is no next episode at all — a title you have not started,
 * a film, a show you have watched to the end of what is mirrored. Collapsing the two
 * would make *nothing to watch* and *the next episode has no name yet* the same line on
 * the cell, and they are not the same fact.
 *
 * There is no season or episode number here on purpose. `docs/design/v1-surfaces.md` §4
 * makes *episodes are named, never numbered alone* a hard rule with no degrading surface,
 * so a surface that had the numbers to hand would be one keystroke from breaking it.
 */
export interface UpNext {
  readonly episodeName: string | null;
}

/** One cell of the library grid, and everything it prints. */
export interface LibraryEntryRow {
  readonly libraryEntryId: string;
  readonly titleId: string;
  /** Borrowed. Replaced by a refresh, like every other fact about a title. */
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  readonly state: LibraryState;
  readonly upNext: UpNext | null;
}

/**
 * Every library entry in one account, with where it stands and what is next in it.
 *
 * ── One query, 472 rows, no N+1 ──────────────────────────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §7 sizes this at 472 titles, which is what makes the shape
 * of the read matter more than its cleverness: the state and the up-next episode are
 * joined here rather than asked per cell, because 472 cells each asking two questions is
 * the request storm `tvtracker` shipped (its cold deck once issued 114 requests for 57
 * shows). The derivation itself is not repeated — the two views are the definition, and
 * this joins them.
 *
 * ── Why the state join is inner and the up-next join is not ──────────────────────────
 *
 * `library_entry_state` has a row for **every** library entry: its `case` has an `else`,
 * and it joins `title` through a `NOT NULL` foreign key. So an inner join drops nothing,
 * and it is the honest one — a `left` join here would type `state` as nullable and invite
 * a fallback, which is a state invented in TypeScript for a row the database could not
 * classify. `library_entry_up_next` genuinely has no row when nothing is next, and that
 * absence is the answer rather than a gap to fill.
 *
 * ── No ordering control, and an order anyway ─────────────────────────────────────────
 *
 * The sort control is issue #57's, and this ticket must reserve no space for it
 * (`SPEC.md` §9). The grid still needs a fixed order, so it takes §7's default — **Title
 * A–Z** — with the tiebreak §7 also requires: without one, two entries sharing a name
 * swap places between two loads that read identical rows, and the grid reshuffles under a
 * reader for no reason they can see. `lower()` rather than the database's collation, so
 * the order does not turn on which locale the server was initialised in.
 *
 * ── There is no `try` here, and there will not be ────────────────────────────────────
 *
 * A failed read throws into `app/(signed-in)/library/error.tsx`. Returning `[]` from a
 * failure is the one bug this codebase is built around not having (`AGENTS.md`), because
 * an empty library and a database that is down would then be the same screen.
 */
export async function listLibraryEntries(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<readonly LibraryEntryRow[]> {
  const rows = await executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleId: title.id,
      name: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
      state: libraryEntryState.state,
      upNextEpisodeId: libraryEntryUpNext.episodeId,
      upNextEpisodeName: episode.name,
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(
      libraryEntryState,
      eq(libraryEntryState.libraryEntryId, libraryEntry.id),
    )
    .leftJoin(libraryEntryUpNext, eq(libraryEntryUpNext.libraryEntryId, libraryEntry.id))
    .leftJoin(episode, eq(episode.id, libraryEntryUpNext.episodeId))
    .where(ownedBy(userId, libraryEntry))
    .orderBy(sql`lower(${title.name})`, libraryEntry.id);

  return rows.map((row) => ({
    libraryEntryId: row.libraryEntryId,
    titleId: row.titleId,
    name: row.name,
    releaseYear: row.releaseYear,
    posterPath: row.posterPath,
    state: stateFrom(row.state),
    /**
     * The episode id, not the name, is what says whether anything is next — the name is
     * nullable and an unnamed next episode is still a next episode.
     */
    upNext:
      row.upNextEpisodeId === null ? null : { episodeName: row.upNextEpisodeName },
  }));
}

/**
 * The view's `state` column is `text`, which Drizzle types as `string`, and a cast here
 * would be the surface trusting a promise nothing checks.
 *
 * So it is matched against the five instead — the same move `libraryCatalogueKeys` makes
 * with catalogue keys — and a sixth value **throws**. That is deliberate and it is the
 * error discipline, not an exception to it: a state nothing can render means the view and
 * this file have gone out of step, and the honest treatment for that is the read failure
 * the boundary already draws. A default of *watchlist* would put every title in the
 * library on a shelf it is not on, and nobody would ever see an error.
 */
function stateFrom(value: string): LibraryState {
  const known = LIBRARY_STATES.find((state) => state === value);
  if (known === undefined) {
    throw new Error(`library_entry_state returned an unknown state: ${value}`);
  }
  return known;
}
