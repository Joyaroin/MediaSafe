import type { EpisodeDetail } from "@/db/access";
import { plural } from "@/app/(signed-in)/you/figures";
import { episodeFullName } from "./season-grouping";

/**
 * Progress and remaining — the two derived facts about how far into a show a
 * reader has got, read from the same `episodes` `getTitleDetail` already hands the page
 * rather than a second query against `library_entry_progress` / `library_entry_remaining`
 * (`db/views.ts`). Both functions below match those views' own rules exactly, so a number
 * shown here is never a second definition of one already evaluated server-side.
 *
 * **They are never interchangeable** (issue #228's own acceptance
 * criterion): progress is a position — the furthest episode with a watch — and remaining is
 * a count of the episodes that have none. `progressLine` never returns a number and
 * `remainingLine` never returns an episode.
 */

/**
 * The furthest `seasonNo > 0` episode with a watch — a high-water mark, exactly
 * `library_entry_progress`'s own `order by season_no desc, episode_no desc limit 1`. `null`
 * where nothing has been watched yet, which is the honest answer rather than season 0's
 * first episode or any other invented start.
 */
export function progressEpisode(episodes: readonly EpisodeDetail[]): EpisodeDetail | null {
  let furthest: EpisodeDetail | null = null;
  for (const one of episodes) {
    if (one.seasonNo <= 0 || !one.watched) continue;
    if (
      furthest === null ||
      one.seasonNo > furthest.seasonNo ||
      (one.seasonNo === furthest.seasonNo && one.episodeNo > furthest.episodeNo)
    ) {
      furthest = one;
    }
  }
  return furthest;
}

/**
 * `seasonNo > 0` episodes with no watch — `library_entry_remaining`'s own count, read the
 * same way and with the same absence of an air-date filter: remaining is a position in the
 * show TMDB has mirrored, not a promise about what has aired yet.
 */
export function remainingCount(episodes: readonly EpisodeDetail[]): number {
  return episodes.filter((one) => one.seasonNo > 0 && !one.watched).length;
}

/** What the progress line says — the episode itself, named the way it is spoken, or
 *  the honest word for having watched nothing of this show yet. */
export function progressLine(episodes: readonly EpisodeDetail[]): string {
  const episode = progressEpisode(episodes);
  return episode === null ? "Not started" : episodeFullName(episode);
}

/** What the remaining line says — a count, in words, never `0` standing in for anything
 *  other than what it says: every mirrored episode already has a watch. */
export function remainingLine(episodes: readonly EpisodeDetail[]): string {
  return plural(remainingCount(episodes), "episode");
}

/**
 * How far through a show you are, as two numbers — what the progress bar draws and what
 * *"16 of 32 episodes watched"* says.
 *
 * ── The denominator is the same one `remainingCount` uses ───────────────────────────
 *
 * Specials are excluded (`seasonNo > 0`), exactly as they are above and for the settled
 * reason: they are mirrored and markable, and they are not part of *caught up* or
 * *finished*. A bar that counted them would sit short of full on a show you have finished,
 * which is the one thing a progress bar must never do.
 *
 * Unreleased episodes **are** counted, which is deliberate and is the existing behaviour
 * this borrows rather than a new decision: `remainingCount` counts them, so *"Remaining —
 * 12 episodes"* and a bar drawn from a different denominator would disagree on the same
 * screen about the same show. The bar therefore reads *how much of this show exists that
 * you have not seen*, not *how much of what has aired*.
 */
export interface WatchProgress {
  readonly watched: number;
  readonly total: number;
}

export function watchProgress(episodes: readonly EpisodeDetail[]): WatchProgress {
  const counted = episodes.filter((one) => one.seasonNo > 0);

  return {
    watched: counted.filter((one) => one.watched).length,
    total: counted.length,
  };
}
