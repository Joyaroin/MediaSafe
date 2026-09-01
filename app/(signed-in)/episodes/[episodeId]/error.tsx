"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * The episode page did not load — the segment boundary for `[episodeId]`.
 *
 * It exists for the reason `library/[entryId]/error.tsx` gives for its own: the boundary
 * above would replace a wider surface than the one that failed, telling a reader something
 * went wrong without telling them what. That was sharper still while this route lived
 * under `[entryId]` — the boundary above was the *title's*, so a failed episode read
 * blanked the show's whole page, which is a page that did not fail. Issue #289 moves the
 * route out from under it and the reasoning survives the move: the boundary above is now
 * `app/error.tsx`, which is the whole application.
 *
 * The back link stays on screen through the failure: it is `layout.tsx`'s, drawn around
 * this, so a route that failed to load is still a route a reader can leave. That is the
 * same promise `[entryId]/error.tsx` keeps, reached by a different means and for the
 * reason `layout.tsx` records.
 *
 * ── What reaches this, and what deliberately does not ───────────────────────────────
 *
 * A database that is down throws into this — either of the route's two reads, the entry
 * resolution or the mirrored detail. **An episode this account cannot reach does not**:
 * `libraryEntryIdForEpisode` answers `null` for an episode of a title the reader has not
 * added and for an id naming nothing at all, and the body turns both into `notFound()`,
 * because a URL naming no episode is a read that succeeded and found nothing and rendering
 * *this did not load* over it would be `AGENTS.md`'s opening rule told backwards.
 *
 * A failed **synopsis** does not reach here either, and that is the ticket's own criterion:
 * it is caught into an `Outcome` (`live-facts.ts`) and rendered as one section's inline
 * failure, so the still, the name, the date and the marks are all untouched by it.
 */
export default function EpisodeReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <div className="px-6 py-5">
      <ReadFailure reference={reference} retry={retry} />
    </div>
  );
}
