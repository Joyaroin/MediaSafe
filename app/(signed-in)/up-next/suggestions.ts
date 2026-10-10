import "server-only";

import { cachedRecommendations, cachedTrendingTitles } from "@/cache/borrowed-facts";
import { libraryCatalogueKeys, mostRecentlyWatchedTitle, type UserId } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { catalogueKeyOf } from "@/tmdb/mirror";
import type { MarkedResult } from "@/app/(signed-in)/search/actions";

/**
 * What Up next's empty states offer to add — issue #365.
 *
 * Seeded like *Because you watched* on the search screen (`search/recommendations.ts`),
 * from the most recent watch of either kind. A new reader has no watch, so
 * `mostRecentlyWatchedTitle` answers `null` and the rail falls back to TMDB's trending
 * titles; without that, the screen this exists for — the first one a new reader sees —
 * would get no rail at all. The same fallback covers a seed TMDB recommends nothing off.
 *
 * Titles already in the library are left out: this is a rail of things to add.
 *
 * ── A failure is represented, not thrown ────────────────────────────────────────────
 *
 * `recommendations.ts`' own reasoning, for the same blast radius: a TMDB call failing
 * under an empty state must replace the rail with the inline read failure, not take the
 * page's own sentence with it. `ok: false` carries no results to mistake for an empty rail.
 */
export interface Suggestions {
  /** The title the rail is *because of*, or `null` when it is TMDB's trending list. */
  readonly seed: string | null;
  readonly results: readonly MarkedResult[];
}

export type SuggestionsOutcome =
  | { readonly ok: true; readonly rail: Suggestions }
  | { readonly ok: false; readonly reference: string | null };

/** A rail's worth — about two phone screens of `124px` cards. */
const RAIL_LENGTH = 12;

export async function readSuggestions(userId: UserId): Promise<SuggestionsOutcome> {
  try {
    const seed = await mostRecentlyWatchedTitle(userId, null);
    const recommended =
      seed === null ? [] : await cachedRecommendations(userId, seed.kind, seed.tmdbId);
    const because = recommended.length > 0 ? seed : null;
    const results = because === null ? await cachedTrendingTitles(userId) : recommended;

    const held = await libraryCatalogueKeys(userId, results);
    const addable = results
      .filter((result) => !held.has(catalogueKeyOf(result)))
      .slice(0, RAIL_LENGTH)
      .map((result) => ({ ...result, inLibrary: false }));

    return { ok: true, rail: { seed: because?.name ?? null, results: addable } };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "up-next-suggestions" }) };
  }
}
