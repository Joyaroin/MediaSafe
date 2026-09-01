"use server";

import { cachedTitleDetail } from "@/cache/tags";
import { type TitleDetailRow } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";
import {
  readCastAndCrew,
  readEpisodeSynopsis,
  readLiveFacts,
  readSynopsis,
  readWatchProviders,
  type LiveFacts,
  type Outcome,
} from "./live-facts";

export type { Outcome } from "./live-facts";

/**
 * Title detail's four reads, each a Server Action rather than a page-render throw — the
 * shape `app/(signed-in)/search/actions.ts` already argues for and this reuses rather
 * than re-derives: **the desktop pane never navigates**, so there is no route-level
 * `error.tsx` for it to throw into the way
 * `app/(signed-in)/titles/[entryId]/page.tsx` (the phone route) has. React also strips a
 * thrown Server Action's error before it crosses to the browser, so catching here is what
 * lets Sentry see the real exception and the reader see a reference id for it.
 *
 * The phone route does not call these. It calls `cachedTitleDetail` directly and lets a
 * failure throw into its own boundary, for the same reason `app/(signed-in)/library/page.tsx`
 * does for the grid — the same wrapper this file calls, so the two surfaces share one
 * cache entry and differ only in where a failure lands.
 */

/** The mirrored half of title detail — the desktop pane's and the Up next sheet's read.
 *  Unchanged by issue #218: it stays the fast, DB-only read it always was, so the panel
 *  those two surfaces show still appears the moment this resolves, not gated behind
 *  whatever the three live facts below are doing (`titleLiveFactsAction`'s own docblock —
 *  and `live-title-facts.tsx`'s top one — carry why the two stay separate reads).
 *
 *  **The `try` is still doing its own job through the cache, and only its own.** It is here
 *  because this action has no route boundary to throw into, not to make the read look
 *  successful: `catch` returns an `Outcome` carrying a reference id, which is a reported
 *  failure and not an empty result (`AGENTS.md`). `unstable_cache` stores nothing on a
 *  rejection, so a failed read is not cached as one and the next call is a real read. */
export async function titleDetailAction(
  libraryEntryId: string,
): Promise<Outcome<TitleDetailRow>> {
  const userId = await requireUserId();

  try {
    return { ok: true, value: await cachedTitleDetail(userId, libraryEntryId) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "title-detail" }) };
  }
}

/**
 * The three live-only sections below are **three actions, not one**, so that a synopsis
 * TMDB answers can render while credits TMDB is failing on the same title cannot, and the
 * reverse — `docs/design/v1-surfaces.md` §7's *fails inline, in its own section* only
 * holds if the sections do not share a failure. Every one of the three still requires a
 * session: `title` and `episode` are unowned (ADR-0001), but a Server Action is a POST
 * endpoint anyone can call with any arguments, and `SPEC.md` §3's *no unauthenticated
 * route may ever be added* does not carve out an exception for one that happens to touch
 * no owned row.
 *
 * They remain for what issue #218 left them for: a reader's own *Try again* on a section
 * that failed, after `titleLiveFactsAction` or `live-title-facts-streamed.tsx`'s own
 * `readSynopsis`/`readCastAndCrew`/`readWatchProviders` already answered the first read.
 *
 * ── The session's answer is now used, not only checked (issue #225) ──────────────────
 *
 * `requireUserId`'s return value used to be discarded on all four of these — the call was
 * the authorisation and nothing more. The reads behind them are cached now and every cache
 * key in this application carries an account (`cache/tags.ts`), so the id is passed down
 * rather than dropped. The authorisation is unchanged and is still the reason the call
 * comes first.
 *
 * **A *Try again* is a real retry, not a replayed failure.** These four sit on the reader-
 * facing side of the cache, and the cache stores resolved values only: the read that just
 * failed left no entry, so the button reaches TMDB again. It is the successful read next
 * to it that is served from memory, which is the whole point of the ticket.
 */
export async function titleSynopsisAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<string | null>> {
  return readSynopsis(await requireUserId(), kind, tmdbId);
}

/**
 * One episode's own synopsis — issue #253's *Try again*, the fourth of these and the only
 * one that is not about a title.
 *
 * Everything the three above say applies unchanged: it requires a session (a Server Action
 * is a POST endpoint anyone can call, and *no unauthenticated route may ever be added*
 * carves out no exception for one that touches no owned row), it passes the account down
 * because every cache key in this application carries one, and it busts nothing because it
 * is a read.
 *
 * **It authorises the session, not the episode.** Deliberately, and it is the same call
 * the three above make: what comes back is a public TMDB synopsis for an episode of a show
 * the catalogue already serves to anyone on the unowned title page. There is nothing here
 * that a reader could learn about another reader's library, so there is no library entry to
 * check this against — and asking for one would mean this action taking an owned id purely
 * to authorise a fact that is not owned.
 *
 * No `kind`: `episodeSynopsis` takes none, because a film has no episodes and TMDB has no
 * endpoint to fork to. `tmdb/catalogue.ts`'s own docblock is where that lives.
 */
export async function episodeSynopsisAction(
  tmdbId: number,
  seasonNo: number,
  episodeNo: number,
): Promise<Outcome<string | null>> {
  return readEpisodeSynopsis(await requireUserId(), tmdbId, seasonNo, episodeNo);
}

export async function titleCastAndCrewAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<CastAndCrew>> {
  return readCastAndCrew(await requireUserId(), kind, tmdbId);
}

export async function titleWatchProvidersAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<readonly WatchProvider[]>> {
  return readWatchProviders(await requireUserId(), kind, tmdbId);
}

/**
 * The desktop pane's and the Up next sheet's one combined read for the three live
 * sections — issue #218. Neither surface navigates, so neither has a page render to
 * stream the three behind (`live-title-facts-streamed.tsx` is what the two surfaces that
 * do have one use instead). This is the next best thing: one round trip for all three,
 * computed concurrently on the server (`readLiveFacts`, in `live-facts.ts`), fired once
 * when `LiveTitleFactsClientFetch` mounts — not the three separate round trips that used
 * to fire from three separate mounts before this issue, and not folded into
 * `titleDetailAction` either, because that would gate the whole panel behind TMDB instead
 * of just the three sections that are actually TMDB's to answer.
 *
 * Never throws — `readLiveFacts` catches each of the three fields on its own account — so
 * there is no `Outcome` wrapping the whole call the way `titleDetailAction`'s DB read
 * needs one.
 */
export async function titleLiveFactsAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<LiveFacts> {
  return readLiveFacts(await requireUserId(), kind, tmdbId);
}
