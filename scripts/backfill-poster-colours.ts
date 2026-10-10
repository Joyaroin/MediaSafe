import process from "node:process";

import {
  fillPosterColours,
  POSTER_COLOUR_CAP,
} from "@/app/api/cron/nightly-sweep/fill-poster-colours";
import { extractPosterColour } from "@/tmdb/poster-image";

/**
 * `npx tsx --env-file=.env scripts/backfill-poster-colours.ts` — colour every title that
 * has a poster and no colour, now, instead of at the next nightly sweep (issue #361).
 *
 * **Not a second writer.** It loops the sweep's own `fillPosterColours` until a pass
 * colours nothing, so there is one idea of what a poster's colour is and one place that
 * writes it. Deployed environments do not need it — the sweep runs the same fill every
 * night, and the first run after the column lands is the whole backfill — so it is for a
 * local database, or for not waiting.
 *
 * Safe to re-run, for the fill's reasons: it asks only for what is missing, and writes
 * only against the poster it fetched. A poster that will not fetch is reported and left;
 * the loop stops when a pass makes no progress rather than retrying it for ever.
 *
 * It writes and does not bust caches: `revalidateTag` needs the Next server, which this
 * is not. A cached read shows the colour once a write or its own key moves.
 */
async function backfill(): Promise<void> {
  let coloured = 0;
  let failed = 0;

  for (;;) {
    const outcome = await fillPosterColours(extractPosterColour, { cap: POSTER_COLOUR_CAP });
    coloured += outcome.filled.length;
    failed = outcome.failures.length;
    for (const { candidate, error } of outcome.failures) {
      console.error(`[backfill-poster-colours] ${candidate.kind} ${candidate.tmdbId}:`, error);
    }
    if (outcome.filled.length === 0) break;
  }

  console.log(`[backfill-poster-colours] ${coloured} coloured · ${failed} could not be read`);
  if (failed > 0) process.exitCode = 1;
}

backfill().catch((error: unknown) => {
  console.error("[backfill-poster-colours] failed.");
  console.error(error);
  process.exitCode = 1;
});
