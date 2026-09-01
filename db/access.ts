import {
  and,
  asc,
  eq,
  desc,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { user } from "@/auth-schema";

import { type Executor, getDb } from "./client";
import { DEFAULT_LIBRARY_SORT, type LibrarySort } from "./library-sort";
import { episode, libraryEntry, list, listMembership, title, titleReconciliation, watch } from "./tables";
import {
  libraryEntryRemaining,
  libraryEntryState,
  libraryEntryUpNext,
} from "./views";
/**
 * Re-exported so a caller outside `db/` that needs to pass its own transaction — the
 * nightly sweep's route handler is the one that exists today — can type it without
 * reaching for `@/db/client` itself, which `eslint.config.mjs`'s choke point forbids
 * everywhere but here. The type is inert on its own; only `db/client.ts` can produce one.
 */
export type { Executor };
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
  type ExternalId,
  type TitleKind,
  type TitleMirror,
} from "@/tmdb/mirror";
/**
 * The native import format, declared once in `import/native-format.ts` and read from
 * there rather than restated — the same direction as `tmdb/mirror.ts` above, and for the
 * same reason. It is a pure module with no filesystem and no network in it, so importing
 * it here brings neither.
 */
import type { NativeImportWatch } from "@/import/native-format";

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
 * 1. **Every exported function that serves a caller rows takes the user id as its first
 *    argument.** Never a session, never a request, never `headers()`. A function that
 *    resolves its own caller cannot be called for a different user in a test, an import,
 *    or a nightly job — and, worse, it is a second place where "who is this" gets decided.
 *
 *    The qualifier is load-bearing and was added by issue #219, because the rule had
 *    already grown two exceptions and read as though it had none. **Two functions here
 *    read an owned table across every account**, and both are the nightly sweep's:
 *    `watchedTmdbEpisodeIds` (`watch`, to reconcile a title whose TMDB id vanished) and
 *    `accountsHoldingTitles` (`library_entry`, to find whose cached library a refreshed
 *    mirror just changed). Neither hands a caller another account's rows — the first
 *    returns TMDB episode ids and the second returns nothing but the `user_id` column
 *    itself — and both exist because a background job has to ask a question about
 *    everybody in order to be correct about anybody. A third one needs the same test:
 *    *does this serve rows, or answer a question about the shape of the table?*
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
 * ADR-0001 gives `library_entry`, `watch` and `list` a uuid `id` of their own alongside
 * `user_id`, and `watch` carries a `source_key`. (`list_membership` never had one — its
 * key is composite, `(list_id, title_id)` since amendment 7 — and this line said it did
 * until #143 went looking.) Read into variables,
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
 * Marks a string as a user id. The two honest uses are `lib/session.ts`, on the id
 * Better Auth just resolved from a session, and `resolveSeedUserId` below, on a row this
 * module just read back from `user` — never on an id nobody has looked up. Tests use it
 * on their own fixtures. Anywhere else it is a cast wearing a function's clothes.
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

/**
 * Whether the mirror being written carries this title's episodes (issue #271).
 *
 * `"mirrored"` on every path that fetched the whole thing — the import, the nightly
 * refresh, a repoint, a film, which has no seasons to fetch. `"pending"` on the one path
 * that deliberately did not: the add writes the `title` row from the series alone so the
 * press can be answered, and the seasons follow after the response.
 *
 * It is spelled as a word rather than a boolean because a bare `false` at a call site
 * says nothing about what is false, and the two states are read off the column by
 * everything downstream.
 */
export type EpisodesMirrored = "mirrored" | "pending";

/** One title's global rows, as they stand after being mirrored. */
interface MirroredTitle {
  readonly id: string;
  /**
   * The `episode` row id for each TMDB episode id in the mirror — what a watch needs in
   * order to point at the right row, and the reason this is returned rather than the
   * title id alone. The add path has no use for it and ignores it.
   */
  readonly episodeIds: ReadonlyMap<number, string>;
}

/**
 * Write the global, unowned half of a title: the `title` row and its `episode` rows.
 *
 * ── One upsert, called twice, and why that is the whole point ────────────────────────
 *
 * `addTitleToLibrary` and `applyImportChunk` both put a mirror into these two tables, and
 * they are **the same write** — so it is spelled once here rather than twice with two
 * sets of conflict handling. `title` and `episode` are global and shared by every account
 * (ADR-0001): two upserts against them is how the add path and the import path drift, and
 * only one of the two ever gets fixed.
 *
 * ── The two conflicts, resolved differently on purpose ───────────────────────────────
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
 *
 * `DO UPDATE` rather than `DO NOTHING` is also what makes `RETURNING` total here: a
 * conflicting row is returned by an update and skipped by a do-nothing, so the episode
 * ids come back for a title whose episodes another account created years ago exactly as
 * they do for one written for the first time. Import depends on that.
 *
 * **Not exported, and takes no user id**, because it touches no owned row. It is called
 * inside a transaction its caller opened; it opens none of its own.
 *
 * ── `episodes`, and the only way a title is ever pending (issue #271) ────────────────
 *
 * `episodes_mirrored_at` moves to `now()` on `"mirrored"` — on the insert and on the
 * conflict, so a refresh **rescues** a title that was left pending — and is written as
 * `NULL` on `"pending"`, which is the add path writing a `title` row from the series
 * alone. On `"pending"` the conflict leaves the column exactly as it found it: a title
 * another account already mirrored whole must not be taken back to pending for everybody
 * because somebody added it a second time.
 */
async function mirrorTitle(
  tx: Executor,
  mirror: TitleMirror,
  episodes: EpisodesMirrored = "mirrored",
): Promise<MirroredTitle> {
  const [mirrored] = await tx
    .insert(title)
    .values({
      kind: mirror.kind,
      tmdbId: mirror.tmdbId,
      externalId: mirror.externalId,
      name: mirror.name,
      releaseYear: mirror.releaseYear,
      releaseDate: mirror.releaseDate,
      posterPath: mirror.posterPath,
      inProduction: mirror.inProduction,
      runtimeMins: mirror.runtimeMins,
      // Written on both branches rather than left to the column's `DEFAULT now()`, so
      // that a pending row is created by a statement somebody wrote and not by the
      // absence of one.
      episodesMirroredAt: episodes === "mirrored" ? sql`now()` : null,
    })
    .onConflictDoUpdate({
      target: [title.kind, title.tmdbId],
      set: {
        /**
         * Overwritten like every other borrowed column, including with `NULL`. It is
         * borrowed, so the last thing TMDB said is what the mirror says — a stored id
         * TMDB has since disowned is worse than none, because the one thing that will
         * read this column repoints titles on the strength of it.
         */
        externalId: sql`excluded.external_id`,
        name: sql`excluded.name`,
        releaseYear: sql`excluded.release_year`,
        releaseDate: sql`excluded.release_date`,
        posterPath: sql`excluded.poster_path`,
        inProduction: sql`excluded.in_production`,
        runtimeMins: sql`excluded.runtime_mins`,
        metadataRefreshedAt: sql`now()`,
        /**
         * Stamped by a write that carried the episodes, and left alone by one that did
         * not — never `excluded.episodes_mirrored_at`, which would take a complete title
         * back to pending the moment a second account added it (issue #271).
         */
        ...(episodes === "mirrored" ? { episodesMirroredAt: sql`now()` } : {}),
      },
    })
    .returning({ id: title.id });

  if (mirror.episodes.length === 0) {
    return { id: mirrored.id, episodeIds: new Map() };
  }

  const episodeRows = await tx
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
        stillPath: one.stillPath,
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
        // Borrowed like every column beside it, so the last thing TMDB said wins —
        // including a still it has since withdrawn, which becomes NULL rather than
        // leaving the mirror pointing at a path the CDN no longer serves.
        stillPath: sql`excluded.still_path`,
      },
    })
    .returning({ id: episode.id, tmdbEpisodeId: episode.tmdbEpisodeId });

  return {
    id: mirrored.id,
    episodeIds: new Map(episodeRows.map((one) => [one.tmdbEpisodeId, one.id])),
  };
}

/**
 * One title the nightly sweep may refresh — enough to fetch its mirror from TMDB and
 * write it back through `refreshTitleMirror` below. `kind` and `tmdbId` are what
 * `tmdb/catalogue.ts`'s `titleMirror()` takes; `id` is carried only so the sweep can
 * report which title a failure was, and so this query can exclude tier 1's rows from
 * tier 2 without a second round trip.
 */
export interface SweepCandidate {
  readonly id: string;
  readonly kind: TitleKind;
  readonly tmdbId: number;
  /**
   * The one handle on this title that survives TMDB forgetting its own id, and the only
   * reason the sweep can do anything but fail when `tmdbId` 404s (issue #116).
   *
   * Selected here rather than fetched on the 404 path, because it costs nothing: the
   * query already reads this row, and a second round trip on the failure path would be a
   * second round trip taken at the worst moment. `null` on a title the sweep has not
   * reached yet — which is a quarantine, never a search (`tmdb/reconcile.ts`).
   */
  readonly externalId: ExternalId | null;
}

/**
 * ADR-0001's cap, and issue #115's: at 472 titles the whole library turns over roughly
 * every three days, comfortably inside TMDB's six-month cache ceiling.
 */
export const NIGHTLY_SWEEP_CAP = 200;

/**
 * `title.kind` and `title.external_id` are both `text` with a `CHECK`
 * (`title_kind_check`, `title_external_id_check`); every row read here already passed
 * both, which is what these two casts stand on. `tests/schema-and-derived-state.test.ts`
 * is where the constraints and the unions are held to still agree.
 */
function asSweepCandidate(row: {
  id: string;
  kind: string;
  tmdbId: number;
  externalId: string | null;
}): SweepCandidate {
  return {
    id: row.id,
    kind: row.kind as TitleKind,
    tmdbId: row.tmdbId,
    externalId: row.externalId as ExternalId | null,
  };
}

/**
 * Which titles the nightly sweep refreshes next, in ADR-0001's priority order, capped at
 * `cap` in total.
 *
 * ── Tier 0: a title whose episodes have never arrived (issue #271) ───────────────────
 *
 * `episodes_mirrored_at IS NULL` — a show whose season-and-episode mirror was scheduled
 * behind an add's response and did not land, because TMDB was unreachable or the process
 * ended first. It is first because it is the only tier where something is *missing*
 * rather than *stale*: the other two describe titles that are wholly mirrored and merely
 * out of date, and a reader is looking at this one right now, on the tab they added it
 * for. By `metadata_refreshed_at` it is the newest row in the table, so without this tier
 * it would be reached last and stay pending for days.
 *
 * The sweep needs no new mechanism to rescue it: `refreshTitleMirror` writes the whole
 * mirror and stamps the column as part of the same upsert every other tier goes through.
 *
 * ── Tier 1: a show that may have just aired something new ────────────────────────────
 *
 * `in_production = true` **and** an episode whose `air_date` fell after the title's own
 * `metadata_refreshed_at` and on or before today. There is no stored "next air date" to
 * compare against — only the mirrored episodes — so this is what *"whose next air date
 * has passed since their last refresh"* means recomputed from them: an episode that, as
 * of the last time this title was checked, had not happened yet, and now has.
 *
 * ── Tier 2: whatever has waited longest ───────────────────────────────────────────────
 *
 * Every other title, oldest `metadata_refreshed_at` first.
 *
 * ── "Come first" is exclusion, not a tiebreak ─────────────────────────────────────────
 *
 * Each tier is answered in full — up to `cap` — before the next is asked at all, and each
 * excludes the rows already spoken for rather than merely being asked to sort after them:
 * two `ORDER BY` terms could not express "come first" here, because an earlier tier's own
 * `metadata_refreshed_at` may well be newer than plenty of later-tier titles it must still
 * precede. A query only runs, and only asks for the remainder, when the ones before it did
 * not already fill the cap — the same short-circuit `libraryCatalogueKeys` takes for an
 * empty `keys` array, and for the same reason: no query is the cheapest query.
 */
export async function titlesDueForRefresh(
  cap: number = NIGHTLY_SWEEP_CAP,
  executor: Executor = getDb(),
): Promise<SweepCandidate[]> {
  const columns = {
    id: title.id,
    kind: title.kind,
    tmdbId: title.tmdbId,
    externalId: title.externalId,
  };

  const airedSinceLastRefresh = exists(
    executor
      .select({ one: sql`1` })
      .from(episode)
      .where(
        and(
          eq(episode.titleId, title.id),
          sql`${episode.seasonNo} > 0`,
          sql`${episode.airDate} is not null`,
          sql`${episode.airDate} > ${title.metadataRefreshedAt}::date`,
          sql`${episode.airDate} <= current_date`,
        ),
      ),
  );

  const tier0Rows = await executor
    .select(columns)
    .from(title)
    .where(isNull(title.episodesMirroredAt))
    .orderBy(asc(title.metadataRefreshedAt), title.id)
    .limit(cap);

  const tier0 = tier0Rows.map(asSweepCandidate);
  if (tier0.length >= cap) return tier0;

  /** Every id already spoken for by an earlier tier — see "come first" above. */
  const taken = tier0.map((row) => row.id);

  const tier1Rows = await executor
    .select(columns)
    .from(title)
    .where(
      and(
        eq(title.kind, "show"),
        eq(title.inProduction, true),
        airedSinceLastRefresh,
        taken.length > 0 ? notInArray(title.id, taken) : undefined,
      ),
    )
    .orderBy(asc(title.metadataRefreshedAt), title.id)
    .limit(cap - tier0.length);

  const tier1 = tier1Rows.map(asSweepCandidate);
  if (tier0.length + tier1.length >= cap) return [...tier0, ...tier1];

  taken.push(...tier1.map((row) => row.id));

  const tier2Rows = await executor
    .select(columns)
    .from(title)
    .where(taken.length > 0 ? notInArray(title.id, taken) : undefined)
    .orderBy(asc(title.metadataRefreshedAt), title.id)
    .limit(cap - tier0.length - tier1.length);

  return [...tier0, ...tier1, ...tier2Rows.map(asSweepCandidate)];
}

/**
 * Write one title's refreshed mirror — the nightly sweep's only write, and every write
 * `mirrorTitle` already makes for `addTitleToLibrary` and `applyImportChunk`, reused
 * rather than respelled: refreshing a title on a schedule is not a different write from
 * mirroring it on add, and ADR-0001 mirrors only through the one pure mapping.
 *
 * `metadata_refreshed_at` moves to `now()` as part of that upsert (`mirrorTitle`), which
 * is what makes **not calling this** the entire mechanism behind *"a title skipped for
 * any reason does not get `metadata_refreshed_at` stamped."* There is no separate "mark
 * refreshed" statement a caller could reach by mistake — the sweep calls this only after
 * TMDB has actually answered, and a title that 404s or times out never reaches it.
 *
 * **Its own transaction**, opened here exactly as `addTitleToLibrary`'s is: the `title`
 * row and its `episode` rows must land together or not at all, because a season TMDB has
 * renumbered since the last refresh can still make the episode upsert violate
 * `UNIQUE (title_id, season_no, episode_no)` (`mirrorTitle`'s own note on that), and a
 * title left with new episode data but the old season numbers is worse than one left
 * untouched. Nesting as a savepoint when `executor` is already a transaction is what lets
 * the test harness roll a whole sweep back in one `inTransaction`, same as every other
 * write in this file.
 */
export async function refreshTitleMirror(
  mirror: TitleMirror,
  executor: Executor = getDb(),
): Promise<void> {
  await executor.transaction((tx) => mirrorTitle(tx, mirror));
}

/**
 * Every TMDB episode id under this title that somebody has a watch on — the input to
 * `reconcileEpisodes` (`tmdb/reconcile.ts`), and read only on the 404 path.
 *
 * ── Somebody's, not this caller's ────────────────────────────────────────────────────
 *
 * There is no user id here and there must not be. `title` and `episode` are global and
 * unowned (ADR-0001), so a repoint happens to **every** account at once: an episode that
 * one stranger has watched is an episode this title may not lose, exactly as if it were
 * the reader's own. Scoping this to one account would make the decision correct for that
 * account and wrong for everybody else — which is the shape of every mistake this path
 * exists to prevent.
 *
 * `DISTINCT`, because an episode with three watches on it is one episode, and the caller
 * asks *is it missing*, not *how many*.
 *
 * A film returns an empty array rather than needing a branch: its watches carry no
 * `episode_id` at all (`db/tables.ts`), so there is nothing to join to and nothing to be
 * missing.
 */
export async function watchedTmdbEpisodeIds(
  titleId: string,
  executor: Executor = getDb(),
): Promise<number[]> {
  const rows = await executor
    .selectDistinct({ tmdbEpisodeId: episode.tmdbEpisodeId })
    .from(episode)
    .innerJoin(watch, eq(watch.episodeId, episode.id))
    .where(eq(episode.titleId, titleId));

  return rows.map((row) => row.tmdbEpisodeId);
}

/**
 * Which accounts hold any of these titles — the nightly sweep's cache question, and the
 * second function in this file that reads an owned table without being scoped to one
 * account (issue #219).
 *
 * ── Why it is allowed to be, and what keeps that narrow ──────────────────────────────
 *
 * The shape rule at the top of this module — *every exported function takes the user id
 * as its first argument* — is about **who a row is served to**. This function serves no
 * rows: it returns the ids of the accounts whose cached library the sweep has just
 * changed, so those caches can be busted, and it can see no more of `library_entry` than
 * the `user_id` column. `watchedTmdbEpisodeIds` above is the precedent and reads the same
 * way: a background job asking a question about everybody's rows in order to do its job
 * correctly, rather than a surface reading somebody else's library.
 *
 * `refreshTitleMirror` and `repointTitle` write `title.name`, `release_year` and
 * `poster_path` — three columns `listLibraryEntries` selects and the library grid prints
 * — and they write them for every account at once. Without this, a refreshed poster would
 * sit behind a cache entry until that account's next write of its own. `SELECT DISTINCT`
 * rather than a count: the caller busts one tag per account, so the same account twice is
 * one bust, and doing that in SQL is cheaper than doing it in a `Set` afterwards.
 *
 * **An empty `titleIds` returns without querying**, and the guard is load-bearing rather
 * than an optimisation, for `libraryCatalogueKeys`'s reason: `inArray` over an empty
 * array is not a predicate that matches nothing in every driver, and a `where` that
 * quietly disappeared would return every account in the database.
 */
export async function accountsHoldingTitles(
  titleIds: readonly string[],
  executor: Executor = getDb(),
): Promise<UserId[]> {
  if (titleIds.length === 0) return [];

  const rows = await executor
    .selectDistinct({ userId: libraryEntry.userId })
    .from(libraryEntry)
    .where(inArray(libraryEntry.titleId, [...titleIds]));

  return rows.map((row) => asUserId(row.userId));
}

/** What `repointTitle` was asked to do — `tmdb/reconcile.ts` reached the decision. */
export interface RepointParams {
  readonly titleId: string;
  /** The id that 404'd. Checked, not trusted: see `repointTitle`'s note on the race. */
  readonly fromTmdbId: number;
  /** The survivor, and the mirror freshly fetched from it. */
  readonly survivor: TitleMirror;
  /** The external id that evidenced it, as it stood when the decision was made. */
  readonly evidence: ExternalId;
}

/**
 * Point one title at the TMDB id that survived, write the mirror fetched from it, and
 * record that this happened — one transaction, or none of it (issue #116).
 *
 * ── The order of the two writes is the whole function ────────────────────────────────
 *
 * `mirrorTitle` upserts on `(kind, tmdb_id)`. Called first, with the survivor's id, it
 * would find no conflict and **insert a second title row** — leaving the original row,
 * every library entry on it and every watch under it pointing at an id TMDB has deleted,
 * and the reader with a duplicate they cannot tell apart. So the `UPDATE` comes first and
 * the upsert lands on the row that was just repointed. This ordering is not an
 * optimisation and there is no version of this function that does not depend on it.
 *
 * ── Not a watch is touched, and that is structural rather than careful ───────────────
 *
 * `watch` is not written here, and neither is `episode.id`. Episodes are upserted on
 * `tmdb_episode_id`, which is identity (ADR-0001) — so an episode the survivor still
 * carries keeps the row id it always had, and every watch pointing at it still points at
 * the episode it always meant. `reconcileEpisodes` is what guarantees the survivor still
 * carries all of them; ADR-0001's `NO ACTION` foreign key is what would refuse the write
 * if it somehow did not.
 *
 * ── `false`, not a throw, when the survivor is already a row of its own ──────────────
 *
 * A merge is precisely the case where the id that survived may already be in this
 * database — somebody added the surviving entry directly, and `UNIQUE (kind, tmdb_id)`
 * would reject the `UPDATE`. Merging the two rows is not on the table: it would mean
 * moving watches from one title's episodes to another's, and **a watch is never
 * repointed, under any policy, ever.** So this returns `false`, the caller quarantines it
 * as `surviving-id-already-mirrored`, and the transaction rolls back having written
 * nothing — including `metadata_refreshed_at`, so the title is retried rather than
 * stamped.
 *
 * The `UPDATE`'s own `WHERE` still names `fromTmdbId`, and a `false` from a row that
 * moved underneath us is the same answer for the same reason: this is a nightly job with
 * one instance, but a write that assumes that is a write that is wrong the first time it
 * is not true.
 */
export async function repointTitle(
  { titleId, fromTmdbId, survivor, evidence }: RepointParams,
  executor: Executor = getDb(),
): Promise<boolean> {
  return executor.transaction(async (tx) => {
    const taken = await tx
      .select({ id: title.id })
      .from(title)
      .where(and(eq(title.kind, survivor.kind), eq(title.tmdbId, survivor.tmdbId)));
    if (taken.length > 0) return false;

    const repointed = await tx
      .update(title)
      .set({ tmdbId: survivor.tmdbId })
      .where(and(eq(title.id, titleId), eq(title.tmdbId, fromTmdbId)))
      .returning({ id: title.id });
    if (repointed.length === 0) return false;

    await mirrorTitle(tx, survivor);

    await tx.insert(titleReconciliation).values({
      titleId,
      fromTmdbId,
      toTmdbId: survivor.tmdbId,
      evidenceExternalId: evidence,
    });

    return true;
  });
}

