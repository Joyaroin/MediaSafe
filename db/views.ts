import { sql } from "drizzle-orm";
import { integer, pgView, smallint, text, uuid } from "drizzle-orm/pg-core";

/**
 * Where a title stands, how far into it you are, and what is after that — as three real
 * Postgres views, and nowhere else.
 *
 * ── Why these are views and not helpers ──────────────────────────────────────────────
 *
 * `tvtracker` kept `watched_through`, `watched_count` and `watch_status` as columns.
 * All three are gone, and the point of that ruling is not tidiness: a stored copy
 * of derived state is a second answer that can disagree with the watches, and it goes
 * stale silently. There is no column here for one to hide in, and putting the rules in a
 * TypeScript helper would only move the hiding place — two callers, two answers, no diff.
 *
 * So the definition lives in the database, once. Changing a rule later is a migration
 * with a diff on it, which is what makes a change to *what finished means* reviewable.
 *
 * ── The rules, verbatim ──────────────────────────────────────────────────────────────
 *
 * Everything below is transcribed from the *Derivation rules*, not re-derived from
 * the glossary. Two rules run through all three views:
 *
 *  - **A released episode is `season_no > 0 AND air_date IS NOT NULL AND air_date <=
 *    current_date`.** A null air date is not released; a future one is not released.
 *  - **Specials (`season_no = 0`) are mirrored and markable, and excluded from every
 *    derived state.** TMDB's season 0 is trailers, recaps and promotional clips. Without
 *    the exclusion, *finished* would quietly come to mean "has no promotional clips" and
 *    a dozen shows would never reach it.
 *
 * **`current_date` is the server's, and that is an exception to a rule.** Every day and
 * year boundary is computed `AT TIME ZONE` the user's IANA zone, never UTC.
 * The released test is written as `air_date <= current_date` literally, and it is
 * kept literal here, on the grounds that an air date is a `date` with no time in it —
 * there is no instant to place in a zone, so "released on the 4th" is the whole fact TMDB
 * gives us. The cost, stated rather than hidden: on a UTC server a reader in Auckland
 * sees the day's episode as unreleased for the first ~13 hours of their day. If that ever
 * matters, the fix is to join `user.timezone` here as the streak query does — a change to
 * this view, with a migration and a diff.
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
 * The five states, one row per library entry, evaluated in the settled order — **the first
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
 *
 * ── Three edges where the rule and the glossary read differently ─────────────────────
 *
 * All three are the ADR followed literally, which is what #54 asked for. They are written
 * down because each one is a place a later reader would otherwise assume a bug:
 *
 *  - **`in_production = NULL` on a show reads as *caught up*, never *finished*.** The
 *    rule is `in_production = false`, and `NULL = false` is NULL, so the finished branch
 *    cannot be reached. Caught up is glossed as "a show that is still in
 *    production", which a null is not — but the alternative is treating *unknown* as
 *    *ended*, which would call a show finished on missing data. The mirror should never
 *    produce this: `in_production` is null for films, and every show TMDB returns has it.
 *  - **A show whose watch carries no episode reads as *caught up*** once it has any
 *    watch, because "every released episode has a watch" is vacuously true over a show
 *    with no episodes mirrored. ADR §3 closes the opposite direction only — the
 *    `(episode_id, title_id)` foreign key makes a *film* watch with an episode
 *    unsatisfiable, and nothing makes a *show* watch without one. Build step 4 writes
 *    episode watches for shows; this is what the derivation does if it ever does not.
 *  - **A show with only unreleased episodes, one of them watched, reads as *caught up*.**
 *    Same vacuous truth, and the honest answer for a show whose next season is dated but
 *    not out.
 *
 * ── On the repetition below ──────────────────────────────────────────────────────────
 *
 * The *finished* and *caught up* branches share a `not exists (… not exists (…))` shape
 * and differ only by the released test. That is deliberate: each `when` is a transcription
 * of one row of the table above, and the value of this view is that it can be read against
 * the rules side by side. Factoring the common half out would save six lines and cost the
 * one property the view exists to have.
 */
