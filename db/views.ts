import { sql } from "drizzle-orm";
import { pgView, smallint, text, uuid } from "drizzle-orm/pg-core";

/**
 * Where a title stands, how far into it you are, and what is after that — as three real
 * Postgres views, and nowhere else.
 *
 * ── Why these are views and not helpers ──────────────────────────────────────────────
 *
 * `tvtracker` kept `watched_through`, `watched_count` and `watch_status` as columns.
 * ADR-0001 killed all three, and the point of that ruling is not tidiness: a stored copy
 * of derived state is a second answer that can disagree with the watches, and it goes
 * stale silently. There is no column here for one to hide in, and putting the rules in a
 * TypeScript helper would only move the hiding place — two callers, two answers, no diff.
 *
 * So the definition lives in the database, once. Changing a rule later is a migration
 * with a diff on it, which is what makes a change to *what finished means* reviewable.
 *
 * ── The rules are ADR-0001's, verbatim ───────────────────────────────────────────────
 *
 * Everything below is transcribed from that ADR's *Derivation rules*, not re-derived from
 * CONTEXT.md's glossary. Two rules run through all three views:
 *
 *  - **A released episode is `season_no > 0 AND air_date IS NOT NULL AND air_date <=
 *    current_date`.** A null air date is not released; a future one is not released.
 *  - **Specials (`season_no = 0`) are mirrored and markable, and excluded from every
 *    derived state.** TMDB's season 0 is trailers, recaps and promotional clips. Without
 *    the exclusion, *finished* would quietly come to mean "has no promotional clips" and
 *    a dozen shows would never reach it.
 *
 * `current_date` is the server's, not the reader's — which is the ADR's rule as written.
 * The user's IANA zone governs *day and year boundaries* (streak, year in review); an air
 * date is a `date` with no time in it, and a released-yesterday-or-tomorrow edge measured
 * in hours is not a distinction the data supports.
 *
 * ── What these views do not do ───────────────────────────────────────────────────────
 *
 * They do not filter by account. Each carries `user_id` so that the choke point in
 * `db/access.ts` can — `ownedBy(userId, libraryEntryState)` — and an unscoped read of one
 * of these is the same mistake as an unscoped read of `library_entry` itself.
 *
 * ── One thing to know before adding a fourth ─────────────────────────────────────────
 *
 * **drizzle-kit emits `CREATE VIEW` in alphabetical order, not declaration order.**
 * `library_entry_up_next` selects from `library_entry_progress`, and it only works
 * because *p* sorts before *u*. A new view that depends on one alphabetically after it
 * would generate a migration that fails on the first run — loudly, and in CI rather than
 * in production, but read the generated SQL rather than assuming the order held.
 */

/**
 * The five states, one row per library entry, evaluated in ADR-0001's order — **the first
 * match wins**, and the order is the rule.
 *
 * | State | Rule |
 * |---|---|
 * | **Abandoned** | `abandoned_at IS NOT NULL` |
 * | **Watchlist** | no watches |
 * | **Finished** | a film with a watch; or a show where every `season_no > 0` episode has a watch **and** `in_production = false` |
 * | **Caught up** | a show where every *released* `season_no > 0` episode has a watch |
 * | **Watching** | a show with watches for some but not all released episodes |
 *
 * **Abandoned is first deliberately**, and outranks every derived state: a re-run import
 * can add watches to an abandoned title without clearing it, so a title whose watches say
 * *watching* is still abandoned until you say otherwise.
 *
 * Two consequences worth naming, because both look like bugs and neither is:
 *
 *  - **A finished show that returns falls back to caught up on its own**, with no extra
 *    machinery. A new unreleased episode appears, so "every episode has a watch" stops
 *    being true; `in_production` flips, so the second half stops being true too. Either
 *    one alone is enough.
 *  - **A show with no released episodes at all**, watched or not, reads as *caught up*
 *    rather than *watching* — "every released episode has a watch" is vacuously true over
 *    an empty set. That is the rule as written, and it is the right answer for the case
 *    it actually describes: a show whose next season has not started airing.
 *
 * The film branch is reached only after *watchlist* has ruled out having no watches, so
 * "a film with a watch" needs no watch test of its own.
 */