/** Whether the add created a library entry, or found one already there. */
export interface AddOutcome {
  readonly added: boolean;
  /**
   * The global `title` row this add wrote — reported because **it is not this account's
   * row** (issue #219). `mirrorTitle` upserts `name`, `release_year` and `poster_path`
   * for every account holding the title, so the caller has to bust their cached libraries
   * too, and it cannot ask which accounts those are without knowing which title moved.
   *
   * Present whether or not `added` is true. A re-add creates no library entry and still
   * refreshes the mirror, which is the case that most needs this: nothing about the
   * caller's own library changed, and everybody else's grid did.
   */
  readonly titleId: string;
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
 * `title` and `episode` are `mirrorTitle`'s two, and that function carries the reasoning
 * for both — it is shared with `applyImportChunk` precisely so there is one upsert
 * against the global tables rather than one per caller. The third is this function's own:
 *
 *  - **`library_entry`** does nothing on conflict and reports it. A title already in your
 *    library is not added twice, and the caller is told which of the two happened rather
 *    than being left to assume.
 *
 * ── `episodes`, defaulted, and the one caller that passes it (issue #271) ────────────
 *
 * `"mirrored"` by default, because every caller before #271 handed this function a whole
 * mirror. The search screen's add now hands it the series alone and passes `"pending"`,
 * so the press can be answered before the seasons are fetched; `mirrorTitle` carries what
 * that does to the column. It is last and defaulted so that the three call sites that
 * were correct before this argument existed remain correct without naming it.
 */
export async function addTitleToLibrary(
  userId: UserId,
  mirror: TitleMirror,
  executor: Executor = getDb(),
  episodes: EpisodesMirrored = "mirrored",
): Promise<AddOutcome> {
  return executor.transaction(async (tx) => {
    const mirrored = await mirrorTitle(tx, mirror, episodes);

    const created = await tx
      .insert(libraryEntry)
      .values({ userId, titleId: mirrored.id })
      .onConflictDoNothing({ target: [libraryEntry.userId, libraryEntry.titleId] })
      .returning({ id: libraryEntry.id });

    return { added: created.length > 0, titleId: mirrored.id };
  });
}

/**
 * What one press of *Add — watched* did: whether it created the entry, and how many
 * watches it wrote.
 *
 * `added` is `addOutcome`'s own field, unchanged in meaning. `recorded` is
 * `MarkWatchedUpToOutcome`'s, and it **stays off the wire** for that one's stated reason
 * — a count on a surface is `DESIGN.md` §11's permanent exclusion, and this press shows
 * the reader no episode list to reconcile a number against in the first place.
 *
 * The pair is genuinely two facts and not one. A show already in the library, added again
 * from a stale search result, is `{ added: false, recorded: 6 }`; a show whose first
 * season has not aired is `{ added: true, recorded: 0 }`. Collapsing them into a boolean
 * would make those two indistinguishable from each other and from a failure.
 */
export interface AddWatchedOutcome {
  readonly added: boolean;
  readonly recorded: number;
  /**
   * `AddOutcome.titleId`'s reason, reached through the nested add (issue #219). This
   * write mirrors the title exactly as the plain add does — its own docblock says the
   * refresh *"every account reads"* is why it calls `addTitleToLibrary` rather than
   * copying it — so its caller owes every other holder of that title a bust too.
   */
  readonly titleId: string;
}

/**
 * Put one title in this account's library **and record having watched it**, in one
 * transaction — issue #222, and the migration case that costs eighty taps without it.
 *
 * ── What "watched" means, for each of the two kinds ──────────────────────────────────
 *
 * A film is one watch, because a film is one watch. A show is **every released episode
 * above season zero**, where released is `db/views.ts`'s own test verbatim: `season_no >
 * 0 AND air_date IS NOT NULL AND air_date <= current_date`. A null air date is not
 * released and a future one is not released.
 *
 * That is what makes the show land correctly with nothing special-cased. An ended show
 * has no unreleased episodes, so every `season_no > 0` episode ends up watched and
 * `library_entry_state`'s *finished* branch is reached; a show still in production has
 * some, so the same rows reach *caught up* instead. Neither branch is named here, and
 * neither is tested for — the states are the view's, evaluated on the next read.
 *
 * **`current_date` is read from Postgres, in the same statement that selects the rows.**
 * Not a `Date` built in this process: the views compare against the server's
 * `current_date` (`db/views.ts` records that as a deliberate exception to `SPEC.md` §5's
 * timezone rule), and a write that decided *released* by a different clock than the read
 * that renders it would be a show that reads *watching* the moment after it was recorded
 * as finished.
 *
 * ── Specials, unaired and undated episodes are left alone, and stay markable ─────────
 *
 * `markWatchedUpTo` carries the argument for excluding specials and it is the same one:
 * a watch of a season-zero episode changes no derived state, so writing one adds a row
 * that answers nothing while holding the show back from *finished* over episodes the
 * reader never counted. Unaired and undated episodes are excluded for a different reason
 * — recording them would claim a watch of something that has not happened.
 *
 * All three remain exactly as markable by hand afterwards as any other episode. Nothing
 * here writes a marker saying they were skipped, because there is no such thing to write:
 * the absence of a `watch` row *is* unwatched.
 *
 * ── Idempotent twice over, because one guard is not enough ───────────────────────────
 *
 * The same press arriving twice is caught by `UNIQUE (user_id, source, source_key)`, the
 * identity ADR-0001 chose. A *genuinely new* press against a title already recorded is
 * caught by the already-watched filter below, which is the same filter `markWatchedUpTo`
 * applies and exists for the same reason: a second `watch` row against an episode is a
 * **rewatch** (`CONTEXT.md`), and one tap on *Add — watched* has no business claiming the
 * reader saw the show twice. Neither guard stands in for the other — the first cannot see
 * a press with a fresh key, and the second cannot see two copies of one press racing.
 *
 * The filter covers the film branch too, where "already watched" is simply *this entry
 * has a watch at all*: a film's watch carries no episode, so there is no other kind of
 * row it could be.
 *
 * ── And two presses at once, which neither guard would catch on its own ──────────────
 *
 * Both guards above are blind to a transaction that has not committed yet, so two presses
 * of *this* title from two surfaces — the search row in one tab, the unowned title page
 * in another, each with its own key — would both read an empty `watch` and both write the
 * whole show. Twelve rows, six of them phantom rewatches, indistinguishable on every
 * screen from history the reader made (ADR-0001 amendment 4).
 *
 * **They cannot interleave, and the reason is one line above rather than anything here.**
 * `addTitleToLibrary` mirrors on the way in, and `mirrorTitle`'s upsert against `title` is
 * `ON CONFLICT DO UPDATE`, which takes a row lock on that title for the rest of the
 * transaction. Two presses of one title therefore queue on it, and the second one's read
 * of `watch` is a later statement with a later snapshot — so it sees what the first one
 * committed and finds nothing left to write. `tests/add-to-library-watched.test.ts` pins
 * this with two real concurrent transactions, once on a new entry and once on one that
 * already existed.
 *
 * **This is load-bearing and it is not obvious**, which is the whole reason it is written
 * down: it is a property of the mirror refresh, not of this function, and an optimisation
 * that skipped the refresh for a title mirrored recently would take it away without
 * touching a line of this file. The tests would fail, which is where that gets caught.
 *
 * ── Timestamped now, and what that costs ─────────────────────────────────────────────
 *
 * `watched_at` is `now()` — the transaction's own instant, so the whole press is one
 * moment in the record — and **not** the null an import writes for the same situation.
 * The consequence is stated rather than hidden, exactly as issue #196 stated it for
 * `markWatchedUpTo`: the rails order on the most recent watch per title
 * (`listUpNextRails`), so a show added-as-watched today rises above titles genuinely
 * watched last week until something newer lands.
 *
 * ── `abandoned_at` is not cleared ────────────────────────────────────────────────────
 *
 * This is backfill, and ADR-0001 amendment 9 is the ruling: *a backfill written by the
 * reader does not clear `abandoned_at`* — the clear follows a watch of something you are
 * watching now, not a watch you are writing down about the past. `markWatchedUpTo` and
 * `applyImportChunk` both take that side and this write joins them.
 *
 * On the ordinary path the column is null anyway, because the entry was created by the
 * line above. It bites only where the title was already in the library and given up on —
 * reachable from a search result rendered before the add happened in another tab — and
 * there the abandoned title stays abandoned, with every watch this wrote still on it.
 *
 * ── One transaction, and the add inside it ───────────────────────────────────────────
 *
 * All-or-nothing is the ticket's own requirement and it is what makes the failure
 * legible: one lost write, one toast, and a reader who reloads finds their library
 * exactly as they left it rather than holding a watchlist entry for a show they said
 * they had finished. That is why `addTitleToLibrary` is **called** here rather than
 * copied — it opens a nested transaction, which Drizzle takes as a savepoint, so there is
 * one definition of *add a title* and the mirror refresh every account reads happens on
 * this path exactly as it does on the plain one.
 *
 * The entry is then read back rather than returned by the add, for the reason
 * `titles/actions.ts` already gives: `addTitleToLibrary` reports `{ added }` and not
 * which row, because `onConflictDoNothing` returns nothing on the conflict.
 */
export async function addTitleToLibraryWatched(
  userId: UserId,
  mirror: TitleMirror,
  sourceKey: string,
  executor: Executor = getDb(),
): Promise<AddWatchedOutcome> {
  return executor.transaction(async (tx) => {
    const { added } = await addTitleToLibrary(userId, mirror, tx);

    const [entry] = await tx
      .select({ id: libraryEntry.id, titleId: libraryEntry.titleId })
      .from(libraryEntry)
      .innerJoin(title, eq(title.id, libraryEntry.titleId))
      .where(
        and(
          ownedBy(userId, libraryEntry),
          eq(title.kind, mirror.kind),
          eq(title.tmdbId, mirror.tmdbId),
        ),
      );

    if (!entry) {
      /**
       * Unreachable: the line above either created this account's entry or found one
       * already there, and both leave a row for this read to find. It throws rather than
       * recording nothing and reporting success — a press that reported the watches
       * landed while writing none of them is the write reading as lost and as landed at
       * once.
       */
      throw new Error(
        `Added ${mirror.kind} ${mirror.tmdbId} to the library and then found no entry for it.`,
      );
    }

    const watchedRows = await tx
      .select({ episodeId: watch.episodeId })
      .from(watch)
      .where(eq(watch.libraryEntryId, entry.id));

    if (mirror.kind === "film") {
      // Already watched, so there is nothing this press can honestly add. A second row
      // would be a rewatch, and the reader asked to record having seen it, not twice.
      if (watchedRows.length > 0) return { added, recorded: 0, titleId: entry.titleId };

      const written = await tx
        .insert(watch)
        .values({
          userId,
          libraryEntryId: entry.id,
          titleId: entry.titleId,
          // A film's watch carries no episode (ADR-0001 §3, where the composite foreign
          // key makes the opposite unsatisfiable).
          episodeId: null,
          watchedAt: sql`now()`,
          source: APP_WATCH_SOURCE,
          sourceKey,
        })
        .onConflictDoNothing({ target: [watch.userId, watch.source, watch.sourceKey] })
        .returning({ id: watch.id });

      return { added, recorded: written.length, titleId: entry.titleId };
    }

    /**
     * `db/views.ts`'s released test, transcribed. It is read from `episode` rather than
     * taken off `mirror.episodes` deliberately: the mirror is what TMDB said a moment
     * ago, and `mirrorTitle` has just reconciled it against rows every other account
     * shares. Deciding the set from the argument would let a title that failed to
     * mirror an episode still be recorded as having it watched.
     */
    const released = await tx
      .select({ id: episode.id })
      .from(episode)
      .where(
        and(
          eq(episode.titleId, entry.titleId),
          gt(episode.seasonNo, 0),
          isNotNull(episode.airDate),
          lte(episode.airDate, sql`current_date`),
        ),
      )
      .orderBy(episode.seasonNo, episode.episodeNo);

    const alreadyWatched = new Set(
      watchedRows.map((one) => one.episodeId).filter((id) => id !== null),
    );
    const covered = released.filter((one) => !alreadyWatched.has(one.id));

    if (covered.length === 0) return { added, recorded: 0, titleId: entry.titleId };

    const written = await tx
      .insert(watch)
      .values(
        covered.map((one) => ({
          userId,
          libraryEntryId: entry.id,
          titleId: entry.titleId,
          episodeId: one.id,
          // The transaction's own instant, so the whole press is one moment in the
          // record rather than sixty-two of them microseconds apart.
          watchedAt: sql`now()`,
          source: APP_WATCH_SOURCE,
          // Derived per episode from the one key the press minted, which is
          // `markWatchedUpTo`'s scheme and is shared with it on purpose: one press is
          // one key, and a retry of it is a no-op row by row.
          sourceKey: `${sourceKey}:${one.id}`,
        })),
      )
      .onConflictDoNothing({ target: [watch.userId, watch.source, watch.sourceKey] })
      .returning({ id: watch.id });

    return { added, recorded: written.length, titleId: entry.titleId };
  });
}

/**
 * One title in a chunk: the judgement the file carries, and the mirror it is written
 * from.
 *
 * The mirror is **passed in, never fetched here** — that is what keeps TMDB out of this
 * module and lets every test of the import run with the network unplugged. Whoever built
 * the chunk (the import screen, or the seed CLI) is where a mirror comes from.
 *
 * `abandoned` is the file's boolean and nothing more; `SPEC.md` §7 is explicit that the
 * file never carries a timestamp, because import is what mints it and the
 * `abandoned_at == added_at` identity has to hold in every environment that runs the file.
 */
export interface ImportChunkTitle {
  readonly mirror: TitleMirror;
  readonly abandoned: boolean;
}

/**
 * One page of an import — `SPEC.md` §7 sizes it at ~25 titles, forced by Vercel Hobby's
 * 300-second function duration and 4.5 MB request body.
 *
 * `titles` and `watches` are independent: 21 real titles have no watches at all and
 * become watchlist entries, which is why nothing here nests one inside the other.
 * `watches` is `import/native-format.ts`'s own type, so the shape is declared once and
 * the writer cannot drift from the reader.
 */
export interface ImportChunk {
  readonly source: string;
  readonly titles: readonly ImportChunkTitle[];
  readonly watches: readonly NativeImportWatch[];
}

/**
 * What one chunk actually wrote — the three counters `SPEC.md` §7's progress line prints,
 * and nothing else:
 *
 * ```
 * 318 of 462 titles · 11,204 watches · 155 marked abandoned
 * ```
 *
 * Every one of them counts **rows created**, not rows named. A chunk applied a second
 * time reports zeroes, because the second run is a no-op and a counter that claimed
 * otherwise would be reporting the file's size back to the reader as though it were work.
 */
export interface ImportChunkOutcome {
  readonly titlesAdded: number;
  readonly watchesAdded: number;
  readonly arrivedAbandoned: number;
  /**
   * Every global `title` row this chunk mirrored — `AddOutcome.titleId`'s reason, at chunk
   * scale (issue #219). Not the same set as *titles added*: a title already in this
   * account's library still had its mirror refreshed, and so did one already in somebody
   * else's, so this is the set whose holders' cached libraries the caller must bust.
   */
  readonly mirroredTitleIds: readonly string[];
}

/**
 * Where one of a chunk's mirrored episodes ended up, and which title claimed it —
 * everything a watch needs in order to be written *and* checked.
 *
 * Collected across the whole chunk and keyed by `tmdb_episode_id`, because that column is
 * globally unique and is identity (ADR-0001): the episode, not the title, is what locates
 * a watch.
 */
interface ChunkEpisode {
  readonly episodeId: string;
  readonly titleId: string;
  /** The mirror's own id, kept so that a watch naming a different title is refused. */
  readonly titleTmdbId: number;
}

/**
 * Write one chunk of an import: the only function that ever writes one.
 *
 * ── Why this is one function and not two ─────────────────────────────────────────────
 *
 * `SPEC.md` §6 seeds preview and local **by running MediaSafe's own import, not a
 * separate loader**, and the only way to hold that is for one function to be the writer.
 * The import screen (#73) and `npm run db:seed` (#74) are both callers of this; neither
 * writes a row of its own.
 *
 * **It knows nothing about `tvtracker`.** Every fact about the old application lives in
 * the conversion script (`SPEC.md` §7); this inserts what it is given and interprets
 * nothing. *Paused* became *abandoned* before the file was written, not here.
 *
 * ── The guard that is the reason this ticket exists ──────────────────────────────────
 *
 * `abandoned_at` is **stamped only on the entries this call creates**, and it is stamped
 * in the `INSERT` itself rather than by a follow-up `UPDATE`. That is deliberate, and it
 * is stronger than an update scoped to the created ids: `ON CONFLICT DO NOTHING` cannot
 * touch a row it did not insert, so *never on update, never cleared* is a property of the
 * statement rather than of a `where` clause somebody has to keep correct.
 *
 * Both halves of it matter, and both are quiet failures:
 *
 *  - An import that **cleared** it would undo the judgement every time it added a watch
 *    to an abandoned title — and `CONTEXT.md` makes watching again the thing that clears
 *    *abandoned*, so a naive "watches mean you are watching" write does exactly that.
 *  - An import that **re-set** it would resurrect the abandonment on every title since
 *    un-abandoned, once per re-seed, on 155 titles, with nothing on any screen to say so.
 *
 * `UNIQUE (user_id, source, source_key)` gives the rest of the idempotence away for free.
 * This is the one case it does not cover.
 *
 * ── One transaction per chunk ────────────────────────────────────────────────────────
 *
 * A `library_entry` pointing at a half-written show has wrong derived states — a show
 * missing half its episodes reads *finished*. So a chunk lands whole or not at all, and a
 * failure part-way through leaves the previous chunks intact and this one absent, which
 * is exactly what re-running the file then repairs.
 *
 * ── A watch resolves through its episode, not through its title ──────────────────────
 *
 * `episode.tmdb_episode_id` is globally unique and is identity (ADR-0001), so the episode
 * is what locates a watch — including for a title whose episodes another account created
 * years ago, which `mirrorTitle`'s `DO UPDATE … RETURNING` covers. The `tmdb_id` the file
 * puts on a watch is therefore redundant, and it is **checked rather than ignored**: a
 * watch whose title and episode disagree is a corrupt file, and landing it against the
 * episode's real title would put someone else's history on the wrong show silently.
 *
 * An episode the chunk does not carry is the same kind of failure and throws for the same
 * reason. It cannot be written — `episode` needs season and episode numbers that only a
 * mirror has — and dropping it would make an import that silently lost watches look
 * identical to one that did not.
 *
 * ── A consequence inherited from the format: a film cannot arrive watched ────────────
 *
 * `watch.episode_id` is nullable and its composite foreign key is MATCH SIMPLE precisely
 * so that a film's watch — no episode — is legal (`db/tables.ts`). Import cannot write
 * one anyway, because `NativeImportWatch` requires a `tmdb_episode_id` and every watch
 * here resolves through it. So a film in a file becomes a watchlist entry and stays one.
 *
 * That is **the format's limit, not this function's**, and it is not worked around here:
 * inventing a film branch would mean guessing which title a watch meant from a `tmdb_id`
 * that is ambiguous across kinds, which is the interpreting this function does not do.
 * It costs nothing on day one — `tvtracker` holds 0 films — and the fix, when a file
 * needs one, is a `tmdb_episode_id`-less watch in `import/native-format.ts`.
 */
export async function applyImportChunk(
  userId: UserId,
  chunk: ImportChunk,
  executor: Executor = getDb(),
): Promise<ImportChunkOutcome> {
  return executor.transaction(async (tx) => {
    /**
     * The global rows first, one title at a time through the shared upsert. Sequential
     * rather than batched: a batch would be a second spelling of the write the add path
     * makes, which is the drift this is factored to avoid, and ~25 titles a chunk is not
     * where an import that runs once spends its time.
     */
    const titleIds: string[] = [];
    const abandonedTitleIds = new Set<string>();
    const episodes = new Map<number, ChunkEpisode>();

    for (const one of chunk.titles) {
      const mirrored = await mirrorTitle(tx, one.mirror);
      titleIds.push(mirrored.id);
      if (one.abandoned) abandonedTitleIds.add(mirrored.id);
      for (const [tmdbEpisodeId, episodeId] of mirrored.episodeIds) {
        episodes.set(tmdbEpisodeId, {
          episodeId,
          titleId: mirrored.id,
          titleTmdbId: one.mirror.tmdbId,
        });
      }
    }

    // `DO NOTHING` returns only the rows it inserted, so this *is* "which ones I created".
    const created =
      titleIds.length === 0
        ? []
        : await tx
            .insert(libraryEntry)
            .values(
              titleIds.map((titleId) => ({
                userId,
                titleId,
                /**
                 * `now()`, not a `Date` from this process: it is the transaction's start,
                 * which is also what `added_at` defaults to, so `SPEC.md` §7's
                 * `abandoned_at == added_at` identity holds exactly rather than nearly.
                 */
                abandonedAt: abandonedTitleIds.has(titleId) ? sql`now()` : null,
              })),
            )
            .onConflictDoNothing({
              target: [libraryEntry.userId, libraryEntry.titleId],
            })
            .returning({
              titleId: libraryEntry.titleId,
              abandonedAt: libraryEntry.abandonedAt,
            });

    /**
     * Every entry the chunk names, created here or already in the library — a watch needs
     * the entry id either way, and `DO NOTHING` above deliberately did not return the
     * ones it left alone. `ownedBy` is what keeps this to one account's entries.
     */
    const entryIds = new Map<string, string>();
    if (titleIds.length > 0) {
      const rows = await tx
        .select({ id: libraryEntry.id, titleId: libraryEntry.titleId })
        .from(libraryEntry)
        .where(
          and(ownedBy(userId, libraryEntry), inArray(libraryEntry.titleId, titleIds)),
        );
      for (const row of rows) entryIds.set(row.titleId, row.id);
    }

    const watchRows = chunk.watches.map((one) => {
      const found = episodes.get(one.tmdbEpisodeId);
      if (!found) {
        throw new Error(
          `This chunk has a watch of episode ${one.tmdbEpisodeId}, which none of its titles carries.`,
        );
      }
      if (found.titleTmdbId !== one.tmdbId) {
        throw new Error(
          `A watch names title ${one.tmdbId}, but episode ${one.tmdbEpisodeId} belongs to title ${found.titleTmdbId}.`,
        );
      }
      const libraryEntryId = entryIds.get(found.titleId);
      if (libraryEntryId === undefined) {
        // Unreachable: the entry was inserted or found above for every title in the chunk.
        throw new Error(
          `This chunk has a watch of episode ${one.tmdbEpisodeId} whose title has no library entry.`,
        );
      }

      return {
        userId,
        libraryEntryId,
        titleId: found.titleId,
        episodeId: found.episodeId,
        watchedAt: one.watchedAt === null ? null : new Date(one.watchedAt),
        source: chunk.source,
        sourceKey: one.key,
      };
    });

    const written =
      watchRows.length === 0
        ? []
        : await tx
            .insert(watch)
            .values(watchRows)
            .onConflictDoNothing({
              target: [watch.userId, watch.source, watch.sourceKey],
            })
            .returning({ id: watch.id });

    return {
      titlesAdded: created.length,
      watchesAdded: written.length,
      arrivedAbandoned: created.filter((row) => row.abandonedAt !== null).length,
      mirroredTitleIds: titleIds,
    };
  });
}

/**
 * `watch.source` for a watch this application recorded, as against `'tvtracker'` for one
 * an import backfilled.
 *
 * ── One writer, and no longer any reader — issue #145 ────────────────────────────────
 *
 * This used to be shared by three functions that had to agree on it, and the docblock
 * said so: `recordWatch` wrote it, `unwatch` refused to delete anything else, and
 * `getTitleDetail` decided from it whether a row could offer an unwatch. The last two are
 * gone. An unwatch removes every watch of an episode whatever recorded it, so nothing
 * anywhere now *branches* on this value — it is written once, by `recordWatch`, and read
 * back only by whoever is looking at where a fact came from.
 *
 * It stays a constant anyway, for the smaller reason it would have earned on its own: it
 * is the one string this module puts in a column, and a typo in a literal would write
 * history labelled as coming from somewhere it did not.
 *
 * There is deliberately no constant for the import's own source: `applyImportChunk` takes
 * it from the file being imported, and pinning it here would imply this module gets to
 * choose it.
 */
const APP_WATCH_SOURCE = "app";

/**
 * What one click needs, and everything about it that is the caller's to decide.
 *
 * ── The one field with a rule attached ────────────────────────────────────────────────
 *
 * `sourceKey` is minted **in the browser**, once per click, and reused for every retry of
 * that click (ADR-0001, issue #84). A server-minted key is a new key per request, which
 * is the precise shape of the bug `recordWatch` exists to prevent — so this function
 * receives the key rather than inventing one, and there is deliberately no code path
 * inside it that could.
 *
 * `titleId` is not here. `libraryEntryId` already identifies one title in one account,
 * and `recordWatch` resolves it rather than trusting a second value that could disagree —
 * the same reasoning `getTitleDetail` above already applies to the read side.
 */
export interface RecordWatchParams {
  readonly libraryEntryId: string;
  /** `null` for a film; a real `episode.id` for a show. */
  readonly episodeId: string | null;
  readonly sourceKey: string;
}

/** Whether the click wrote a new watch, or found a retry of one already there. */
export interface RecordWatchOutcome {
  readonly recorded: boolean;
}

/**
 * The application's first write of a watch — issue #85, and the write everything from
 * step 4 on is built against.
 *
 * ── Why a retry cannot become a rewatch ───────────────────────────────────────────────
 *
 * `UNIQUE (user_id, source, source_key)` (ADR-0001) makes idempotency a property of the
 * statement: the same `sourceKey` twice is one row, `ON CONFLICT DO NOTHING`. A genuine
 * rewatch is a different key, minted by a different click, and is a second row — nothing
 * here tells the two apart by content, because content is not what identifies a watch.
 *
 * `source` is hard-coded to `'app'` and is not a parameter. Import's is `'tvtracker'`,
 * permanently, and the distinction between recorded history and backfilled history is
 * this function only ever writing one of the two — not a value a caller could pass wrong.
 *
 * ── Resuming, in the same statement as the insert ─────────────────────────────────────
 *
 * `abandoned_at` is cleared in the same transaction as the watch insert — `CONTEXT.md`'s
 * *watching it again clears it*, made true by the transaction rather than by a follow-up
 * write somebody could forget. **It runs only when the insert actually wrote a row.** A
 * retry is defined as a no-op (`ADR-0001`'s "same key twice is one row"), and a no-op
 * that still clears a column is not one: picture a title watched, then deliberately
 * abandoned again, with a stale optimistic retry of the *first* click still in flight —
 * without this guard, that retry would silently un-abandon a title the person re-gave-up
 * on after the watch it is retrying. Conditioning on `recorded` is what keeps "a retry is
 * a no-op" true of the whole write rather than of the `watch` row alone. Import is the
 * only writer that must never take this path regardless, and it does not call this
 * function — `applyImportChunk` has its own insert, which is the whole reason that guard
 * is spelled where it is rather than shared here.
 *
 * ── Nothing derived is written ─────────────────────────────────────────────────────────
 *
 * No progress column, no state, no count. The five states, progress and up next are the
 * views in `db/views.ts`, evaluated on the next read — this function's whole job ends at
 * the `watch` row and the one column it is allowed to touch beside it.
 *
 * ── One transaction, opened here ──────────────────────────────────────────────────────
 *
 * The insert and the clear must land together or not at all — a watch recorded without
 * its resume, or a resume without its watch, is a state the application never asked for.
 * Passing an executor that is already a transaction nests as a savepoint, exactly as
 * `addTitleToLibrary` and `applyImportChunk` already rely on.
 *
 * ── Authorization, not a foreign-key gamble ───────────────────────────────────────────
 *
 * `params.libraryEntryId` is looked up through `ownedBy(userId, libraryEntry)` before
 * anything is written, and a miss throws — the same treatment `getTitleDetail` gives a
 * tampered or stale id. The composite foreign keys on `watch` would also reject a
 * cross-account or cross-title row (ADR-0001 §3), but that is the backstop for a bug, not
 * the mechanism this function leans on to say no.
 */
export async function recordWatch(
  userId: UserId,
  params: RecordWatchParams,
  executor: Executor = getDb(),
): Promise<RecordWatchOutcome> {
  return executor.transaction(async (tx) => {
    // Built once and reused by both statements below — the isolation predicate is the
    // one thing this function may never spell two different ways.
    const entryFilter = and(
      ownedBy(userId, libraryEntry),
      eq(libraryEntry.id, params.libraryEntryId),
    );

    const [entry] = await tx
      .select({ titleId: libraryEntry.titleId })
      .from(libraryEntry)
      .where(entryFilter);

    if (!entry) {
      throw new Error(
        `Library entry ${params.libraryEntryId} was not found in this account's library.`,
      );
    }

    const written = await tx
      .insert(watch)
      .values({
        userId,
        libraryEntryId: params.libraryEntryId,
        titleId: entry.titleId,
        episodeId: params.episodeId,
        // The transaction's own instant, not a `Date` read in this process — "the moment
        // of the click" is the write, and `now()` is what makes the resume below and this
        // insert agree on when that was.
        watchedAt: sql`now()`,
        source: APP_WATCH_SOURCE,
        sourceKey: params.sourceKey,
      })
      .onConflictDoNothing({ target: [watch.userId, watch.source, watch.sourceKey] })
      .returning({ id: watch.id });

    const recorded = written.length > 0;
    if (recorded) {
      await tx.update(libraryEntry).set({ abandonedAt: null }).where(entryFilter);
    }

    return { recorded };
  });
}

/**
 * Which watch to take back. The same two fields `recordWatch` identifies one by, and
 * deliberately no third: there is no `watchId` here, because a surface that held one
 * would be a surface that could be made to delete a specific row of somebody's history
 * by editing a value in a request.
 */
export interface UnwatchParams {
  readonly libraryEntryId: string;
  /** `null` for a film; a real `episode.id` for a show. */
  readonly episodeId: string | null;
}

/**
 * What happened, and deliberately nothing about what survived — issue #145.
 *
 * #89 returned two more fields, `watched` and `unwatchable`, because *what is left* was a
 * real question: an imported watch underneath left the episode watched, and unwatching
 * one half of a rewatch left an app watch to unwatch again. Neither is possible now.
 * Every watch of the episode goes, so *what is left* is `false` and `false` for ever, and
 * a field that can only hold one value is a field a surface will eventually branch on.
 *
 * `removed` stays because it is the one thing that is genuinely not knowable in advance:
 * a press against an episode whose watches were already gone removed nothing, and that is
 * a stale row rather than a lost write.
 */
export interface UnwatchOutcome {
  /** Whether there was anything to remove. `false` is a stale row, not a failure. */
  readonly removed: boolean;
}

/**
 * Unwatch an episode — or a film, which is the same write with a null `episodeId`. Issue
 * #89, rewritten by #145, and the only function in this module that removes a watch.
 *
 * ── Every watch of that episode, and nothing else ─────────────────────────────────────
 *
 * A rewatch is a second `watch` row (`CONTEXT.md`, ADR-0001), and this function's job is
 * *put the episode back to unwatched* — so it is **every** row, not the most recent one.
 * One `DELETE` over a predicate, no `SELECT` resolving an id for it to delete by, and no
 * ordering: there is no longer a choice of which watch goes, so there is nothing left for
 * an `ORDER BY` to be an opinion about.
 *
 * ── The predicate that is gone, and why it went ───────────────────────────────────────
 *
 * #89 stated `source = 'app'` on both of its statements and this docblock called it *the
 * one predicate whose loss is silent*. **It is removed, not narrowed**, and that removal
 * is the whole of issue #145.
 *
 * It was not wrong to be careful; it was wrong about the facts. The rule rested on the
 * library's imported watches having been reconstructed once from an archive with no live
 * source — unrecoverable, and so not this application's to edit. **ADR-0001 amendment 8
 * is where that is taken apart**, with the committed export, the committed seed, import's
 * idempotency and its deterministic keys as the evidence; it is not restated here, because
 * an argument kept in two places is an argument that comes to differ between them.
 *
 * `npm run db:seed` therefore restores any imported watch exactly, which makes the *cost*
 * of removing one a command on a laptop rather than a fact destroyed. Against that: the
 * library is **19,558** imported watches (`SPEC.md` §7 — 19,391 is the *dated* subset of
 * them, and #89 quoted that figure as the total), so a control that refused them rendered
 * on essentially nothing its only reader owns. The careful rule made the feature
 * invisible and bought a recovery guarantee that `db:seed` already gave.
 *
 * Restoring is still not a button, and there is no undo in the product. What justifies
 * one press with no dialog is that it is one episode.
 *
 * `tests/watch-unwatch.test.ts` asserts the imported row is **gone** by reading it back,
 * rather than by reading this query and believing it — which is the same standard #89 held
 * the opposite claim to, and the reason the inversion is visible as an inversion.
 *
 * ── Nothing else moves ────────────────────────────────────────────────────────────────
 *
 * No derived state is written, because there is none to write (`db/views.ts`). Progress
 * is a high-water mark over watches, so unwatching the furthest episode moves it back and
 * up next follows — on the next read, by the views, with nothing here recalculating
 * anything. A title left with no watches at all reads as *watchlist* again for exactly
 * the same reason.
 *
 * `abandoned_at` is **not** touched in either direction. `recordWatch` clears it because
 * `CONTEXT.md` says watching something again clears it, and ADR-0001 pins that clear to
 * the same transaction as a watch *insert*. There is no matching rule saying taking a
 * watch back gives up on a title: unwatching is a correction to the record, not a
 * judgement about the show.
 *
 * ── One transaction ───────────────────────────────────────────────────────────────────
 *
 * The authorization check and the delete are one act — nested as a savepoint when
 * `executor` already is one, exactly as `recordWatch` relies on and as every test in
 * `tests/watch-unwatch.test.ts` runs.
 *
 * ── Authorization, and what now carries it alone ──────────────────────────────────────
 *
 * `ownedBy(userId, libraryEntry)` combined with the entry id, and a miss throws — the
 * same treatment `recordWatch` gives a tampered or stale id. `ownedBy(userId, watch)` is
 * then stated on the delete too rather than trusted to follow from the entry.
 *
 * That predicate mattered before and is load-bearing now: `episode` is global (ADR-0001),
 * so two accounts can hold a watch of the very same episode id, and `source` was never
 * what kept one person's press off the other's row. Owner, library entry and episode are
 * the whole of the isolation, which is why the tests #145 adds are the two isolation
 * questions #89 never asked: another title of the same account, and another account's
 * watch of the same episode.
 */
export async function unwatch(
  userId: UserId,
  params: UnwatchParams,
  executor: Executor = getDb(),
): Promise<UnwatchOutcome> {
  return executor.transaction(async (tx) => {
    const [entry] = await tx
      .select({ id: libraryEntry.id })
      .from(libraryEntry)
      .where(and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, params.libraryEntryId)));

    if (!entry) {
      throw new Error(
        `Library entry ${params.libraryEntryId} was not found in this account's library.`,
      );
    }

    // A film's watch carries no episode, so the two cases are `IS NULL` and `=` — not one
    // comparison that would silently match nothing for every film.
    const onThisEpisode =
      params.episodeId === null
        ? isNull(watch.episodeId)
        : eq(watch.episodeId, params.episodeId);

    const removed = await tx
      .delete(watch)
      .where(
        and(
          ownedBy(userId, watch),
          eq(watch.libraryEntryId, params.libraryEntryId),
          onThisEpisode,
        ),
      )
      .returning({ id: watch.id });

    return { removed: removed.length > 0 };
  });
}

