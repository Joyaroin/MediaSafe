import * as Sentry from "@sentry/nextjs";

import {
  NIGHTLY_SWEEP_CAP,
  refreshTitleMirror,
  titlesDueForRefresh,
  type Executor,
  type SweepCandidate,
} from "@/db/access";
import { isUnresolvedTitle, type TitleKind, type TitleMirror } from "@/tmdb/mirror";
import type { QuarantineReason } from "@/tmdb/reconcile";

import { reconcileVanishedTitle, type FindByExternalId } from "./reconcile-title";

/**
 * The nightly sweep itself (issue #115) — everything but the HTTP wrapper and the real
 * TMDB call, both of which `route.ts` supplies. Split out so this can be tested against
 * real Postgres, without a network, exactly as asked: this file never imports
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
 * One title whose TMDB id is gone and which MediaSafe declined to write anything about
 * (issue #116, `tmdb/reconcile.ts`).
 *
 * **Not a `SweepFailure`, and the distinction is the ticket.** A failure is *MediaSafe
 * could not do this* — TMDB timed out, the database was down — and it is an exception
 * with a stack trace. A quarantine is *MediaSafe looked and declined to guess*: nothing
 * is broken, nothing is retried differently, and there is no exception because nothing
 * threw. Both are reported and both leave `metadata_refreshed_at` alone; only one of them
 * means something is wrong.
 */
export interface SweepQuarantine {
  readonly candidate: SweepCandidate;
  readonly reason: QuarantineReason;
}

/**
 * One title repointed at the id that survived (issue #116).
 *
 * The evidencing external id is not repeated here — it is `candidate.externalId`, and a
 * repoint cannot happen without one. `title_reconciliation` is where it is written down.
 */
export interface SweepRepoint {
  readonly candidate: SweepCandidate;
  readonly toTmdbId: number;
}

/**
 * What one run did — the whole of what Sentry, and nothing else, ever hears (no badge, no "last refreshed" line, nothing in Settings).
 */
