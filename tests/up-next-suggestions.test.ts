import { beforeEach, describe, expect, it, vi } from "vitest";

import { asUserId } from "@/db/access";
import type { CatalogueResult } from "@/tmdb/mirror";

/**
 * Up next's empty-state rail — issue #365. `suggestions.ts` decides between the
 * recommendation rail and TMDB's trending titles, and keeps a failure apart from an empty
 * rail; both of those are decisions over reads, so the reads are faked here and the
 * decision is what is asserted. The seed read itself is `tests/watched-seed.test.ts`'s.
 *
 * `suggestions.ts` is `server-only` and reaches `tmdb/catalogue.ts` through the cache,
 * so both are replaced: the guard throws under plain Node, and nothing here should call
 * TMDB.
 */
vi.mock("server-only", () => ({}));

const reads = vi.hoisted(() => ({
  mostRecentlyWatchedTitle: vi.fn(),
  libraryCatalogueKeys: vi.fn(),
  cachedRecommendations: vi.fn(),
  cachedTrendingTitles: vi.fn(),
  referenceFor: vi.fn(() => "sentry-1"),
}));

vi.mock("@/db/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/access")>()),
  mostRecentlyWatchedTitle: reads.mostRecentlyWatchedTitle,
  libraryCatalogueKeys: reads.libraryCatalogueKeys,
}));
vi.mock("@/cache/borrowed-facts", () => ({
  cachedRecommendations: reads.cachedRecommendations,
  cachedTrendingTitles: reads.cachedTrendingTitles,
}));
vi.mock("@/errors/reference", () => ({ referenceFor: reads.referenceFor }));

const { readSuggestions } = await import("@/app/(signed-in)/up-next/suggestions");

const READER = asUserId("reader");

function result(tmdbId: number, kind: CatalogueResult["kind"] = "show"): CatalogueResult {
  return {
    kind,
    tmdbId,
    name: `Title ${tmdbId}`,
    releaseYear: 2024,
    posterPath: `/poster-${tmdbId}.jpg`,
    audienceScore: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reads.libraryCatalogueKeys.mockResolvedValue(new Set());
});

describe("what an empty Up next offers to add", () => {
  it("offers what TMDB recommends off the most recent watch, of either kind", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue({ kind: "film", tmdbId: 7, name: "Arrival" });
    reads.cachedRecommendations.mockResolvedValue([result(1, "film"), result(2, "film")]);

    const outcome = await readSuggestions(READER);

    // Across both kinds: Up next has no Films/Shows mode to narrow the seed by.
    expect(reads.mostRecentlyWatchedTitle).toHaveBeenCalledWith(READER, null);
    expect(reads.cachedRecommendations).toHaveBeenCalledWith(READER, "film", 7);
    expect(reads.cachedTrendingTitles).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ok: true,
      rail: { seed: "Arrival", results: [{ tmdbId: 1 }, { tmdbId: 2 }] },
    });
  });

  it("falls back to trending for a reader who has watched nothing", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue(null);
    reads.cachedTrendingTitles.mockResolvedValue([result(3), result(4, "film")]);

    const outcome = await readSuggestions(READER);

    expect(reads.cachedRecommendations).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ok: true,
      rail: { seed: null, results: [{ tmdbId: 3 }, { tmdbId: 4 }] },
    });
  });

  it("falls back to trending when the seed has nothing recommended off it", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue({ kind: "show", tmdbId: 9, name: "Severance" });
    reads.cachedRecommendations.mockResolvedValue([]);
    reads.cachedTrendingTitles.mockResolvedValue([result(5)]);

    const outcome = await readSuggestions(READER);

    expect(outcome).toMatchObject({ ok: true, rail: { seed: null, results: [{ tmdbId: 5 }] } });
  });

  it("leaves out what is already in the library, since every card offers to add it", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue(null);
    reads.cachedTrendingTitles.mockResolvedValue([result(3), result(4)]);
    reads.libraryCatalogueKeys.mockResolvedValue(new Set(["show:3"]));

    const outcome = await readSuggestions(READER);

    expect(outcome).toMatchObject({ ok: true, rail: { results: [{ tmdbId: 4 }] } });
    if (outcome.ok) expect(outcome.rail.results).toHaveLength(1);
  });

  it("reports a failed read as a failure, never as an empty rail", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue(null);
    reads.cachedTrendingTitles.mockRejectedValue(new Error("TMDB answered 503"));

    const outcome = await readSuggestions(READER);

    expect(outcome).toEqual({ ok: false, reference: "sentry-1" });
  });
});
