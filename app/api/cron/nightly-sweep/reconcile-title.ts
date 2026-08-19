import {
  repointTitle,
  watchedTmdbEpisodeIds,
  type Executor,
  type SweepCandidate,
} from "@/db/access";
import {
  reconcileByExternalId,
  reconcileEpisodes,
  type ExternalIdLookup,
  type ReconcileDecision,
  type TmdbFindPayload,
} from "@/tmdb/reconcile";
import type { ExternalId } from "@/tmdb/mirror";

import type { FetchMirror } from "./run-sweep";

/**
 * One 404'd title, reconciled or quarantined — the sequence around
 * `tmdb/reconcile.ts`'s decision, and nothing that decides anything itself (issue #116).
 *
 * ── Why the impure half is its own file ──────────────────────────────────────────────
 *
 * The decision is pure and is pinned against captured responses
 * (`tests/tmdb-reconcile.test.ts`). What is left over is *ordering*: look up, then fetch,
 * then read the watches, then write — and the order matters, because every step is
 * allowed to say no and **a quarantine writes nothing at all.** Keeping it separate from
 * `run-sweep.ts` keeps the sweep's own loop readable as the two things it is: refresh a
 * title, and if TMDB has forgotten it, reconcile.
 *
 * ── Nothing here catches ─────────────────────────────────────────────────────────────
 *
 * A failing `/find`, a survivor that will not fetch, a database that is down — all of
 * them throw straight past this function to the sweep's own `catch`, which records the
 * title as a failure, reports it and moves on to the next one. That is the same
 * treatment an ordinary refresh failure gets and it is the right one: the title keeps its
 * old `metadata_refreshed_at` and is picked up again on the next run. A quarantine is a
 * *decision* — MediaSafe looked and declined to write — and is a different thing from a
 * failure, which is why it is a return value and not an exception.
 */

/** `tmdb/catalogue.ts`'s `findByExternalId`, or a stub standing in for it under test. */
export type FindByExternalId = (externalId: ExternalId) => Promise<TmdbFindPayload>;

/**
 * Reconcile one title whose TMDB id answered 404.
 *
 * The `ReconcileDecision` returned is the decision **as carried out**: a `repoint` here
 * means the write landed, not that the decision was to write one.
 *
 * The steps, in the only order they work in:
 *
 *  1. **The stored external id decides whether there is a question at all.** No external
 *     id is a quarantine, and `ExternalIdLookup` is shaped so that branch cannot reach a
 *     lookup — there is no name-and-year search here or anywhere else on this path.
 *  2. **`/find`, then the decision.** Exactly one surviving id repoints; nothing, or more
 *     than one, quarantines.
 *  3. **Fetch the survivor before believing it.** The episodes are only knowable from the
 *     survivor's own mirror, and that fetch is also what proves the surviving id is real
 *     rather than an entry `/find` still lists.
 *  4. **The watched episodes decide again.** An episode carrying watches that the
 *     survivor does not have ends it — the title is quarantined and no watch is touched.
 *  5. **Write, or discover the survivor is already mirrored.** `repointTitle` is one
 *     transaction and returns `false` rather than merging two title rows.
 *
 * `executor` is threaded through for the reason every function in `db/access.ts` takes
 * one: the tests run a whole sweep inside a transaction and roll it back.
 */
export async function reconcileVanishedTitle(
  candidate: SweepCandidate,
  fetchMirror: FetchMirror,
  findByExternalId: FindByExternalId,
  executor?: Executor,
): Promise<ReconcileDecision> {
  const { externalId } = candidate;

  // The `null` arm is what makes "never a search": there is no `find` to pass, and no
  // second argument this branch could have been handed a search result in.
  const lookup: ExternalIdLookup =
    externalId === null
      ? { externalId: null }
      : { externalId, find: await findByExternalId(externalId) };

  const found = reconcileByExternalId(candidate.kind, candidate.tmdbId, lookup);
  if (found.outcome === "quarantine") return found;

  const survivor = await fetchMirror(candidate.kind, found.toTmdbId);
  const watched = await watchedTmdbEpisodeIds(candidate.id, executor);

  const decided = reconcileEpisodes(found, survivor, watched);
  if (decided.outcome === "quarantine") return decided;

  const repointed = await repointTitle(
    {
      titleId: candidate.id,
      fromTmdbId: candidate.tmdbId,
      survivor,
      evidence: decided.evidence,
    },
    executor,
  );

  return repointed
    ? decided
    : { outcome: "quarantine", reason: "surviving-id-already-mirrored" };
}
