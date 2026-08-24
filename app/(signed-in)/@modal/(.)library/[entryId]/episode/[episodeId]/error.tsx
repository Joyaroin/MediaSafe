"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * The episode did not load, **inside the dialog it was going to load into**.
 *
 * ── Why the slot needs a boundary of its own ────────────────────────────────────────
 *
 * Without one, a failed read in this slot throws past it to `app/error.tsx` and replaces
 * the whole application with a failure — including the page the reader was looking at,
 * which did not fail and which they never left. That is `AGENTS.md`'s blast-radius table
 * read backwards: one region failed to load, and the treatment is inline, replacing that
 * region. The region here is the dialog's body.
 *
 * `layout.tsx` beside this file is what makes *inline* possible at all: Next wraps a
 * segment's error boundary in that segment's layout, so the dialog, its backdrop, its
 * focus trap and its close control are all still there around this. A boundary without
 * that layout would render a bare failure into the page's flow with no way out of it.
 *
 * ── What reaches this, and what deliberately does not ───────────────────────────────
 *
 * The mirrored read (`cachedTitleDetail`) throws into this: an entry that is not in this
 * account's library, or a database that is down. **An episode this show does not have does
 * not** — `episode-detail-body.tsx` answers that with `notFound()`, because a URL naming no
 * episode is a read that succeeded and found nothing. A failed **synopsis** does not reach
 * here either: it is caught into an `Outcome` (`live-facts.ts`) and rendered as one
 * section's inline failure.
 *
 * The full page's own `error.tsx` says all of this for the surface a direct load lands on.
 * Both exist because both surfaces exist; neither is the other's fallback.
 */
export default function InterceptedEpisodeReadFailure({
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