/**
 * One press of *watched up to here*, and everything about it that is the caller's to
 * decide — issue #196.
 *
 * ── One key for the press, and one derived per row ───────────────────────────────────
 *
 * `sourceKey` is minted **in the browser**, once per press, on exactly the rule
 * `RecordWatchParams` states and for exactly the reason it gives: a server-minted key is
 * a new key per request, which is what turns a retry into history. What is different here
 * is that one press writes many rows and `UNIQUE (user_id, source, source_key)` allows
 * each key once — so this function derives a per-row key from the press's own,
 * `{sourceKey}:{episodeId}`.
 *
 * That derivation is deterministic, which is the whole of why it is not the thing
 * `RecordWatchParams` forbids. The same press retried derives the same keys and writes
 * the same rows, so `ON CONFLICT DO NOTHING` catches a second attempt exactly as it
 * catches a second click. A server-minted key would be different on every attempt, and
 * this has no code path that could produce one.
 *
 * `upToEpisodeId` is the episode the reader actually pressed, and the whole set is
 * derived from it here rather than sent. A list of ids from the browser is a list this
 * function would have to re-authorize row by row, and a stale one — a page open while a
 * refresh added episodes — would write a set that does not match what the reader saw. The
 * ordering that decides *earlier* lives in `episode`, so the answer is taken from there.
 */
export interface MarkWatchedUpToParams {
  readonly libraryEntryId: string;
  /** The episode the reader pressed on. Never `null` — a film has no episode list, and
   *  `programme-note-episodes.tsx` never draws this control on one. */
  readonly upToEpisodeId: string;
  readonly sourceKey: string;
}

/**
 * How many rows this press actually wrote.
 *
 * It is genuinely not knowable in advance from the browser — the reader's screen may be
 * older than the table — which is the same test `UnwatchOutcome`'s `removed` passes and
 * the reason that one exists. And like `removed`, it **stays off the wire**
 * (`watch-action.ts` returns only `ok`): a count on a surface is `DESIGN.md` §11's
 * permanent exclusion, and the confirmation the reader was already shown is drawn from
 * the episodes in front of them rather than from an answer that arrives after the write.
 */
export interface MarkWatchedUpToOutcome {
  readonly recorded: number;
}

/**
 * Record a show up to the episode the reader had reached — issue #196, and the migration
 * case `SPEC.md`'s import does not cover: a reader arriving with no export to bring.
 *
 * ── What "earlier" means, and where the answer comes from ────────────────────────────
 *
 * The show's own `(season_no, episode_no)` order, which is the order every other rule in
 * this application is stated in (`db/views.ts`'s progress, up next and remaining all read
 * it). So *earlier* crosses a season boundary: pressing S2E1 covers the whole of season
 * one as well.
 *
 * ── Above season zero only ───────────────────────────────────────────────────────────
 *
 * `db/views.ts` excludes specials from every derived state, so a watch of one cannot move
 * a title anywhere. Writing them would therefore add rows that change no answer, while
 * holding a show back from `library_entry_state`'s *finished* branch — every `season_no >
 * 0` episode watched — over episodes the reader never counted. Excluding them is what
 * makes an ended show read **finished** and one still in production read **caught up**
 * with neither special-cased.
 *
 * A special's own mark is untouched in both directions: one the reader struck by hand
 * stays struck, and one they never touched stays unstruck.
 *
 * ── Already-recorded episodes are skipped, not re-written ────────────────────────────
 *
 * A second `watch` row against an episode is a **rewatch** (`CONTEXT.md`, ADR-0001), and
 * a backfill has no business claiming the reader watched something twice. So the covered
 * set is filtered against this entry's existing watches before anything is inserted.
 *
 * That is a different guarantee from the conflict clause below, which is about one press
 * arriving twice. Both are needed: the filter is what stops a *first* press duplicating
 * history it can see, and the derived key is what stops a *second* attempt at the same
 * press duplicating what it wrote.
 *
 * ── Timestamped now ──────────────────────────────────────────────────────────────────
 *
 * `watched_at` is `now()` — the transaction's own instant, so a press is one moment in
 * the record — and **not** the null an import writes for the same situation. Issue #196
 * makes that divergence deliberately and records the consequence: the rails order on the
 * most recent watch per title (`listUpNextRails`), so a show backfilled today rises above
 * titles genuinely watched last week until something newer lands.
 *
 * ── `abandoned_at` is not cleared, which is where this parts company with `recordWatch` ─
 *
 * `recordWatch` clears it, because `CONTEXT.md` says watching something again clears it
 * and ADR-0001 pins that clear to a watch insert. This write is the other kind: it is
 * backfill, and `applyImportChunk` — the only other backfill in the application — does
 * not clear it either, on the stated grounds that a re-run import may add watches to an
 * abandoned title without giving it back.
 *
 * Recording that you *had* watched a show up to some point is a statement about the past.
 * Deciding you have not given up on it is `unabandonTitle` — which no surface calls any
 * more: the control that did was retired, and `recordWatch` clearing `abandoned_at` is now
 * the only path out of the state. **The consequence is stated rather than hidden**: an abandoned show
 * marked up to its last episode still reads *abandoned* afterwards, because
 * `library_entry_state` tests `abandoned_at` first and outranks every derived answer.
 *
 * **This is a divergence from a written rule and is recorded as one** — ADR-0001
 * amendment 9, added because the two-axis review of #196 was right that a docblock is not
 * where a departure from `CONTEXT.md` gets to live. That amendment is the argument; this
 * paragraph is the pointer to it.
 *
 * ── Two reads and one insert, in one transaction ─────────────────────────────────────
 *
 * All-or-nothing is the ticket's own requirement, and it is what makes the failure
 * legible: one lost write, one toast, and a reader who reloads finds the show exactly as
 * they left it rather than half-recorded. Passing an executor that is already a
 * transaction nests as a savepoint, exactly as `recordWatch` and `applyImportChunk`
 * already rely on.
 *
 * The two reads are separate queries rather than one correlated statement, for the reason
 * `getTitleDetail`'s own docblock sets out at length: `episode` and `watch` both carry an
 * `id` and Drizzle does not table-qualify inside a `sql` fragment, so a correlated
 * `EXISTS` over these two tables resolves to the wrong column silently and is always
 * false. Two queries and a `Set` sidestep the footgun rather than working around it.
 *
 * ── Authorization ────────────────────────────────────────────────────────────────────
 *
 * `ownedBy(userId, libraryEntry)` with the entry id, and a miss throws — the same
 * treatment `recordWatch` and `getTitleDetail` give a tampered or stale id. The episode
 * is then resolved **through the entry's own title** rather than by its id alone, so an
 * episode of some other show cannot be used to reach across into this entry: `episode` is
 * global (ADR-0001), and an id from anywhere in the catalogue is a value anyone can send.
 */
export async function markWatchedUpTo(
  userId: UserId,
  params: MarkWatchedUpToParams,
  executor: Executor = getDb(),
): Promise<MarkWatchedUpToOutcome> {
  return executor.transaction(async (tx) => {
    const [entry] = await tx
      .select({ titleId: libraryEntry.titleId })
      .from(libraryEntry)
      .where(
        and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, params.libraryEntryId)),
      );

    if (!entry) {
      throw new Error(
        `Library entry ${params.libraryEntryId} was not found in this account's library.`,
      );
    }

    // Every episode of this title, in the show's own order — the same `orderBy`
    // `getTitleDetail` reads, so this and the surface that drew the control agree about
    // what "earlier" means rather than each deciding it.
    const episodes = await tx
      .select({
        id: episode.id,
        seasonNo: episode.seasonNo,
        episodeNo: episode.episodeNo,
      })
      .from(episode)
      .where(eq(episode.titleId, entry.titleId))
      .orderBy(episode.seasonNo, episode.episodeNo);

    const through = episodes.find((one) => one.id === params.upToEpisodeId);
    if (!through) {
      throw new Error(
        `Episode ${params.upToEpisodeId} is not an episode of library entry ${params.libraryEntryId}'s title.`,
      );
    }

    const watchedRows = await tx
      .select({ episodeId: watch.episodeId })
      .from(watch)
      .where(eq(watch.libraryEntryId, params.libraryEntryId));
    const alreadyWatched = new Set(
      watchedRows.map((one) => one.episodeId).filter((id) => id !== null),
    );

    const covered = episodes.filter(
      (one) =>
        one.seasonNo > 0 &&
        // Lexicographic over the pair, exactly as `library_entry_up_next`'s own row
        // comparison is: at or before this episode of this season, or anywhere in an
        // earlier one. A special is excluded by the test above rather than by ordering —
        // season 0 sorts first, so pressing one covers nothing at all.
        (one.seasonNo < through.seasonNo ||
          (one.seasonNo === through.seasonNo && one.episodeNo <= through.episodeNo)) &&
        !alreadyWatched.has(one.id),
    );

    if (covered.length === 0) return { recorded: 0 };

    const written = await tx
      .insert(watch)
      .values(
        covered.map((one) => ({
          userId,
          libraryEntryId: params.libraryEntryId,
          titleId: entry.titleId,
          episodeId: one.id,
          // The transaction's own instant, so the whole press is one moment in the
          // record rather than sixty-two of them microseconds apart.
          watchedAt: sql`now()`,
          source: APP_WATCH_SOURCE,
          sourceKey: `${params.sourceKey}:${one.id}`,
        })),
      )
      .onConflictDoNothing({ target: [watch.userId, watch.source, watch.sourceKey] })
      .returning({ id: watch.id });

    return { recorded: written.length };
  });
}

/**
 * Give up on a title — issue #87, and the only hand-set state in the model
 * (`CONTEXT.md`, *Abandoned*).
 *
 * ── Why this needs no state to hand back ──────────────────────────────────────────────
 *
 * `db/views.ts`'s `library_entry_state` tests `abandoned_at is not null` **first**, ahead
 * of every derived rule — so setting it is the whole write. There is nothing to compute:
 * the entry reads *abandoned* on the very next read regardless of what its watches say,
 * which is the property `SPEC.md` §7 calls "abandoned outranks the state the watches
 * would give."
 *
 * ── Neither this nor `unabandonTitle` below touches `watch` ─────────────────────────
 *
 * `abandoned_at` is the one column on `library_entry` a person sets directly. Giving up
 * is not a fact about what was watched, so it is not recorded as one — `recordWatch`
 * above is the only function that ever writes a `watch` row, and it is not called here.
 *
 * ── Authorization ──────────────────────────────────────────────────────────────────────
 *
 * `ownedBy(userId, libraryEntry)` combined with the entry id, same as `recordWatch`: a
 * tampered or stale id updates nothing, `RETURNING` comes back empty, and that is a throw
 * rather than a silent no-op — indistinguishable, from here, from the id belonging to
 * somebody else's library.
 */
export async function abandonTitle(
  userId: UserId,
  libraryEntryId: string,
  executor: Executor = getDb(),
): Promise<void> {
  const [row] = await executor
    .update(libraryEntry)
    .set({ abandonedAt: sql`now()` })
    .where(and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, libraryEntryId)))
    .returning({ id: libraryEntry.id });

  if (!row) {
    throw new Error(
      `Library entry ${libraryEntryId} was not found in this account's library.`,
    );
  }
}

/**
 * How many entries a bulk abandon actually changed. A count rather than nothing at all,
 * for `AddTitlesToListOutcome`'s reason: *did the whole set land* is what the transaction
 * below promises outright, and *how many of them were not already given up on* is the
 * only thing left to report.
 */
export interface AbandonTitlesOutcome {
  readonly abandoned: number;
}

/**
 * Give up on several titles at once, as one write — issue #199.
 *
 * ── Why this is not `abandonTitle` in a loop ─────────────────────────────────────────
 *
 * The same reason `addTitlesToList` is not `addTitleToList` in a loop: a loop cannot
 * promise all-or-nothing. Six sequential `UPDATE`s are six transactions, four of which can
 * commit before the fifth fails, and the reader is then left to work out which two of the
 * six they still have to give up on. One transaction makes partial success structurally
 * impossible, which is what let `bulk-selection.ts` raise **one** toast for a lost abandon
 * rather than one per title.
 *
 * **Nothing calls this any more.** The library's bulk *Abandon* was retired with the
 * single-title control, and the rows already abandoned are untouched — this function, its
 * transaction and its filter are kept against the state coming back, not because anything
 * presses them today. `tests/abandon.test.ts` is what still holds them honest.
 *
 * ── Already-abandoned entries are read, not overwritten ──────────────────────────────
 *
 * The ticket is explicit that abandon over a set is not the toggle the single-title
 * control is: *select four watching and two abandoned, press Abandon, and the four are
 * abandoned while the two are left exactly as they were.* `bulk-selection.ts` filters the
 * selection before it ever gets here, and this function filters again — not out of
 * distrust of that caller, but because a Server Action is a POST endpoint anyone can call
 * with any arguments, and `abandoned_at` is a time somebody's press already set.
 * Re-stamping it with `now()` would keep the title abandoned while quietly moving *when*,
 * which is a fact this write was never asked to change.
 *
 * So the entries are read first, inside the same transaction, and only the ones with a
 * null `abandoned_at` are updated. `SELECT … FOR UPDATE` is deliberately not taken: two
 * readers racing to abandon the same title both write the same column to a time within
 * milliseconds of each other, and the loser of that race has nothing to correct.
 *
 * ── A missing entry is a throw, and takes the whole set with it ──────────────────────
 *
 * `ownedBy(userId, libraryEntry)` combined with the ids, exactly as `abandonTitle`. An id
 * naming no row and an id naming somebody else's row are the same case from here, and both
 * are a write that did not happen — so the transaction rolls back and none of the *other*
 * ids are abandoned either. That is all-or-nothing holding for authorization as well as
 * for infrastructure, which is the only thing that makes the toast's *nothing changed*
 * true rather than usually true.
 *
 * ── Neither this nor `abandonTitle` touches `watch` ──────────────────────────────────
 *
 * Stated there at length and unchanged by doing several at once: giving up is not a fact
 * about what was watched, so it is not recorded as one.
 */
export async function abandonTitles(
  userId: UserId,
  libraryEntryIds: readonly string[],
  executor: Executor = getDb(),
): Promise<AbandonTitlesOutcome> {
  // No transaction and no round trip for a set with nothing in it, as `addTitlesToList`.
  if (libraryEntryIds.length === 0) return { abandoned: 0 };

  return executor.transaction(async (tx) => {
    const rows = await tx
      .select({ id: libraryEntry.id, abandonedAt: libraryEntry.abandonedAt })
      .from(libraryEntry)
      .where(
        and(ownedBy(userId, libraryEntry), inArray(libraryEntry.id, [...libraryEntryIds])),
      );

    const found = new Set(rows.map((row) => row.id));
    const missing = libraryEntryIds.filter((id) => !found.has(id));

    if (missing.length > 0) {
      throw new Error(
        `Library entries ${missing.join(", ")} were not found in this account's library.`,
      );
    }

    // Derived from the rows rather than from the request, so a caller that named the same
    // entry twice updates it once and counts it once.
    const pending = rows.filter((row) => row.abandonedAt === null).map((row) => row.id);

    if (pending.length === 0) return { abandoned: 0 };

    await tx
      .update(libraryEntry)
      .set({ abandonedAt: sql`now()` })
      .where(
        and(
          ownedBy(userId, libraryEntry),
          inArray(libraryEntry.id, pending),
          // The read above already established this, and it is repeated so that the
          // statement is right on its own: this is the line that makes re-stamping an
          // existing `abandoned_at` impossible rather than merely unreached.
          isNull(libraryEntry.abandonedAt),
        ),
      );

    // `pending.length`, not a count read back off the `UPDATE`. The predicate is the one
    // the read was taken under and both run in the same transaction, so the two numbers
    // are equal by construction.
    return { abandoned: pending.length };
  });
}

/**
 * Take an abandonment back directly — the other of the two paths `CONTEXT.md`'s
 * *Abandoned* names out of, and the one that does not require recording a watch that did
 * not happen. The other path is the watch write itself: `recordWatch` already clears
 * `abandoned_at` in the same transaction as an insert, for *watching it again clears it*.
 *
 * ── Restoring the derived state means clearing one column, not choosing one ──────────
 *
 * Nothing is re-marked by hand. `library_entry_state` re-evaluates its ordinary four
 * rules against whatever `watch` rows already exist the moment `abandoned_at` is no
 * longer in the way — so the state this returns is read back from that view rather than
 * guessed here, and there is no second copy of the five-state rule for this function to
 * drift from.
 *
 * ── One transaction ────────────────────────────────────────────────────────────────────
 *
 * The clear and the read need to agree on the same row, so both run against the same
 * connection — nested as a savepoint when `executor` is already a transaction, exactly as
 * `recordWatch` relies on.
 */
export interface UnabandonOutcome {
  readonly state: LibraryState;
}

export async function unabandonTitle(
  userId: UserId,
  libraryEntryId: string,
  executor: Executor = getDb(),
): Promise<UnabandonOutcome> {
  return executor.transaction(async (tx) => {
    const [row] = await tx
      .update(libraryEntry)
      .set({ abandonedAt: null })
      .where(and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, libraryEntryId)))
      .returning({ id: libraryEntry.id });

    if (!row) {
      throw new Error(
        `Library entry ${libraryEntryId} was not found in this account's library.`,
      );
    }

    const [state] = await tx
      .select({ state: libraryEntryState.state })
      .from(libraryEntryState)
      .where(eq(libraryEntryState.libraryEntryId, libraryEntryId));

    return { state: stateFrom(state.state) };
  });
}

/**
 * Your rating of one title — issue #113, and the last column in ADR-0001's model that had
 * no writer at all.
 *
 * ── One rating per title, and no history of it ────────────────────────────────────────
 *
 * An `UPDATE` of one column, never an insert, which is the whole of `SPEC.md` §7's *held
 * on the library entry, overwritten on change, one per title and never one per watch*:
 * choosing a second value leaves no trace of the first, and a rewatch writes a `watch`
 * row this column knows nothing about. There is deliberately no rating on `watch` for
 * this to have to reconcile against, and so nothing here to ask *which* watch.
 *
 * ── The range is checked here as well as in Postgres, and both are load-bearing ───────
 *
 * `library_entry_rating_check` is the guarantee; this is the *error*. A Server Action is
 * a POST endpoint anyone can call with any arguments, and a check violation from the
 * driver would still reach the toast as a lost write — correctly, but only after this
 * function had passed on a value it could see was wrong. Rejecting it here says so
 * plainly and never opens a statement to find out.
 *
 * ── Authorization, and why a missing row throws ───────────────────────────────────────
 *
 * `ownedBy(userId, libraryEntry)` combined with the entry id, the same shape
 * `abandonTitle` above uses and for the same reason: a tampered or stale id updates
 * nothing, `RETURNING` comes back empty, and that is a throw rather than a silent no-op.
 * From here an id naming no row and an id naming somebody else's row are the same case,
 * and both are a write that did not happen.
 */
export async function rateTitle(
  userId: UserId,
  libraryEntryId: string,
  rating: number,
  executor: Executor = getDb(),
): Promise<void> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    throw new Error(`A rating is a whole number 1-10; got ${rating}.`);
  }

  const [row] = await executor
    .update(libraryEntry)
    .set({ rating })
    .where(and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, libraryEntryId)))
    .returning({ id: libraryEntry.id });

  if (!row) {
    throw new Error(
      `Library entry ${libraryEntryId} was not found in this account's library.`,
    );
  }
}

/**
 * What removing one title from this library would destroy, in the numbers the
 * confirmation states — issue #142.
 *
 * `AccountFootprint` below is the shape this is modelled on and the one the ticket names:
 * the numbers are the whole argument for pressing the button, so they are read rather than
 * described in the abstract. The difference is scope. That one counts an account and this
 * one counts a single library entry — the account's is *titles, watches, ratings*, and a
 * single title has exactly one entry and at most one rating, so *how many watches* and
 * *whether there is a rating* is all that is left to state.
 *
 * `name` comes back with them rather than being fetched separately by the caller, because
 * the confirmation has to name the title it is about and a second read for the name would
 * be a second snapshot: a repoint by the nightly sweep between the two would put one
 * title's name over another title's counts.
 *
 * ── One statement, one snapshot ──────────────────────────────────────────────────────
 *
 * The join, for `accountFootprint`'s reason: two queries are two snapshots, and a watch
 * recorded on another device between them would show under a count that was taken before
 * it. `left`, not `inner` — a title in the library that has never been watched is still a
 * title being removed, and an inner join would make it answer nothing at all, which this
 * function would then report as *not in this library*.
 *
 * The scope is `ownedBy` on `library_entry` combined with the entry id, and it is
 * sufficient on its own: `watch`'s foreign key is composite —
 * `(library_entry_id, user_id, title_id)` — so a watch reached through this entry belongs
 * to this entry, and to this account, by construction. There is no watch of another title
 * or another account's copy of this one that the join can see.
 *
 * ── A count that cannot be read is not a zero ────────────────────────────────────────
 *
 * There is no `try` here and there must never be one (`AGENTS.md`, `SPEC.md` §3.2). On
 * this surface it is the difference between *this title has nothing behind it* and
 * *MediaSafe could not tell you what you are about to destroy*, and the confirmation page's
 * own boundary is what turns the throw into a read failure with no remove button under it.
 *
 * ── A missing entry and somebody else's entry are the same case ──────────────────────
 *
 * Both throw, exactly as they do in `getTitleDetail`, `abandonTitle` and `rateTitle`. There
 * is nothing for this surface to degrade to: a confirmation that cannot find the title it
 * is about has nothing to confirm.
 *
 * ── What the numbers are, exactly ────────────────────────────────────────────────────
 *
 * True when the confirmation was offered, and not re-read at the press — the trade
 * `accountFootprint` sets out at length and for the same reasons. A watch recorded on
 * another device in between goes with the rest and was never counted. What must never
 * drift is the shape: this read and `removeTitleFromLibrary` below scope by the same
 * account and the same entry and nothing else, and `tests/remove-from-library.test.ts` is
 * what holds that.
 */
