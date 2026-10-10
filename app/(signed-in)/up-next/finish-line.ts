import type { QueuedEpisode, UpNextEntry } from "@/db/access";

/**
 * What a card says while it holds after a mark — issue #367's finish moment.
 *
 * Marking the last aired episode of a season is the one press that finishes something, so
 * the hold (`up-next-card.tsx`'s `HOLD_MS`) says so in place of *Watched*. It is a line of
 * copy and nothing more: no route, sheet or overlay. A pure function of the facts the read
 * carries, so the whole rule is a table `tests/finish-line.test.ts` can state.
 */
export const WATCHED = "Watched";

export interface FinishFacts {
  readonly seasonNo: number;
  /** The mark recorded the last aired episode of its season. */
  readonly lastEpisode: boolean;
  /** An episode TMDB lists later in the same season has not aired yet. */
  readonly seasonAiring: boolean;
  /**
   * The series has ended (`title.in_production` is false) **and** nothing follows this
   * episode — a finished show's mid-run finale is a season done, not the show.
   */
  readonly seriesEnded: boolean;
}

export function finishLine(facts: FinishFacts): string {
  if (!facts.lastEpisode) return WATCHED;
  if (facts.seriesEnded) return "That's the show";
  if (facts.seasonAiring) return "All caught up";
  return `Season ${facts.seasonNo} done`;
}

/** The facts for one queued episode of one entry. */
export function finishFactsFor(
  entry: Pick<UpNextEntry, "inProduction">,
  episode: QueuedEpisode,
): FinishFacts {
  return {
    seasonNo: episode.seasonNo,
    lastEpisode: episode.lastAiredInSeason,
    seasonAiring: episode.seasonAiring,
    seriesEnded: entry.inProduction === false && episode.lastOfShow,
  };
}

/** Whether marking this episode is a finish moment — the line and the haptic go together. */
export function finishesSomething(
  entry: Pick<UpNextEntry, "inProduction">,
  episode: QueuedEpisode,
): boolean {
  return finishLine(finishFactsFor(entry, episode)) !== WATCHED;
}
