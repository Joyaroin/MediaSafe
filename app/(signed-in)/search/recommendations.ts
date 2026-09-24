import "server-only";

import { cachedRecommendations } from "@/cache/borrowed-facts";
import { mostRecentlyWatchedTitle, type UserId } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import type { CatalogueResult, TitleKind } from "@/tmdb/mirror";

/**
 * The read behind *Because you watched*, and the four answers it can give.
 *
 * ── Why an `Outcome` rather than a thrown error ─────────────────────────────────────
 *
 * `AGENTS.md`'s blast-radius table puts *one region failed to load* at an inline failure
 * **replacing that region**. Throwing from a Server Component reaches the nearest
 * `error.tsx`, which on this screen is the route's — so a TMDB recommendations call
 * failing would replace the search field with a failure, and the search field is the one
 * control this screen exists for.
 *
 * `app/(signed-in)/library/live-facts.ts` had this problem first and solved it with the
 * shape reused here: the failure is **represented** rather than raised, carried to the
 * caller as data, and rendered where the region was. That is not the thing the rule
 * forbids. The rule is against manufacturing a *successful-looking empty result* out of a
 * failure — `catch { return [] }` — and this catch does the opposite, producing a value
 * that cannot be mistaken for success by anything that reads it, because `ok: false` has
 * no `rail` on it to read.
 *
 * ── `null` and `[]` are both success, and both render nothing ───────────────────────
 *
 * `rail: null` means there is no seed — you have watched nothing of this kind, so there is
 * no title for the rail to be *because* of. An empty `results` means TMDB answered and had
 * nothing to suggest. Neither is a failure and neither gets a heading over an empty track,
 * by the same rule. They stay distinguishable in the type even though they render alike,
 * because the day one of them wants different copy, the caller can already tell them
 * apart.
 */
export interface Recommendations {
  readonly seed: { readonly kind: TitleKind; readonly name: string };
  readonly results: readonly CatalogueResult[];
}

export type RecommendationsOutcome =
  | { readonly ok: true; readonly rail: Recommendations | null }
  | { readonly ok: false; readonly reference: string | null };

export async function readRecommendations(
  userId: UserId,
  kind: TitleKind,
): Promise<RecommendationsOutcome> {
  try {
    const seed = await mostRecentlyWatchedTitle(userId, kind);
    if (seed === null) return { ok: true, rail: null };

    const results = await cachedRecommendations(userId, seed.kind, seed.tmdbId);

    return {
      ok: true,
      rail: { seed: { kind: seed.kind, name: seed.name }, results },
    };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "recommendations" }) };
  }
}
