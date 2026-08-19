import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "@/auth-schema";

/**
 * MediaSafe's six tables, whole, in one migration (ADR-0001, SPEC.md §5).
 *
 * The ADR's `Schema` section is normative — "the source of truth is the Drizzle schema,
 * and these are the migrations it must generate" — so this file is that SQL, spelled in
 * Drizzle. Read the ADR for why; this file only says what.
 *
 * `list` and `list_membership` are here even though lists are not in v1. An empty table
 * costs nothing and one migration is cheaper than two.
 *
 * ── The two splits that shape everything below ───────────────────────────────────────
 *
 * **Borrowed is global; owned is not.** `title` and `episode` are one row per TMDB id,
 * shared by every account, with no `user_id` at all — a Title is "a film or a show as it
 * exists in the world" (CONTEXT.md), which is not a per-user fact. So `ON DELETE CASCADE`
 * to `user.id` applies to the owned four only, and deleting an account never empties the
 * database.
 *
 * **Ownership is a column, held true by the database.** Every owned row carries
 * `user_id`, and `watch` carries `title_id` besides. Both are denormalised, deliberately,
 * and neither can drift: a composite foreign key makes the disagreeing row unsatisfiable
 * rather than reviewable.
 */

/**
 * A film or a show as it exists in the world. Every column here is borrowed from TMDB and
 * replaceable by a refresh; MediaSafe owns none of it.
 */
export const title = pgTable(
  "title",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    /**
     * The one handle on this title that survives TMDB forgetting its own id.
     *
     * `imdb:tt0944947` or `tvdb:121361` — IMDb where TMDB has one, TVDB otherwise, and
     * the source is written into the value because the only thing that will ever read
     * this column has to hand it back to TMDB's `/find/{id}?external_source=` and cannot
     * guess which source it is. One column and one fact, not two columns; the `CHECK`
     * below is what keeps the two spellings from becoming three.
     *
     * **Nullable on purpose, and null on every row today.** TMDB publishes no successor
     * id — a deleted or merged title answers 404 with error code 6 and nothing else — so
     * a title that vanishes upstream can only be re-found by something that is not its
     * TMDB id. The nightly sweep fills this in as it refreshes each title, which is why
     * there is no backfill migration: the sweep is the mechanism, and a second writer
     * would be a second definition of what a mirrored title contains.
     *
     * Nothing reads it yet. It lands early because a title that vanishes before its
     * first refresh has nothing to be re-found by, and that window closes only by
     * starting it.
     */
    externalId: text("external_id"),
    name: text("name").notNull(),
    releaseYear: smallint("release_year"),
    posterPath: text("poster_path"),
    /** Shows only; NULL for films. `caught up` versus `finished` turns on this column. */
    inProduction: boolean("in_production"),
    /** Films only. */
    runtimeMins: smallint("runtime_mins"),
    metadataRefreshedAt: timestamp("metadata_refreshed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("title_kind_check", sql`${t.kind} in ('film','show')`),
    /**
     * An external id MediaSafe cannot hand back to TMDB is not evidence, it is a string.
     * `tmdb/mirror.ts` already declines to mirror anything that does not match, and its
     * `ExternalId` union is the same rule in the type system; this is that rule held by
     * the database, on a row every account reads. The pairing is `title.kind`'s exactly —
     * a union in the mapping, a `CHECK` here — and `tests/schema-and-derived-state.test.ts`
     * asserts the two halves still agree.
     */
    check(
      "title_external_id_check",
      sql`${t.externalId} ~ '^(imdb:tt[0-9]+|tvdb:[0-9]+)$'`,
    ),
    // TMDB numbers films and shows separately, so the id alone is not unique.
    unique("title_kind_tmdb_id_key").on(t.kind, t.tmdbId),
    // The nightly metadata sweep reads oldest-first.
    index("title_metadata_refreshed_at_idx").on(t.metadataRefreshedAt),
  ],
);

/**
 * One instalment of a show.
 *
 * **The row is keyed by `tmdb_episode_id`; `season_no` and `episode_no` are borrowed
 * attributes, not identity.** When TMDB renumbers a season or inserts a special, the
 * numbers update and every existing watch still points at the episode it always meant.
 * Keying a watch by `(show, season_no, episode_no)` instead would silently repoint
 * history — which is why `watch` references this table's `id`.
 *
 * Season 0 is TMDB's specials: mirrored and markable, and excluded from every derived
 * state (`db/views.ts`).
 */
export const episode = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titleId: uuid("title_id")
      .notNull()
      .references(() => title.id, { onDelete: "cascade" }),
    tmdbEpisodeId: integer("tmdb_episode_id").notNull().unique(),
    /** 0 = specials. */
    seasonNo: smallint("season_no").notNull(),
    episodeNo: smallint("episode_no").notNull(),
    name: text("name"),
    /** NULL where TMDB has not dated it. Never counts as released. */
    airDate: date("air_date"),
    runtimeMins: smallint("runtime_mins"),
  },
  (t) => [
    unique("episode_title_id_season_no_episode_no_key").on(
      t.titleId,
      t.seasonNo,
      t.episodeNo,
    ),
    // Not redundant with the primary key: it is the foreign-key target that ties a
    // watch's episode to the watch's title.
    unique("episode_id_title_id_key").on(t.id, t.titleId),
  ],
);

/**
 * Your relationship with one title — the fact that it is yours, plus everything MediaSafe
 * owns about it and nothing it borrowed.
 *
 * `abandoned_at` is the one exception to "no state is ever stored", because abandonment
 * is the one thing watches cannot express. It is set by hand, cleared by the application
 * write path in the same transaction as a watch insert, and set — never cleared, never
 * updated — by import on entry creation only (ADR-0001, amendment 2).
 */
