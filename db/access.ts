import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { user } from "@/auth-schema";

import { type Executor, getDb } from "./client";
import { DEFAULT_LIBRARY_SORT, type LibrarySort } from "./library-sort";
import { episode, libraryEntry, title, watch } from "./tables";
import {
  libraryEntryRemaining,
  libraryEntryState,
  libraryEntryUpNext,
} from "./views";
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
 * It is a constant rather than three string literals because three functions now have to
 * agree on it and the disagreement would be silent: `recordWatch` writes it, `undoWatch`
 * refuses to delete anything else, and `getTitleDetail` decides from it whether a row can
 * offer an undo at all. A typo in the second of those does not throw — it quietly deletes
 * an imported watch, which is the one outcome issue #89 exists to prevent.
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
export interface UndoWatchParams {
  readonly libraryEntryId: string;
  /** `null` for a film; a real `episode.id` for a show. */
  readonly episodeId: string | null;
}

/**
 * What is left afterwards — read back from the table, never assumed by the caller.
 *
 * `watched` and `undoable` are exactly what `getTitleDetail` reports for the same
 * episode, so the row a browser is holding can be corrected from a returned outcome
 * instead of guessing. The guess it would otherwise make is wrong in both of the cases
 * this function exists for: an imported watch underneath still leaves the episode
 * watched, and undoing a rewatch leaves an app watch to undo again.
 */
export interface UndoWatchOutcome {
  /** Whether a watch was actually removed. `false` when there was none of ours to take. */
  readonly removed: boolean;
  /** Whether any watch of this episode survives — imported, or an earlier app one. */
  readonly watched: boolean;
  /** Whether an app watch survives, so undo can be offered again. */
  readonly undoable: boolean;
}

/**
 * Take back one watch — issue #89, and the only function in this module that removes one.
 *
 * ── Exactly one row, and only ever one of ours ────────────────────────────────────────
 *
 * A rewatch is a second `watch` row (`CONTEXT.md`, ADR-0001), so "undo" cannot mean
 * *unwatch this episode*: it means **remove the most recent watch this account recorded
 * through the app**, leaving anything underneath it standing. That is one `DELETE` of one
 * id, resolved by the `SELECT … LIMIT 1` above it, and not a `DELETE` with a `LIMIT` this
 * dialect does not have.
 *
 * **`source = 'app'` is stated on both statements.** The `SELECT` narrows to a row this
 * application wrote; the `DELETE` then refuses to remove anything else even if handed an
 * id that is not one. That is not redundancy for its own sake — it is the one predicate
 * whose loss is silent. A `DELETE` by primary key alone is correct exactly as long as the
 * query above it stays correct, and `tests/watch-undo.test.ts` asserts the survival of a
 * `'tvtracker'` row directly rather than reading either query and believing it.
 *
 * The reason that matters is not symmetry with `recordWatch`. `SPEC.md` §7's 19,391
 * imported watches were reconstructed once from an archive that no longer has a live
 * source: they are not editable from the application at all, and an episode whose only
 * watch is imported has no undo to offer (`getTitleDetail`'s `undoable` is what says so
 * before a reader ever gets a control to press). If an imported watch is wrong, that is a
 * conversion problem with a committed archive behind it — not a button.
 *
 * ── "Most recent" is when it was recorded ─────────────────────────────────────────────
 *
 * `created_at desc` first, because the sentence is *the most recent one this account
 * **recorded***, and `created_at` is the only column that means that. `watched_at` breaks
 * a tie and `id` breaks the tie after it, so the statement is total — two app watches
 * written in the same transaction are otherwise indistinguishable by either timestamp,
 * `now()` being the transaction's own clock. Which of two identical facts goes is not a
 * property worth having an opinion about; *that the choice is deterministic* is.
 *
 * ── Nothing else moves ────────────────────────────────────────────────────────────────
 *
 * No derived state is written, because there is none to write (`db/views.ts`). And
 * `abandoned_at` is **not** touched in either direction: `recordWatch` clears it because
 * `CONTEXT.md` says watching something again clears it, and there is no matching rule
 * saying taking a watch back gives up on a title. Undoing a mis-tap is a correction to
 * the record, not a decision about the title.
 *
 * ── One transaction ───────────────────────────────────────────────────────────────────
 *
 * The delete and the read-back of what survives must agree on the same row set, so both
 * run on the same connection — nested as a savepoint when `executor` already is one,
 * exactly as `recordWatch` relies on.
 *
 * ── Authorization ─────────────────────────────────────────────────────────────────────
 *
 * `ownedBy(userId, libraryEntry)` combined with the entry id, and a miss throws — the
 * same treatment `recordWatch` gives a tampered or stale id. `ownedBy(userId, watch)` is
 * then stated on the watch statements too rather than trusted to follow from the entry:
 * this is a delete, and the two predicates cost one index lookup between them.
 */
