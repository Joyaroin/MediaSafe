import { groupBySeason } from "./season-grouping";

/**
 * Where one episode sits in its show's run, and what is either side of it — the rule
 * behind *previous* and *next* on the episode page (issue #253).
 *
 * Pure, and beside `season-grouping.ts` rather than inside the route, for the reason that
 * file gives for its own two functions: this is **shape, not state**. It takes no owned
 * fact, reads no `watched` and no `upNext`, and so can be driven from a plain list in
 * `tests/episode-run.test.ts` with no React, no database and no browser.
 *
 * ── The order is the one on the glass, not the one in the table ──────────────────────
 *
 * `getTitleDetail` orders episodes `(season_no, episode_no)`, which puts **season 0
 * first**, because that is what Postgres does with a zero. Every surface that draws a
 * season list shows specials **last** — issue #216 moved them there, and `groupBySeason`
 * is the one function that expresses it.
 *
 * So this walks `groupBySeason`'s output rather than the array it was handed. Walking the
 * database order instead would make *previous* from a show's first episode land on its
 * last special — a control that sends the reader somewhere the season list they came from
 * has never drawn above it. The acceptance criterion is *previous and next move between
 * episodes without returning to the show*, and a reader who cannot predict where next
 * goes has been returned to the show in every sense but the URL's.
 *
 * That it re-uses `groupBySeason` rather than restating *specials last* is the point.
 * There is one answer to what order a show's episodes are in, and the day it changes,
 * this changes with it.
 *
 * ── Specials are in the run, and are not skipped ─────────────────────────────────────
 *
 * They are mirrored, they are markable, and they have a page each — `db/tables.ts`:
 * *season 0 is TMDB's specials: mirrored and markable*. What specials are excluded from
 * is **derived state** (`db/views.ts`) and the *watched up to here* set (`mark-up-to.ts`),
 * both of which are about what a watch means. Walking past one here would be a third,
 * different rule, and it would strand the special's own page with a *previous* nothing
 * could arrive from.
 *
 * ── Structurally typed, and generic in the row ───────────────────────────────────────
 *
 * The same treatment `groupBySeason` and `episodeFullName` take. This reads an `id` and a
 * `seasonNo` and nothing else, so it works over `EpisodeDetail` and would work over the
 * unowned list too. Returning `T` rather than the interface it was constrained to is what
 * lets the caller keep every field it started with — the page needs the neighbour's name
 * to label a control with it.
 */
/**
 * Where one episode's page lives — written once, because a link built by hand in two
 * places is two routes the day one of them is renamed.
 *
 * ── Its own surface, carrying one id — issue #289 ────────────────────────────────────
 *
 * It was `/library/{entryId}/episode/{episodeId}` until then, and #253 argued for the
 * nesting: there is no entry id for a title you have not added, so *an unowned title has
 * no episode page* was a property of the URL's shape rather than a check somebody had to
 * remember.
 *
 * The nesting is gone and the property is not. **Two ids in a path can disagree** — an
 * entry from one account beside an episode of another title is an address anybody can
 * type — and the answer to that was a check inside the page. One id cannot contradict
 * itself, so the entry is resolved *from* the episode instead
 * (`libraryEntryIdForEpisode`), scoped by the same `ownedBy` every other read in
 * `db/access.ts` is scoped by. An episode of a title you do not hold resolves to nothing
 * and the route is a 404, which is what it always was.
 *
 * ── Keyed by the episode's id ────────────────────────────────────────────────────────
 *
 * The **episode's id**, not its season and episode numbers, for the reason `db/tables.ts`
 * gives for keying the row that way: *`season_no` and `episode_no` are borrowed
 * attributes, not identity*, and TMDB renumbers seasons and inserts specials. A URL built
 * on the numbers would silently come to name a different episode after a sweep — a
 * bookmark that still resolves and is now about something else, which is worse than one
 * that 404s. `tmdb/catalogue.ts`'s `episodeSynopsis` is the one place the numbers are
 * unavoidable, because TMDB's own API accepts nothing else, and it reads them off the row
 * this id resolves to.
 */
export function episodePath(episodeId: string): string {
  return `/episodes/${episodeId}`;
}

export interface EpisodeInRun<T> {
  readonly episode: T;
  /** The episode before this one in the order above, or `null` at the front of the run. */
  readonly previous: T | null;
  /** The episode after it, or `null` at the end. */
  readonly next: T | null;
}

/**
 * `episodes` is the whole show's list as `getTitleDetail` hands it over; `episodeId` is
 * the one the route names.
 *
 * `null` — rather than a throw or a partial answer — when no episode in the list has that
 * id. That is the honest shape for the case it covers: a URL naming an episode of a
 * *different* show, or one this show no longer has because a sweep repointed it. The
 * caller turns it into a 404, which is what a route with no such episode beneath it is;
 * throwing would render the read-failure treatment, and *this did not load* would be a
 * lie about a read that succeeded and found nothing (`SPEC.md` §3.2, and the whole of
 * `AGENTS.md`'s first rule pointed the other way round).
 */
export function locateEpisode<T extends { readonly id: string; readonly seasonNo: number }>(
  episodes: readonly T[],
  episodeId: string,
): EpisodeInRun<T> | null {
  const run = groupBySeason(episodes).flatMap(([, inSeason]) => inSeason);
  const at = run.findIndex((one) => one.id === episodeId);
  if (at === -1) return null;

  return {
    episode: run[at],
    previous: at > 0 ? run[at - 1] : null,
    next: at < run.length - 1 ? run[at + 1] : null,
  };
}
