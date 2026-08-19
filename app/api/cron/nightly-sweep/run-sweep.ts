import * as Sentry from "@sentry/nextjs";

import {
  NIGHTLY_SWEEP_CAP,
  refreshTitleMirror,
  titlesDueForRefresh,
  type Executor,
  type SweepCandidate,
} from "@/db/access";
import { isUnresolvedTitle, type TitleKind, type TitleMirror } from "@/tmdb/mirror";

/**
 * The nightly sweep itself (issue #115) — everything but the HTTP wrapper and the real
 * TMDB call, both of which `route.ts` supplies. Split out so this can be tested against
 * real Postgres, without a network, exactly as `SPEC.md` §6 asks: this file never imports
 * `@/tmdb/catalogue`, which is `import "server-only"` — a no-op inside Next's build but a
 * hard throw under plain Node module resolution, so a test that imported it could never
 * run under Vitest (`tmdb/mirror.ts` draws the identical line for `TmdbHttpError`, for the
 * identical reason). `fetchMirror` is taken as a parameter instead; `route.ts` passes the
 * real `titleMirror`, tests pass a stub that never touches the network.
 */

/** `tmdb/catalogue.ts`'s `titleMirror`, or a stub standing in for it under test. */
export type FetchMirror = (kind: TitleKind, tmdbId: number) => Promise<TitleMirror>;

/** One title the sweep could not refresh this run, and why. */
export interface SweepFailure {
  readonly candidate: SweepCandidate;
  readonly error: unknown;
}

/**
 * What one run did — the whole of what Sentry, and nothing else, ever hears (`SPEC.md`
 * §6: no badge, no "last refreshed" line, nothing in Settings).
 */
export interface NightlySweepOutcome {
  readonly candidates: number;
  readonly refreshed: number;
  readonly failures: readonly SweepFailure[];
}

/**
 * Refresh up to `cap` titles, in `titlesDueForRefresh`'s priority order.
 *
 * ── One title at a time, and never inside another's transaction ──────────────────────
 *
 * `refreshTitleMirror` opens its own transaction per title. A title that fails here —
 * mid-fetch or mid-write — cannot roll back a title this loop already committed, which is
 * what makes *"one broken title never stops the run"* true of the write path itself and
 * not just of the `catch` around it.
 *
 * ── `executor`, and why it is threaded through rather than left to the default ────────
 *
 * `titlesDueForRefresh` and `refreshTitleMirror` both default to the application pool
 * (`getDb()`), which is right for the route and wrong for a test — `db/client.ts` makes
 * that pool throw under Vitest on purpose, so that a function which forgot to take its
 * caller's transaction fails loudly rather than writing to the wrong database. Passing
 * `executor` straight through, undefined by default, is what lets `tests/nightly-
 * sweep.test.ts` run a whole sweep inside one `inTransaction` and roll it back — every
 * write in `db/access.ts` takes the same shape, for the same reason.
 */
export async function runNightlySweep(
  fetchMirror: FetchMirror,
  cap: number = NIGHTLY_SWEEP_CAP,
  executor?: Executor,
): Promise<NightlySweepOutcome> {
  const candidates = await titlesDueForRefresh(cap, executor);

  let refreshed = 0;
  const failures: SweepFailure[] = [];

  for (const candidate of candidates) {
    try {
      const mirror = await fetchMirror(candidate.kind, candidate.tmdbId);
      await refreshTitleMirror(mirror, executor);
      refreshed++;
    } catch (error) {
      // Not manufactured `[]` — a failure recorded here, never a result standing in for
      // one. Nothing is silently dropped: `reportToSentry` below is what makes this run's
      // failures visible at all, and it reads this array rather than a count.
      failures.push({ candidate, error });
    }
  }

  const outcome: NightlySweepOutcome = { candidates: candidates.length, refreshed, failures };
  reportToSentry(outcome);
  return outcome;
}

/**
 * The one place a broken refresh is found (`SPEC.md` §6, issue #115): one event per
 * skipped title, tagged with enough to find it without reading a stack trace first, and a
 * summary so a quiet night — nothing due, nothing failed — is still a message rather than
 * silence. `Sentry.getClient()?.getDsn()` is not checked here the way `errors/reference.ts`
 * checks it: that guard exists so a reader is never shown an id that resolves to nothing,
 * and nothing here is ever shown to a reader. With no DSN the SDK already drops the event.
 */
function reportToSentry({ candidates, refreshed, failures }: NightlySweepOutcome): void {
  for (const failure of failures) {
    Sentry.captureException(failure.error, {
      tags: {
        surface: "nightly-sweep",
        titleId: failure.candidate.id,
        kind: failure.candidate.kind,
        tmdbId: String(failure.candidate.tmdbId),
        unresolved: String(isUnresolvedTitle(failure.error)),
      },
    });
  }

  Sentry.captureMessage(
    `Nightly sweep: ${refreshed} of ${candidates} refreshed, ${failures.length} skipped`,
    { level: failures.length > 0 ? "warning" : "info", tags: { surface: "nightly-sweep" } },
  );
}
