"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * The episode page did not load — the segment boundary for `[episodeId]`.
 *
 * It exists for the reason `[entryId]/error.tsx` gives for its own: the boundary above
 * would replace a wider surface than the one that failed, telling a reader something went
 * wrong without telling them what. Here that matters more than usual, because the boundary
 * above is the *title's* — a failed episode read would blank the show's whole page, which
 * is a page that did not fail.
 *
 * The back link stays on screen through the failure: it is `layout.tsx`'s, drawn around
 * this, so a route that failed to load is still a route a reader can leave. That is the
 * same promise `[entryId]/error.tsx` keeps, reached by a different means and for the
 * reason `layout.tsx` records.
 *
 * ── What reaches this, and what deliberately does not ───────────────────────────────
 *
 * The mirrored read (`cachedTitleDetail`) throws into this: an entry that is not in this
 * account's library, or a database that is down. **An episode this show does not have does
 * not** — `page.tsx` answers that with `notFound()`, because a URL naming no episode is a
 * read that succeeded and found nothing, and rendering *this did not load* over it would be
 * `AGENTS.md`'s opening rule told backwards.
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