export const libraryEntry = pgTable(
  "library_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    titleId: uuid("title_id")
      .notNull()
      .references(() => title.id),
    /** A whole number 1-10. One per title, never one per watch. */
    rating: smallint("rating"),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("library_entry_rating_check", sql`${t.rating} between 1 and 10`),
    unique("library_entry_user_id_title_id_key").on(t.userId, t.titleId),
    // Foreign-key target for `list_membership`.
    unique("library_entry_id_user_id_key").on(t.id, t.userId),
    // Foreign-key target for `watch`.
    unique("library_entry_id_user_id_title_id_key").on(t.id, t.userId, t.titleId),
    index("library_entry_user_id_idx").on(t.userId),
  ],
);

/**
 * That you watched one episode, or one film, once. The only thing MediaSafe stores about
 * watching: progress, the five states, rewatches, streaks and stats are all read out of
 * this table and never kept beside it.
 *
 * **Identity comes from where the fact came from**, not from what it says:
 * `UNIQUE (user_id, source, source_key)`. A retried click reuses its UUID and is a no-op;
 * a genuine rewatch mints a new one; an import key is derived from the file, so
 * re-running it is inert. No rule built from `(user, episode, date)` can do all three.
 *
 * `user_id` and `title_id` are both denormalised, and each buys a structural guarantee:
 * `user_id` makes a watch attributed to the wrong account impossible, `title_id` makes a
 * watch of an episode belonging to a different title impossible. Neither can drift from
 * the row it duplicates, because the composite foreign keys below reject the disagreement
 * rather than storing it.
 */
export const watch = pgTable(
  "watch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    libraryEntryId: uuid("library_entry_id").notNull(),
    titleId: uuid("title_id").notNull(),
    /** NULL for films. */
    episodeId: uuid("episode_id"),
    /** NULL = an undated watch: it happened, you do not know when. */
    watchedAt: timestamp("watched_at", { withTimezone: true }),
    /** Where the fact came from — 'app', or an import's own name. */
    source: text("source").notNull(),
    sourceKey: text("source_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Three columns, one key. This is what makes `user_id` and `title_id` guarantees
     * rather than copies, and it is what cascades a watch when its entry is removed —
     * transitively cascading it when the account is deleted, because `library_entry`
     * cascades to `user`.
     */
    foreignKey({
      columns: [t.libraryEntryId, t.userId, t.titleId],
      foreignColumns: [libraryEntry.id, libraryEntry.userId, libraryEntry.titleId],
      name: "watch_library_entry_id_user_id_title_id_fk",
    }).onDelete("cascade"),
    /**
     * **`NO ACTION`, deliberately.** TMDB removing an episode somebody has watched must
     * make the refresh *fail* rather than delete history. A cascade here would make data
     * loss the quiet outcome of an upstream edit.
     *
     * `episode_id` is nullable and this is a MATCH SIMPLE key, so a film's watch — no
     * episode — is unconstrained by it, which is why `kind` on the watch was rejected as
     * redundant: a film watch carrying an episode is already unsatisfiable.
     */
    foreignKey({
      columns: [t.episodeId, t.titleId],
      foreignColumns: [episode.id, episode.titleId],
      name: "watch_episode_id_title_id_fk",
    }),
    unique("watch_user_id_source_source_key_key").on(t.userId, t.source, t.sourceKey),
    index("watch_library_entry_id_idx").on(t.libraryEntryId),
    index("watch_episode_id_idx").on(t.episodeId),
    // Streak and year in review, both of which ignore undated watches entirely.
    index("watch_user_id_watched_at_idx")
      .on(t.userId, t.watchedAt)
      .where(sql`${t.watchedAt} is not null`),
  ],
);

/** A named group of library entries you curate by hand. Not in v1; specified, so built. */
export const list = pgTable(
  "list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("list_user_id_name_key").on(t.userId, t.name),
    // Foreign-key target for `list_membership`.
    unique("list_id_user_id_key").on(t.id, t.userId),
  ],
);

/**
 * That one library entry belongs to one list, at one position.
 *
 * `position` exists because a list is a ranking — "best things I watched in 2025".
 * `UNIQUE (list_id, position)` must therefore be **`DEFERRABLE INITIALLY DEFERRED`**, so
 * a whole reorder commits as one transaction instead of colliding with itself halfway
 * through.
 *
 * **Drizzle cannot express that, and drizzle-kit did not emit it** — verified by reading
 * the generated SQL before committing it. The clause is hand-written into
 * `drizzle/0001_mediasafe_tables_and_views.sql`, which carries the note; a test in
 * `tests/schema-and-derived-state.test.ts` reads `pg_constraint` so that a future
 * regeneration cannot drop it silently.
 */
export const listMembership = pgTable(
  "list_membership",
  {
    listId: uuid("list_id").notNull(),
    libraryEntryId: uuid("library_entry_id").notNull(),
    userId: text("user_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.libraryEntryId] }),
    foreignKey({
      columns: [t.listId, t.userId],
      foreignColumns: [list.id, list.userId],
      name: "list_membership_list_id_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.libraryEntryId, t.userId],
      foreignColumns: [libraryEntry.id, libraryEntry.userId],
      name: "list_membership_library_entry_id_user_id_fk",
    }).onDelete("cascade"),
    unique("list_membership_list_id_position_key").on(t.listId, t.position),
  ],
);
