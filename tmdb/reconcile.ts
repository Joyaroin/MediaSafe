import type { ExternalId, TitleKind, TitleMirror } from "./mirror";
import { integerFrom } from "./mirror";

/**
 * What the nightly refresh does when a title's TMDB id is gone — the decision, and
 * nothing else. Pure, and tested (`tests/tmdb-reconcile.test.ts`).
 *
 * `SPEC.md` §11.3 carried this open from the map: TMDB can delete a title or merge two
 * ids, ADR-0001 made that failure loud rather than silent, and nothing decided what
 * happens next. Issue #116 is the answer, and this file is the whole of it that can be
 * got wrong quietly.
 *
 * ── The constraint that shapes everything below: TMDB publishes no successor ──────────
 *
 * A merged or deleted id returns **404, error code 6, and nothing else.** Ids are never
 * reused, duplicates are resolved by keeping the oldest entry, and the request for a
 * *deleted as a duplicate, here is the new id* response was never implemented. There is
 * no id to reconcile *to* — which is why issue #114 mirrored an external id, and why the
 * only question this file asks is *what does that external id still resolve to.*
 *
 *     tmdb_id 1416 → 404 (error code 6)
 *       → look the title up by its stored external id
 *           → exactly one surviving TMDB id  →  repoint the title, keep every watch
 *           → nothing, or more than one      →  quarantine: write nothing, skip, report
 *       → no external id stored yet          →  quarantine
 *
 * ── Evidence or nothing ──────────────────────────────────────────────────────────────
 *
 * **Name-and-year search is rejected outright**, and this file is where that is held.
 * `title` and `episode` are global and unowned (ADR-0001), so a wrong match is not one
 * person's problem — **one wrong match is everyone's wrong match**, and it looks exactly
 * like a correct one, in every library, forever, with nothing on any screen wrong. The
 * `/find` response arrives here carrying names, years, posters and popularity scores;
 * nothing below reads any of them, and `TmdbFindResultPayload` declines to declare them
 * so that a later reader reaching for one fails to typecheck.
 *
 * ── A watch is never repointed. Under any policy, ever ───────────────────────────────
 *
 * Your viewing history is the one thing in this database that cannot be re-derived from
 * anything. So even a title that reconciles is matched **by TMDB episode id only**: if
 * the surviving entry's episodes do not carry the same ids, that is not a match to make
 * approximately, and `reconcileEpisodes` quarantines rather than guessing. This is
 * ADR-0001's `NO ACTION` foreign key expressed as policy rather than as a database error.
 *
 * ── Pure, precisely ──────────────────────────────────────────────────────────────────
 *
 * No clock, no network, no database — the same line `tmdb/mirror.ts` draws, and it is
 * what lets every branch below be pinned against captured responses. The two impure
 * halves live where they belong: the `/find` request in `tmdb/catalogue.ts`, and the
 * writes in `db/access.ts`, orchestrated by
 * `app/api/cron/nightly-sweep/reconcile-title.ts`.
 */

/**
 * One entry in a `/find` response, declared as narrowly as this file reads it.
 *
 * **The id, and deliberately nothing else.** TMDB sends the full result object here — the
 * same shape `/search/multi` returns, with `name`, `original_name`, `first_air_date`,
 * `overview`, `poster_path`, `popularity` and `vote_average` on it. Every one of those is
 * a field a *guess* would be built from, and this is the one path in the codebase where a
 * guess writes a global row. Leaving them undeclared is how "no name-and-year match" stops
 * being a rule somebody remembers and becomes a thing the type system will not express.
 */
export interface TmdbFindResultPayload {
  id?: number;
}

/**
 * `/find/{external_id}?external_source=…`, as this file reads it.
 *
 * TMDB answers with five lists — `movie_results`, `person_results`, `tv_results`,
 * `tv_episode_results` and `tv_season_results`. Two of them are titles; the other three
 * are not, and are undeclared for the reason `TmdbExternalIdsPayload` leaves the social
 * handles undeclared. A person, an episode or a season carries an id of its own, and a
 * decision that counted them would find three survivors where TMDB published one.
 */
export interface TmdbFindPayload {
  movie_results?: TmdbFindResultPayload[];
  tv_results?: TmdbFindResultPayload[];
}

/**
 * TMDB's `external_source` values for the two catalogues `ExternalId` can hold.
 *
 * The source is a **required** query parameter on `/find`, which is the whole reason
 * `title.external_id` writes the catalogue into the value rather than storing the bare id
 * and recovering the source from its shape at read time.
 */
export type TmdbExternalSource = "imdb_id" | "tvdb_id";

/** Everything `/find` needs, from the one column that stores it. */
export interface TmdbFindRequest {
  readonly externalSource: TmdbExternalSource;
  /** `tt0944947`, `121361` — the id without the catalogue prefix. */
  readonly id: string;
}

/**
 * `imdb:tt0076759` → `{ externalSource: "imdb_id", id: "tt0076759" }`.
 *
 * One function rather than a `split(":")` at the call site: the prefix and TMDB's
 * parameter name are not the same string (`imdb` against `imdb_id`), and a call site that
 * discovered that by reading a 422 would be a call site that had already shipped.
 */
export function findRequestFor(externalId: ExternalId): TmdbFindRequest {
  const IMDB = "imdb:";
  if (externalId.startsWith(IMDB)) {
    return { externalSource: "imdb_id", id: externalId.slice(IMDB.length) };
  }
  return { externalSource: "tvdb_id", id: externalId.slice("tvdb:".length) };
}

