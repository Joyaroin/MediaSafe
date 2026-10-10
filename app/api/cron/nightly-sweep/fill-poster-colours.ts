import * as Sentry from "@sentry/nextjs";

import {
  titlesWantingPosterColour,
  writePosterColour,
  type Executor,
  type PosterColourCandidate,
} from "@/db/access";

/**
 * Take the poster colour of every title that has a poster and no colour — issue #361.
 *
 * One function, three callers, and it is the only writer of `title.poster_colour`:
 *
 *  - **the nightly sweep** (`route.ts`), after its refresh, over up to `POSTER_COLOUR_CAP`
 *    titles. This is the backfill: the first run after the column lands colours the
 *    library, and every later run picks up whatever an add or a poster change left;
 *  - **the add paths**, behind the response (`after`), for the title just added, so a new
 *    title is coloured by the time anybody opens it;
 *  - **`scripts/backfill-poster-colours.ts`**, by hand, which loops this until nothing is
 *    left — the same function, so the script cannot drift into a second idea of what a
 *    colour is.
 *
 * Re-running is always safe: it asks only for what is missing
 * (`titlesWantingPosterColour`), and a write lands only against the poster it was taken
 * from (`writePosterColour`).
 *
 * ── A failure is recorded, never papered over ────────────────────────────────────────
 *
 * The extractor throws for a poster that will not fetch or decode. That title is left
 * NULL — which every surface already draws as *no tint*, and which is the truth: nobody
 * has a colour for it — and it is reported to Sentry, and tomorrow's sweep tries again.
 * Nothing here substitutes a colour for a failure, and nothing returns an empty result
 * for one: `failures` carries every error to the caller.
 *
 * Like `run-sweep.ts`, this never imports the network itself: `extract` is a parameter,
 * so `tests/poster-colour-fill.test.ts` runs it against real Postgres with a stub.
 */
export async function fillPosterColours(
  extract: ExtractPosterColour,
  scope: { readonly cap: number } | { readonly titleIds: readonly string[] },
  executor?: Executor,
): Promise<PosterColourOutcome> {
  const candidates = await titlesWantingPosterColour(scope, executor);
  const filled: PosterColourCandidate[] = [];
  const failures: PosterColourFailure[] = [];

  for (let start = 0; start < candidates.length; start += CONCURRENCY) {
    await Promise.all(
      candidates.slice(start, start + CONCURRENCY).map(async (candidate) => {
        try {
          const colour = await extract(candidate.posterPath);
          if (await writePosterColour(candidate.id, candidate.posterPath, colour, executor)) {
            filled.push(candidate);
          }
        } catch (error) {
          // Recorded, not swallowed — see the docblock. The title stays NULL, which is
          // already what it was, and `reportFailures` makes the miss visible.
          failures.push({ candidate, error });
        }
      }),
    );
  }

  reportFailures(failures);
  return { candidates: candidates.length, filled, failures };
}

/** `tmdb/poster-image.ts`'s `extractPosterColour`, or a stub under test. */
export type ExtractPosterColour = (posterPath: string) => Promise<string>;

export interface PosterColourFailure {
  readonly candidate: PosterColourCandidate;
  readonly error: unknown;
}

export interface PosterColourOutcome {
  readonly candidates: number;
  /** The titles that now carry a colour — what the caller busts the caches of. */
  readonly filled: readonly PosterColourCandidate[];
  readonly failures: readonly PosterColourFailure[];
}

/**
 * The sweep's bound. A w92 poster is a few kilobytes and a 24×36 decode is a millisecond,
 * so this is a minute or two of a run that may take twenty; and it is more than the whole
 * library (~472 titles), so the first run after the column lands is the whole backfill.
 */
export const POSTER_COLOUR_CAP = 600;

/** A few posters at a time — the image CDN, not the TMDB API, so no rate limit to share. */
const CONCURRENCY = 6;

function reportFailures(failures: readonly PosterColourFailure[]): void {
  for (const { candidate, error } of failures) {
    Sentry.captureException(error, {
      tags: {
        surface: "poster-colour",
        titleId: candidate.id,
        kind: candidate.kind,
        tmdbId: String(candidate.tmdbId),
      },
    });
  }
}