export async function undoWatch(
  userId: UserId,
  params: UndoWatchParams,
  executor: Executor = getDb(),
): Promise<UndoWatchOutcome> {
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

    const ours = and(
      ownedBy(userId, watch),
      eq(watch.libraryEntryId, params.libraryEntryId),
      onThisEpisode,
    );

    const [target] = await tx
      .select({ id: watch.id })
      .from(watch)
      .where(and(ours, eq(watch.source, APP_WATCH_SOURCE)))
      .orderBy(desc(watch.createdAt), desc(watch.watchedAt), desc(watch.id))
      .limit(1);

    const removedRows =
      target === undefined
        ? []
        : await tx
            .delete(watch)
            .where(and(eq(watch.id, target.id), eq(watch.source, APP_WATCH_SOURCE)))
            .returning({ id: watch.id });

    const surviving = await tx
      .select({ source: watch.source })
      .from(watch)
      .where(ours);

    return {
      removed: removedRows.length > 0,
      watched: surviving.length > 0,
      undoable: surviving.some((one) => one.source === APP_WATCH_SOURCE),
    };
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
 * How many entries one fetch of the deck returns.
 *
 * `SPEC.md` §11.4 left the number open as a build-time call — #25 dissolved the *cap*
 * question into a *fetch* question and deliberately picked no figure. This is that call,
 * and it is a fetch size and not a cap: `DESIGN.md` forbids a numeric bound on the phone
 * deck ("Don't … put a numeric cap on the phone deck, or a 'showing 10 of 62' line"), and
 * the desktop row is bounded by the viewport instead. Twenty is one screen's worth of
 * deck with room to work down before the next fetch, against a real library whose
 * *watching* set is 284 titles.
 *
 * Exported for the tests, which have to page past it to prove that paging is stable. No
 * surface has any use for it: a page carries its own cursor, so a caller pages by asking
 * whether there is one rather than by counting to twenty.
 */
export const UP_NEXT_PAGE_SIZE = 20;

/**
 * One entry of the deck: a title, and the episode of it you are up to.
 *
 * ── Why the season and episode numbers are here, and not on `LibraryEntryRow` ────────
 *
 * `UpNext` above deliberately carries no numbers, because the library cell has no place
 * to print them and a surface holding them would be one keystroke from breaking *episodes
 * are named, never numbered alone*. The Up next card is the opposite case: `DESIGN.md`
 * sets the number **beside** the name as a dim code line — "S3 E4" over "Sweet Vitriol" —
 * on both the desktop row and the phone deck, so withholding them here would force a
 * surface to fetch them somewhere else.
 *
 * `episodeName` is still `null` where TMDB has not named the episode. That is the honest
 * answer and it stays the surface's problem: the rule the surfaces follow is that they
 * never *degrade* to the number, and nothing this read could invent would help them keep
 * it.
 *
 * There is no remainder here, and no count of anything. The remainder is a sort key
 * below, not a fact either card prints — `DESIGN.md`'s Up next card is a plate, a code
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
  /** Borrowed. */
  readonly posterPath: string | null;
  readonly episodeId: string;
  /** Borrowed, and `null` where TMDB has not named the episode. */
  readonly episodeName: string | null;
  readonly seasonNo: number;
  readonly episodeNo: number;
}

/**
 * Where the last page stopped — the whole sort key of its final entry, and nothing else.
 *
 * **Keyset, not an offset**, because the deck reorders under its own reader: marking the
 * top card watched makes that title the most recent watch, which moves it to the head of
 * the order. Against `OFFSET 20` every such write shifts the rows underneath it, so page
 * two repeats whatever slid down across the boundary. A cursor made of the sort key
 * itself asks for *everything after this entry, in this order*, which stays a truthful
 * question after the deck has moved.
 *
 * **What that buys is exactly one guarantee: no entry is served twice.** It does not, and
 * no cursor could, catch an entry that moves the other way — a title below the cursor
 * that gains a watch jumps to the head of the order, ahead of a point page two only looks
 * past, and so is not on page two. It is not lost: it is the first thing the next fetch
 * from the start returns, which is what a surface does after recording a watch. Paging
 * over a set that reorders under you can promise no duplicates or no misses, not both,
 * and a deck you work down is served by the first.
 *
 * It is opaque to surfaces: a page hands back whatever it was given and never reads a
 * field of it. Tampering with one can only reorder the tamperer's own deck — the account
 * scope is `ownedBy`, never the cursor.
 */