/**
 * Why a title was left exactly as it was found.
 *
 * Every one of these is a *refusal to write*, not a failure: nothing is wrong with
 * MediaSafe when one occurs, and the title is retried on the next run in case TMDB
 * resolves the duplicate or the sweep fills in the external id first.
 */
export type QuarantineReason =
  /** Nothing to look the title up by. The sweep fills `external_id` in as it goes. */
  | "no-external-id"
  /** The external id resolves to nothing on TMDB either. The title is genuinely gone. */
  | "no-surviving-id"
  /** Two or more. TMDB resolves duplicates by hand and has not resolved this one. */
  | "more-than-one-surviving-id"
  /** An episode somebody has watched is not in the survivor. Never approximated. */
  | "watched-episode-missing"
  /** The survivor is already a row of its own — see `repointTitle` in `db/access.ts`. */
  | "surviving-id-already-mirrored";

/** Repoint this title at `toTmdbId`, on the evidence of `evidence`. */
export interface Repoint {
  readonly outcome: "repoint";
  readonly toTmdbId: number;
  readonly evidence: ExternalId;
}

/** Write nothing at all, skip the title, report it. */
export interface Quarantine {
  readonly outcome: "quarantine";
  readonly reason: QuarantineReason;
}

export type ReconcileDecision = Repoint | Quarantine;

/**
 * What was looked up, and what came back — or that there was nothing to look up.
 *
 * A union rather than two nullable fields, because it makes **"no external id stored →
 * quarantine, and never a search"** a fact about the type rather than a branch somebody
 * has to keep taking. There is no way to spell *no external id, but here is a search
 * result anyway*: the payload does not exist on that arm.
 */
export type ExternalIdLookup =
  | { readonly externalId: null }
  | { readonly externalId: ExternalId; readonly find: TmdbFindPayload };

/**
 * The first half of the decision: what, if anything, this title's external id still
 * resolves to.
 *
 * `goneTmdbId` is the id that just 404'd, and it is excluded from the survivors rather
 * than being ignored. TMDB answering 404 for an id and then handing that same id back
 * from `/find` is an inconsistency rather than a documented response — but if it happens,
 * *repointing a title to itself* would write a row and stamp `metadata_refreshed_at` for
 * no change at all, and then 404 again on the very next fetch. Excluding it makes the
 * outcome a quarantine, which is the true thing to say about a title nothing survived.
 */
export function reconcileByExternalId(
  kind: TitleKind,
  goneTmdbId: number,
  lookup: ExternalIdLookup,
): ReconcileDecision {
  if (lookup.externalId === null) {
    return { outcome: "quarantine", reason: "no-external-id" };
  }

  const results = kind === "film" ? lookup.find.movie_results : lookup.find.tv_results;

  /**
   * A `Set`, so a repeated id is one survivor rather than an ambiguity. TMDB is not
   * guaranteed to be free of repeats — `catalogueResults` keys its results for exactly
   * that reason — and *the same id twice* is not the thing a quarantine is protecting
   * against. Two **different** ids is.
   */
  const surviving = new Set<number>();
  for (const result of results ?? []) {
    const id = integerFrom(result.id);
    if (id === null || id === goneTmdbId) continue;
    surviving.add(id);
  }

  if (surviving.size === 0) return { outcome: "quarantine", reason: "no-surviving-id" };
  if (surviving.size > 1) {
    // Never a pick. Which of two duplicates TMDB will keep is a decision TMDB makes by
    // hand, and picking the lower id, or the more popular one, is a guess wearing a rule.
    return { outcome: "quarantine", reason: "more-than-one-surviving-id" };
  }

  const [toTmdbId] = surviving;
  return { outcome: "repoint", toTmdbId, evidence: lookup.externalId };
}

/**
 * The second half: whether the survivor still has every episode this title has watches
 * on.
 *
 * **Matched by `tmdb_episode_id` only.** Never by season and episode number, never by
 * name. A survivor whose S1 E1 is a different TMDB episode is a different episode row,
 * and the numbers agreeing is not evidence — it is the coincidence that makes an
 * approximate match look correct. `episode` is keyed by `tmdb_episode_id` for the same
 * reason (ADR-0001), and this is that key applied one level up.
 *
 * The survivor **gaining** episodes is not a mismatch: that is an ordinary refresh, and
 * the whole point of repointing is to receive it. Only losing a watched one is fatal.
 *
 * `watchedTmdbEpisodeIds` is every episode under this title that carries at least one
 * watch, from any account — `title` and `episode` are global, so *somebody's history*
 * is the bar, not *this caller's*. A film has none: its watches carry no `episode_id`
 * at all (`db/tables.ts`), so nothing is missing and nothing is checked.
 *
 * Takes a `Repoint` and returns a `ReconcileDecision`, rather than a boolean, so that the
 * two halves speak one language and the caller cannot forget which way round the answer
 * ran.
 */
export function reconcileEpisodes(
  repoint: Repoint,
  survivor: TitleMirror,
  watchedTmdbEpisodeIds: readonly number[],
): ReconcileDecision {
  const survivorEpisodeIds = new Set(survivor.episodes.map((one) => one.tmdbEpisodeId));

  for (const watched of watchedTmdbEpisodeIds) {
    if (!survivorEpisodeIds.has(watched)) {
      return { outcome: "quarantine", reason: "watched-episode-missing" };
    }
  }

  return repoint;
}
