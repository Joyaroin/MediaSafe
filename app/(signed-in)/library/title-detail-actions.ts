"use server";

import { requireUserId } from "@/lib/session";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";
import {
  readCastAndCrew,
  readSynopsis,
  readWatchProviders,
  type Outcome,
} from "./live-facts";

export type { Outcome } from "./live-facts";

/**
 * Title detail's *Try again* — one Server Action per live-only section, behind the button
 * `live-title-facts.tsx` draws on a section that failed. The first read is not made here:
 * `live-title-facts-streamed.tsx` makes it during the page render, through the same
 * `readSynopsis`/`readCastAndCrew`/`readWatchProviders`.
 *
 * Each returns an `Outcome` rather than throwing, the shape `app/(signed-in)/search/
 * actions.ts` already argues for: a retry has no route boundary to throw into, and React
 * strips a thrown Server Action's error before it crosses to the browser, so catching on
 * the server (in `live-facts.ts`) is what lets Sentry see the real exception and the reader
 * see a reference id for it.
 *
 * **Three actions, not one**, so that a synopsis TMDB answers can render while credits TMDB
 * is failing on the same title cannot, and the reverse — *fails inline, in its own section*
 * only holds if the sections do not share a failure.
 *
 * Every one still requires a session: `title` is unowned, but a Server Action is a POST
 * endpoint anyone can call with any arguments, and *no unauthenticated route may ever be
 * added* does not carve out an exception for one that happens to touch no owned row. The
 * id is passed down rather than discarded because every cache key in this application
 * carries an account (`cache/tags.ts`, issue #225).
 *
 * **A *Try again* is a real retry, not a replayed failure.** The cache stores resolved
 * values only: the read that just failed left no entry, so the button reaches TMDB again.
 */
export async function titleSynopsisAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<string | null>> {
  return readSynopsis(await requireUserId(), kind, tmdbId);
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
