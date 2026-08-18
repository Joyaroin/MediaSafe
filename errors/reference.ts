import * as Sentry from "@sentry/nextjs";

/**
 * The one technical string a reader ever sees, and where it comes from.
 *
 * `SPEC.md` §6: *the user never reads technical text beyond a copyable reference id, which
 * **is** the Sentry event id.* Not an id of our own that has to be looked up in a table
 * and correlated with Sentry — the event id itself, so a reference read back over a
 * message is pasted straight into Sentry's search and lands on the error.
 *
 * `Sentry.captureException` returns that id, which is why reporting and displaying are the
 * same call rather than two.
 */

/**
 * One report per error object, remembered for as long as that object is alive.
 *
 * This is what makes the function safe to call while rendering, which is what the failure
 * boundaries do: React renders them twice under StrictMode, and `retry()` can re-render
 * them again with the same error. Without the memo each of those is a duplicate Sentry
 * event and a different reference id on screen for one failure.
 *
 * A `WeakMap`, so holding the id does not keep the error — and everything it closes
 * over — from being collected.
 */
const reported = new WeakMap<object, string | null>();

/**
 * Report `error` and return the id to print, or `null` when there is nothing to print.
 *
 * `null` is returned when Sentry has no DSN — local development, a fork, a preview without
 * the environment set. The SDK still hands back an id in that case, for an event it never
 * sent, and showing it would put a technical string on screen that resolves to nothing. A
 * reader with no reference has lost nothing; a reader quoting an id Sentry has never heard
 * of has been actively misled.
 */
export function referenceFor(
  error: unknown,
  tags?: Record<string, string>,
): string | null {
  const memoisable = typeof error === "object" && error !== null;
  if (memoisable) {
    const already = reported.get(error);
    if (already !== undefined) return already;
  }

  const reference = report(error, tags);
  if (memoisable) reported.set(error, reference);
  return reference;
}

/**
 * The reference for an error that arrived at a `error.tsx` boundary, which is every
 * failure boundary in the application.
 *
 * ── Why the digest is a tag and not the reference ────────────────────────────────────
 *
 * When a Server Component render throws, React strips the error before it crosses to the
 * browser: the boundary receives a generic message and a `digest`. The stack lives in the
 * event `instrumentation.ts`'s `onRequestError` sent from the server, and tagging this
 * event with the same digest is what joins the two — so the id a reader quotes leads to an
 * event that names its server half.
 *
 * Printing the digest *instead* fails `SPEC.md` §6 outright: a digest is a hash of the
 * error, identical for every occurrence, so it identifies a kind of failure rather than
 * the reader's. Two people would quote the same string.
 *
 * It is one function because every boundary derives it identically and the derivation is
 * the part that must not drift. `app/error.tsx` and `app/(signed-in)/library/error.tsx`
 * had it written out twice; a third segment would have made three.
 */
export function referenceForBoundary(
  error: Error & { digest?: string },
): string | null {
  return referenceFor(error, error.digest ? { digest: error.digest } : undefined);
}

function report(error: unknown, tags?: Record<string, string>): string | null {
  // `getClient()` returns a client even when `init()` ran without a DSN, and that client
  // drops everything it is given. The DSN is the honest test of whether an id will mean
  // anything.
  const client = Sentry.getClient();
  if (!client?.getDsn()) return null;

  return Sentry.captureException(error, tags ? { tags } : undefined);
}
