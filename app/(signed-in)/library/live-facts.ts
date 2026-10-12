import "server-only";

import {
  cachedTitleCastAndCrew,
  cachedTitleSynopsis,
  cachedTitleWatchProviders,
} from "@/cache/borrowed-facts";
import type { UserId } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";

/**
 * The live-only reads of title detail — synopsis, cast and crew, watch providers (issue
 * #218). `live-title-facts-streamed.tsx` makes each during the page render, and
 * `title-detail-actions.ts` makes it again on a reader's *Try again*.
 *
 * ── One `Outcome` per field, not one for all three ────────────────────────────────────
 *
 * *A combined call either has everything or is one failure covering all three*, and one
 * failed fetch must never take the other two. So each read is its own function with its
 * own `Outcome`, and a `titleWatchProviders` rejection cannot touch the `titleSynopsis`
 * result beside it.
 *
 * ── Since issue #225 the three go through the cache, and the `catch` stays out here ──
 *
 * `cache/borrowed-facts.ts` is what actually calls TMDB, behind an entry with a tag and a
 * six-hour window. Which side of the cache the `try` below sits on is the whole of what
 * that ticket had to get right: **outside**. `unstable_cache` stores a resolved value and
 * nothing else, so a TMDB outage leaves no entry, the section renders its own inline
 * recovery with a reference id, and the reader's *Try again* is a real retry. An
 * `Outcome` computed inside the cache would have pinned *this region failed* for six
 * hours — a cache miss rendered as an empty region.
 *
 * ── The account is an argument, resolved once by the caller ──────────────────────────
 *
 * Every cache key in this application carries one (`cache/`, and the lint rule that
 * enforces it). It arrives as a parameter rather than being resolved here: `requireUserId`
 * is a session lookup, and the three reads run concurrently on one page render. Both
 * callers already hold a `UserId` before they get here.
 */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reference: string | null };

async function outcomeOf<T>(read: () => Promise<T>, surface: string): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface }) };
  }
}

export function readSynopsis(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<string | null>> {
  return outcomeOf(() => cachedTitleSynopsis(userId, kind, tmdbId), "title-synopsis");
}

export function readCastAndCrew(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<CastAndCrew>> {
  return outcomeOf(() => cachedTitleCastAndCrew(userId, kind, tmdbId), "title-cast-crew");
}

export function readWatchProviders(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<readonly WatchProvider[]>> {
  return outcomeOf(
    () => cachedTitleWatchProviders(userId, kind, tmdbId),
    "title-watch-providers",
  );
}
