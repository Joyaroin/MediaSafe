import {
  and,
  asc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
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
 */
async function mirrorTitle(tx: Executor, mirror: TitleMirror): Promise<MirroredTitle> {
  const [mirrored] = await tx
    .insert(title)
    .values({
      kind: mirror.kind,
      tmdbId: mirror.tmdbId,
      externalId: mirror.externalId,
      name: mirror.name,
      releaseYear: mirror.releaseYear,
      posterPath: mirror.posterPath,
      inProduction: mirror.inProduction,
      runtimeMins: mirror.runtimeMins,
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
        posterPath: sql`excluded.poster_path`,
        inProduction: sql`excluded.in_production`,
        runtimeMins: sql`excluded.runtime_mins`,
        metadataRefreshedAt: sql`now()`,
      },
    })
    .returning({ id: title.id });

  if (mirror.episodes.length === 0) {
    return { id: mirrored.id, episodeIds: new Map() };
  }

  const episodes = await tx
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
    })
    .returning({ id: episode.id, tmdbEpisodeId: episode.tmdbEpisodeId });

  return {
    id: mirrored.id,
    episodeIds: new Map(episodes.map((one) => [one.tmdbEpisodeId, one.id])),
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
 * Tier 1 is answered in full — up to `cap` — before tier 2 is asked at all, and tier 2
 * explicitly excludes tier 1's rows rather than merely being asked to sort after them:
 * two `ORDER BY` terms could not express "come first" here, because a tier-1 title's own
 * `metadata_refreshed_at` may well be newer than plenty of tier-2 titles it must still
 * precede. The second query only runs, and only asks for the remainder, when the first
 * did not already fill the cap — the same short-circuit `libraryCatalogueKeys` takes for
 * an empty `keys` array, and for the same reason: no query is the cheapest query.
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

  const tier1Rows = await executor
    .select(columns)
    .from(title)
    .where(and(eq(title.kind, "show"), eq(title.inProduction, true), airedSinceLastRefresh))
    .orderBy(asc(title.metadataRefreshedAt), title.id)
    .limit(cap);

  const tier1 = tier1Rows.map(asSweepCandidate);
  if (tier1.length >= cap) return tier1;

  const tier2Rows = await executor
    .select(columns)
    .from(title)
    .where(
      tier1.length > 0
        ? notInArray(title.id, tier1.map((row) => row.id))
        : undefined,
    )
    .orderBy(asc(title.metadataRefreshedAt), title.id)
    .limit(cap - tier1.length);

  return [...tier1, ...tier2Rows.map(asSweepCandidate)];
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
 */
export async function addTitleToLibrary(
  userId: UserId,
  mirror: TitleMirror,
  executor: Executor = getDb(),
): Promise<AddOutcome> {
  return executor.transaction(async (tx) => {
    const mirrored = await mirrorTitle(tx, mirror);

    const created = await tx
      .insert(libraryEntry)
      .values({ userId, titleId: mirrored.id })
      .onConflictDoNothing({ target: [libraryEntry.userId, libraryEntry.titleId] })
      .returning({ id: libraryEntry.id });

    return { added: created.length > 0 };
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
 * There is no remainder here, and no count of anything. The remainder is a sort key
 * below, not a fact either card prints — `DESIGN.md`'s Up next card is a poster, a code
 * line, a title, an episode name and a control, and the wireframe's "▓▓▓░ 12" meter did
 * not survive into it.
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

/** One row of the shared read: everything any Up next rail renders. */
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
        .where(and(ownedBy(userId, libraryEntry), where))
        .orderBy(...order.orderBy);

      return limit === null ? await query : await query.limit(limit);
    },
  };
}

/** The shared read's row as the entry every surface is handed. */
function upNextEntry(row: UpNextRow): UpNextEntry {
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
export interface UpNextRails {
  readonly ongoing: readonly UpNextEntry[];
  readonly comingBack: readonly UpNextEntry[];
  readonly oldFriends: readonly UpNextEntry[];
}

export async function listUpNextRails(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<UpNextRails> {
  const read = upNextRead(userId, executor);

  /**
   * Two independent reads, overlapped rather than stacked: neither takes the other's
   * rows. `Promise.all` rejects on the first rejection, so a failure still reaches the
   * caller's boundary exactly as it did in series.
   *
   * On the pool this checks out two connections instead of reusing one, which on a cold
   * process is two WebSocket handshakes rather than one. It is still the shorter wall
   * clock — the handshakes overlap too — and it is a trade of connection count for
   * latency, made knowingly. Passed a transaction, node-postgres queues both on that one
   * connection, so this is correct there and merely no faster.
   */
  const [watching, comingBack] = await Promise.all([
    read.rows(WATCHING, null),
    read.rows(COMING_BACK, null),
  ]);

  return {
    ongoing: watching.slice(0, ONGOING_RAIL_SIZE).map(upNextEntry),
    comingBack: comingBack.map(upNextEntry),
    oldFriends: watching.slice(ONGOING_RAIL_SIZE).map(upNextEntry),
  };
}

/**
 * One entry of the phone's WATCHLIST or ABANDONED group (issue #138) — a poster, a name
 * and a year, the same three facts a rail tile carries and nothing `upNextRead` above
 * would even have: neither state has an episode after it worth pointing at, so there is
 * no `library_entry_up_next` row to join for either — and, for a watchlist film, never
 * could be (`UpNextRow`'s own note on why a film has no such row). Joining that view
 * anyway would silently drop every watchlist and abandoned film off both groups.
 */
export interface LibraryStateGroupEntry {
  readonly libraryEntryId: string;
  readonly titleId: string;
  readonly titleName: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
}

/**
 * **WATCHLIST and ABANDONED's membership: `library_entry_state`, filtered to one state.**
 *
 * Reused by both — `state` is the one thing they differ on — rather than two near-copies
 * of the same three-table join. Ordered Title A–Z, `orderByFor`'s own default tiebreak
 * (`db/library-sort.ts`'s vocabulary does not reach this reader, so the expression is
 * repeated rather than imported): neither group has a §7 order of its own to inherit, and
 * a filter-and-slice screen showing up to two hundred titles needs a stable one more than
 * it needs a chosen one.
 */
async function listByState(
  userId: UserId,
  state: LibraryState,
  executor: Executor,
): Promise<readonly LibraryStateGroupEntry[]> {
  return executor
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
    .where(and(ownedBy(userId, libraryEntry), eq(libraryEntryState.state, state)))
    .orderBy(sql`lower(${title.name})`, libraryEntry.id);
}

/** The phone home's WATCHLIST group, and the screen `more ›` on it opens. */
export async function listWatchlist(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<readonly LibraryStateGroupEntry[]> {
  return listByState(userId, "watchlist", executor);
}

/** The phone home's ABANDONED group, and the screen `more ›` on it opens. */
export async function listAbandoned(
  userId: UserId,
  executor: Executor = getDb(),
): Promise<readonly LibraryStateGroupEntry[]> {
  return listByState(userId, "abandoned", executor);
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
    })
    .from(episode)
    .where(eq(episode.titleId, row.titleId))
    .orderBy(episode.seasonNo, episode.episodeNo);

  return {
    libraryEntryId: row.libraryEntryId,
    titleId: row.titleId,
    kind: kindFrom(row.kind),
    tmdbId: row.tmdbId,
    name: row.name,
    releaseYear: row.releaseYear,
    posterPath: row.posterPath,
    runtimeMins: row.runtimeMins,
    state: stateFrom(row.state),
    rating: row.rating,
    episodes: episodeRows.map((one) => ({
      id: one.id,
      seasonNo: one.seasonNo,
      episodeNo: one.episodeNo,
      name: one.name,
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
 */
export async function getUnownedTitleDetail(
  kind: TitleKind,
  tmdbId: number,
  executor: Executor = getDb(),
): Promise<UnownedTitleDetailRow> {
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

  if (!row) {
    throw new Error(`No ${kind} with TMDB id ${tmdbId} is mirrored.`);
  }

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

    const created = await tx
      .insert(listMembership)
      .values(
        missing.map((titleId, index) => ({
          listId,
          titleId,
          userId,
          position: next + index,
        })),
      )
      .returning({ position: listMembership.position });

    return { added: created.length };
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