export const libraryEntryState = pgView("library_entry_state", {
  libraryEntryId: uuid("library_entry_id").notNull(),
  userId: text("user_id").notNull(),
  titleId: uuid("title_id").notNull(),
  /** One of `abandoned`, `watchlist`, `finished`, `caught_up`, `watching`. */
  state: text("state").notNull(),
}).as(sql`
  select
    le.id as library_entry_id,
    le.user_id as user_id,
    le.title_id as title_id,
    case
      when le.abandoned_at is not null then 'abandoned'
      when not exists (
        select 1 from watch w where w.library_entry_id = le.id
      ) then 'watchlist'
      when t.kind = 'film' then 'finished'
      when t.in_production = false and not exists (
        select 1
        from episode e
        where e.title_id = le.title_id
          and e.season_no > 0
          and not exists (
            select 1 from watch w
            where w.library_entry_id = le.id and w.episode_id = e.id
          )
      ) then 'finished'
      when not exists (
        select 1
        from episode e
        where e.title_id = le.title_id
          and e.season_no > 0
          and e.air_date is not null
          and e.air_date <= current_date
          and not exists (
            select 1 from watch w
            where w.library_entry_id = le.id and w.episode_id = e.id
          )
      ) then 'caught_up'
      else 'watching'
    end as state
  from library_entry le
  join title t on t.id = le.title_id
`);

/**
 * Progress: the episode with the greatest `(season_no, episode_no)` among `season_no > 0`
 * episodes that have a watch.
 *
 * **A high-water mark, not a count.** Skipping an episode passes it permanently —
 * MediaSafe never sends you backwards — so this is a `DISTINCT ON` over a descending
 * order and not `max()` over a contiguous run.
 *
 * **Undated watches count normally.** Progress is derived from *what* you watched, not
 * when, so an imported watch with no date moves it exactly as a live one does.
 *
 * A library entry with no watches on a numbered episode has no row here at all — a film's
 * entry included, since a film's watch carries no episode. Absence is the answer, not a
 * null.
 */
export const libraryEntryProgress = pgView("library_entry_progress", {
  libraryEntryId: uuid("library_entry_id").notNull(),
  userId: text("user_id").notNull(),
  titleId: uuid("title_id").notNull(),
  episodeId: uuid("episode_id").notNull(),
  seasonNo: smallint("season_no").notNull(),
  episodeNo: smallint("episode_no").notNull(),
}).as(sql`
  select distinct on (le.id)
    le.id as library_entry_id,
    le.user_id as user_id,
    le.title_id as title_id,
    e.id as episode_id,
    e.season_no as season_no,
    e.episode_no as episode_no
  from library_entry le
  join watch w on w.library_entry_id = le.id
  join episode e on e.id = w.episode_id
  where e.season_no > 0
  order by le.id, e.season_no desc, e.episode_no desc
`);

/**
 * Up next: the episode immediately after your progress, in the same `(season_no,
 * episode_no)` ordering.
 *
 * Built on `library_entry_progress` rather than repeating its query, so "the episode after
 * it" cannot come to mean something different from "it". `(e.season_no, e.episode_no) >
 * (p.season_no, p.episode_no)` is a row comparison, which is lexicographic — the next
 * episode of this season, or the first of the next one.
 *
 * **No row means nothing is next**, which is the honest answer for a show you have
 * finished and for one whose next episode TMDB has not listed yet. Nothing is invented to
 * fill the gap.
 *
 * Specials are excluded, as everywhere. Unreleased episodes are **not**: up next is a
 * position in the show, and the ADR's rule puts no air-date filter on it. What a surface
 * chooses to show is that surface's decision, made against `episode.air_date`, which is
 * right here.
 */
export const libraryEntryUpNext = pgView("library_entry_up_next", {
  libraryEntryId: uuid("library_entry_id").notNull(),
  userId: text("user_id").notNull(),
  titleId: uuid("title_id").notNull(),
  episodeId: uuid("episode_id").notNull(),
  seasonNo: smallint("season_no").notNull(),
  episodeNo: smallint("episode_no").notNull(),
}).as(sql`
  select
    p.library_entry_id as library_entry_id,
    p.user_id as user_id,
    p.title_id as title_id,
    n.id as episode_id,
    n.season_no as season_no,
    n.episode_no as episode_no
  from library_entry_progress p
  join lateral (
    select e.id, e.season_no, e.episode_no
    from episode e
    where e.title_id = p.title_id
      and e.season_no > 0
      and (e.season_no, e.episode_no) > (p.season_no, p.episode_no)
    order by e.season_no, e.episode_no
    limit 1
  ) n on true
`);