/**
 * `notNull()` on a view's columns is a claim about the query, not a constraint — Postgres
 * enforces nothing here. Each one below is true by construction: the `case` has an `else`
 * so `state` is total, and every other column comes from a `not null` column reached
 * through an inner join. Changing a view without re-checking its column list is how these
 * would start lying.
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
 * Remaining: how many of a show's mirrored `season_no > 0` episodes carry no watch.
 * **Remaining** is explicit that this is a show concept — "how much of
 * a show you have left" — so a film's entry has no row here at all, which is what makes it
 * the *missing* case in `db/access.ts`'s *closest to finishing* sort rather than a zero.
 *
 * ── Why unreleased episodes count too ────────────────────────────────────────────────
 *
 * Unlike `library_entry_state`, this does **not** filter by `air_date`. *Closest to
 * finishing* ranks how much of the whole series is left to watch, not how much of it you
 * could watch today — a show with three unaired episodes announced is not "finished" in
 * the sense that sort cares about, and counting only released episodes would rank it
 * alongside a show that has genuinely ended. This is also why a *caught up* show — every
 * released episode watched, more still to come — reads as a positive remainder here and
 * not as the zero `#22`'s rule reserves for *finished*.
 *
 * ── Zero is a real answer, not an absent row ─────────────────────────────────────────
 *
 * A finished show's entry is still here, at `0` — the rule is explicit that "0
 * remaining is not missing". The distinction is what lets the sort push *finished* to the
 * bottom deliberately (`case when remaining = 0`) rather than by the accident of `NULLS
 * LAST` also catching every film.
 */
export const libraryEntryRemaining = pgView("library_entry_remaining", {
  libraryEntryId: uuid("library_entry_id").notNull(),
  userId: text("user_id").notNull(),
  titleId: uuid("title_id").notNull(),
  remaining: integer("remaining").notNull(),
}).as(sql`
  select
    le.id as library_entry_id,
    le.user_id as user_id,
    le.title_id as title_id,
    (
      select count(*)::int
      from episode e
      where e.title_id = le.title_id
        and e.season_no > 0
        and not exists (
          select 1 from watch w
          where w.library_entry_id = le.id and w.episode_id = e.id
        )
    ) as remaining
  from library_entry le
  join title t on t.id = le.title_id
  where t.kind = 'show'
`);

/**
 * Release progress: how many of a show's *released* `season_no > 0` episodes carry a
 * watch, and how many are released at all — the two counts issue #324's library card bar
 * is filled from.
 *
 * **Not `library_entry_progress` below, and not `library_entry_remaining` above.**
 * `libraryEntryProgress` is a position — the furthest episode watched. `libraryEntryRemaining`
 * is a count, but it is every unwatched episode, released or not, because *closest to
 * finishing* ranks the whole series. This view answers a third, narrower question — *of
 * what has aired, how much have you seen* — which is the one a bar filled watched-against-
 * released needs and neither of the other two views answers.
 *
 * **Released is transcribed, not imported**, from `library_entry_state`'s own *caught up*
 * branch a few lines up, on the same grounds that docblock gives for repeating it there
 * rather than factoring it out: `season_no > 0 and air_date is not null and air_date <=
 * current_date` is the rule, and each view that needs it writes it out so it can be
 * read directly.
 *
 * A film has no row here at all, same as `library_entry_remaining` and for the same
 * reason — `db/access.ts` reads that absence as *no bar*. A show has a row even when
 * `released` is `0`, which is what lets `db/access.ts` tell *nothing released yet* (a
 * present row, `released = 0`) apart from *a film* (no row).
 */
export const libraryEntryReleaseProgress = pgView("library_entry_release_progress", {
  libraryEntryId: uuid("library_entry_id").notNull(),
  userId: text("user_id").notNull(),
  titleId: uuid("title_id").notNull(),
  watched: integer("watched").notNull(),
  released: integer("released").notNull(),
}).as(sql`
  select
    le.id as library_entry_id,
    le.user_id as user_id,
    le.title_id as title_id,
    (
      select count(*)::int
      from episode e
      where e.title_id = le.title_id
        and e.season_no > 0
        and e.air_date is not null
        and e.air_date <= current_date
        and exists (
          select 1 from watch w
          where w.library_entry_id = le.id and w.episode_id = e.id
        )
    ) as watched,
    (
      select count(*)::int
      from episode e
      where e.title_id = le.title_id
        and e.season_no > 0
        and e.air_date is not null
        and e.air_date <= current_date
    ) as released
  from library_entry le
  join title t on t.id = le.title_id
  where t.kind = 'show'
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
