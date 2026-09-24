"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * The route-level boundary. Every read in the application throws into this.
 *
 * It is shipped now, with almost nothing to catch, because build step 1 says
 * so and the reasoning is arithmetic: retrofitting the error discipline means auditing
 * every read in the app, and the number of reads only goes up. Today it is one.
 *
 * ── The reference id ───────────────────────────────────────────────────────────────
 *
 * `referenceForBoundary` reports the error and returns the id printed on screen — the
 * Sentry event id itself, with the `digest` attached as a tag rather than
 * printed. `errors/reference.ts` carries the whole argument: why the digest identifies a
 * *kind* of failure and not the reader's, and how the tag joins this event to the one
 * `instrumentation.ts` sent from the server with the stack in it.
 *
 * ── Why this is read during render and not in an effect ────────────────────────────
 *
 * It is memoised on the error object, so calling it is idempotent: the same failure
 * reports once and answers with the same id however many times it is asked. That matters
 * here because `retry()` re-renders *this* instance with a new `error` rather than
 * remounting it — state seeded once at mount would leave the reader quoting a reference
 * for the failure before last, and an effect that corrected it would render the page twice
 * and hold the id back a frame.
 */
export default function ReadFailureBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next.js 16.3 — `retry` re-fetches and re-renders the segment. It is not `reset`,
  // which only clears the boundary and is almost never what a failed read wants.
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="mx-auto max-w-3xl px-gutter py-16">
      <ReadFailure reference={reference} retry={retry} />
    </main>
  );
}
