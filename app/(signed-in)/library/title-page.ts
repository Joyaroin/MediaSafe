import type { EpisodeDetail, LibraryState } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";
import { seasonHeading } from "./season-grouping";

/**
 * The title page's rules — issue #357 — as functions of what the page already holds.
 *
 * One title page serves a title you own and one you do not. What changes between them is
 * what the reader is offered, and that is decided here, once, so the page renders these
 * answers rather than restating the rules in its markup.
 */

/** The one main button a title page carries, or none. */
export type PrimaryAction =
  | { readonly kind: "add"; readonly label: "Add" }
  | { readonly kind: "mark-episode"; readonly label: string; readonly episode: EpisodeDetail }
  | { readonly kind: "mark-film"; readonly label: "Mark watched" }
  | { readonly kind: "rewatch-film"; readonly label: "Watch again" }
  | { readonly kind: "none" };

/**
 * The likely next thing to do with this title.
 *
 * - Not in the library: add it.
 * - A show with an episode to watch: mark that episode — even one given up on, because
 *   watching it again is what clears giving up.
 * - A show with nothing left to watch: no main button; the status says *Caught up* or
 *   *Finished* instead.
 * - A film: mark it watched, or once it has been, record another watch.
 */
export function titlePrimaryAction(title: {
  readonly owned: boolean;
  readonly kind: TitleKind;
  readonly state: LibraryState | null;
  readonly nextEpisode: EpisodeDetail | null;
}): PrimaryAction {
  if (!title.owned) return { kind: "add", label: "Add" };

  if (title.kind === "film") {
    return title.state === "finished"
      ? { kind: "rewatch-film", label: "Watch again" }
      : { kind: "mark-film", label: "Mark watched" };
  }

  if (title.nextEpisode === null) return { kind: "none" };

  return {
    kind: "mark-episode",
    label: `Mark ${shortEpisodeCode(title.nextEpisode.seasonNo, title.nextEpisode.episodeNo)} watched`,
    episode: title.nextEpisode,
  };
}

/**
 * *S1 E2* — the title page's button names its episode the way Charcoal §8.6 writes it,
 * unpadded and without the dot, because the button shares a `390px` row with two `48px`
 * squares and *Mark S01 · E02 watched* broke onto two lines there. The specials keep their
 * word (`seasonHeading`): *Specials E3*. Tonight's cards still read `episodeCode`.
 */
function shortEpisodeCode(seasonNo: number, episodeNo: number): string {
  return seasonNo === 0 ? `${seasonHeading(0)} E${episodeNo}` : `S${seasonNo} E${episodeNo}`;
}

/** Season, then episode — the order a show is watched in. */
function inOrder(a: EpisodeDetail, b: EpisodeDetail): number {
  return a.seasonNo - b.seasonNo || a.episodeNo - b.episodeNo;
}

function isAfter(one: EpisodeDetail, other: EpisodeDetail): boolean {
  return inOrder(one, other) > 0;
}

/** Aired on or before `today` — an episode with no date has not aired as far as we know. */
function hasAired(one: EpisodeDetail, today: string): boolean {
  return one.airDate !== null && one.airDate <= today;
}

/**
 * The episode the main button offers: the first aired, unwatched regular episode after the
 * furthest one watched. A gap behind the furthest watched episode is not where the reader
 * is, so it is skipped rather than offered; specials are never offered.
 *
 * `today` is the reader's calendar day (`YYYY-MM-DD`), handed down by the page, so the
 * answer does not depend on the clock of whichever machine renders it.
 */
export function nextToWatch(
  episodes: readonly EpisodeDetail[],
  today: string,
): EpisodeDetail | null {
  const regular = episodes.filter((one) => one.seasonNo > 0).sort(inOrder);

  let furthest: EpisodeDetail | null = null;
  for (const one of regular) {
    if (one.watched) furthest = one;
  }

  const candidate = regular.find(
    (one) => !one.watched && (furthest === null || isAfter(one, furthest)),
  );

  return candidate !== undefined && hasAired(candidate, today) ? candidate : null;
}

/**
 * What *Mark season watched* records for `seasonNo`: every aired, unwatched regular
 * episode up to and including the season's last aired one — earlier seasons' gaps
 * included, because it is the same write as marking up to that episode, and the confirm
 * step says how many it will record. `null` when there is nothing to record: the season is
 * watched, has not aired, or is the specials.
 */
export function seasonMarkTarget(
  episodes: readonly EpisodeDetail[],
  seasonNo: number,
  today: string,
): { readonly through: EpisodeDetail; readonly covered: readonly EpisodeDetail[] } | null {
  if (seasonNo <= 0) return null;

  const regular = episodes.filter((one) => one.seasonNo > 0).sort(inOrder);
  const aired = regular.filter((one) => one.seasonNo === seasonNo && hasAired(one, today));
  const through = aired.at(-1);
  if (through === undefined) return null;

  const covered = regular.filter((one) => !one.watched && !isAfter(one, through));
  const seasonHasWork = covered.some((one) => one.seasonNo === seasonNo);

  return seasonHasWork ? { through, covered } : null;
}

/** The regular seasons whose every episode is watched — the ones whose chip carries a tick. */
export function finishedSeasons(episodes: readonly EpisodeDetail[]): ReadonlySet<number> {
  const unfinished = new Set<number>();
  const seen = new Set<number>();

  for (const one of episodes) {
    if (one.seasonNo <= 0) continue;
    seen.add(one.seasonNo);
    if (!one.watched) unfinished.add(one.seasonNo);
  }

  return new Set([...seen].filter((seasonNo) => !unfinished.has(seasonNo)));
}
