"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";

/**
 * The route-level boundary. Every read in the application throws into this.
 *
 * It is shipped now, with almost nothing to catch, because SPEC.md §11's build step 1 says
 * so and the reasoning is arithmetic: retrofitting the error discipline means auditing
 * every read in the app, and the number of reads only goes up. Today it is one.
 *
 * ── The reference id ───────────────────────────────────────────────────────────────
 *
 * `Sentry.captureException` is called *here*, on the client, and the id it returns is the
 * id printed on screen — SPEC.md §6 requires that the reference **is** the Sentry event
 * id and not something correlated with one.
 *
 * That event is not the one with the stack trace in it. When a Server Component render
 * throws, React strips the error before it crosses to the browser: this component receives
 * a generic message and a `digest`. The stack lives in the event `instrumentation.ts`'s
 * `onRequestError` sent from the server. Tagging this event with the same `digest` is what
 * joins the two, so the id the reader quotes leads to an event that names its server half.
 *
 * The alternative — printing the `digest` — fails the requirement outright: a digest is a
 * hash of the error, identical for every occurrence, so it identifies a *kind* of failure
 * and not the reader's. Two people would quote the same string.
 *
 * ── Why this is read during render and not in an effect ────────────────────────────
 *
 * `referenceFor` is memoised on the error object, so calling it is idempotent: the same
 * failure reports once and answers with the same id however many times it is asked. That
 * matters here because `retry()` re-renders *this* instance with a new `error` rather than
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
  const reference = referenceFor(
    error,
    error.digest ? { digest: error.digest } : undefined,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <ReadFailure reference={reference} retry={retry} />
    </main>
  );
}
