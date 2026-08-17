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

function report(error: unknown, tags?: Record<string, string>): string | null {
  // `getClient()` returns a client even when `init()` ran without a DSN, and that client
  // drops everything it is given. The DSN is the honest test of whether an id will mean
  // anything.
  const client = Sentry.getClient();
  if (!client?.getDsn()) return null;

  return Sentry.captureException(error, tags ? { tags } : undefined);
}