export interface TitleFootprint {
  /** The title's own name, so the confirmation can say which title it is about. */
  readonly name: string;
  readonly watches: number;
  /** `null` where the title is unrated — the confirmation says nothing about a rating. */
  readonly rating: number | null;
}

export async function titleFootprint(
  userId: UserId,
  libraryEntryId: string,
  executor: Executor = getDb(),
): Promise<TitleFootprint> {
  const [row] = await executor
    .select({
      name: title.name,
      rating: libraryEntry.rating,
      watches: sql<number>`count(${watch.id})`.mapWith(Number),
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .leftJoin(watch, eq(watch.libraryEntryId, libraryEntry.id))
    .where(and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, libraryEntryId)))
    .groupBy(libraryEntry.id, libraryEntry.rating, title.name);

  if (!row) {
    throw new Error(
      `Library entry ${libraryEntryId} was not found in this account's library.`,
    );
  }

  return { name: row.name, watches: row.watches, rating: row.rating };
}

/**
 * Remove one title from this account's library — issue #142, and the second irreversible
 * write in the product.
 *
 * ── One statement, and the cascade is the schema's ───────────────────────────────────
 *
 * `deleteAccount` below is the precedent and the argument is identical: `watch`'s
 * composite foreign key to `library_entry` is `ON DELETE CASCADE` (`db/tables.ts`,
 * ADR-0001), so deleting the entry takes that title's watches with it, atomically, and the
 * ordering and the completeness are Postgres's rather than a hand-written sequence's. A
 * list of deletes in application code is a list an eighth owned table gets left off.
 *
 * It needs no explicit transaction for that reason — a single statement and the cascades it
 * fires are one atomic unit already. `executor` is still last, so the test harness runs it
 * inside its rollback.
 *
 * ── What it deliberately leaves standing ─────────────────────────────────────────────
 *
 * `title` and `episode`, exactly as they survive account deletion: they are global and
 * unowned, one row per TMDB id shared by every account, and `library_entry.title_id`
 * references `title` with **no** cascade, so this statement cannot reach them. A Title is a
 * fact about the world (`CONTEXT.md`) and removing it from your library is not a statement
 * about it. It is also what makes the title addable again afterwards — the add finds the
 * mirrored rows rather than re-fetching them, and mints a fresh entry with no watches
 * behind it, which is a watchlist title.
 *
 * ── What it leaves standing that is easy to assume it takes ──────────────────────────
 *
 * **The lists the title was in.** `list_membership` hangs off `title` rather than
 * `library_entry` since issue #143's repoint, so this statement cannot reach a membership
 * any more than it can reach the catalogue — which is issue #133's decision, arrived at by
 * the schema rather than by a clause here: *a list is your own grouping, not a view of your
 * library, and one action must not silently edit a list you ordered by hand.* The entry in
 * the list then reads as untracked, and adding the title again is what fills it back in.
 *
 * This is worth stating precisely because it is invisible in the statement below. Nothing
 * here mentions lists, and the reason that is correct rather than an omission is the shape
 * of the key; before the repoint the same one-line `DELETE` would silently have taken every
 * membership with it.
 *
 * ── A missing entry and somebody else's entry are the same case ──────────────────────
 *
 * `ownedBy(userId, libraryEntry)` combined with the entry id, and `RETURNING` coming back
 * empty is a throw rather than a silent no-op — the shape `abandonTitle` and `rateTitle`
 * already use. A Server Action is a POST endpoint anyone can call with any arguments, so
 * the predicate that scopes this to one account is the one that may never be left out.
 *
 * ── A removal that fails ─────────────────────────────────────────────────────────────
 *
 * It throws, and the entry is intact — there is no partial state a single `DELETE` can
 * leave. The caller is what turns that into a sentence saying so.
 */
export async function removeTitleFromLibrary(
  userId: UserId,
  libraryEntryId: string,
  executor: Executor = getDb(),
): Promise<void> {
  const [row] = await executor
    .delete(libraryEntry)
    .where(and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, libraryEntryId)))
    .returning({ id: libraryEntry.id });

  if (!row) {
    throw new Error(
      `Library entry ${libraryEntryId} was not found in this account's library.`,
    );
  }
}

/**
 * Records that the first-run **Bring your library in** offer has been answered — by
 * choosing to import or by declining, either one (issue #75, completing the column
 * issue #70 declared and deliberately left unwritten).
 *
 * `lib/auth.ts` marks `user.importOfferAnsweredAt` `input: false`, which stops Better
 * Auth's own `update-user` endpoint from accepting it from a request body — it does not
 * stop an ordinary write to the row, and there is no Better Auth flow for "the server
 * decided this, not the reader" to go through instead. `resolveSeedUserId` above already
 * reads the `user` table from this module for the same reason: it is Better Auth's table,
 * but this is still the one place MediaSafe's own server code touches owned and
 * account-adjacent rows.
 *
 * Always writes `new Date()`, even when called a second time — there is no unanswered
 * state to return to, so re-answering only moves the timestamp forward, which is not a
 * fact anything reads.
 */