export interface UpNextCursor {
  /** 0 recency, 1 the air-date fallback, 2 nothing to date it by. */
  readonly rank: number;
  /** The timestamp that rank sorts by, as Postgres prints it. */
  readonly sortAt: string;
  readonly remaining: number;
  /** The title's name, lower-cased — the same expression the order uses. */
  readonly name: string;
  readonly libraryEntryId: string;
}

/** One fetch of the deck. **No total**, and there is nowhere for one to be added. */
export interface UpNextPage {
  readonly entries: readonly UpNextEntry[];
  /** `null` means this was the last page — not that the deck is empty. */
  readonly nextCursor: UpNextCursor | null;
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
 * to the bottom of its own sort. Neither reaches this deck: it holds *watching* shows,
 * every one of which has a `library_entry_remaining` row with at least one released
 * unwatched episode counted in it. So the tiebreak is a plain ascending `remaining`, and
 * the two are not one expression written twice — they are one rule applied to two sets.
 *
 * ── The last two terms are not in `SPEC.md`, and are not optional ───────────────────
 *
 * `lower(name)` and the entry id are the total order underneath the rule. §7's own
 * *"every sort breaks ties by Title A–Z"* covers the first; the second is what makes
 * *two identical loads give an identical order* true of two entries that share a name,
 * and what lets a cursor name one row rather than a group of them.
 */
interface UpNextOrder {
  readonly rank: SQL;
  readonly at: SQL;
  readonly remaining: PgColumn;
  readonly name: SQL;
  readonly entry: PgColumn;
  /**
   * The five terms above as the `ORDER BY` itself, with their directions — the same shape
   * `orderByFor` returns for the library's four sorts.
   *
   * It is a member rather than something `listUpNext` assembles, because the sequence and
   * the directions *are* half of the rule: `afterCursor` has to walk the same five terms
   * in the same order, and a query that listed them itself would be a second place for
   * that sequence to be written down and a second place for it to drift.
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

  return {
    rank,
    at,
    remaining,
    name,
    entry,
    orderBy: [rank, sql`${at} desc`, remaining, name, entry],
  };
}

/**
 * *Everything after this entry, in this order* — the five order terms as one predicate,
 * written as the flat sum of their prefixes.
 *
 * Each line is one term: equal on everything before it, and strictly past it on that one.
 * Postgres's row constructor would say the same thing in a line, but only for an order
 * that ascends throughout, and this one descends on `at`. Spelling the cascade out keeps
 * it checkable against the `ORDER BY` line for line, which is the property worth having
 * in the one place a paging bug would show up as a missing card rather than an error.
 */
function afterCursor(order: UpNextOrder, cursor: UpNextCursor): SQL {
  const rank = sql`${cursor.rank}`;
  const at = sql`${cursor.sortAt}::timestamptz`;
  const remaining = sql`${cursor.remaining}`;
  const name = sql`${cursor.name}`;
  const entry = sql`${cursor.libraryEntryId}::uuid`;

  return sql`(
    ${order.rank} > ${rank}
    or (${order.rank} = ${rank} and ${order.at} < ${at})
    or (${order.rank} = ${rank} and ${order.at} = ${at}
        and ${order.remaining} > ${remaining})
    or (${order.rank} = ${rank} and ${order.at} = ${at}
        and ${order.remaining} = ${remaining} and ${order.name} > ${name})
    or (${order.rank} = ${rank} and ${order.at} = ${at}
        and ${order.remaining} = ${remaining} and ${order.name} = ${name}
        and ${order.entry} > ${entry})
  )`;
}

/**
 * One fetch of Up next — **the one definition of what is next**, so the phone deck and
 * the desktop TONIGHT row cannot disagree about which titles are on it or in what order.
 *
 * `library_entry_up_next` has known *which episode* since build step 2. Which titles, in
 * what order, has never existed anywhere until here, and it exists here once: `upNextOrder`
 * above is the only place `SPEC.md` §7's rule is written down, and both surfaces read it
 * through this function.
 *
 * ── The deck's membership, which is one predicate ────────────────────────────────────
 *
 * `state = 'watching'` and nothing else. A caught-up show's next episode has not aired,
 * and offering it is offering something that does not exist yet; abandoned outranks every
 * derived state, so an abandoned title stays out whatever its watches say; a watchlist
 * title has no watches, so `library_entry_up_next` has no row for it and the inner join
 * removes it without being asked. Finished is out on both counts. That is the same set
 * Library's *Watching* chip holds, which is what `DESIGN.md` needs to be true when it
 * says the desktop row's remainder lives one click below behind that chip.
 *
 * There is deliberately **no air-date filter on the next episode**. `library_entry_state`
 * has already ruled out the case where nothing has aired, and §7's rule expects an unaired
 * or undated next episode to be *ordered* — that is what ranks 1 and 2 are for. Filtering
 * here would make half of the rule unreachable.
 *
 * The one place the deck is a strict subset of the chip: a show whose progress has passed
 * every mirrored episode — you skipped one and watched the last — is *watching* with
 * nothing after it, so `library_entry_up_next` has no row and there is no card to draw.
 *
 * ── The title's most recent watch, joined rather than correlated ─────────────────────
 *
 * A rewatch is a second `watch` row (`CONTEXT.md`), so joining `watch` into the deck
 * directly would multiply an entry by its watches. `last_watch` groups them first. It is
 * scoped by `ownedBy` too — the join is on the entry, so it could not read across accounts
 * either way, but an unscoped read of an owned table is the one habit this module exists
 * to not have.
 *
 * ── One extra row, and no count ──────────────────────────────────────────────────────
 *
 * The query asks for `UP_NEXT_PAGE_SIZE + 1` and returns at most `UP_NEXT_PAGE_SIZE`. The
 * row that does not fit is not data — it is the whole of what the page knows about what
 * comes after it, and it is spent on deciding whether `nextCursor` is null. No `count(*)`
 * is issued and no total is returned, because §7 gives the phone deck no numeric cap and
 * `DESIGN.md` forbids the "showing 10 of 62" line a total invites: a number nothing can
 * render is a number nothing can render wrong.
 *
 * ── There is no `try` here ───────────────────────────────────────────────────────────
 *
 * A failed read throws, and the Up next surfaces' own error boundaries catch it
 * (`AGENTS.md`). An empty deck — everything caught up, or a library not yet imported — is
 * a real state and arrives as an empty `entries` with a null cursor, which is reachable
 * only from a query that succeeded.
 */
export async function listUpNext(
  userId: UserId,
  cursor: UpNextCursor | null = null,
  executor: Executor = getDb(),
): Promise<UpNextPage> {
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

  const rows = await executor
    .select({
      libraryEntryId: libraryEntry.id,
      titleId: title.id,
      titleName: title.name,
      posterPath: title.posterPath,
      episodeId: libraryEntryUpNext.episodeId,
      episodeName: episode.name,
      seasonNo: libraryEntryUpNext.seasonNo,
      episodeNo: libraryEntryUpNext.episodeNo,
      remaining: libraryEntryRemaining.remaining,
      rank: sql<number>`${order.rank}`.as("sort_rank"),
      /**
       * Postgres's own rendering of the timestamp, so that the value a cursor carries and
       * the value it is compared against are the same one. Handing back whatever a driver
       * happened to parse it into would put a second date format in the loop.
       */
      sortAt: sql<string>`${order.at}::text`.as("sort_at"),
      sortName: sql<string>`${order.name}`.as("sort_name"),
    })
    .from(libraryEntry)
    .innerJoin(title, eq(title.id, libraryEntry.titleId))
    .innerJoin(libraryEntryState, eq(libraryEntryState.libraryEntryId, libraryEntry.id))
    .innerJoin(libraryEntryUpNext, eq(libraryEntryUpNext.libraryEntryId, libraryEntry.id))
    .innerJoin(episode, eq(episode.id, libraryEntryUpNext.episodeId))
    .innerJoin(
      libraryEntryRemaining,
      eq(libraryEntryRemaining.libraryEntryId, libraryEntry.id),
    )
    .leftJoin(lastWatch, eq(lastWatch.libraryEntryId, libraryEntry.id))
    .where(
      and(
        ownedBy(userId, libraryEntry),
        /**
         * `satisfies`, not a bare string: `state` is a `text` column, so a typo here
         * would be an empty deck rather than an error — silent, on the one predicate
         * that decides what the deck contains.
         */
        eq(libraryEntryState.state, "watching" satisfies LibraryState),
        cursor === null ? undefined : afterCursor(order, cursor),
      ),
    )
    .orderBy(...order.orderBy)
    .limit(UP_NEXT_PAGE_SIZE + 1);

  const more = rows.length > UP_NEXT_PAGE_SIZE;
  const page = more ? rows.slice(0, UP_NEXT_PAGE_SIZE) : rows;

  let nextCursor: UpNextCursor | null = null;
  if (more) {
    const last = page.at(-1);
    if (last === undefined) {
      /**
       * Unreachable: `more` means the query returned more rows than a page holds, so the
       * page sliced out of them has a last row. It throws rather than falling through to
       * a null cursor, because the fallthrough is a deck that silently ends early — which
       * is the shape of failure this whole read exists to not have.
       */
      throw new Error("A full page of Up next has no last entry to page from.");
    }
    nextCursor = {
      rank: last.rank,
      sortAt: last.sortAt,
      remaining: last.remaining,
      name: last.sortName,
      libraryEntryId: last.libraryEntryId,
    };
  }

  return {
    entries: page.map((row) => ({
      libraryEntryId: row.libraryEntryId,
      titleId: row.titleId,
      titleName: row.titleName,
      posterPath: row.posterPath,
      episodeId: row.episodeId,
      episodeName: row.episodeName,
      seasonNo: row.seasonNo,
      episodeNo: row.episodeNo,
    })),
    nextCursor,
  };
}

/** One row of a season/episode list — issue #58's title detail. */
export interface EpisodeDetail {
  readonly id: string;
  /** 0 = specials — mirrored and markable, and shown here like any other season. */
  readonly seasonNo: number;
  readonly episodeNo: number;
  /** `null` where TMDB has not named it. Never falls back to a bare number. */
  readonly name: string | null;
  readonly watched: boolean;
  /**
   * Whether one of this episode's watches is one the application recorded — `source =
   * 'app'`, never an import's.
   *
   * Named for the question the surface asks rather than for the column behind it, the
   * same way `upNext` above is: it is the *only* question anything asks of the source,
   * and issue #89's rule is that an episode whose watches are all imported offers no undo
   * at all. A watched episode with `undoable: false` is one somebody reconstructed from
   * an archive, and this application is not the editor of it.
   */
  readonly undoable: boolean;
  /** This is `library_entry_up_next`'s episode, if it has one. */
  readonly upNext: boolean;
}

/** Everything title detail shows that is mirrored — nothing fetched live is in here. */
export interface TitleDetailRow {
  readonly libraryEntryId: string;
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  /** Films only; `null` for shows. */
  readonly runtimeMins: number | null;
  readonly state: LibraryState;
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
    .select({ episodeId: watch.episodeId, source: watch.source })
    .from(watch)
    .where(eq(watch.libraryEntryId, libraryEntryId));
  // A film's watch carries no episode; only a show reaches this far with rows at all.
  const watchedEpisodeIds = new Set(
    watchedRows.map((one) => one.episodeId).filter((id) => id !== null),
  );
  /**
   * The same rows, narrowed to the ones this application wrote — issue #89's undo. It is
   * a second `Set` over one query rather than a second query for the same reason the
   * first one is a `Set` at all: a rewatch is two rows against one episode, and the
   * question here is only ever *is there one of ours*.
   */
  const undoableEpisodeIds = new Set(
    watchedRows
      .filter((one) => one.source === APP_WATCH_SOURCE)
      .map((one) => one.episodeId)
      .filter((id) => id !== null),
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
    kind: kindFrom(row.kind),
    tmdbId: row.tmdbId,
    name: row.name,
    releaseYear: row.releaseYear,
    posterPath: row.posterPath,
    runtimeMins: row.runtimeMins,
    state: stateFrom(row.state),
    episodes: episodeRows.map((one) => ({
      id: one.id,
      seasonNo: one.seasonNo,
      episodeNo: one.episodeNo,
      name: one.name,
      watched: watchedEpisodeIds.has(one.id),
      undoable: undoableEpisodeIds.has(one.id),
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
