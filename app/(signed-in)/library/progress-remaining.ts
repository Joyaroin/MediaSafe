import type { EpisodeDetail } from "@/db/access";

/**
 * How far through **one season** you are — the title hero's *1 of 8 · Season 1* (Charcoal
 * §8.6), read from the same `episodes` `getTitleDetail` already hands the page rather than
 * a second query.
 *
 * The season is the one the next episode is in; with nothing next (caught up or finished),
 * the last regular season. Specials are never that season: they are mirrored and
 * markable, and they are not part of *caught up* or *finished* (`library_entry_remaining`
 * in `db/views.ts` leaves them out for the same reason). Every episode of the season
 * counts, aired or not, so the fraction reads *how much of this season exists that you
 * have not seen*. `null` for a show with no regular episodes, where there is no season to
 * be part way through.
 */
export function seasonWatchProgress(
  episodes: readonly EpisodeDetail[],
  next: EpisodeDetail | null,
): { readonly seasonNo: number; readonly watched: number; readonly total: number } | null {
  const regular = episodes.filter((one) => one.seasonNo > 0);
  if (regular.length === 0) return null;
  const seasonNo =
    next !== null && next.seasonNo > 0
      ? next.seasonNo
      : Math.max(...regular.map((one) => one.seasonNo));

  const season = regular.filter((one) => one.seasonNo === seasonNo);
  return {
    seasonNo,
    watched: season.filter((one) => one.watched).length,
    total: season.length,
  };
}
