import "server-only";

import { cachedRecommendations, cachedTrendingThisWeek } from "@/cache/borrowed-facts";
import { mostRecentlyWatchedTitle, type UserId } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import type { CatalogueResult, TitleKind } from "@/tmdb/mirror";

/**
 * The read behind each idle-Search rail, and the answers it can give.
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
 * ── An empty `results` is success, and renders nothing ──────────────────────────────
 *
 * TMDB answered and had nothing to suggest. That is not a failure and it gets no heading
 * over an empty track, by the same rule. It stays distinguishable from a failure in the
 * type, because `ok: false` has no `rail` on it to read.
 *
 * ── One rail per kind: *Because you watched*, or else *Trending this week* ──────────
 *
 * Issue #542. Where the reader has watched something of this kind, the rail is
 * recommendations off that seed. Where they have not, there is no seed to be *because* of,
 * and the rail is what is trending this week for that kind. A seed whose recommendations
 * come back empty does **not** fall through to trending: the seed decides which rail this
 * is, and an empty one is nothing, as above.
 */
export type Rail =
  | {
      readonly kind: "because-you-watched";
      readonly seed: { readonly kind: TitleKind; readonly name: string };
      readonly results: readonly CatalogueResult[];
    }
  | { readonly kind: "trending-this-week"; readonly results: readonly CatalogueResult[] };

export type RailOutcome =
  | { readonly ok: true; readonly rail: Rail }
  | { readonly ok: false; readonly reference: string | null };

export async function readRail(userId: UserId, kind: TitleKind): Promise<RailOutcome> {
  try {
    const seed = await mostRecentlyWatchedTitle(userId, kind);

    if (seed === null) {
      return {
        ok: true,
        rail: { kind: "trending-this-week", results: await cachedTrendingThisWeek(userId, kind) },
      };
    }

    const results = await cachedRecommendations(userId, seed.kind, seed.tmdbId);

    return {
      ok: true,
      rail: {
        kind: "because-you-watched",
        seed: { kind: seed.kind, name: seed.name },
        results,
      },
    };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "recommendations" }) };
  }
}