export interface NightlySweepOutcome {
  readonly candidates: number;
  /**
   * The titles that now carry fresh metadata — the whole candidate rather than a count,
   * so the summary line and the two cache busts cannot come to disagree about which
   * titles moved.
   *
   * `route.ts` is its only reader outside this file — `reportToSentry` below counts it for
   * the summary line — and it needs two different things out of each one
   * (issues #219 and #225). **The `title.id`** resolves the accounts holding it, whose
   * cached libraries print the `name`, `release_year` and `poster_path` this run just
   * rewrote. **The `(kind, tmdbId)` pair** is the borrowed facts' tag: the unowned title
   * page's mirrored read is keyed by the catalogue key, and its readers are by definition
   * the accounts that do *not* hold the title, so the account list cannot reach them.
   *
   * A repoint is in here too, carrying the id that **vanished** — which is the right key
   * to expire, because it is the one every stale entry was stored under. `repointed`
   * below carries the survivor, and `route.ts` busts both.
   */
  readonly refreshed: readonly SweepCandidate[];
  readonly failures: readonly SweepFailure[];
  /** Titles whose TMDB id is gone and which were repointed at the id that survived. */
  readonly repointed: readonly SweepRepoint[];
  /** Titles whose TMDB id is gone and which were left exactly as they were found. */
  readonly quarantined: readonly SweepQuarantine[];
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
 *
 * ── A 404 is a question, not a failure (issue #116) ──────────────────────────────────
 *
 * TMDB answering 404 for a title means the id is **gone** — deleted, or merged into
 * another — and that is the one failure this loop does not simply record and move past.
 * `reconcileVanishedTitle` asks the only question there is evidence for: what does this
 * title's stored external id still resolve to. It answers with a repoint or a
 * quarantine, and either way the run continues with the other titles.
 *
 * The reconciliation is inside the same `try`, so a `/find` that times out or a database
 * that is down still lands in `failures` and is still retried tomorrow. **A 404 raised by
 * the reconciliation itself is not re-reconciled**: `reconcileVanishedTitle` is called
 * from the outer `catch` only, so the survivor 404ing too is an ordinary failure and
 * there is no second attempt to recurse into.
 */
export async function runNightlySweep(
  fetchMirror: FetchMirror,
  findByExternalId: FindByExternalId,
  cap: number = NIGHTLY_SWEEP_CAP,
  executor?: Executor,
): Promise<NightlySweepOutcome> {
  const candidates = await titlesDueForRefresh(cap, executor);

  const refreshed: SweepCandidate[] = [];
  const failures: SweepFailure[] = [];
  const repointed: SweepRepoint[] = [];
  const quarantined: SweepQuarantine[] = [];

  for (const candidate of candidates) {
    try {
      const mirror = await fetchMirror(candidate.kind, candidate.tmdbId);
      await refreshTitleMirror(mirror, executor);
      refreshed.push(candidate);
    } catch (error) {
      if (!isUnresolvedTitle(error)) {
        // Not manufactured `[]` — a failure recorded here, never a result standing in for
        // one. Nothing is silently dropped: `reportToSentry` below is what makes this
        // run's failures visible at all, and it reads this array rather than a count.
        failures.push({ candidate, error });
        continue;
      }

      try {
        const decision = await reconcileVanishedTitle(
          candidate,
          fetchMirror,
          findByExternalId,
          executor,
        );
        if (decision.outcome === "repoint") {
          repointed.push({ candidate, toTmdbId: decision.toTmdbId });
          // A repoint wrote the survivor's mirror in the same transaction, so this title
          // *was* refreshed — recording it is what keeps the summary line honest about
          // how many of the night's titles now carry fresh metadata, and what puts this
          // title's accounts on the list whose cached libraries `route.ts` busts.
          //
          // The candidate carries the TMDB id that vanished, not the survivor. That is
          // the key every stale borrowed-fact entry for this title was stored under, so
          // it is the one to expire; `repointed` above carries the other, and `route.ts`
          // busts both (issue #225).
          refreshed.push(candidate);
        } else {
          quarantined.push({ candidate, reason: decision.reason });
        }
      } catch (reconcileError) {
        // The reconciliation itself could not be carried out — `/find` was unreachable,
        // the survivor would not fetch, the write failed. An ordinary failure, retried on
        // the next run, and never a partial write: `repointTitle` is one transaction.
        failures.push({ candidate, error: reconcileError });
      }
    }
  }

  const outcome: NightlySweepOutcome = {
    candidates: candidates.length,
    refreshed,
    failures,
    repointed,
    quarantined,
  };
  reportToSentry(outcome);
  return outcome;
}

/**
 * The one place a broken refresh is found: one event per
 * skipped title, tagged with enough to find it without reading a stack trace first, and a
 * summary so a quiet night — nothing due, nothing failed — is still a message rather than
 * silence. `Sentry.getClient()?.getDsn()` is not checked here the way `errors/reference.ts`
 * checks it: that guard exists so a reader is never shown an id that resolves to nothing,
 * and nothing here is ever shown to a reader. With no DSN the SDK already drops the event.
 *
 * ── Quarantines and repoints, and why Sentry hears about both (issue #116) ───────────
 *
 * **A quarantine is a message, not an exception.** Nothing threw, nothing is broken, and
 * there is no stack to attach — a `captureException` here would put a manufactured error
 * in front of whoever reads these, which is the same lie in the other direction as a
 * `catch` returning `[]`. It is a warning because it is the state that persists: the
 * title is skipped again every night until TMDB resolves the duplicate or the sweep fills
 * the external id in.
 *
 * **A repoint is reported too, at `info`.** It is the successful outcome, and it is still
 * the one write in this application that changes what a title *is* for every account at
 * once, with nobody watching. `title_reconciliation` is the record you can reverse it
 * from; this is the line that tells you to go and look.
 */
function reportToSentry({
  candidates,
  refreshed,
  failures,
  repointed,
  quarantined,
}: NightlySweepOutcome): void {
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

  for (const { candidate, reason } of quarantined) {
    Sentry.captureMessage(
      `Nightly sweep: TMDB ${candidate.kind} ${candidate.tmdbId} is gone and was not reconciled (${reason})`,
      {
        level: "warning",
        tags: {
          surface: "nightly-sweep",
          quarantine: reason,
          titleId: candidate.id,
          kind: candidate.kind,
          tmdbId: String(candidate.tmdbId),
        },
      },
    );
  }

  for (const { candidate, toTmdbId } of repointed) {
    Sentry.captureMessage(
      `Nightly sweep: TMDB ${candidate.kind} ${candidate.tmdbId} is gone; repointed to ${toTmdbId}`,
      {
        level: "info",
        tags: {
          surface: "nightly-sweep",
          repoint: String(toTmdbId),
          titleId: candidate.id,
          kind: candidate.kind,
          tmdbId: String(candidate.tmdbId),
        },
      },
    );
  }

  Sentry.captureMessage(
    `Nightly sweep: ${refreshed.length} of ${candidates} refreshed, ${failures.length} skipped, ${repointed.length} repointed, ${quarantined.length} quarantined`,
    {
      level: failures.length > 0 || quarantined.length > 0 ? "warning" : "info",
      tags: { surface: "nightly-sweep" },
    },
  );
}
