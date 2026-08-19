/**
 * How an episode list becomes seasons, and what a season is called — the two pieces of
 * shaping that title detail does to a flat, ordered list of episodes.
 *
 * Extracted for issue #148, which adds the second surface that has to do it: the page for
 * a title you do not own renders the same seasons under the same headings, minus every
 * control. Written once for the reason `programme-note-section.ts` gives its own string —
 * two copies of *what season 0 is called* is two places for one of them to start saying
 * `Season 0`, and the Named Episode Rule (`CONTEXT.md`) is not a rule two components get
 * to hold separately.
 *
 * Both are pure and take no owned fact: they are shape, not state, which is what lets the
 * owned surface (`programme-note-episodes.tsx`, whose rows carry `watched` and `upNext`)
 * and the unowned one (`titles/[kind]/[tmdbId]/unowned-episodes.tsx`, whose rows carry
 * neither) share them without either type learning about the other.
 */

/** The episodes both surfaces read arrive from `db/access.ts` already ordered
 *  `(season_no, episode_no)`, so a `Map`'s insertion order *is* the season order —
 *  nothing here re-sorts, and nothing here may start to. */
export function groupBySeason<T extends { readonly seasonNo: number }>(
  episodes: readonly T[],
): readonly (readonly [number, T[]])[] {
  const bySeason = new Map<number, T[]>();
  for (const one of episodes) {
    const inSeason = bySeason.get(one.seasonNo);
    if (inSeason) inSeason.push(one);
    else bySeason.set(one.seasonNo, [one]);
  }
  return [...bySeason.entries()];
}

/** Season 0 is *Specials* on screen and in an episode's spoken-out name alike — a reader
 *  hearing `Season 0` from a screen reader while the heading above says `Specials` is the
 *  same word having two answers. */
export function seasonHeading(seasonNo: number): string {
  return seasonNo === 0 ? "Specials" : `Season ${seasonNo}`;
}
