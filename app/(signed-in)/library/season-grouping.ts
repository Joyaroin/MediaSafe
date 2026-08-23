/**
 * How an episode list becomes seasons, and what a season is called — the two pieces of
 * shaping that title detail does to a flat, ordered list of episodes.
 *
 * Extracted for issue #148, which adds the second surface that has to do it: the page for
 * a title you do not own renders the same seasons under the same headings, minus every
 * control. Written once for the reason `programme-note-section.ts` gives its own string —
 * two copies of *what season 0 is called* is two places for one of them to start saying
 * `Season 0`, and a season's name is not a thing two components get to answer separately.
 *
 * Both are pure and take no owned fact: they are shape, not state, which is what lets the
 * owned surface (`programme-note-episodes.tsx`, whose rows carry `watched` and `upNext`)
 * and the unowned one (`titles/[kind]/[tmdbId]/unowned-episodes.tsx`, whose rows carry
 * neither) share them without either type learning about the other.
 */

/** The episodes both surfaces read arrive from `db/access.ts` already ordered
 *  `(season_no, episode_no)`, so a `Map`'s insertion order *is* the season order for every
 *  real season — nothing here re-sorts those, and nothing here may start to. Season 0 is
 *  the one exception: issue #216 moves it after the highest-numbered real season on
 *  screen, so once every episode is grouped, a re-`set` of key `0` (if present) relocates
 *  it to the end of the `Map`'s iteration order without touching any other season's
 *  position or the database order those seasons keep. */
export function groupBySeason<T extends { readonly seasonNo: number }>(
  episodes: readonly T[],
): readonly (readonly [number, T[]])[] {
  const bySeason = new Map<number, T[]>();
  for (const one of episodes) {
    const inSeason = bySeason.get(one.seasonNo);
    if (inSeason) inSeason.push(one);
    else bySeason.set(one.seasonNo, [one]);
  }
  const specials = bySeason.get(0);
  if (specials !== undefined) {
    bySeason.delete(0);
    bySeason.set(0, specials);
  }
  return [...bySeason.entries()];
}

/** Season 0 is *Specials* on screen and in an episode's spoken-out name alike — a reader
 *  hearing `Season 0` from a screen reader while the heading above says `Specials` is the
 *  same word having two answers. */
export function seasonHeading(seasonNo: number): string {
  return seasonNo === 0 ? "Specials" : `Season ${seasonNo}`;
}

/**
 * An episode named the way it is spoken — `CONTEXT.md`: an episode is never referred to
 * by number alone. The season word comes from `seasonHeading` above, the same function
 * that writes the heading the episode is grouped under, so `Specials` is `Specials` in
 * both places. `null` is TMDB not having named it yet, and is not a licence to print the
 * number a second time in its place.
 *
 * It sits beside `seasonHeading` rather than in the component that draws the row, and
 * issue #196 is what made that worth doing: the *watched up to here* control carries no
 * text at all, so its accessible label is the only thing that says which episode it acts
 * through — and a second copy of this is how the label and the row it sits on would come
 * to name the same episode two different ways.
 *
 * Structurally typed on the three fields it reads, so `UnownedEpisodeDetail` satisfies it
 * as well as `EpisodeDetail` — the borrowed list has the same rule and no owned fact to
 * offer this function even if it wanted one.
 */
export function episodeFullName(episode: {
  readonly seasonNo: number;
  readonly episodeNo: number;
  readonly name: string | null;
}): string {
  const name = episode.name === null ? "Not yet named" : episode.name;
  return `${seasonHeading(episode.seasonNo)}, Episode ${episode.episodeNo} — ${name}`;
}