export async function markImportOfferAnswered(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<void> {
  await executor
    .update(user)
    .set({ importOfferAnsweredAt: new Date() })
    .where(eq(user.id, userId));
}

/**
 * What deleting this account would destroy, in the three numbers the delete-account page
 * states — issue #125.
 *
 * `titles` is library entries rather than rows of `title`: the catalogue is global and
 * unowned, and none of it is going anywhere. What the reader loses is *their* relationship
 * with those titles, which is one `library_entry` each. `ratings` is a subset of the same
 * rows — a rating is a column on the entry, never a table of its own — so a rated title is
 * counted in both, and that is the truth rather than a double count: the entry is
 * destroyed and so is the rating on it.
 */
export interface AccountFootprint {
  readonly titles: number;
  readonly watches: number;
  readonly ratings: number;
}

/**
 * The three numbers, read in **one statement** — which is the point of the join rather
 * than three round trips.
 *
 * Three separate queries would be three snapshots, so a watch recorded on another device
 * between the first and the third would show as a title with no watch behind it. One
 * statement is one snapshot, and on the one screen in the product whose numbers are the
 * whole argument for pressing the button, the three have to have been true at the same
 * instant.
 *
 * ── What the join does and does not widen ────────────────────────────────────────────
 *
 * A left join from `library_entry` to `watch` repeats an entry once per watch, so `titles`
 * and `ratings` count distinct entry ids and `watches` counts the joined rows. `left`, not
 * `inner`: a title in the library that has never been watched is still a title being
 * destroyed, and an inner join would drop it from `titles` entirely.
 *
 * The scope is `ownedBy` on `library_entry` alone, and that is sufficient rather than
 * incomplete. `watch`'s foreign key is composite — `(library_entry_id, user_id, title_id)`
 * — so a watch row joined through an entry belongs to that entry's account by
 * construction; there is no watch this join can reach that another account owns. That is
 * asserted rather than assumed, in `tests/delete-account.test.ts`.
 *
 * ── A count that cannot be read is not a zero ────────────────────────────────────────
 *
 * There is no `try` here and there must never be one. `SPEC.md` §3.2 is the rule
 * everywhere; on this page it is the difference between *you have nothing to lose* and
 * *MediaSafe could not tell you what you are about to lose*. A failure throws, the page's
 * boundary catches it, and the reader is shown a read failure with no confirmation field
 * under it.
 *
 * ── What the numbers are, exactly ────────────────────────────────────────────────────
 *
 * True at page load, and not re-read at the press. A watch recorded on another device
 * between arriving here and typing the word is destroyed along with everything else and
 * was never counted, so the figure the reader saw can be one short of what went. This is
 * accepted rather than overlooked: closing it means locking the account's rows for as long
 * as somebody stares at the page, or re-counting and re-confirming after the reader has
 * already decided — both of which buy an exactness the decision does not turn on, since
 * *473 titles* and *472 titles* are the same decision. What must never drift is the shape
 * of the answer — these three counts and the delete both scope by `user_id` and nothing
 * else — and `tests/delete-account.test.ts` is what holds that.
 */
export async function accountFootprint(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<AccountFootprint> {
  const [row] = await executor
    .select({
      titles: sql<number>`count(distinct ${libraryEntry.id})`.mapWith(Number),
      ratings: sql<number>`count(distinct ${libraryEntry.id}) filter (where ${libraryEntry.rating} is not null)`.mapWith(
        Number,
      ),
      watches: sql<number>`count(${watch.id})`.mapWith(Number),
    })
    .from(libraryEntry)
    .leftJoin(watch, eq(watch.libraryEntryId, libraryEntry.id))
    .where(ownedBy(userId, libraryEntry));

  return { titles: row.titles, watches: row.watches, ratings: row.ratings };
}

/**
 * Delete the account. One statement, and everything else is the schema's — issue #125.
 *
 * ── Why there is so little here ──────────────────────────────────────────────────────
 *
 * `library_entry`, `list`, `list_membership`, `session` and `account` all carry
 * `REFERENCES "user"(id) ON DELETE CASCADE`, and `watch` cascades transitively through
 * its composite key to `library_entry` (ADR-0001, `db/tables.ts`). `list_membership`
 * gained its direct key with amendment 7, when it stopped reaching `user` through
 * `library_entry`; it also still cascades through `list`, and either route alone would
 * take it. So the deletion is one `DELETE`, and the ordering, the atomicity and
 * the completeness are Postgres's rather than a hand-written sequence's — which is the
 * only version of this that cannot be got half-right. A list of deletes in application
 * code is a list a seventh owned table gets left off.
 *
 * It needs no explicit transaction for the same reason: a single statement and the
 * cascades it fires are one atomic unit already. `executor` is still the last argument, so
 * the test harness can run it inside its rollback.
 *
 * ── What it deliberately leaves standing ─────────────────────────────────────────────
 *
 * `title` and `episode`. They are global and unowned — one row per TMDB id, shared across
 * every account — and `library_entry.title_id` references `title` with **no** cascade, so
 * this statement cannot reach them. A title nobody has in a library any more is left
 * behind as an orphan, and that is v1's answer: `SPEC.md` §11.3 lists reaping them as
 * open. The alternative, a cascade that emptied the catalogue when its last reader left,
 * would silently empty every other account's library too.
 *
 * ── No outbound call ─────────────────────────────────────────────────────────────────
 *
 * Nothing here revokes the Google OAuth grant, and nothing should. An outbound call that
 * can fail in the middle of an irreversible operation leaves a half-deleted account, and a
 * half-failed deletion is worse than the honest sentence the page prints instead: MediaSafe
 * stays listed in the reader's Google account until they remove it there.
 *
 * ── A deletion that fails ────────────────────────────────────────────────────────────
 *
 * It throws, and the account is intact — there is no partial state a `DELETE` can leave.
 * The caller in `app/(signed-in)/settings/delete-account/actions.ts` is what turns that
 * into a sentence saying so.
 */
export async function deleteAccount(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<void> {
  await executor.delete(user).where(eq(user.id, userId));
}

/**
 * The user id `npm run db:seed` writes to (issue #74) — the CLI's own resolution
 * boundary, held to the same standard `lib/session.ts` is: a raw string becomes a
 * `UserId` in exactly one place, and only after this module has looked the row up
 * itself.
 *
 * Two modes, both refusing rather than guessing:
 *
 *  - **`requestedId` given** — must name a real `user` row, or this throws. A typo in
 *    `--user` should not surface as a foreign-key error three writes into a chunk.
 *  - **`requestedId` omitted** — resolves only when the database holds exactly one user.
 *    Zero or several both throw, because picking which of several accounts receives
 *    18,715 watches is not a default worth having, and the ambiguity is exactly the same
 *    shape whether there are zero candidates or five.
 */
export async function resolveSeedUserId(
  requestedId: string | undefined,
  executor: Executor = getDb(),
): Promise<UserId> {
  if (requestedId !== undefined) {
    const [found] = await executor
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, requestedId));
    if (!found) {
      throw new Error(`No user with id "${requestedId}" exists in this database.`);
    }
    return asUserId(found.id);
  }

  const rows = await executor.select({ id: user.id }).from(user);
  if (rows.length === 0) {
    throw new Error(
      "This database has no users. Sign in once first, or pass --user <id> explicitly.",
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `This database holds ${rows.length} users. Pass --user <id> — guessing which one ` +
        "receives the import is not a default worth having.",
    );
  }
  return asUserId(rows[0].id);
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
/**
 * The title one *Because you watched* rail is about — the most recently watched title of
 * one kind, or `null` when this account has never watched one.
 *
 * ── Why the most recent, and why per kind ───────────────────────────────────────────
 *
 * *Recent* rather than *most watched* or *most recently finished*: the rail's heading is a
 * sentence about something you did, and the truest answer to *because you watched what?*
 * is the last thing. It also moves — a rail seeded off a title you finished a year ago
 * would be a rail that never changes.
 *
 * Per kind because the search screen has a Films/Shows mode and the rail follows it.
 * TMDB's recommendation endpoints are per kind anyway (`/tv/{id}/recommendations` returns
 * shows), so a mode-blind seed would offer show recommendations under a field labelled
 * *Search for a film*.
 *
 * ── `null` is a real answer here, and not an empty list ─────────────────────────────
 *
 * A new account has watched nothing, and there is genuinely no title for the rail to be
 * about. That is not a failed read and it is not an empty rail — the caller renders no
 * rail at all. `SPEC.md` §3's separation is why this returns `null` rather than an empty
 * array that a caller could mistake for *TMDB recommended nothing*, which is a different
 * state with a different cause.
 *
 * ── The ordering is deliberately not `watched_at` alone ─────────────────────────────
 *
 * `watch.watchedAt` is nullable — an imported watch may carry no timestamp at all
 * (`CONTEXT.md`'s undated watch). `NULLS LAST` keeps a dated watch ahead of an undated
 * one, and `created_at` breaks the tie underneath, so an account whose every watch arrived
 * undated from an import still gets a stable, sensible seed rather than an arbitrary row.
 */
export interface WatchedSeed {
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
}

export async function mostRecentlyWatchedTitle(
  userId: UserId,
  kind: TitleKind,
  executor: Executor = getDb(),
): Promise<WatchedSeed | null> {
  const [row] = await executor
    .select({ kind: title.kind, tmdbId: title.tmdbId, name: title.name })
    .from(watch)
    .innerJoin(title, eq(title.id, watch.titleId))
    .where(and(ownedBy(userId, watch), eq(title.kind, kind)))
    .orderBy(sql`${watch.watchedAt} desc nulls last`, desc(watch.createdAt))
    .limit(1);

  if (row === undefined) return null;

  return { kind: kindFrom(row.kind), tmdbId: row.tmdbId, name: row.name };
}

export interface LibraryEntryRow {
  readonly libraryEntryId: string;
  readonly titleId: string;
  /** Borrowed. Replaced by a refresh, like every other fact about a title. */
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  /**
   * Film or show — borrowed, and read from `title` rather than kept beside the entry.
   *
   * `db/tables.ts` refuses this as a *column* on `library_entry` and that refusal stands:
   * denormalising it would need a `UNIQUE (id, kind)` on `title` that nothing else wants.
   * This is the join the query already makes, selected one field wider.
   *
   * It is here because the library screen became two screens. The Films/Shows control is
   * a mode rather than a filter, and the grouping under it differs by kind — so the
   * surface has to be able to tell a film from a show, and until now nothing handed to it
   * could.
   */
  readonly kind: TitleKind;
  readonly state: LibraryState;
  readonly upNext: UpNext | null;
}

/**
 * The `ORDER BY` for one of the four sorts, always ending in the same tiebreak. The four
 * choices themselves — the URL vocabulary and the default — are `db/library-sort.ts`,
 * split out because none of it reads or writes a row; this is the one piece that has to
 * stay here, because building `SQL` is the thing only this file may do.
 *
 * ── Title A–Z's tiebreak is everyone else's rule too ─────────────────────────────────
 *
 * `SPEC.md` §7: *"missing last, and every sort breaks ties by Title A–Z."* 457 titles
 * share one `added_at` after import, so without it *recently added* would reshuffle
 * between two loads of the same rows for the same reason the grid's own default order
 * would. `lower()` rather than the database's collation, matching the existing default.
 *
 * `libraryEntry.id` is one further stabiliser underneath that — two entries can still
 * share a title's exact name, and the query needs a total order, not just the one
 * `SPEC.md` names, to promise the same two loads never swap them either.
 *
 * ── Why *closest to finishing* is two `ORDER BY` terms, not one ─────────────────────
 *
 * `library_entry_remaining` has no row for a film, so `remaining` arrives `NULL` through
 * the `left` join below — the *missing* case `SPEC.md` §7 asks to sort last. A finished
 * show is a real `0`, not missing, and it is asked to sort last too, which plain
 * ascending order gets backwards: `0` is the smallest value a naive sort sees, so it would
 * open the order with everything already finished. The leading `case` sorts the "at the
 * bottom" titles — `0` and `NULL` alike — into one trailing group before `remaining`
 * itself is even consulted, and only inside that group does `NULLS LAST` decide whether a
 * film or a finished show comes first, which nothing asks it to care about.
 */
function orderByFor(sort: LibrarySort): (SQL | PgColumn)[] {
  const titleTiebreak = sql`lower(${title.name})`;

  switch (sort) {
    case "title":
      return [titleTiebreak, libraryEntry.id];
    case "recently-added":
      return [sql`${libraryEntry.addedAt} desc`, titleTiebreak, libraryEntry.id];
    case "release-year":
      return [sql`${title.releaseYear} desc nulls last`, titleTiebreak, libraryEntry.id];
    case "closest-to-finishing":
      return [
        sql`case when ${libraryEntryRemaining.remaining} is null or ${libraryEntryRemaining.remaining} = 0 then 1 else 0 end`,
        sql`${libraryEntryRemaining.remaining} asc nulls last`,
        titleTiebreak,
        libraryEntry.id,
      ];
    default: {
      const exhaustive: never = sort;
      throw new Error(`Unknown library sort: ${String(exhaustive)}`);
    }
  }
}

/**
 * Every library entry in one account, with where it stands and what is next in it, in one
 * of the four orders `SPEC.md` §7 settles.
 *
 * ── One query, 472 rows, no N+1 ──────────────────────────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §7 sizes this at 472 titles, which is what makes the shape
 * of the read matter more than its cleverness: the state, the up-next episode and now the
 * remaining count are joined here rather than asked per cell, because 472 cells each
 * asking several questions is the request storm `tvtracker` shipped (its cold deck once
 * issued 114 requests for 57 shows). The derivation itself is not repeated — the views are
 * the definition, and this joins them. `library_entry_remaining` is joined unconditionally
 * rather than only for `closest-to-finishing`, so there is still one query behind this
 * screen and not four.
 *
 * ── Why the state join is inner and the other two are not ───────────────────────────
 *
 * `library_entry_state` has a row for **every** library entry: its `case` has an `else`,
 * and it joins `title` through a `NOT NULL` foreign key. So an inner join drops nothing,
 * and it is the honest one — a `left` join here would type `state` as nullable and invite
 * a fallback, which is a state invented in TypeScript for a row the database could not
 * classify. `library_entry_up_next` genuinely has no row when nothing is next, and
 * `library_entry_remaining` genuinely has no row for a film — both absences are the answer
 * rather than a gap to fill.
 *
 * ── There is no `try` here, and there will not be ────────────────────────────────────
 *
 * A failed read throws into `app/(signed-in)/library/error.tsx`. Returning `[]` from a
 * failure is the one bug this codebase is built around not having (`AGENTS.md`), because
 * an empty library and a database that is down would then be the same screen.
 *
 * ── The page does not call this directly any more — issue #219 ───────────────────────
 *
 * `cache/tags.ts`'s `cachedLibraryEntries` wraps it, and that is what
 * `library/page.tsx` calls. Nothing about the query changed: the user id is still the
 * first argument, `ownedBy` is still the whole isolation model, and a rejection still
 * leaves through `unstable_cache` untouched. What changed is that a caller may now be
 * served an earlier answer, so **a write that changes what this returns has to bust the
 * library's tag** — `INVALIDATES` in that file is where each one is written down, and
 * `tests/cache-tags.test.ts` fails if a write in this module is missing from it.
 */
export async function listLibraryEntries(
  userId: UserId,
  sort: LibrarySort = DEFAULT_LIBRARY_SORT,
  executor: Executor = getDb(),
): Promise<readonly LibraryEntryRow[]> {
  const rows = await executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleId: title.id,
      name: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
      kind: title.kind,
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
    .leftJoin(
      libraryEntryRemaining,
      eq(libraryEntryRemaining.libraryEntryId, libraryEntry.id),
    )
    .where(ownedBy(userId, libraryEntry))
    .orderBy(...orderByFor(sort));

  return rows.map((row) => ({
    libraryEntryId: row.libraryEntryId,
    titleId: row.titleId,
    name: row.name,
    releaseYear: row.releaseYear,
    posterPath: row.posterPath,
    // Parsed, not cast — `kindFrom`'s own note: a column Drizzle types as `string` is a
    // promise nothing at the type level checks.
    kind: kindFrom(row.kind),
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

/**
 * One entry of a rail: a title, and the episode of it you are up to.
 *
 * ── Why the season and episode numbers are here, and not on `LibraryEntryRow` ────────
 *
 * `UpNext` above deliberately carries no numbers, because the library cell has no place
 * to print them and a surface holding them would be one keystroke from breaking *episodes
 * are named, never numbered alone*. This is the opposite case: `DESIGN.md` sets the
 * number **beside** the name as a dim code line — "S3 E4" over "Sweet Vitriol" — on the
 * desktop row this entry once fed too, so withholding them here would force a surface to
 * fetch them somewhere else.
 *
 * `episodeName` is still `null` where TMDB has not named the episode. That is the honest
 * answer and it stays the surface's problem: the rule the surfaces follow is that they
 * never *degrade* to the number, and nothing this read could invent would help them keep
 * it.
 *
 * ── The remainder is here now, and that is an amendment rather than a slip (#250) ────
 *
 * It used to say *there is no remainder here, and no count of anything* — the remainder
 * was a sort key and nothing else. The phone's next-episodes card prints it, so the read
 * carries it, and `SPEC.md` §7 is amended in the same change rather than this quietly
 * disagreeing with it. The rule that narrowed to survive is *a count may not appear as
 * chrome on a surface the reader came to do something else on*; a number saying whether
 * you are three from the end or thirty is the content of the card it sits on, which is
 * what the wireframe's "▓▓▓░ 12" meter never was.
 *
 * **It is `library_entry_remaining`'s number, unmodified.** Episodes of the show with no
 * watch — unreleased ones included, which is `db/views.ts`'s definition and `CONTEXT.md`'s
 * — and so it counts the episode this entry is offering. The card subtracts that one
 * itself (`episode-card-line.ts`), because *what is left after this* is a rendering
 * question and *how much of this show is unwatched* is the domain's.
 *
 * ── The still, the runtime and the air date arrived with the card (#246, #250) ───────
 *
 * All three are borrowed and all three are mirrored — `still_path` by amendment 10 of
 * #246, precisely so a rail of landscape cards is not one catalogue request per card.
 * Each is `null` where TMDB has nothing, and no surface degrades to a placeholder for any
 * of them.
 */
export interface UpNextEntry {
  readonly libraryEntryId: string;
  readonly titleId: string;
  /**
   * Borrowed, and replaced by a refresh like every other fact about a title. Called
   * `titleName` rather than `LibraryEntryRow`'s `name` because there are two names on
   * this card and neither of them gets to be the unqualified one.
   */
  readonly titleName: string;
  /**
   * Borrowed, and `null` where TMDB has not dated the title — the rail tile prints no line
   * at all in that case rather than a placeholder, the same choice `library-entry-cell.tsx`
   * makes for the identical fact.
   *
   * Here since #137, because the rail tile is a poster, a name and a year — the prototype's
   * own tile (`design/catalogue-wall.html`), which is binding on appearance.
   */
  readonly releaseYear: number | null;
  /** Borrowed. */
  readonly posterPath: string | null;
  readonly episodeId: string;
  /** Borrowed, and `null` where TMDB has not named the episode. */
  readonly episodeName: string | null;
  readonly seasonNo: number;
  readonly episodeNo: number;
  /**
   * Borrowed, and `null` where TMDB has not dated the episode. **Not the same fact as
   * *released***: the rail deliberately carries undated and future-dated episodes, since
   * *coming back* is the state whose whole content is an episode that has not aired
   * (`COMING_BACK`).
   */
  readonly airDate: string | null;
  /** Borrowed. The episode's own runtime, not the title's. */
  readonly runtimeMins: number | null;
  /** Borrowed (#246). The episode's own image, as a TMDB CDN path. */
  readonly stillPath: string | null;
  /** `library_entry_remaining`, unmodified — see this interface's own docblock. */
  readonly remaining: number;
  /**
   * The run of released episodes this card can mark without another read — issue #220,
   * widened from the Ongoing group to every next-episodes card by #250.
   *
   * **Empty is a fact and not a gap.** A card whose next episode has not aired gets an
   * empty run by construction, which is what makes it the *unreleased episode, no toggle*
   * state rather than a card missing a control. `listUpNextRails` is where that is
   * arranged, and `up-next-episode-card.tsx` is where it is read.
   */
  readonly queue: UpNextQueue;
}

/**
 * A title on Ongoing whose episodes have not mirrored — issue #272, and **the only entry
 * on this surface that carries no episode**.
 *
 * ── Why it is a second shape and not a widened `UpNextEntry` ─────────────────────────
 *
 * Every field `UpNextEntry` holds beyond these five is a fact about an episode, and this
 * title has none: no id, no name, no numbers, no air date, no still, no run to mark, and
 * no remainder — `library_entry_remaining` counts episode rows, and there are none. Making
 * those nullable would put thirteen `?? null`s into the read and hand every surface a row
 * whose emptiness it has to interpret. **Pending is not a card with holes in it; it is a
 * different card**, and a separate shape is what says so to the type checker.
 *
 * The five fields here are exactly the five a pending tile draws — the poster, the name,
 * the year, and the two ids the surface needs to key and open it. That is `DESIGN.md` §9's
 * *render what you already know* held at the read: what the tile knows is what the add
 * wrote from the series, and the episode line is the one region genuinely still waiting.
 *
 * ── `pending` is the discriminant, and it is only on this side ───────────────────────
 *
 * `isPendingEntry` narrows with `in` rather than on a literal field, so `UpNextEntry` gains
 * no `pending: false` it would have to carry through every construction of one. The two are
 * told apart by a field one of them has, which is what a discriminated union is for.
 */
export interface UpNextPendingEntry {
  readonly libraryEntryId: string;
  readonly titleId: string;
  /** Borrowed, and written by the add from the series alone — `UpNextEntry.titleName`. */
  readonly titleName: string;
  /** Borrowed, and `null` where TMDB has not dated the title. */
  readonly releaseYear: number | null;
  /** Borrowed. */
  readonly posterPath: string | null;
  /** Always `true`. The discriminant, and never written anywhere else. */
  readonly pending: true;
}

/**
 * What Ongoing holds — an ordinary entry, or a title still waiting for its episodes.
 *
 * Only Ongoing is widened. *Coming back* is a caught-up show with a dated episode ahead of
 * it and *Old friends* is the cold tail of *watching*; a title whose episodes have not
 * arrived is neither of those things, and the spec puts it on Ongoing precisely so that the
 * rails stay three.
 */
export type UpNextRailEntry = UpNextEntry | UpNextPendingEntry;

/**
 * Which of the two an Ongoing entry is — the one place that question is answered, so that
 * no surface mints a second test for it (`"pending" in entry`, or worse, `episodeId ===
 * null` against a field that does not exist).
 */
export function isPendingEntry(entry: UpNextRailEntry): entry is UpNextPendingEntry {
  return "pending" in entry;
}

/**
 * `isPendingEntry`'s complement, and it exists because a negated call is not a type guard:
 * `entries.filter((entry) => !isPendingEntry(entry))` narrows nothing, so a caller that
 * wants the episode-bearing half has to be handed a predicate that says so.
 */
export function isEpisodeEntry(entry: UpNextRailEntry): entry is UpNextEntry {
  return !isPendingEntry(entry);
}

/**
 * The five terms of `SPEC.md` §7's Up next order, built once and handed to both the
 * `ORDER BY` and the cursor's `WHERE`, so there is one definition of the order and not a
 * copy of it in each place that has to agree with it.
 *
 * ── The rule, transcribed ────────────────────────────────────────────────────────────
 *
 * > Your most recent watch of the title, descending. Undated titles fall back to the air
 * > date of their next unwatched episode, newest first. A next episode with no air date
 * > sinks below both, and closest-to-finishing survives as the final tiebreak.
 *
 * **It is a cascade, not one comparison.** A title with any dated watch is ordered by
 * that watch and never consults an air date — so a watch from eight years ago still
 * outranks the whole fallback group, and a next episode TMDB has not dated sinks a title
 * only if the title had no dated watch to be ranked by in the first place. `rank` is that
 * cascade, and it leads the order.
 *
 * `at` then holds whichever date the rank chose. Two different kinds of date share one
 * expression, which is safe precisely because `rank` is compared first: a watch timestamp
 * is never compared against an air date. Rank 2 has no date at all and takes `-infinity`,
 * a constant that decides nothing and exists so the expression is never null — a null
 * here would make the cursor's comparison unanswerable rather than false.
 *
 * The `::timestamptz` on the air date reads the server's zone, which `db/views.ts` is at
 * pains to keep out of what *released* means. Stated rather than hidden, and it is not
 * the same exposure: every air date in rank 1 is cast the same way, so the cast is
 * monotonic and cannot reorder two of them. It shifts the whole group by an offset, and
 * the group is only ever compared with itself.
 *
 * ── Why *closest to finishing* is one term here and two in the library sort ──────────
 *
 * `orderByFor` needs a leading `case` to push `NULL` (a film) and `0` (a finished show)
 * to the bottom of its own sort. Neither reaches this order, and #137's COMING BACK rail
 * did not change that. `NULL` is a film's missing row, and no film is ever *watching* or
 * *caught up* — `library_entry_state`'s film branch reads *finished* the moment there is a
 * watch. `0` is a show with every episode watched, which is either *finished* or, if
 * `in_production` is not `false`, a *caught up* show with nothing after its progress and so
 * no `library_entry_up_next` row for the inner join to find. So the tiebreak is a plain
 * ascending `remaining`, and the two are not one expression written twice — they are one
 * rule applied to two sets.
 *
 * ── The last two terms are not in `SPEC.md`, and are not optional ───────────────────
 *
 * `lower(name)` and the entry id are the total order underneath the rule. §7's own
 * *"every sort breaks ties by Title A–Z"* covers the first; the second is what makes
 * *two identical loads give an identical order* true of two entries that share a name.
 */
interface UpNextOrder {
  /**
   * The five terms above as the `ORDER BY` itself, with their directions — the same shape
   * `orderByFor` returns for the library's four sorts.
   */
  readonly orderBy: (SQL | PgColumn)[];
}

function upNextOrder(lastWatchedAt: SQL.Aliased<string | null>): UpNextOrder {
  const rank = sql`
      case
        when ${lastWatchedAt} is not null then 0
        when ${episode.airDate} is not null then 1
        else 2
      end`;
  const at = sql`
      coalesce(
        ${lastWatchedAt},
        ${episode.airDate}::timestamptz,
        '-infinity'::timestamptz
      )`;
  const remaining = libraryEntryRemaining.remaining;
  const name = sql`lower(${title.name})`;
  const entry = libraryEntry.id;

  return { orderBy: [rank, sql`${at} desc`, remaining, name, entry] };
}

/**
 * Up next's membership and order, built once and read three ways — the desktop page's
 * three rails (issue #137).
 *
 * ── Why this is a builder and not three queries ───────────────────────────────────────
 *
 * `upNextOrder` is five terms in a cascade, and a rail that restated the `ORDER BY` would
 * be a fourth place for that sequence to be written down and a fourth place for it to
 * drift. **A wrong order does not throw.** It puts the wrong show at the top of the
 * surface opened every night, and the only person who could notice is the one assuming
 * the app is right.
 *
 * So the joins, the ownership scoping, the select list and the order live here, and what a
 * caller supplies is one predicate and a row limit.
 *
 * ── The joins, and what each of them removes ──────────────────────────────────────────
 *
 * `library_entry_up_next` has known *which episode* since build step 2. Which titles, in
 * what order, has never existed anywhere but here: `upNextOrder` above is the only place
 * `SPEC.md` §7's rule is written down, and every surface reads it through this builder.
 *
 * The inner join on `library_entry_up_next` is a membership rule in its own right, and it
 * is the one nothing states: a title with no episode after your progress has no row there,
 * so there is nothing to render and nothing to offer. It removes a watchlist title (no
 * watches, so no progress) without being asked, and it removes the *watching* show whose
 * progress has passed every mirrored episode — you skipped one and watched the last. It is
 * also what keeps COMING BACK honest: a caught-up show that has genuinely run out of
 * listed episodes cannot appear on it, whatever `in_production` says.
 *
 * ── The title's most recent watch, joined rather than correlated ─────────────────────
 *
 * A rewatch is a second `watch` row (`CONTEXT.md`), so joining `watch` in directly would
 * multiply an entry by its watches. `last_watch` groups them first. It is scoped by
 * `ownedBy` too — the join is on the entry, so it could not read across accounts either
 * way, but an unscoped read of an owned table is the one habit this module exists to not
 * have.
 *
 * ── There is no `try` in here or in any caller ────────────────────────────────────────
 *
 * A failed read throws, and the Up next route's own `error.tsx` catches it (`AGENTS.md`).
 * An empty rail is reachable only from a query that succeeded, which is the whole of what
 * lets the surface tell *absent* from *broken* — and this is the surface where it matters
 * most, because *you are all caught up* is a plausible lie.
 */
interface UpNextRead {
  /**
   * `where` narrows the read and nothing widens it: `ownedBy` is applied here rather than
   * left to a caller, so no membership predicate can forget it. `limit` is `null` for a
   * read with no bound — a rail is bounded by its own rule, not by a fetch size.
   */
  readonly rows: (where: SQL, limit: number | null) => Promise<UpNextRow[]>;
}

/** One row of the shared read: everything any Up next rail renders, bar the queue — which
 *  is a second read, keyed by the entry ids this one chooses. */
interface UpNextRow {
  readonly libraryEntryId: string;
  readonly titleId: string;
  readonly titleName: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  readonly episodeId: string;
  readonly episodeName: string | null;
  readonly seasonNo: number;
  readonly episodeNo: number;
  readonly airDate: string | null;
  readonly runtimeMins: number | null;
  readonly stillPath: string | null;
  readonly remaining: number;
}

/**
 * **ONGOING and OLD FRIENDS' membership: `state = 'watching'`, and nothing else.**
 *
 * The deck's own predicate since #98, unchanged by the rails being three readers over it
 * — the two rails split this set by position in the order, not by a second predicate, so
 * there is no way for a title to satisfy both or neither.
 *
 * Abandoned outranks every derived state, so an abandoned title stays out whatever its
 * watches say; a watchlist title has no watches, so `library_entry_up_next` has no row for
 * it; *finished* is out on both counts. That is the same set Library's *Watching* chip
 * holds.
 *
 * There is deliberately **no air-date filter on the next episode** here.
 * `library_entry_state` has already ruled out the case where nothing has aired, and §7's
 * rule expects an unaired or undated next episode to be *ordered* — that is what ranks 1
 * and 2 are for. Filtering here would make half of the rule unreachable.
 *
 * `satisfies`, not a bare string: `state` is a `text` column, so a typo here would be an
 * empty rail rather than an error — silent, on the one predicate that decides what the
 * surface contains.
 */
const WATCHING: SQL = eq(libraryEntryState.state, "watching" satisfies LibraryState);

/**
 * **COMING BACK's membership: *caught up*, and the next episode's air date is in the
 * future.**
 *
 * The one rail that is not a slice of the deck. *Caught up* is `library_entry_state`'s
 * "every released episode has a watch, and the show has not ended" — nothing to watch now,
 * something to watch later (`CONTEXT.md`) — and this is the *later* made concrete:
 * `library_entry_up_next`'s episode, dated, and dated after today.
 *
 * **A null air date is not a future one.** `air_date > current_date` is null against a null
 * air date, which is false to a `WHERE`, so a caught-up show whose next episode TMDB has
 * not dated never appears here. That is the honest answer and not an omission: the rail
 * says *this is coming back on a day you could look up*, and there is no such day.
 *
 * **The rail empties itself.** Once the date passes, this predicate stops holding — and
 * `library_entry_state` moves the title to *watching* in the same moment, which is what
 * puts it on ONGOING instead. Neither transition is a write, a job or a stored flag; both
 * are the same read on a different day.
 *
 * `current_date` is the server's, the exception `db/views.ts` states and defends at length
 * for the identical comparison — an air date is a `date` with no instant in it to place in
 * a zone.
 */
const COMING_BACK: SQL = sql`(
    ${eq(libraryEntryState.state, "caught_up" satisfies LibraryState)}
    and ${episode.airDate} > current_date
  )`;

/**
 * **The rule every rail's membership now runs through: the title's episodes have
 * mirrored** — issue #272.
 *
 * It sits on the shared read rather than on one predicate because it is not a rail's rule,
 * it is a rule about which *read* answers a title. A pending title is answered by
 * `upNextPending`, once, at the head of Ongoing; without this it could also be answered
 * here — a show with a watch and a next episode among the handful of episodes that did land
 * before the mirror failed is *watching*, and would draw twice, as a pending tile and as an
 * ordinary one. **Once** is an acceptance criterion, and it is worth having by construction
 * rather than by deduplicating two lists afterwards.
 *
 * It excludes nothing that existed before the column did. `title.episodes_mirrored_at`
 * carries `DEFAULT now()` and the migration stamped every row with it, so the only way to
 * be null is for `mirrorTitle` to have been passed `"pending"` deliberately (#271).
 */
const MIRRORED: SQL = isNotNull(title.episodesMirroredAt);

/**
 * **Ongoing's second membership: a show whose episodes have not mirrored, and which you
 * have not abandoned** — issue #272.
 *
 * ── Why `kind = 'show'` is a predicate and not a comment ─────────────────────────────
 *
 * A film is stamped on the way in, because it has nothing to wait for (#271), so this
 * clause removes nothing today. It is here because *a film is never pending* is a rule of
 * the product rather than a consequence of how the add happens to be written: an import, a
 * backfill or a future writer that leaves the column null on a film must not put that film
 * on Ongoing with an episode line that will never resolve.
 *
 * ── Abandoned, through the view and not through the column ───────────────────────────
 *
 * `library_entry_state` is where *abandoned outranks every derived state* is written down,
 * and this asks it rather than reading `abandoned_at` a second time. A title you have put
 * down is off this surface whatever its mirror is doing.
 *
 * There is no air-date filter, no state filter beyond that one, and no watch test. Pending
 * is a fact about the catalogue row, not about the reader's progress through it: the common
 * case is a title nobody has watched anything of yet, but a half-arrived mirror can leave a
 * watched show unstamped too, and that show is still pending.
 */
const PENDING: SQL = sql`(
    ${isNull(title.episodesMirroredAt)}
    and ${eq(title.kind, "show" satisfies TitleKind)}
    and ${ne(libraryEntryState.state, "abandoned" satisfies LibraryState)}
  )`;

function upNextRead(userId: UserId, executor: Executor): UpNextRead {
  const lastWatch = executor
    .select({
      libraryEntryId: watch.libraryEntryId,
      watchedAt: sql<string | null>`max(${watch.watchedAt})`.as("watched_at"),
    })
    .from(watch)
    .where(ownedBy(userId, watch))
    .groupBy(watch.libraryEntryId)
    .as("last_watch");

  const order = upNextOrder(lastWatch.watchedAt);

  return {
    rows: async (where, limit) => {
      const query = executor
        .select({
          libraryEntryId: libraryEntry.id,
          titleId: title.id,
          titleName: title.name,
          releaseYear: title.releaseYear,
          posterPath: title.posterPath,
          episodeId: libraryEntryUpNext.episodeId,
          episodeName: episode.name,
          seasonNo: libraryEntryUpNext.seasonNo,
          episodeNo: libraryEntryUpNext.episodeNo,
          airDate: episode.airDate,
          runtimeMins: episode.runtimeMins,
          stillPath: episode.stillPath,
          /* Already joined, and joined for the sort rather than for this — `upNextOrder`'s
             *closest to finishing* tiebreak reads the same column. Selecting it costs
             nothing beyond the column, and reading it from anywhere else would be a second
             answer to how much of a show is left. */
          remaining: libraryEntryRemaining.remaining,
        })
        .from(libraryEntry)
        .innerJoin(title, eq(title.id, libraryEntry.titleId))
        .innerJoin(
          libraryEntryState,
          eq(libraryEntryState.libraryEntryId, libraryEntry.id),
        )
        .innerJoin(
          libraryEntryUpNext,
          eq(libraryEntryUpNext.libraryEntryId, libraryEntry.id),
        )
        .innerJoin(episode, eq(episode.id, libraryEntryUpNext.episodeId))
        .innerJoin(
          libraryEntryRemaining,
          eq(libraryEntryRemaining.libraryEntryId, libraryEntry.id),
        )
        .leftJoin(lastWatch, eq(lastWatch.libraryEntryId, libraryEntry.id))
        .where(and(ownedBy(userId, libraryEntry), MIRRORED, where))
        .orderBy(...order.orderBy);

      return limit === null ? await query : await query.limit(limit);
    },
  };
}

/**
 * The shared read's row, plus its run of markable episodes, as the entry every surface is
 * handed.
 *
 * The queue is a parameter rather than a lookup here because the two reads that produce it
 * differ by rail: `WATCHING`'s entries get `upNextQueues`' answer, and `COMING_BACK`'s get
 * `NOTHING_RELEASED` without a query being run for them (`listUpNextRails`).
 */
function upNextEntry(row: UpNextRow, queue: UpNextQueue): UpNextEntry {
  return {
    libraryEntryId: row.libraryEntryId,
    titleId: row.titleId,
    titleName: row.titleName,
    releaseYear: row.releaseYear,
    posterPath: row.posterPath,
    episodeId: row.episodeId,
    episodeName: row.episodeName,
    seasonNo: row.seasonNo,
    episodeNo: row.episodeNo,
    airDate: row.airDate,
    runtimeMins: row.runtimeMins,
    stillPath: row.stillPath,
    remaining: row.remaining,
    queue,
  };
}

/**
 * **Twelve**, and it is a chosen number rather than a measured one.
 *
 * The measured signal in the committed library was an empty 61–90 day gap in *days since
 * last watch*, which suggests a 60-day threshold. A **count** was chosen over a day count
 * because it is self-correcting: ONGOING is never empty after a quiet month, and never 199
 * long after a binge year. A 60-day rule is both, in turn, on the same library.
 *
 * Twelve, specifically, because the rail is one horizontal run of posters and twelve is
 * about two screens of it — long enough that a week of ordinary watching does not fall out
 * of it, short enough that the head of it still reads as *what I am actually in the middle
 * of*. The measured shape it is drawn against: of 283 non-abandoned titles with a dated
 * watch, 199 — 70% — are more than two years cold, and the deck before #137 treated every
 * one of them identically to something watched last night.
 *
 * **It is a build-time constant.** Not a stored setting, not a user preference, and not a
 * thing any surface can change: nothing takes it as an argument and nothing writes it. It
 * is exported for the tests, which have to prove the cap holds at exactly this number.
 */
export const ONGOING_RAIL_SIZE = 12;

/**
 * The three rails of the desktop Up next page — issue #137, and **a grouping over the
 * existing state and the existing order, evaluated on read**.
 *
 * | Rail | Rule |
 * |---|---|
 * | **ONGOING** | *watching* ∩ the `ONGOING_RAIL_SIZE` most recently watched |
 * | **COMING BACK** | *caught up* ∧ the next episode's air date is in the future |
 * | **OLD FRIENDS** | *watching*, everything not in ONGOING |
 *
 * **No column is added and no view is added.** Nothing here is stored, nothing is
 * refreshed and nothing can go stale, for ADR-0001's reason: a stored copy of derived
 * state is a second answer that can disagree with the watches. A rail is a `slice` and a
 * `WHERE`, and both are computed the moment the page is read.
 *
 * ── Why ONGOING and OLD FRIENDS are one read and not two ─────────────────────────────
 *
 * *Every watching title is in exactly one of the two, and none is in both* is an acceptance
 * criterion, and it is worth having by construction rather than by two queries agreeing.
 * `LIMIT 12` and `OFFSET 12` over the same order would be two reads of a set that a watch
 * landing between them can reorder. One read, sliced in memory, cannot have that gap at all.
 *
 * It also settles what *the 12 most recently watched* means, which the rule alone leaves
 * open: **the head of §7's order over the watching set**, not the head of the whole
 * library's recency. A finished show watched last night is not in the twelve and does not
 * consume one of them — it is not on this surface at all, and the alternative reading would
 * let a fortnight of films empty ONGOING while twenty shows sat part-watched. That is
 * exactly the "never empty after a quiet month" property the count was chosen for.
 *
 * The head of that order is the twelve most recent *watches* where there are twelve dated
 * watches, and thereafter whatever the cascade ranks next — the air-date fallback group,
 * then the undatable one. A library with no dated watch at all still gets a full ONGOING
 * rather than an empty one, which is the same choice, held consistently.
 *
 * ── OLD FRIENDS has no cap, and that is the rule ─────────────────────────────────────
 *
 * *Everything not in ONGOING* — 187 titles on the committed library. It is not truncated
 * here and there is no "and 175 more": §9 forbids the count, and a rail that silently
 * stopped at N would be the *showing 10 of 62* line with the number filed off. The surface
 * bounds it with a horizontal scroll, and `app/poster.tsx`'s `loading="lazy"` is what keeps
 * the artwork off the wire until a poster is scrolled towards.
 *
 * ── Two reads, in this order ──────────────────────────────────────────────────────────
 *
 * Sequential rather than concurrent: an `Executor` can be a transaction, and a transaction
 * runs one statement at a time. They are two reads rather than one because they are two
 * memberships — the alternative is a single read of *watching or coming back* partitioned
 * in memory, which would need the state on every row and would put a third rule (*which
 * rail is this?*) somewhere other than in the predicate that defines it.
 */
/**
 * One episode a tile can mark, and the four facts it takes to mark it — issue #220.
 *
 * `episodeName` is `null` where TMDB has not named the episode, exactly as everywhere
 * else. The surface never degrades to the number in its place: the tile's control reads
 * its label from `season-grouping.ts`'s `episodeFullName`, which is the one answer in this
 * build to what an unnamed episode is called.
 */
export interface QueuedEpisode {
  readonly episodeId: string;
  readonly episodeName: string | null;
  readonly seasonNo: number;
  readonly episodeNo: number;
}

/**
 * What an Ongoing tile can mark without another read — issue #220.
 *
 * ── Why a run and not one episode ────────────────────────────────────────────────────
 *
 * The tile advances **optimistically**: a press marks the episode and the tile is showing
 * the one after it before the server has answered, which means the one after it has to be
 * in the browser already. `UpNextEntry.episodeId` is the head of this run and says nothing
 * about what follows, so a tile built on it alone could advance exactly nowhere.
 *
 * Nothing here is a second definition of *up next*. The run **starts** at
 * `library_entry_up_next`'s own episode and walks the same `(season_no, episode_no)`
 * ordering that view walks, so the head of `episodes` and `UpNextEntry.episodeId` are one
 * fact read twice and cannot come to disagree.
 *
 * ── The run stops at the first unreleased episode, and that is the whole rule ────────
 *
 * *Released* is `db/views.ts`'s, unchanged — `air_date is not null and air_date <=
 * current_date` — and the run is **truncated at the first episode that fails it** rather
 * than filtered by it. Filtering would let a later released episode close a gap left by an
 * earlier undated one, which would advance a tile past an episode nobody watched and put
 * the app's idea of a reader's progress ahead of their own.
 *
 * That truncation is also what answers *marking the last released episode takes the tile
 * out of the group*: the run empties, and an empty run is a tile with nothing to mark.
 *
 * ── `more`, and why the cap needs it ─────────────────────────────────────────────────
 *
 * `UP_NEXT_QUEUE_DEPTH` bounds what is read per tile, so an exhausted run is ambiguous on
 * its own — the show may have run out of released episodes, or the cap may simply have
 * been reached. `more` separates the two, and the read pays for it by fetching one row
 * past the cap rather than by counting the rest of the show.
 *
 * | `episodes` | `more` | What the card does |
 * |---|---|---|
 * | non-empty | either | offers the mark on `episodes[0]` |
 * | empty | `false` | see below — the answer depends on when it went empty |
 * | empty | `true` | stays, with no control, until the next load refills the run |
 *
 * The last row is the cap showing through, and it is reachable only by marking
 * `UP_NEXT_QUEUE_DEPTH` episodes of one show from one card without this page being loaded
 * again in between. It renders as a card that is momentarily not markable rather than as a
 * card that claims a show is finished, which is the direction this has to fail in.
 *
 * ── The middle row got a second reading in #250, and the two must not be conflated ───
 *
 * *Empty, and nothing more released* means one thing when the run **ran out under the
 * reader's thumb** — they marked the last released episode, and the card has done its job
 * and leaves the rail — and quite another when it **arrived empty from the server**, which
 * is every *coming back* entry: a caught-up show whose next episode airs on a date TMDB
 * has published. That card must stay, show the dated episode it is announcing, and offer
 * no control.
 *
 * The two are told apart by *when*, not by the pair, and the distinguishing fact is the
 * server render: an empty run in the props is the second reading, an empty run reached by
 * marking is the first. `up-next-episode-card.tsx` is where that split is made, and it is
 * made there rather than by a fourth field here because it is a fact about the render and
 * not about the show.
 */
export interface UpNextQueue {
  readonly episodes: readonly QueuedEpisode[];
  /** There is at least one further released episode beyond `episodes`. */
  readonly more: boolean;
}

/**
 * How far ahead one card is read — issue #220.
 *
 * **Four, and it caps a burst rather than estimating an evening.** The run only has to
 * outlast the presses made between two loads of this page, and the scene the mark exists
 * for is *one* tap — #215's own words are that it makes the most common action in the app
 * one tap. Four covers a double bill and the fumble either side of it, and
 * `UpNextQueue.more` is what keeps a fifth press honest rather than wrong.
 *
 * The cost is what bounds it. Since #250 the run is read for every *watching* entry
 * rather than for `ONGOING_RAIL_SIZE` of them, so this returns at most *watching* × 5 rows
 * — the depth, plus the one row that answers `more`. Reading the whole show instead would
 * be the same query returning several hundred episodes per entry that nobody is going to
 * press tonight, which is the thing the depth exists to refuse. `listUpNextRails` states
 * the widened cost in full.
 *
 * Exported for the tests, which have to prove the cap and its `more` flag hold at exactly
 * this number.
 */
export const UP_NEXT_QUEUE_DEPTH = 4;

/**
 * Every Ongoing tile's run of markable episodes, in one read — issue #220.
 *
 * ── One query for all twelve, and why it is not a lateral per entry ─────────────────
 *
 * `row_number()` partitioned by the entry gives each tile its own numbering over one scan,
 * so twelve tiles cost one round trip rather than twelve. The window is ordered by
 * `(season_no, episode_no)` — the same ordering `library_entry_up_next` uses to decide
 * what is next — and the `>=` below is a **row comparison**, lexicographic, so it means
 * *this episode or any after it* across a season boundary without a second clause.
 *
 * ── The air date travels, and the truncation happens here ───────────────────────────
 *
 * The query returns whether each row is released rather than filtering on it, because the
 * rule is *stop at the first unreleased episode* and a `WHERE` cannot express *stop*. The
 * walk below is that rule, and `UpNextQueue`'s docblock is where it is argued.
 *
 * ── An empty `entryIds` returns without querying ────────────────────────────────────
 *
 * The same guard `libraryCatalogueKeys` states at length: `inArray` over nothing is not a
 * predicate that matches nothing in every driver, and a read of *every* entry's episodes
 * is not the failure to find out with.
 */
async function upNextQueues(
  userId: UserId,
  entryIds: readonly string[],
  executor: Executor,
): Promise<Map<string, UpNextQueue>> {
  const queues = new Map<string, UpNextQueue>();
  if (entryIds.length === 0) return queues;

  const ranked = executor
    .select({
      libraryEntryId: libraryEntryUpNext.libraryEntryId,
      episodeId: episode.id,
      episodeName: episode.name,
      seasonNo: episode.seasonNo,
      episodeNo: episode.episodeNo,
      released:
        sql<boolean>`${episode.airDate} is not null and ${episode.airDate} <= current_date`.as(
          "released",
        ),
      rank: sql<number>`row_number() over (
          partition by ${libraryEntryUpNext.libraryEntryId}
          order by ${episode.seasonNo}, ${episode.episodeNo}
        )`
        .mapWith(Number)
        .as("rank"),
    })
    .from(libraryEntryUpNext)
    .innerJoin(
      episode,
      and(
        eq(episode.titleId, libraryEntryUpNext.titleId),
        gt(episode.seasonNo, 0),
        sql`(${episode.seasonNo}, ${episode.episodeNo}) >= (${libraryEntryUpNext.seasonNo}, ${libraryEntryUpNext.episodeNo})`,
      ),
    )
    .where(
      and(
        eq(libraryEntryUpNext.userId, userId),
        inArray(libraryEntryUpNext.libraryEntryId, [...entryIds]),
      ),
    )
    .as("ranked");

  const rows = await executor
    .select()
    .from(ranked)
    // One past the depth, which is the row that answers `more`.
    .where(lte(ranked.rank, UP_NEXT_QUEUE_DEPTH + 1))
    .orderBy(ranked.libraryEntryId, ranked.rank);

  const runs = new Map<string, typeof rows>();
  for (const row of rows) {
    const run = runs.get(row.libraryEntryId);
    if (run) run.push(row);
    else runs.set(row.libraryEntryId, [row]);
  }

  for (const entryId of entryIds) {
    const run = runs.get(entryId) ?? [];
    const released: QueuedEpisode[] = [];
    for (const row of run) {
      // The truncation, not a filter: the first unreleased episode ends the run whatever
      // is dated behind it.
      if (!row.released) break;
      released.push({
        episodeId: row.episodeId,
        episodeName: row.episodeName,
        seasonNo: row.seasonNo,
        episodeNo: row.episodeNo,
      });
    }
    queues.set(entryId, {
      episodes: released.slice(0, UP_NEXT_QUEUE_DEPTH),
      more: released.length > UP_NEXT_QUEUE_DEPTH,
    });
  }

  return queues;
}

/**
 * The three orderings, still three arrays — issue #137, and #250 did **not** collapse
 * them into one.
 *
 * The phone concatenates them into a single next-episodes rail and the desktop draws them
 * as three, which is exactly why the read keeps them apart: the concatenation is a
 * rendering decision (`up-next-episode-rail.tsx` holds the one line that makes it), and a
 * read that had already flattened them would put the *ongoing, then coming back, then old
 * friends* rule somewhere no surface could see it and the desktop could not undo.
 *
 * All three were the same shape from #250 until #272, which widened **Ongoing alone** to
 * hold a title whose episodes have not mirrored as well. Ongoing used to be the only one
 * carrying a queue, because it was the only group with a mark; it is now the only one
 * carrying two shapes, for the reason `UpNextRailEntry` gives.
 */
export interface UpNextRails {
  /**
   * Pending titles first, then the twelve — issue #272. This is the one rail of the three
   * that can hold either shape, and `isPendingEntry` is how a surface tells them apart.
   */
  readonly ongoing: readonly UpNextRailEntry[];
  readonly comingBack: readonly UpNextEntry[];
  readonly oldFriends: readonly UpNextEntry[];
}

/**
 * The titles still waiting for their episodes, newest first — issue #272.
 *
 * ── Why this is a query of its own and not a widened join ────────────────────────────
 *
 * `upNextRead` reaches these titles through nothing: `library_entry_up_next` is an inner
 * join and a title with no episodes has no row in it, `library_entry_remaining` is an inner
 * join and a title with no episodes has a zero it would rank on, and `episode` is an inner
 * join on an episode that does not exist. Loosening all three to outer joins would make
 * every column on every other row nullable in order to carry one that has none of them —
 * the shared read's whole select list weakened for a set it does not describe.
 *
 * ── The order, and why it is not `SPEC.md` §7's ──────────────────────────────────────
 *
 * §7's cascade ranks by *your most recent watch*, falling back to *the next episode's air
 * date*. A pending title has neither, so every one of them lands in the cascade's rank 2 —
 * the group with no date at all — and the rule would separate them by name. That is the
 * wrong answer for the case: the reader just added one of these, and the one they added is
 * the one they are looking for. So it is **most recently added first**, with §7's own
 * `lower(name)` and the entry id underneath it as the total order two adds in the same
 * millisecond still need.
 */
async function upNextPending(
  userId: UserId,
  executor: Executor,
): Promise<UpNextPendingEntry[]> {
  const rows = await executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleId: title.id,
      titleName: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .where(and(ownedBy(userId, libraryEntry), PENDING))
    .orderBy(desc(libraryEntry.addedAt), sql`lower(${title.name})`, libraryEntry.id);

  return rows.map((row) => ({
    libraryEntryId: row.libraryEntryId,
    titleId: row.titleId,
    titleName: row.titleName,
    releaseYear: row.releaseYear,
    posterPath: row.posterPath,
    pending: true,
  }));
}

export async function listUpNextRails(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<UpNextRails> {
  const read = upNextRead(userId, executor);

  /**
   * Three independent reads, overlapped rather than stacked: none takes another's rows.
   * `Promise.all` rejects on the first rejection, so a failure still reaches the caller's
   * boundary exactly as it did in series.
   *
   * On the pool this checks out three connections instead of reusing one, which on a cold
   * process is three WebSocket handshakes rather than one. It is still the shorter wall
   * clock — the handshakes overlap too — and it is a trade of connection count for
   * latency, made knowingly. Passed a transaction, node-postgres queues them all on that
   * one connection, so this is correct there and merely no faster.
   *
   * **The third is #272's**, and it is here rather than sequential because it takes nothing
   * from the other two: the pending read's membership is a column on `title`, not a set of
   * entry ids the other reads produce. It is also the cheapest of the three by a wide
   * margin — an index on `episodes_mirrored_at`, read by `IS NULL`, over a set that is
   * empty on almost every load.
   */
  const [watching, comingBack, pending] = await Promise.all([
    read.rows(WATCHING, null),
    read.rows(COMING_BACK, null),
    upNextPending(userId, executor),
  ]);

  /**
   * The third read, and the only one of the three that is sequential — issue #220,
   * widened by #250. It takes the entry ids the reads above produced, so it cannot be
   * overlapped with them.
   *
   * ── It is asked of every *watching* entry now, not of the first twelve ─────────────
   *
   * #220 needed a run for the Ongoing group alone, because Ongoing was the one group with
   * a mark. #250's next-episodes rail is ongoing, coming back and old friends
   * concatenated, and **every card on it carries the check** — so every card needs the run
   * that lets it advance optimistically, and a queue read bounded to the first twelve
   * would leave every cold show's check unable to move.
   *
   * **The cost, stated.** `ONGOING_RAIL_SIZE × (UP_NEXT_QUEUE_DEPTH + 1)` becomes
   * *watching* × the same, which on the committed library is 199 entries rather than 12 —
   * one query returning at most ~1000 narrow rows instead of ~60. It is one round trip
   * either way, the window function scans the same join, and it replaces the two reads
   * (`listWatchlist`, `listAbandoned`) this ticket deletes. It runs on a desktop load too,
   * for the reason `page.tsx` states at length: **the server does not know the viewport.**
   *
   * ── `COMING_BACK` is not asked, and that is provable rather than assumed ───────────
   *
   * That predicate is *caught up ∧ the next episode's air date is in the future*, and
   * `upNextQueues` truncates a run at the first episode that is not released — `air_date
   * <= current_date`. A future air date fails that on the first row, every time, so the
   * answer for every coming-back entry is the empty run, and asking for it would be paying
   * for a query whose result the predicate already determines. `NOTHING_RELEASED` below is
   * that answer written down once.
   */
  const queues = await upNextQueues(
    userId,
    watching.map((row) => row.libraryEntryId),
    executor,
  );

  /**
   * `UpNextQueue` is a shape every entry has, so a missing key is not one of the answers:
   * a card branching on `undefined` would be a fourth case beside the three `UpNextQueue`
   * already enumerates.
   *
   * `upNextQueues` writes a key for every id it is handed, so this fallback is unreachable
   * — and it is written **`more: true`** rather than `more: false` for the direction it
   * would fail in if that ever stopped being true. An empty run with `more: false` is
   * *this show has nothing released left*, which takes the card off the rail; with
   * `more: true` it is *this read has nothing to offer yet*, which keeps the card and
   * offers no control. A bug should never be able to tell a reader a show finished.
   */
  const watchingEntry = (row: UpNextRow): UpNextEntry =>
    upNextEntry(row, queues.get(row.libraryEntryId) ?? { episodes: [], more: true });

  /**
   * **Pending titles are ahead of the twelve, not among them** — issue #272.
   *
   * `ONGOING_RAIL_SIZE` bounds *watching*, which is the set it was measured against and
   * the set it is self-correcting over: twelve is about two screens of what you are in the
   * middle of. Pending is neither of those things. It is a handful of titles for a few
   * seconds, and spending one of the twelve on each of them would push a show the reader
   * is actually watching onto Old friends for the length of a mirror — a rail that
   * reshuffles itself while nothing is watched.
   *
   * So the cap is unchanged and the head is prepended, which is also what makes *at the
   * head* true without a sort key that could rank a pending title below a watch.
   */
  return {
    ongoing: [...pending, ...watching.slice(0, ONGOING_RAIL_SIZE).map(watchingEntry)],
    comingBack: comingBack.map((row) => upNextEntry(row, NOTHING_RELEASED)),
    oldFriends: watching.slice(ONGOING_RAIL_SIZE).map(watchingEntry),
  };
}

/**
 * The run of a title with nothing released left to mark — every *coming back* entry's
 * queue, by construction rather than by query (`listUpNextRails`).
 *
 * **`more: false` is the load-bearing half.** It is the pair that says *this show has
 * nothing released left*, which is exactly true of a caught-up show whose next episode
 * airs in the future: there is nothing to mark today. `more: true` would claim a run the
 * read merely failed to fetch, and would leave the card waiting for a refill that no
 * reload could ever produce.
 *
 * Frozen at module scope so every coming-back entry shares one object rather than minting
 * one per row, the same reason `up-next-mark.ts` freezes its `UNWATCHED` view.
 */
const NOTHING_RELEASED: UpNextQueue = Object.freeze({
  episodes: Object.freeze([]),
  more: false,
});

/**
 * One card of the landing screen's films rail (#250) — a poster, a name, a year and a
 * runtime.
 *
 * ── Why this joins no `library_entry_up_next`, and never could ───────────────────────
 *
 * A film has no episode after it to point at, so it has no row in that view — and, for a
 * watchlist title, no watches to have produced one anyway (`UpNextRow`'s own note).
 * Joining it here would silently empty this rail rather than narrow it, which is the
 * failure mode this comment exists to keep out.
 *
 * `library_entry_remaining` is not joined either, and for the same kind of reason: that
 * view is `where t.kind = 'show'`, so it has no row for any film. **A film carries no
 * remainder**, which is `CONTEXT.md`'s *Remaining is a show concept* holding here rather
 * than being restated — and it is why a film card prints a year and a runtime where an
 * episode card prints a count.
 *
 * Extends `LibraryStateGroupEntry` (#138's shape) with the runtime the handoff's film card
 * draws. The provider line that card also draws is **not** here: a watch provider is a
 * borrowed live fact fetched per title (`live-title-facts.tsx`), and a rail of them would
 * be one catalogue request per card — the exact cost #246 moved the episode still into the
 * mirror to avoid.
 */
export interface LibraryStateGroupEntry {
  readonly libraryEntryId: string;
  readonly titleId: string;
  readonly titleName: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  /** Borrowed. `null` where TMDB has not published one. */
  readonly runtimeMins: number | null;
}

/**
 * **The films rail's membership: standing at Watchlist, and a film** — issue #250.
 *
 * Both halves are predicates and neither is a slice: `library_entry_state` decides the
 * first and `title.kind` the second, so a show on the watchlist and a film being watched
 * are each out by a rule rather than by a `LIMIT` that happened not to reach them.
 *
 * `satisfies`, not bare strings: `state` and `kind` are both `text` columns, so a typo in
 * either would be an empty rail rather than an error — silent, on the two predicates that
 * decide what this rail contains.
 *
 * Ordered Title A–Z with the entry id underneath it. This rail has no §7 order to inherit
 * — there is no watch to be recent and no next episode to be dated — and a stable order is
 * what makes *two identical loads give an identical order* true of two films that share a
 * name. The expression is repeated rather than imported for the reason #138 gave:
 * `db/library-sort.ts`'s vocabulary does not reach this reader.
 *
 * **This replaces `listWatchlist` and `listAbandoned`.** #250 deletes the phone's five
 * vertical groups, which were their only callers; both states stay reachable through the
 * library's status filters, which already carry all five and read through
 * `listLibraryEntries`.
 */
export async function listWatchlistFilms(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<readonly LibraryStateGroupEntry[]> {
  return executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleId: title.id,
      titleName: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
      runtimeMins: title.runtimeMins,
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .where(
      and(
        ownedBy(userId, libraryEntry),
        eq(libraryEntryState.state, "watchlist" satisfies LibraryState),
        eq(title.kind, "film" satisfies TitleKind),
      ),
    )
    .orderBy(sql`lower(${title.name})`, libraryEntry.id);
}

/**
 * One row of Upcoming — issue #251.
 *
 * Everything the handoff's compact row prints and nothing else: the still, the series, the
 * season and episode, the episode's name, and the date. `libraryEntryId` is not printed —
 * it is what the row navigates through, since an episode's own route lives beneath its
 * owning library entry (#254).
 *
 * ── `airDate` is not nullable here, and that is the read's doing ─────────────────────
 *
 * Every other episode type in this file carries `airDate: string | null`, because an
 * undated episode is an ordinary thing for the catalogue to hold. It cannot reach this
 * surface: *upcoming* **is** a statement about a date, so the read's `is not null` is the
 * whole reason this field is not nullable, and the grouping module downstream needs no
 * branch for a row it can never be handed.
 *
 * The column is nullable, so the select **does** cast — `sql<string>` over
 * `episode.air_date`, which launders a null the `where` has already excluded. That is a
 * cast standing on a predicate a few lines away rather than on nothing, and it is named
 * here rather than left to be discovered: move or weaken that `is not null` and this type
 * starts lying, with no compiler error to say so. `tests/upcoming-episodes.test.ts` is what
 * holds the predicate.
 *
 * **There is no air time and there is no field for one.** TMDB publishes a `date` for an
 * episode and no time of day, so a *time unknown* state would be the only state that field
 * ever reached — #245 says so where it refuses to draw one, `episode-facts.ts` says it one
 * surface over, and the absence is recorded here so that nobody adds the column to fill
 * the gap the handoff's mock leaves.
 */
export interface UpcomingEpisode {
  readonly episodeId: string;
  /** Where the row navigates — the episode's route is beneath its library entry. */
  readonly libraryEntryId: string;
  /** The series, as the row's first line. */
  readonly titleName: string;
  readonly seasonNo: number;
  readonly episodeNo: number;
  /** `null` where TMDB has announced the episode without naming it. Never falls back to
   *  a bare number — `CONTEXT.md`: *an episode is never referred to by number alone*. */
  readonly episodeName: string | null;
  /**
   * The **show's** poster, and the reason this row carries one at all.
   *
   * `stillPath` below is the episode's own frame, and for an episode that has not aired
   * TMDB nearly always has none — a still is a screenshot of something nobody has seen. So
   * the upcoming list, which is *only ever* unaired episodes, drew an empty box on every
   * row while Up next (aired episodes) drew a frame on each of its own.
   *
   * The poster is the fact that identifies an upcoming episode anyway: what you are
   * waiting for is the show. `title` is already joined here for `titleName`, so this is
   * one column rather than a read.
   */
  readonly posterPath: string | null;
  /**
   * The episode's own frame, kept on the type though the upcoming row no longer draws it:
   * it is a real fact about the episode and the day TMDB publishes stills ahead of air, a
   * surface that wants one has it. See `posterPath` above for why this row does not.
   */
  readonly stillPath: string | null;
  /** `YYYY-MM-DD`, never null — see above. */
  readonly airDate: string;
}

/**
 * **What is coming: the future-dated episodes of the shows you are actually watching** —
 * issue #251.
 *
 * ── The membership is two predicates and neither is a slice ──────────────────────────
 *
 * **Watching or caught up**, from `library_entry_state`. This is deliberately narrower
 * than `CONTEXT.md`'s Upcoming entry was — *the next air dates for shows in your library
 * you have not abandoned* — and the glossary is amended in the same change rather than
 * left describing something else. What drops out is watchlist and finished: a show you
 * have not started is not something you are waiting for the next episode of, and a show
 * you have finished has no next episode by definition unless it comes back, at which point
 * its state moves on its own.
 *
 * `satisfies LibraryState` on both states rather than bare strings: `state` is a `text`
 * column, so a typo would be an empty page rather than an error — silent, on the predicate
 * that decides what this whole surface contains.
 *
 * `season_no > 0` is `db/views.ts`'s own domain for *released*, kept so that *upcoming* is
 * the exact complement of it over the same set of episodes rather than a second, wider
 * idea of what an episode is.
 *
 * ── The window is a day wider than the server's day, on purpose ──────────────────────
 *
 * `air_date >= current_date - 1`, where every other clock-reading query in this file
 * compares to `current_date` alone. **The extra day is a timezone, not a fudge.** No zone
 * on earth is more than 24 hours from UTC, so a window opening one day early is a superset
 * of *today or later* for every reader at every instant — including the reader in Honolulu
 * for whom the server's yesterday is still this evening, who is exactly the reader a bare
 * `>= current_date` shows an empty *Today* to.
 *
 * The narrowing to the reader's actual day happens once, in the reader's own zone, in
 * `upcoming-grouping.ts` — which is where the labels are written too, so the row that is
 * dropped and the heading it would have sat under are decided by one function against one
 * day. The alternative was a day boundary computed here in SQL and a second one computed
 * there for the labels: two clocks, and eventually one of them wrong by one day for one
 * reader, forever, with every row on screen looking entirely correct.
 *
 * That also keeps this read cacheable the way every other one is. `cache/tags.ts` keys the
 * clock-reading reads on `serverDay()`, which is UTC because `current_date` is; a query
 * bucketed in the reader's zone would turn over at a midnight the key does not, which is
 * worse than no key part at all (`serverDay`'s own docblock argues that).
 *
 * ── Ordered, and not capped ──────────────────────────────────────────────────────────
 *
 * By date first, because the page is a calendar and the groups come out of the read's own
 * order; then by title and by `(season_no, episode_no)`, so two episodes airing on one day
 * have a stable order and two loads give the same page. `lower(name)` for the tie-break is
 * `listWatchlistFilms`' expression, repeated rather than imported for the reason #138 gave.
 *
 * **No `LIMIT`.** The bound is the catalogue's: TMDB mirrors the episodes it has announced,
 * which for a show in production is a handful ahead of today and for everything else is
 * none. A cap here would be *showing 20 of 34* with the number filed off, on a surface
 * whose whole content is *what is still to come* — and `up-next-phone-rail.tsx` refuses the
 * same thing one screen over for the same reason.
 *
 * Unguarded, like every read in this file. A failure throws to the route's `error.tsx`,
 * which draws the read-failure treatment with a reference id — *nothing is coming* is
 * exactly as plausible a lie as *you're caught up* was, and this is the screen `AGENTS.md`
 * was written about.
 */
export async function listUpcomingEpisodes(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<readonly UpcomingEpisode[]> {
  return executor
    .select({
      episodeId: episode.id,
      libraryEntryId: libraryEntry.id,
      titleName: title.name,
      seasonNo: episode.seasonNo,
      episodeNo: episode.episodeNo,
      episodeName: episode.name,
      posterPath: title.posterPath,
      stillPath: episode.stillPath,
      // `date` comes back as the `YYYY-MM-DD` text Postgres wrote, and is left as text:
      // nothing does arithmetic on an air date, and a `Date` here would silently acquire
      // a timezone the column does not have (ADR-0003).
      airDate: sql<string>`${episode.airDate}`.as("air_date"),
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .innerJoin(episode, eq(episode.titleId, title.id))
    .where(
      and(
        ownedBy(userId, libraryEntry),
        inArray(libraryEntryState.state, [
          "watching" satisfies LibraryState,
          "caught_up" satisfies LibraryState,
        ]),
        gt(episode.seasonNo, 0),
        isNotNull(episode.airDate),
        sql`${episode.airDate} >= current_date - 1`,
      ),
    )
    .orderBy(episode.airDate, sql`lower(${title.name})`, episode.seasonNo, episode.episodeNo);
}

/**
 * One card of Upcoming's second half — **a film you are waiting for** (issue #252).
 *
 * A poster, a name, the day it is released, and the days between here and there. Nothing
 * else: no runtime, because a film's runtime is a fact about watching it and this card is
 * about not being able to yet, and neither of the two facts the handoff draws beside the
 * date — see below.
 *
 * ── `releaseDate` is not nullable here, for `UpcomingEpisode`'s exact reason ──────────
 *
 * `title.release_date` is a nullable column and an undated film is an ordinary thing for
 * the catalogue to hold — a film announced but not yet scheduled is the common case for
 * everything on a watchlist worth waiting for. It cannot reach this card: *waiting for* is
 * a statement about a date, so the read's `is not null` is the whole reason this field is
 * a `string`, and the countdown downstream needs no branch for a row it can never be
 * handed. The cast below launders the null that predicate has already excluded; weaken the
 * predicate and this type starts lying with no compiler error to say so, which is what
 * `tests/upcoming-films.test.ts` is holding.
 *
 * ── The release type and the region are **deliberately absent** ──────────────────────
 *
 * The handoff draws `Sep 26 · Canada` and a `Theatrical` chip. Neither is built and the
 * columns for them are not here. **This is a cost call rather than a policy one**, and
 * #252 states it: both live in TMDB's release-dates endpoint, which is a separate
 * catalogue request *per film*, so a list surface of them would be one request per card —
 * the exact cost #246 moved the episode still into the mirror to avoid. They are also
 * region-specific and they change, so mirroring them at add time would give a reader a
 * chip that had been true once.
 *
 * Under #245's precedence rule the handoff would otherwise carry them, so this is a
 * subtraction to revisit once Upcoming has been lived with — recorded here rather than
 * left to be rediscovered as an omission.
 */
export interface UpcomingFilm {
  /** Where the card navigates — the film's own page beneath its library entry. */
  readonly libraryEntryId: string;
  readonly titleName: string;
  /** `null` where the catalogue has no artwork. `app/poster.tsx` holds the measure. */
  readonly posterPath: string | null;
  /** `YYYY-MM-DD`, never null — see above. */
  readonly releaseDate: string;
}

/**
 * **What you are waiting for: the watchlist films whose release date is still ahead** —
 * issue #252, and `listUpcomingEpisodes`' sibling over the other half of one page.
 *
 * ── The membership is three predicates and none of them is a slice ───────────────────
 *
 * **Standing at Watchlist**, **a film**, and **dated**. The first two are
 * `listWatchlistFilms`' own pair, held to deliberately rather than widened: this is the
 * dated half of the rail one page over, so a film that leaves the watchlist leaves both at
 * once and a reader paging sideways never finds the two disagreeing about what is on it.
 * `satisfies` on both string columns for that read's reason — a typo in either would be an
 * empty section rather than an error.
 *
 * The third is what makes the section mean anything. A watchlist film TMDB has not dated
 * is not something you are *waiting for* on a page that counts down; it is on the films
 * rail, undated, where it belongs. It is excluded by a predicate rather than by a `null`
 * check downstream so that nothing has to decide what a card with no date would draw.
 *
 * Shows are out by `kind` and not by accident: a show's dates are its episodes' and they
 * are the section above this one. A show's own `release_date` is the day its *first*
 * episode went out, which for anything in a library is years in the past — a predicate on
 * it would be quietly right for the wrong reason, and wrong the day a reader watchlists a
 * series that has not premiered.
 *
 * ── The same day-wide window, for the same timezone reason ───────────────────────────
 *
 * `release_date >= current_date - 1`, which is `listUpcomingEpisodes`' window and that
 * function's argument in full: no zone on earth is more than 24 hours from UTC, so a
 * window opening a day early is a superset of *today or later* for every reader at every
 * instant, and the narrowing to the reader's actual today happens once, in the reader's
 * zone, in `upcoming-grouping.ts` — the same module that writes the countdown, so the film
 * that is dropped and the words under the one beside it are decided against one day.
 *
 * It also keeps this read cacheable on `serverDay()` the way every clock-reading read here
 * is, which a window bucketed in the reader's zone would not be.
 *
 * ── Ordered by what is nearest, and not capped ───────────────────────────────────────
 *
 * By release date first, because *what is coming next* is the whole question the section
 * answers and the countdown under the first card is the smallest number on it. Then
 * `lower(name)` and the entry id, so two films released on one day have a stable order and
 * two identical loads give an identical section (`listWatchlistFilms`' expression, and its
 * note on why it is repeated rather than imported).
 *
 * **No `LIMIT`**, for `listUpcomingEpisodes`' reason: the bound is a reader's own
 * watchlist, the section is a horizontal rail whose bound is the scroll, and a cap here
 * would be *showing 20 of 34* with the number filed off.
 *
 * Unguarded, like every read in this file. A failure throws to the route's `error.tsx`,
 * which draws the read-failure treatment with a reference id — *nothing is coming* is
 * exactly as plausible a lie here as it is over the episodes above.
 */
export async function listUpcomingFilms(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<readonly UpcomingFilm[]> {
  return executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleName: title.name,
      posterPath: title.posterPath,
      // Left as the `YYYY-MM-DD` text Postgres wrote, never a `Date`: a release date is a
      // `date` column with no instant in it, and a `Date` here would silently acquire a
      // timezone the column does not have (ADR-0003). `listUpcomingEpisodes` casts its
      // `air_date` the same way over the same laundered null.
      releaseDate: sql<string>`${title.releaseDate}`.as("release_date"),
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .where(
      and(
        ownedBy(userId, libraryEntry),
        eq(libraryEntryState.state, "watchlist" satisfies LibraryState),
        eq(title.kind, "film" satisfies TitleKind),
        isNotNull(title.releaseDate),
        sql`${title.releaseDate} >= current_date - 1`,
      ),
    )
    .orderBy(title.releaseDate, sql`lower(${title.name})`, libraryEntry.id);
}

/** One row of a season/episode list — issue #58's title detail. */
export interface EpisodeDetail {
  readonly id: string;
  /** 0 = specials — mirrored and markable, and shown here like any other season. */
  readonly seasonNo: number;
  readonly episodeNo: number;
  /** `null` where TMDB has not named it. Never falls back to a bare number. */
  readonly name: string | null;
  /**
   * The three mirrored facts an episode's own page prints and a season row does not —
   * issue #253, over the columns issue #246 put in the mirror.
   *
   * ── Why they are on this type rather than on a second one ────────────────────────
   *
   * The episode page is a projection of this read rather than a read of its own — its
   * `page.tsx` argues that at length. A parallel `EpisodeDetailRow` carrying the same
   * identity, the same `watched` and the same `upNext` plus three columns would be a
   * second answer to *what is an episode* with nothing keeping it in step with this
   * one, and the surface that noticed the drift would be the one printing a date beside
   * a name read from a different row.
   *
   * The season list simply does not read them. That costs three columns on a query that
   * already selects four from the same table and returns the same rows.
   *
   * `stillPath` is TMDB's `still_path` — a CDN path and never a URL, because ADR-0001
   * stores no image blobs and `episode-still.tsx` is what turns one into a URL. `null`
   * is TMDB having no frame for this episode: not an error, and not a missing read.
   *
   * `airDate` is the ISO `YYYY-MM-DD` string Postgres hands back for a `date` column,
   * left as text rather than parsed. `db/views.ts` compares this column to
   * `current_date` in SQL, nothing in the application does arithmetic on it, and a
   * `Date` here would silently acquire a timezone the column does not have (ADR-0003).
   * `null` where TMDB has not dated it, which is not the same as *not out yet* — and
   * `episode-facts.ts` refuses to say either in the other's words.
   *
   * `runtimeMins` is this episode's own runtime, unrelated to `TitleDetailRow`'s, which
   * is a film's. `null` where TMDB has published none.
   */
  readonly stillPath: string | null;
  readonly airDate: string | null;
  readonly runtimeMins: number | null;
  /**
   * Struck, and now the whole of what the row needs to decide what to offer.
   *
   * #89 carried a second flag beside this one — `unwatchable`, *one of this episode's
   * watches is one the application recorded* — because an episode whose watches were all
   * imported offered no unwatch. #145 removes that rule and **removes the field with
   * it**, rather than leaving it set to whatever `watched` is: two fields that can only
   * ever agree are two fields that can come to disagree, and the surface would then be
   * reading the one that was wrong.
   */
  readonly watched: boolean;
  /** This is `library_entry_up_next`'s episode, if it has one. */
  readonly upNext: boolean;
}

/** Everything title detail shows that is mirrored — nothing fetched live is in here. */
export interface TitleDetailRow {
  readonly libraryEntryId: string;
  /** Issue #147: what `addTitleToList` keys a membership on — a list holds titles, not
   *  library entries, so the control that adds this title to one needs this rather than
   *  `libraryEntryId`. */
  readonly titleId: string;
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  /** Films only; `null` for shows. */
  readonly runtimeMins: number | null;
  readonly state: LibraryState;
  /**
   * Your rating, `null` until you have given one — issue #113. It is on this row and on
   * no other read in this file, which is most of what makes *nothing reads a rating in
   * v1* (`SPEC.md` §7) structural rather than remembered: `LibraryEntryRow` does not
   * carry it, so the tile could not display one even by accident, and neither the chips
   * nor the sort can work on a column their query never selects.
   */
  readonly rating: number | null;
  /** Empty for a film, and for a show TMDB has no episode data for — the two read
   *  identically here; `programme-note-episodes.tsx` is what tells them apart, from
   *  `kind`. */
  readonly episodes: readonly EpisodeDetail[];
  /**
   * **This show's episodes have not mirrored** — issue #272, and the fact that makes
   * `episodes: []` two states rather than one.
   *
   * Empty and pending are not the same answer and the page must not draw them the same
   * way: *still arriving* becomes an ordinary season list in a moment, and *TMDB lists
   * none* is the whole truth about the title. This is `title.episodes_mirrored_at IS NULL`
   * and nothing inferred — inferring it from `episodes.length === 0` is the exact
   * conflation the column was added to end (#271).
   *
   * **False for a film, always.** A film has nothing to wait for and no episode region for
   * a pending line to stand in; the add stamps it on the way in, and the `kind` test here
   * is what keeps a row that somehow escaped that from putting one on its page.
   */
  readonly episodesPending: boolean;
}

/**
 * One title, as the programme note and the phone route both show it — issue #58.
 *
 * ── Scoped by entry, not by title ─────────────────────────────────────────────────────
 *
 * `title` and `episode` are global (ADR-0001), but what this reads is *your* copy of one:
 * `ownedBy(userId, libraryEntry)` combined with the entry id is what makes a tampered or
 * stale id from another account's library answer nothing rather than someone else's row.
 * A missing row and a row that belongs to somebody else are the same case here and are
 * both a throw — there is nothing for this surface to degrade to, unlike
 * `listLibraryEntries`'s empty library, which is a real, intended state.
 *
 * ── Watched, by a second query, not by a join ─────────────────────────────────────────
 *
 * A rewatch (`CONTEXT.md`) is a second `watch` row against the same episode, so a plain
 * `leftJoin` on `watch` would multiply that episode into two rows the moment it had been
 * watched twice. A `Set` of this entry's watched episode ids, built from its own query,
 * dedupes a rewatch for free and needs no correlated subquery — which matters here for a
 * reason worth naming: `episode` and `watch` are both selected by column name only
 * (`db/schema.ts` gives Drizzle one `episode` table in scope, so it never table-qualifies
 * `episode.id`), and `watch` happens to have its own `id` and `episode_id` columns. A
 * `sql` fragment correlating `${episode.id}` inside a subquery `FROM watch` renders as
 * the bare identifier `id`, which resolves to `watch`'s own primary key instead of
 * reaching the outer table — silently, with no SQL error, and an `EXISTS` that is always
 * false. Caught by `tests/title-detail.test.ts`; two separate queries sidestep the
 * footgun entirely rather than working around it.
 *
 * ── Up next, by id, not by rebuilding the rule ────────────────────────────────────────
 *
 * `library_entry_up_next` already is "the episode after your progress" — a second query,
 * not a second definition. A library entry with nothing next (unstarted, a film, a show
 * finished to the edge of what is mirrored) simply has no row there, and every episode's
 * `upNext` reads `false`.
 *
 * ── There is no `try` here ────────────────────────────────────────────────────────────
 *
 * Called directly from the phone route (`app/(signed-in)/library/[entryId]/page.tsx`),
 * a throw here is what reaches that route's own `error.tsx`. The desktop pane cannot
 * lean on a route boundary — it never navigates — so it calls this through
 * `titleDetailAction`, which is what does the catching, for the reason
 * `app/(signed-in)/search/actions.ts` already gives for the search screen.
 */
export async function getTitleDetail(
  userId: UserId,
  libraryEntryId: string,
  executor: Executor = getDb(),
): Promise<TitleDetailRow> {
  const [row] = await executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleId: title.id,
      kind: title.kind,
      tmdbId: title.tmdbId,
      name: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
      runtimeMins: title.runtimeMins,
      state: libraryEntryState.state,
      rating: libraryEntry.rating,
      episodesMirroredAt: title.episodesMirroredAt,
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .where(and(ownedBy(userId, libraryEntry), eq(libraryEntry.id, libraryEntryId)));

  if (!row) {
    throw new Error(
      `Library entry ${libraryEntryId} was not found in this account's library.`,
    );
  }

  const [upNextRow] = await executor
    .select({ episodeId: libraryEntryUpNext.episodeId })
    .from(libraryEntryUpNext)
    .where(eq(libraryEntryUpNext.libraryEntryId, libraryEntryId));
  const upNextEpisodeId = upNextRow?.episodeId ?? null;

  const watchedRows = await executor
    .select({ episodeId: watch.episodeId })
    .from(watch)
    .where(eq(watch.libraryEntryId, libraryEntryId));
  /**
   * A film's watch carries no episode; only a show reaches this far with rows at all.
   *
   * `source` is no longer selected. #89 built a second `Set` from it — the episodes with
   * a watch this application recorded, which were the only ones allowed to offer an
   * unwatch — and #145 removes that rule, so the column has nothing left to answer here.
   */
  const watchedEpisodeIds = new Set(
    watchedRows.map((one) => one.episodeId).filter((id) => id !== null),
  );

  const episodeRows = await executor
    .select({
      id: episode.id,
      seasonNo: episode.seasonNo,
      episodeNo: episode.episodeNo,
      name: episode.name,
      // The three columns #246 put in the mirror, read here for #253's episode page.
      // `EpisodeDetail`'s own docblock holds the argument for their being on this row
      // rather than on a second read beside it.
      stillPath: episode.stillPath,
      airDate: episode.airDate,
      runtimeMins: episode.runtimeMins,
    })
    .from(episode)
    .where(eq(episode.titleId, row.titleId))
    .orderBy(episode.seasonNo, episode.episodeNo);

  const kind = kindFrom(row.kind);

  return {
    libraryEntryId: row.libraryEntryId,
    titleId: row.titleId,
    kind,
    tmdbId: row.tmdbId,
    name: row.name,
    releaseYear: row.releaseYear,
    posterPath: row.posterPath,
    runtimeMins: row.runtimeMins,
    state: stateFrom(row.state),
    rating: row.rating,
    episodesPending: kind === "show" && row.episodesMirroredAt === null,
    episodes: episodeRows.map((one) => ({
      id: one.id,
      seasonNo: one.seasonNo,
      episodeNo: one.episodeNo,
      name: one.name,
      stillPath: one.stillPath,
      airDate: one.airDate,
      runtimeMins: one.runtimeMins,
      watched: watchedEpisodeIds.has(one.id),
      upNext: one.id === upNextEpisodeId,
    })),
  };
}

/**
 * `title.kind` carries `title_kind_check`, so this never fires against a row this
 * application wrote — it is here for the reason `stateFrom` is: a column Drizzle types
 * as `string` is a promise nothing at the type level checks, and the honest treatment of
 * a broken promise is the read failure this throw feeds into, not a silent guess.
 */
function kindFrom(value: string): TitleKind {
  if (value === "film" || value === "show") return value;
  throw new Error(`title.kind was neither 'film' nor 'show': ${value}`);
}

/**
 * One row of an unowned title's episode list — issue #148.
 *
 * `EpisodeDetail` above carries `watched` and `upNext`; this carries neither, and the
 * absence is the type doing the ticket's work rather than a convention to remember. A
 * surface handed one of these cannot draw a mark, a rewatch or an *Up next* chip, because
 * there is no field on it that could say so — which is the whole of *nothing tells you
 * something false about a show you have never watched*.
 */
export interface UnownedEpisodeDetail {
  readonly id: string;
  /** 0 = specials, grouped here as they are everywhere else. */
  readonly seasonNo: number;
  readonly episodeNo: number;
  /** `null` where TMDB has not named it. Never falls back to a bare number. */
  readonly name: string | null;
}

/**
 * Title detail's borrowed half, and only that — issue #148.
 *
 * Every field here is a fact about the world (`CONTEXT.md`): it lives on `title` or
 * `episode`, which are global and unowned (ADR-0001), so the same answer is true for
 * every reader. `TitleDetailRow`'s other five fields — `libraryEntryId`, `state`,
 * `rating`, and an episode's `watched` and `upNext` — are all *somebody's*, and this
 * shape has no somebody to attribute them to.
 */
export interface UnownedTitleDetailRow {
  /** What `addTitleToList` keys a membership on, so the unowned page can offer *Add to
   *  list* the way the owned one already does (issue #147). */
  readonly titleId: string;
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  readonly runtimeMins: number | null;
  /** Empty for a film, and for a show TMDB has no episode data for. */
  readonly episodes: readonly UnownedEpisodeDetail[];
}

/**
 * One title, for a reader who does not own it — issue #148, and a second read beside
 * `getTitleDetail` rather than a relaxation of it.
 *
 * ── Why this is not `getTitleDetail` with the owner made optional ─────────────────────
 *
 * That was the alternative and it is the shape to avoid. `getTitleDetail` is scoped by
 * `ownedBy(userId, libraryEntry)` combined with an entry id, and it throws when the pair
 * matches nothing — a tampered id, a foreign one and a deleted one are the same case, and
 * all three are a boundary. Making that join optional would mean the read's `where` no
 * longer had to mention an owner to return a row, and the failure mode of that is not a
 * wrong screen: it is one account's library entry answering another account's request,
 * out of a query that still reads as scoped. So ownership stays mandatory where it is,
 * and the unowned case is a different function, with a different key and a different
 * return type.
 *
 * ── Keyed by `(kind, tmdbId)`, which is what makes it unownable ───────────────────────
 *
 * `title_kind_tmdb_id_key` is that pair — TMDB numbers films and shows separately, so the
 * id alone is not unique (`db/tables.ts`). What matters more than the choice of key is
 * what the signature does not have: no user id, and no argument that could name one. The
 * isolation model (this module's own docblock) is one filtered column, and a read with no
 * owned table in it has nothing to filter and nothing to leak. `title` and `episode` were
 * always like this; `libraryCatalogueKeys` is the only reason either has ever been asked
 * a per-account question, and that question is really about `library_entry`.
 *
 * ── A missing title throws ────────────────────────────────────────────────────────────
 *
 * The treatment `getTitleDetail` and `getListDetail` give a row that is not there, for
 * the reason they give it: there is nothing for this surface to degrade to. The route
 * into the page is a list row, which cannot exist without the `title` row it names, so a
 * miss here is a hand-typed id or a mirror that has lost a row — neither of which is an
 * empty state, and both of which are honestly a page that did not load.
 *
 * ── The page does not call this directly any more — issue #225 ───────────────────────
 *
 * `cache/borrowed-facts.ts`'s `cachedUnownedTitleDetail` wraps it, and that is what
 * `catalogue/[kind]/[tmdbId]/page.tsx` calls. Nothing about the query changed, and the throws
 * above still leave through `unstable_cache` untouched, because it stores resolved values
 * only.
 *
 * What changed is that a caller may now be served an earlier answer, and **the thing that
 * has to bust it is a rewrite of the mirror rather than a write of the reader's.** This
 * read has no user id and no owned table in it, so it is on the borrowed side of the
 * cache: its entry is tagged by `(kind, tmdbId)` and every write that reaches `mirrorTitle`
 * — the list in `cache/tags.ts`'s `MIRRORS_SHARED_TITLE_ROWS` — owes it a call to
 * `invalidateBorrowedFactsFor`, as does the nightly sweep. It also carries a six-hour
 * window, which is a ceiling and not the mechanism.
 */
export async function getUnownedTitleDetail(
  kind: TitleKind,
  tmdbId: number,
  executor: Executor = getDb(),
): Promise<UnownedTitleDetailRow> {
  const row = await findUnownedTitleDetail(kind, tmdbId, executor);

  if (row === null) {
    throw new Error(`No ${kind} with TMDB id ${tmdbId} is mirrored.`);
  }

  return row;
}

/**
 * The same read, with **absence as an answer rather than an error**.
 *
 * ── Why both exist ──────────────────────────────────────────────────────────────────
 *
 * `getUnownedTitleDetail` above throws when the row is not there, and that is right for
 * the caller issue #148 built it for: a title sitting in one of your lists, where the
 * membership guarantees the mirror row. A missing row there is a broken invariant.
 *
 * Catalogue detail reached from a search result or the *Because you watched* rail has no
 * such guarantee — it is a title TMDB knows about and this database has never heard of, so
 * *not mirrored* is the ordinary case and not a fault.
 *
 * **The distinction is the point, and it is why that caller does not simply catch.** A
 * `try`/`catch` around the throwing version cannot tell *this row does not exist* from
 * *the database did not answer*, so a Postgres outage would fall through to the catalogue,
 * render the title from TMDB, and look completely fine — which is `SPEC.md` §3's failure
 * wearing a different hat. Here a missing row returns `null` and a failed read still
 * throws, so the two stay apart at the only place that can tell them apart.
 */
export async function findUnownedTitleDetail(
  kind: TitleKind,
  tmdbId: number,
  executor: Executor = getDb(),
): Promise<UnownedTitleDetailRow | null> {
  const [row] = await executor
    .select({
      titleId: title.id,
      kind: title.kind,
      tmdbId: title.tmdbId,
      name: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
      runtimeMins: title.runtimeMins,
    })
    .from(title)
    .where(and(eq(title.kind, kind), eq(title.tmdbId, tmdbId)));

  if (!row) return null;

  const episodeRows = await executor
    .select({
      id: episode.id,
      seasonNo: episode.seasonNo,
      episodeNo: episode.episodeNo,
      name: episode.name,
    })
    .from(episode)
    .where(eq(episode.titleId, row.titleId))
    .orderBy(episode.seasonNo, episode.episodeNo);

  return { ...row, kind: kindFrom(row.kind), episodes: episodeRows };
}

/**
 * This account's own entry for one title, or `null` — issue #148.
 *
 * ── Null here is a state, not a failure ───────────────────────────────────────────────
 *
 * `SPEC.md` §3.2's distinction: a query that succeeded and found nothing means *you have
 * not added this title*, which is the entire premise of the page this feeds. A failure
 * still throws, from the driver, with no `catch` in the way.
 *
 * ── The two things it decides ─────────────────────────────────────────────────────────
 *
 * It is what the unowned route asks before rendering — an account that does own the title
 * is sent to its own copy of it, so *there are not two kinds of show* survives a URL
 * typed by hand — and it is how that page's *Add to library* finds the entry it has just
 * created, to send the reader on to. `addTitleToLibrary` reports whether it created one
 * and not which one, deliberately: its `onConflictDoNothing` returns no row on the
 * conflict, and reading the id back here is more honest than making that write's return
 * value depend on a second query it does not otherwise need.
 *
 * `ownedBy` is the whole of the isolation. Without it this reads *anybody's* entry for
 * the title and the page offers a stranger's copy; with it, a title only somebody else
 * has added answers `null`, which is the true answer.
 */
export async function libraryEntryIdForTitle(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
  executor: Executor = getDb(),
): Promise<string | null> {
  const [row] = await executor
    .select({ id: libraryEntry.id })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .where(
      and(ownedBy(userId, libraryEntry), eq(title.kind, kind), eq(title.tmdbId, tmdbId)),
    );

  return row?.id ?? null;
}

/**
 * A list's own facts, and the one number the delete confirmation needs — issue #146.
 *
 * `titleCount` is read from `list_membership` rather than carried on `list` itself: there
 * is no stored count anywhere in this schema, so it is counted the same way
 * `accountFootprint` counts a rating — at read time, off the rows that are the only truth
 * about it.
 */
export interface ListSummary {
  readonly id: string;
  readonly name: string;
  readonly titleCount: number;
}

/**
 * This account's lists, alphabetically — issue #146.
 *
 * Alphabetical rather than by creation order: nothing here asks for a ranking among lists
 * themselves — ordering is `list_membership.position`, a title's place inside one list,
 * not one list's place among the others — so the tie is broken the way a reader scanning
 * for a list they made finds it fastest, by name.
 *
 * `left join`, not inner: a list with no memberships yet — every list, until the ticket
 * that lets you add to one ships — must still appear, with `titleCount` at zero rather
 * than the list vanishing from its own destination.
 */
export async function listLists(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<ListSummary[]> {
  return executor
    .select({
      id: list.id,
      name: list.name,
      titleCount: sql<number>`count(${listMembership.titleId})`.mapWith(Number),
    })
    .from(list)
    .leftJoin(listMembership, eq(listMembership.listId, list.id))
    .where(ownedBy(userId, list))
    .groupBy(list.id)
    .orderBy(asc(sql`lower(${list.name})`));
}

/**
 * A list name's length, checked here for the same reason `rateTitle` checks its rating's
 * range: a Server Action is a POST endpoint anyone with a session can call with any
 * argument, and `NOT NULL` is the only constraint the column itself carries.
 */
export const LIST_NAME_MAX_LENGTH = 60;

export type CreateListOutcome =
  | { readonly ok: true; readonly list: ListSummary }
  /** `list_user_id_name_key` — one account, one list of a given name. */
  | { readonly ok: false; readonly reason: "duplicate" };

/**
 * Make a list, and name it — issue #146.
 *
 * ── The duplicate name is caught by the constraint, not pre-checked ─────────────────
 *
 * `onConflictDoNothing` targets `list_user_id_name_key` directly rather than this
 * function running a `SELECT` first and hoping nothing else inserts between the two: two
 * requests racing the same name would both pass a pre-check and one would still hit the
 * constraint, so the constraint has to be the real answer regardless. Reading it off
 * `RETURNING` coming back empty keeps that to one round trip either way.
 */
export async function createList(
  userId: UserId,
  name: string,
  executor: Executor = getDb(),
): Promise<CreateListOutcome> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > LIST_NAME_MAX_LENGTH) {
    throw new Error(
      `A list name must be 1-${LIST_NAME_MAX_LENGTH} characters; got ${JSON.stringify(name)}.`,
    );
  }

  const [row] = await executor
    .insert(list)
    .values({ userId, name: trimmed })
    .onConflictDoNothing({ target: [list.userId, list.name] })
    .returning({ id: list.id, name: list.name });

  if (!row) return { ok: false, reason: "duplicate" };

  return { ok: true, list: { ...row, titleCount: 0 } };
}

/**
 * Delete a list — issue #146.
 *
 * ── Why there is nothing here about memberships ──────────────────────────────────────
 *
 * `list_membership_list_id_user_id_fk` cascades on `list`'s deletion (`db/tables.ts`), so
 * the memberships go with the one statement below, the same way `deleteAccount` leans on
 * Postgres for its cascades rather than a hand-written sequence. Nothing else references a
 * list, so nothing else is at risk — the acceptance criterion this exists to meet is
 * *removes its memberships and nothing else*, and "nothing else" is true because there is
 * nothing else to reach.
 */
export async function deleteList(
  userId: UserId,
  listId: string,
  executor: Executor = getDb(),
): Promise<void> {
  const [row] = await executor
    .delete(list)
    .where(and(ownedBy(userId, list), eq(list.id, listId)))
    .returning({ id: list.id });

  if (!row) {
    throw new Error(`List ${listId} was not found in this account's lists.`);
  }
}

/** Whether the add created a membership, or found one already there — `AddOutcome`'s own
 *  shape, for the reason its docblock gives: nothing here reads a position back, the same
 *  way nothing reads a library entry id back from `addTitleToLibrary`. A caller wanting a
 *  title's position reads it from `getListDetail`, the same read the list page itself
 *  uses, rather than this write carrying a second, narrower copy of the same fact. */
export interface AddToListOutcome {
  readonly added: boolean;
}

/**
 * Put one title in one list, at the next position — issue #147.
 *
 * ── Ownership, enforced by the foreign key rather than a second query ────────────────
 *
 * `list_membership_list_id_user_id_fk` (`db/tables.ts`) is `(list_id, user_id)` against
 * `list(id, user_id)`. Insert `userId` here paired with a `listId` that names somebody
 * else's list, and there is no row in `list` for that pair to satisfy — Postgres rejects
 * the write and this throws, the same shape `deleteList` uses for a tampered id. There is
 * nothing to pre-check.
 *
 * ── At most once, by the primary key ──────────────────────────────────────────────────
 *
 * `(list_id, title_id)` is `list_membership`'s primary key, so a title already in the
 * list conflicts on it. `onConflictDoNothing` targets that key directly, the same way
 * `addTitleToLibrary` targets its own — a second add is not an error and not a duplicate
 * row, it is a write that found nothing to do.
 *
 * ── The next position, read and written in one transaction ───────────────────────────
 *
 * `db/tables.ts`'s own docblock: `UNIQUE (list_id, position) DEFERRABLE INITIALLY
 * DEFERRED`, built for a whole reorder to commit as one transaction without colliding
 * with itself. A plain append does not need that deferral — it only needs the read of
 * the current maximum and the insert to happen together, which is what the transaction
 * below is for. `coalesce(max(position), 0) + 1` is deterministic for an empty list (the
 * first title lands at `1`) and never touches a row already there, which is the acceptance
 * criterion this exists to meet: *existing positions do not shuffle*.
 */
export async function addTitleToList(
  userId: UserId,
  listId: string,
  titleId: string,
  executor: Executor = getDb(),
): Promise<AddToListOutcome> {
  return executor.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({
        next: sql<number>`coalesce(max(${listMembership.position}), 0) + 1`.mapWith(Number),
      })
      .from(listMembership)
      .where(eq(listMembership.listId, listId));

    const created = await tx
      .insert(listMembership)
      .values({ listId, titleId, userId, position: next })
      .onConflictDoNothing({ target: [listMembership.listId, listMembership.titleId] })
      .returning({ position: listMembership.position });

    return { added: created.length > 0 };
  });
}

/**
 * How many memberships a bulk add created. A count rather than `AddToListOutcome`'s
 * boolean, because the two answers a caller wants from a set are not the same as the two
 * it wants from one title: *did the whole set land* is what the transaction below promises
 * outright, and *how many of them were not already there* is the only thing left to report.
 */
export interface AddTitlesToListOutcome {
  readonly added: number;
}

/**
 * Put several titles in one list, at sequential positions, as one write — issue #197.
 *
 * ── Why this is not `addTitleToList` in a loop ───────────────────────────────────────
 *
 * Because a loop cannot promise the thing the ticket is built on: *the whole set lands
 * with sequential positions or none of it does.* `addTitleToList` computes its own next
 * position per call, so six sequential calls are six transactions — four can commit and
 * two can fail, and the reader is left to work out which — and six parallel ones race
 * `UNIQUE (list_id, position)` against each other. One transaction makes partial success
 * structurally impossible, which is what lets `bulk-selection.ts` raise **one** toast for
 * a lost add rather than one per title.
 *
 * ── Already-in-the-list titles are read, not conflicted away ─────────────────────────
 *
 * `addTitleToList` leans on `onConflictDoNothing` against `list_membership`'s primary key,
 * which is exactly right for one row: nothing is written and there is no position to
 * account for. It is wrong for a set. Handing Postgres six rows at `next … next + 5` and
 * letting two of them conflict away would leave two **holes** in the position sequence,
 * and contiguity is an invariant here — `reorderListMembership`'s own docblock names it
 * (*`1..count`, contiguous, exactly the invariant `addTitleToList`'s `coalesce(max(...),
 * 0) + 1` maintains*).
 *
 * So the titles already in the list are read first, inside the same transaction, and only
 * the rest are given positions. That is also the plainest reading of the acceptance
 * criterion *titles already in the chosen list are not duplicated*: they are not written
 * at all, rather than written and swallowed.
 *
 * The insert deliberately carries **no** `onConflictDoNothing` after that. Having just
 * read which rows are missing, a conflict can only mean a concurrent writer took one of
 * these positions or memberships — and the honest answer to that is the whole transaction
 * rolling back and the reader being told, not a silent hole in the sequence.
 *
 * ── Ownership, enforced by the foreign key ───────────────────────────────────────────
 *
 * As `addTitleToList`: `list_membership_list_id_user_id_fk` is `(list_id, user_id)` against
 * `list(id, user_id)`, so a `listId` naming somebody else's list has no row to satisfy and
 * the insert throws. The read above it is scoped by `ownedBy` for a reason that is not
 * decoration — an unscoped read of a foreign list would find *its* memberships, decide
 * every title was already there, and return `{ added: 0 }` without ever reaching the
 * insert that would have rejected the request.
 */
export async function addTitlesToList(
  userId: UserId,
  listId: string,
  titleIds: readonly string[],
  executor: Executor = getDb(),
): Promise<AddTitlesToListOutcome> {
  // No transaction and no round trip for a set with nothing in it. `bulk-selection.ts`
  // guards this too; an empty `VALUES` list is not a thing to send and find out about.
  if (titleIds.length === 0) return { added: 0 };

  return executor.transaction(async (tx) => {
    const present = await tx
      .select({ titleId: listMembership.titleId })
      .from(listMembership)
      .where(
        and(
          ownedBy(userId, listMembership),
          eq(listMembership.listId, listId),
          inArray(listMembership.titleId, [...titleIds]),
        ),
      );

    // Seeded with what the list already holds, then added to as the request is walked —
    // so a caller that named the same title twice writes it once, exactly as if the
    // second mention had been in the list all along.
    const seen = new Set(present.map((row) => row.titleId));
    const missing = titleIds.filter((titleId) => {
      if (seen.has(titleId)) return false;
      seen.add(titleId);
      return true;
    });

    if (missing.length === 0) return { added: 0 };

    const [{ next }] = await tx
      .select({
        next: sql<number>`coalesce(max(${listMembership.position}), 0) + 1`.mapWith(Number),
      })
      .from(listMembership)
      .where(and(ownedBy(userId, listMembership), eq(listMembership.listId, listId)));

    await tx.insert(listMembership).values(
      missing.map((titleId, index) => ({
        listId,
        titleId,
        userId,
        position: next + index,
      })),
    );

    // `missing.length`, and not a count read back off the insert. There is no
    // `onConflictDoNothing` above, so this statement either writes every row or throws and
    // takes the transaction with it — the two numbers are equal by construction, and
    // asking Postgres to send the rows back to prove it is a payload for a fact the shape
    // of the statement already guarantees.
    return { added: missing.length };
  });
}

/**
 * Make a list and add one title to it, as one write — issue #147's *creating a new list
 * is available in the same action, so the first list is not a separate errand.*
 *
 * One transaction, so a duplicate name leaves no membership behind either: `createList`'s
 * own `onConflictDoNothing` reports the duplicate without writing a row, and returning
 * before `addTitleToList` runs is what keeps the two in step. Nesting `addTitleToList`'s
 * own `executor.transaction` inside this one costs nothing — `repointTitle` and
 * `addTitleToLibrary` already lean on Drizzle nesting a passed-in transaction as a
 * savepoint rather than a second, unrelated transaction.
 */
export async function createListAndAddTitle(
  userId: UserId,
  name: string,
  titleId: string,
  executor: Executor = getDb(),
): Promise<CreateListOutcome> {
  return executor.transaction(async (tx) => {
    const created = await createList(userId, name, tx);
    if (!created.ok) return created;

    await addTitleToList(userId, created.list.id, titleId, tx);

    return { ok: true, list: { ...created.list, titleCount: 1 } };
  });
}

/** One row of a list's titles, in position order — issue #147. */
export interface ListDetailTitleRow {
  readonly titleId: string;
  /** This account's own copy of the title, when they have one — `null` for a title the
   *  list holds that is not in their library. A list holds anything in the catalogue. */
  readonly libraryEntryId: string | null;
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  readonly position: number;
}

/** A list's own facts, and its titles in order — issue #147. */
export interface ListDetailRow {
  readonly id: string;
  readonly name: string;
  readonly titles: readonly ListDetailTitleRow[];
}

/**
 * One list, and the ordered rows it holds — issue #147.
 *
 * ── Scoped by list, the same shape `getTitleDetail` uses for an entry ────────────────
 *
 * `ownedBy(userId, list)` combined with the list id: a missing row and a row belonging to
 * somebody else are the same case, and both throw. There is nothing for this surface to
 * degrade to — `SPEC.md`'s *one account cannot read another account's list* is a
 * boundary, not a state this function ever returns.
 *
 * ── `title`, left-joined against this account's own library entry ────────────────────
 *
 * A list holds a title, not a library entry (ADR-0001 amendment 7), so the read starts
 * from `list_membership` and joins `title` for the borrowed facts a row shows. The `left
 * join` against `library_entry` is scoped by `userId` *and* `title.id` together — the
 * same pairing `library_entry_user_id_title_id_key` makes unique — so it can answer at
 * most one row per title and never invents an owner the membership itself does not carry.
 * `libraryEntryId` is `null` exactly when this account has not added the title, which is
 * expected: issue #133 decided a list survives its titles leaving the library.
 */
export async function getListDetail(
  userId: UserId,
  listId: string,
  executor: Executor = getDb(),
): Promise<ListDetailRow> {
  const [row] = await executor
    .select({ id: list.id, name: list.name })
    .from(list)
    .where(and(ownedBy(userId, list), eq(list.id, listId)));

  if (!row) {
    throw new Error(`List ${listId} was not found in this account's lists.`);
  }

  const titleRows = await executor
    .select({
      titleId: title.id,
      libraryEntryId: libraryEntry.id,
      kind: title.kind,
      tmdbId: title.tmdbId,
      name: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
      position: listMembership.position,
    })
    .from(listMembership)
    .innerJoin(title, eq(title.id, listMembership.titleId))
    .leftJoin(
      libraryEntry,
      and(eq(libraryEntry.userId, userId), eq(libraryEntry.titleId, title.id)),
    )
    .where(eq(listMembership.listId, listId))
    .orderBy(asc(listMembership.position));

  return {
    id: row.id,
    name: row.name,
    titles: titleRows.map((one) => ({ ...one, kind: kindFrom(one.kind) })),
  };
}

/**
 * Move one title to a new position in a list, shifting whatever is between — issue #149.
 *
 * ── The read that both authorizes and bounds the write ────────────────────────────────
 *
 * One `SELECT`, scoped by `ownedBy(userId, listMembership)` and `listId`, does two jobs
 * `getListDetail` also splits across two separate concerns: it is the ownership check —
 * a tampered or foreign list id finds no rows for `titleId` to match, and this throws the
 * same way `deleteList` and `rateTitle` do — and it is where `newPosition`'s valid range
 * comes from. A Server Action is a POST endpoint anyone with a session can call with any
 * argument, so `1-count` is checked here rather than trusted from the drag that produced
 * it.
 *
 * Three statements rather than the one round trip `rateTitle` and `deleteList` manage —
 * the shift below has to know every row's current position before it can decide which
 * ones move, and that is not a fact an `UPDATE ... RETURNING` on the moved row alone can
 * answer.
 *
 * ── Shift the range between, not the whole list ────────────────────────────────────────
 *
 * A drag can move a row past any number of others, not only its neighbour, so this is not
 * literally always *two rows swap* — but it is the same mechanism ADR-0001 built the
 * deferred constraint for: every row strictly between the old and new position shifts by
 * one to close the gap, and the moved row lands on `newPosition` last. Positions stay
 * `1..count`, contiguous, exactly the invariant `addTitleToList`'s `coalesce(max(...), 0)
 * + 1` already depends on for the next append.
 *
 * ── Why the shift and the move can share one transaction without colliding ────────────
 *
 * `list_membership_list_id_position_key` is `DEFERRABLE INITIALLY DEFERRED`
 * (`db/tables.ts`) precisely so this is possible: shifting a range of rows onto positions
 * a still-unmoved row occupies is a uniqueness violation at every intermediate statement,
 * and would abort immediately under an ordinary constraint. Deferred, Postgres checks only
 * once, at commit, by which point every row — including the one that moved — holds a
 * position no other row in the list holds.
 */
export async function reorderListMembership(
  userId: UserId,
  listId: string,
  titleId: string,
  newPosition: number,
  executor: Executor = getDb(),
): Promise<void> {
  await executor.transaction(async (tx) => {
    const rows = await tx
      .select({ titleId: listMembership.titleId, position: listMembership.position })
      .from(listMembership)
      .where(and(ownedBy(userId, listMembership), eq(listMembership.listId, listId)))
      .orderBy(asc(listMembership.position));

    const current = rows.find((row) => row.titleId === titleId);
    if (!current) {
      throw new Error(`Title ${titleId} was not found in this account's list ${listId}.`);
    }

    const count = rows.length;
    if (!Number.isInteger(newPosition) || newPosition < 1 || newPosition > count) {
      throw new Error(`A list position is a whole number 1-${count}; got ${newPosition}.`);
    }

    const oldPosition = current.position;
    if (newPosition === oldPosition) return;

    if (newPosition > oldPosition) {
      await tx
        .update(listMembership)
        .set({ position: sql`${listMembership.position} - 1` })
        .where(
          and(
            eq(listMembership.listId, listId),
            gt(listMembership.position, oldPosition),
            lte(listMembership.position, newPosition),
          ),
        );
    } else {
      await tx
        .update(listMembership)
        .set({ position: sql`${listMembership.position} + 1` })
        .where(
          and(
            eq(listMembership.listId, listId),
            gte(listMembership.position, newPosition),
            lt(listMembership.position, oldPosition),
          ),
        );
    }

    await tx
      .update(listMembership)
      .set({ position: newPosition })
      .where(and(eq(listMembership.listId, listId), eq(listMembership.titleId, titleId)));
  });
}

/** How many posters a list card draws before it stops, in membership order. */
const LIST_CARD_POSTERS = 4;

export interface ListCard extends ListSummary {
  /**
   * Up to `LIST_CARD_POSTERS` posters, in list-membership order, filtered to the titles
   * TMDB has artwork for — issue #248. **Four posters, not four slots**: a member with no
   * poster is skipped rather than drawn as a gap, so the array is short only when the list
   * itself does not have four covered titles to offer.
   *
   * Empty exactly when the card falls back to the missing-artwork frame — a list with no
   * titles and a list whose titles all lack artwork are the same case from here, and
   * `you-list-card.tsx` tests exactly the one thing that unifies them: this array's length.
   */
  readonly posterPaths: readonly string[];
}

/**
 * The You page's lists rail — issue #248, and `listLists`'s own row plus the covers #248
 * reverses SPEC's *list covers: still out* over.
 *
 * ── Two statements, not a window function ─────────────────────────────────────────────
 *
 * `listLists` is called for the row every other lists surface already reads — the name and
 * `titleCount`, unchanged. The posters are a second, flat statement: every membership this
 * account owns with a covered title, ordered by list then position, capped to four **in
 * JavaScript** rather than with a `row_number() over (partition by …)` window. A personal
 * library is small enough that the plainer query is the honest trade — `getListDetail` and
 * `getTitleDetail` already prefer several simple statements combined in code over one
 * clever one, for the same reason.
 *
 * ── `ownedBy` on the membership, not the list ─────────────────────────────────────────
 *
 * `list_membership` carries its own `user_id` (`reorderListMembership` reads it the same
 * way), so this scopes there directly rather than joining `list` a second time only to
 * scope through it.
 */
export async function listYouListCards(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<readonly ListCard[]> {
  const lists = await listLists(userId, executor);
  if (lists.length === 0) return [];

  const posterRows = await executor
    .select({ listId: listMembership.listId, posterPath: title.posterPath })
    .from(listMembership)
    .innerJoin(title, eq(title.id, listMembership.titleId))
    .where(and(ownedBy(userId, listMembership), isNotNull(title.posterPath)))
    .orderBy(asc(listMembership.listId), asc(listMembership.position));

  const postersByList = new Map<string, string[]>();
  for (const row of posterRows) {
    const posters = postersByList.get(row.listId) ?? [];
    if (posters.length < LIST_CARD_POSTERS) {
      posters.push(row.posterPath as string);
      postersByList.set(row.listId, posters);
    }
  }

  return lists.map((list) => ({ ...list, posterPaths: postersByList.get(list.id) ?? [] }));
}

/**
 * The You page's shows and films rails — issue #248. Shows are the entries standing at
 * *watching* or *caught up*; films are the entries standing at *finished*. Both rails are
 * ordered by their title's most recent **dated** watch first.
 *
 * ── Why the two rails read different states ───────────────────────────────────────────
 *
 * #248 as filed asked for one rule, *watching or caught up*, applied to both kinds — but
 * `CONTEXT.md`'s own glossary is explicit that **a film is only ever on your watchlist,
 * finished, or abandoned**, and `library_entry_state`'s view agrees: `t.kind = 'film'`
 * resolves straight to `'finished'` the moment it has any watch at all, before *watching*
 * or *caught up* are even considered. A films rail filtered on those two states is not a
 * films rail that is sometimes empty; it is one that can never hold a single row, for any
 * account, ever — which fails #245's own user story 19, *"I want the same for films, so
 * that both halves of my library are represented."* Literal compliance with the acceptance
 * criterion defeats the reason the criterion was written. Films read *finished* instead,
 * which is the one state a watched film can actually occupy — the direct analogue of "in
 * play" that a title with no partial-progress concept has to offer.
 *
 * ── One read, split in memory, for `listUpNextRails`'s own reason ────────────────────
 *
 * A single query over both kinds' predicates, sliced afterwards, rather than two separate
 * queries — the property that matters is *every entry is on exactly one rail*, which is
 * true by construction of one `or` of two kind-scoped predicates and one split rather than
 * by two statements agreeing with each other.
 *
 * ── The order is `upNextRead`'s `last_watch`, without the up-next fallback ────────────
 *
 * `lastWatch` is the same grouped, `ownedBy`-scoped subquery `upNextRead` builds — a
 * rewatch is a second `watch` row (`CONTEXT.md`), so it has to be grouped before it can be
 * joined without multiplying an entry. What is dropped is `upNextOrder`'s fallback to an
 * unaired episode's air date: that exists so an unwatched title still has *some* position in
 * Up next's queue, and every entry here has already watched something (a show *watching* or
 * *caught up*, a film *finished*), so there is no "never watched" case to fall back for.
 *
 * **`desc nulls last`, spelled out.** Postgres defaults a `desc` order to nulls *first*,
 * which would put every entry with only undated watches at the head of its rail — backwards
 * from *most recent dated watch first*. The undated case is real (`CONTEXT.md`'s glossary:
 * a watch with no date still counts), so it is not filtered out, only ordered after
 * whatever a dated watch can say, tie-broken Title A–Z then entry id like every other
 * state-group read in this file.
 */
export interface YouRails {
  readonly shows: readonly LibraryStateGroupEntry[];
  readonly films: readonly LibraryStateGroupEntry[];
}

export async function listYouRails(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<YouRails> {
  const lastWatch = executor
    .select({
      libraryEntryId: watch.libraryEntryId,
      watchedAt: sql<string | null>`max(${watch.watchedAt})`.as("watched_at"),
    })
    .from(watch)
    .where(ownedBy(userId, watch))
    .groupBy(watch.libraryEntryId)
    .as("you_rails_last_watch");

  const rows = await executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleId: title.id,
      titleName: title.name,
      releaseYear: title.releaseYear,
      posterPath: title.posterPath,
      runtimeMins: title.runtimeMins,
      kind: title.kind,
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .leftJoin(lastWatch, eq(lastWatch.libraryEntryId, libraryEntry.id))
    .where(
      and(
        ownedBy(userId, libraryEntry),
        or(
          and(
            eq(title.kind, "show" satisfies TitleKind),
            or(
              eq(libraryEntryState.state, "watching" satisfies LibraryState),
              eq(libraryEntryState.state, "caught_up" satisfies LibraryState),
            ),
          ),
          and(
            eq(title.kind, "film" satisfies TitleKind),
            eq(libraryEntryState.state, "finished" satisfies LibraryState),
          ),
        ),
      ),
    )
    .orderBy(sql`${lastWatch.watchedAt} desc nulls last`, sql`lower(${title.name})`, libraryEntry.id);

  const shows: LibraryStateGroupEntry[] = [];
  const films: LibraryStateGroupEntry[] = [];
  for (const row of rows) {
    const entry: LibraryStateGroupEntry = {
      libraryEntryId: row.libraryEntryId,
      titleId: row.titleId,
      titleName: row.titleName,
      releaseYear: row.releaseYear,
      posterPath: row.posterPath,
      runtimeMins: row.runtimeMins,
    };
    (row.kind === "show" ? shows : films).push(entry);
  }

  return { shows, films };
}

/**
 * ── The figures You reports ──────────────────────────────────────────────────────────
 *
 * Issue #227 built this section for `/stats`, and issue #249 removed that page. What is
 * left is the two statements `accountFigures` still makes — `libraryTotals` and
 * `watchTotals` — and the shape they return between them. The six that went with the page
 * (the streak, recently finished, monthly activity, the decade distribution and the five
 * state counts) took their statements, their result types and their sizing constants with
 * them rather than being left here for a caller that no longer exists; `SPEC.md` §9 has
 * them back under *Specced, but later*.
 *
 * ── Computed in SQL, beside the derived views ────────────────────────────────────────
 *
 * *Finished* is read out of `library_entry_state` rather than recomputed here. That is not
 * merely tidiness: *a released episode is `season_no > 0 and air_date is not null and
 * air_date <= current_date`* is a sentence that must have one home, and `db/views.ts` is
 * it. A `where e.season_no > 0` written in this section would be a second copy of it, in a
 * file with no migration and no diff to make a change to it reviewable.
 *
 * Which is also why **nothing below applies either rule itself.** `episodesWatched` counts
 * watch rows and nothing else: a watch on a special is a thing you watched, and counting
 * it needs no opinion about season zero.
 *
 * ── Two statements, and what that costs ──────────────────────────────────────────────
 *
 * `accountFootprint` makes its three counts in one statement, because the decision on that
 * screen turns on the three having been true at the same instant. This is the other case:
 * two statements are two snapshots, so a watch landing between them can be inside one
 * figure and outside the other. That is accepted rather than overlooked — 341 episodes
 * beside 62 titles is the same page as 342 beside 62.
 */

/**
 * Watch time, split, and the number the split is incomplete by.
 *
 * `watchesWithoutRuntime` is not a footnote — it is what keeps the two sums from being
 * read as exact. Runtimes are mirrored per film (`title.runtime_mins`) and per episode
 * (`episode.runtime_mins`) and are null wherever TMDB had none, so a total assembled from
 * the rest is a floor rather than a figure, and the page says which.
 */
export interface WatchTime {
  readonly filmMinutes: number;
  readonly televisionMinutes: number;
  readonly watchesWithoutRuntime: number;
}

/**
 * Whether this library entry has ever been watched — the test behind *films watched* and
 * *shows watched*.
 *
 * **Watched, not finished.** *Shows completed*, in the same statement, says how many shows
 * are *finished*; these two say how many titles you have watched anything of, which is the
 * question that one does not answer. An abandoned film you saw half of is counted here, and
 * that is deliberate: you watched it, and abandoning it did not undo that.
 *
 * A correlated `exists` rather than a join, because a join to `watch` would repeat each
 * library entry once per watch and so multiply every count in this statement — the point
 * being that one row per entry is what makes all four figures countable together.
 */
const HAS_A_WATCH: SQL = sql`exists (
  select 1 from ${watch} w where w.library_entry_id = ${libraryEntry.id}
)`;

/** Titles, films watched, shows watched and shows completed — one row, and four of You's
 *  six figures.
 *
 *  It carried two more columns until issue #249: `episodesRemaining`, summed off
 *  `library_entry_remaining`, and `titlesWithoutReleaseYear`. Both existed for the Stats
 *  page — the decade distribution named the second — and both went with it rather than
 *  being left computed for nobody, taking the `library_entry_remaining` join with them.
 *  A column nothing reads is a cost paid on every visit to `/you` and a claim about the
 *  data that no test can go wrong. */
async function libraryTotals(userId: UserId, executor: Executor) {
  const [row] = await executor
    .select({
      titles: sql<number>`count(*)`.mapWith(Number),
      filmsWatched: sql<number>`count(*) filter (
        where ${title.kind} = 'film' and ${HAS_A_WATCH}
      )`.mapWith(Number),
      showsWatched: sql<number>`count(*) filter (
        where ${title.kind} = 'show' and ${HAS_A_WATCH}
      )`.mapWith(Number),
      /**
       * **Shows completed** — issue #247's one new figure, and the only count here that
       * is about *finishing* rather than about having watched anything.
       *
       * It is a `filter` on this statement rather than a count grouped by state, because
       * a grouped count cannot tell a finished film from a finished show, and the figure
       * You reports is per kind. The state itself is still read off `library_entry_state`
       * rather than restated — *finished* is ADR-0001's rule and `db/views.ts` is its one
       * home, so this asks the view the question instead of re-deriving `in_production`
       * and *every season-one-and-above episode watched* in a second place.
       */
      showsCompleted: sql<number>`count(*) filter (
        where ${title.kind} = 'show' and ${libraryEntryState.state} = 'finished'
      )`.mapWith(Number),
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    /**
     * One row per library entry, so nothing here can be double-counted the way a join to
     * `watch` would double-count it — which is the reason `HAS_A_WATCH` is a correlated
     * `exists` and this is not. `left`, not `inner`: the view is total over
     * `library_entry` today, and an inner join would silently drop an entry from *every*
     * figure in this statement on the day it stopped being.
     */
    .leftJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .where(ownedBy(userId, libraryEntry));

  return row;
}

/**
 * Everything read off the `watch` table itself: how many episode watches there are, how
 * many watches carry no date, and the two runtime sums with the count they are short by.
 *
 * ── The runtime a watch carries depends on what it is a watch of ─────────────────────
 *
 * A film's watch carries no episode, so its runtime is `title.runtime_mins`; an episode's
 * is `episode.runtime_mins`. The `case` below asks that question explicitly rather than
 * `coalesce`-ing one onto the other — `title.runtime_mins` is *films only* today
 * (`db/tables.ts`), so a coalesce would work by accident and would start counting a show's
 * runtime for an episode with none the day that column meant anything for shows.
 */
async function watchTotals(userId: UserId, executor: Executor) {
  const runtimeOfThisWatch = sql`case
    when ${watch.episodeId} is null then ${title.runtimeMins}
    else ${episode.runtimeMins}
  end`;

  const [row] = await executor
    .select({
      episodesWatched: sql<number>`count(*) filter (
        where ${watch.episodeId} is not null
      )`.mapWith(Number),
      undatedWatches: sql<number>`count(*) filter (
        where ${watch.watchedAt} is null
      )`.mapWith(Number),
      filmMinutes: sql<number>`coalesce(sum(${title.runtimeMins}) filter (
        where ${watch.episodeId} is null
      ), 0)`.mapWith(Number),
      televisionMinutes: sql<number>`coalesce(sum(${episode.runtimeMins}) filter (
        where ${watch.episodeId} is not null
      ), 0)`.mapWith(Number),
      watchesWithoutRuntime: sql<number>`count(*) filter (
        where ${runtimeOfThisWatch} is null
      )`.mapWith(Number),
    })
    .from(watch)
    .innerJoin(title, eq(title.id, watch.titleId))
    .leftJoin(episode, eq(episode.id, watch.episodeId))
    .where(ownedBy(userId, watch));

  return row;
}

/**
 * ── You's six figures ────────────────────────────────────────────────────────────────
 *
 * Issue #247. One read, `accountFigures`, and it is the whole of what `/you` puts on the
 * glass.
 *
 * ── Why this was never a projection of `accountStats` ────────────────────────────────
 *
 * You was not a smaller Stats. The read that fed `/stats` made eight statements to answer
 * nine kinds of question — a streak, an activity window, two averages, the decades, the
 * recently finished. You asks for six figures that describe a watching life, and **not one
 * of them turns on a date**, so five of those eight statements would have been work the
 * page never renders. This makes two.
 *
 * That the two reads overlapped was not a reason to share a function, and issue #249 is
 * where that call paid: `/stats` went, and this read did not have to be untangled from
 * anything on the way. The six statements that only Stats made went with it; the two this
 * one makes stayed exactly where they were.
 *
 * ── What it does not carry, and why that is the point ────────────────────────────────
 *
 * No streak, no averages, no activity. Those are the figures that made Stats a report
 * rather than a page about the reader, and #245 removed them from the direction rather
 * than moving them.
 */
export interface AccountFigures {
  /** Every title in the library. You's empty branch turns on this and nothing else, for
   *  the reason the retired Stats page turned on it too: an account with nothing in it
   *  has a real `0` for all six figures, and printing them is a page that looks like it is
   *  reporting when there is nothing to report. */
  readonly titles: number;
  /** Films with at least one watch — *watched anything of*, not *finished*. */
  readonly filmsWatched: number;
  /** Shows with at least one watch, on the same reading. */
  readonly showsWatched: number;
  /**
   * Shows in the derived `finished` state — issue #247's new figure, and the one that
   * makes *finishing* legible beside *starting*. Films are excluded by the count itself
   * rather than by the caller: `finished` is a state a film reaches on its first watch,
   * so a per-kind filter is the only thing that keeps this from being *titles finished*.
   */
  readonly showsCompleted: number;
  /** Watches carrying an episode — rewatches and specials included. */
  readonly episodesWatched: number;
  /** Split, never summed. `CONTEXT.md`'s glossary reports film and television separately
   *  and the page prints them that way. */
  readonly watchTime: WatchTime;
  /** Watches with no date. You's qualification line names this, **without** claiming the
   *  watches are left out: no figure above turns on a date, and the glossary is explicit
   *  that a watch with no date still counts. */
  readonly undatedWatches: number;
}

/**
 * Everything `/you` prints, in one object.
 *
 * Two statements, in sequence rather than concurrently: they share the one executor their
 * caller passed, which inside a transaction is one connection.
 *
 * **No `try`, here or anywhere below it.** A failed read throws past the page into
 * `app/(signed-in)/you/error.tsx`, which draws the inline read-failure treatment and a
 * reference id. On a page made entirely of numbers that is the discipline that matters
 * most: every failure has a plausible-looking zero waiting for it, and `AGENTS.md` opens
 * on why `tvtracker` is the cautionary tale.
 */
export async function accountFigures(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<AccountFigures> {
  const totals = await libraryTotals(userId, executor);
  const watches = await watchTotals(userId, executor);

  return {
    titles: totals.titles,
    filmsWatched: totals.filmsWatched,
    showsWatched: totals.showsWatched,
    showsCompleted: totals.showsCompleted,
    episodesWatched: watches.episodesWatched,
    watchTime: {
      filmMinutes: watches.filmMinutes,
      televisionMinutes: watches.televisionMinutes,
      watchesWithoutRuntime: watches.watchesWithoutRuntime,
    },
    undatedWatches: watches.undatedWatches,
  };
}
