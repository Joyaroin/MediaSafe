import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RailView } from "@/app/(signed-in)/search/rail-view";
import { RecentlyAddedView } from "@/app/(signed-in)/search/recently-added-view";
import type { RailOutcome } from "@/app/(signed-in)/search/recommendations";
import type { CatalogueResult } from "@/tmdb/mirror";

/**
 * Search's idle rails (issue #542): which rail a kind gets, and how each outcome is drawn.
 *
 * Two halves. `readRail` is the read — a seed gives *Because you watched*, no seed gives
 * *Trending this week*, a failure is carried as data. Its collaborators are faked, because
 * it is `import "server-only"` and sits in front of TMDB. The views are drawn with
 * `renderToStaticMarkup`, as `library-surface.test.ts` does, so the three outcomes —
 * a failure with its reference, an empty answer, and a populated rail — are asserted on
 * what a reader would see.
 */

vi.mock("server-only", () => ({}));

const reads = vi.hoisted(() => ({
  mostRecentlyWatchedTitle: vi.fn(),
  cachedRecommendations: vi.fn(),
  cachedTrendingThisWeek: vi.fn(),
  referenceFor: vi.fn(),
}));

vi.mock("@/db/access", () => ({ mostRecentlyWatchedTitle: reads.mostRecentlyWatchedTitle }));
vi.mock("@/cache/borrowed-facts", () => ({
  cachedRecommendations: reads.cachedRecommendations,
  cachedTrendingThisWeek: reads.cachedTrendingThisWeek,
}));
vi.mock("@/errors/reference", () => ({ referenceFor: reads.referenceFor }));
// The failure's retry is a client component over the router; there is no router here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { readRail } = await import("@/app/(signed-in)/search/recommendations");

const reader = "reader-1" as never;

function result(tmdbId: number, name: string, kind: "show" | "film"): CatalogueResult {
  return {
    kind,
    tmdbId,
    name,
    releaseYear: 2024,
    posterPath: `/${tmdbId}.jpg`,
    audienceScore: 7.25,
    overview: null,
  } as unknown as CatalogueResult;
}

beforeEach(() => {
  for (const mock of Object.values(reads)) mock.mockReset();
  reads.referenceFor.mockReturnValue("ref-42");
});

describe("which rail a kind gets", () => {
  it("is Because you watched off the seed, when the reader has watched one", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue({ kind: "show", tmdbId: 1396, name: "Hacks" });
    reads.cachedRecommendations.mockResolvedValue([result(1, "Somewhere", "show")]);

    const outcome = await readRail(reader, "show");

    expect(reads.mostRecentlyWatchedTitle).toHaveBeenCalledWith(reader, "show");
    expect(reads.cachedRecommendations).toHaveBeenCalledWith(reader, "show", 1396);
    expect(reads.cachedTrendingThisWeek).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ok: true,
      rail: { kind: "because-you-watched", seed: { name: "Hacks" } },
    });
  });

  it("is Trending this week for that kind, when there is no seed", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue(null);
    reads.cachedTrendingThisWeek.mockResolvedValue([result(2, "Anora", "film")]);

    const outcome = await readRail(reader, "film");

    expect(reads.cachedTrendingThisWeek).toHaveBeenCalledWith(reader, "film");
    expect(reads.cachedRecommendations).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, rail: { kind: "trending-this-week" } });
  });

  it("does not fall through to trending when a seed's recommendations come back empty", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue({ kind: "show", tmdbId: 1, name: "Hacks" });
    reads.cachedRecommendations.mockResolvedValue([]);

    const outcome = await readRail(reader, "show");

    expect(reads.cachedTrendingThisWeek).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, rail: { kind: "because-you-watched", results: [] } });
  });

  it("carries a failed trending read as data with the reference, never as an empty rail", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue(null);
    reads.cachedTrendingThisWeek.mockRejectedValue(new Error("TMDB is unreachable"));

    expect(await readRail(reader, "show")).toEqual({ ok: false, reference: "ref-42" });
  });

  it("carries a failed recommendations read the same way", async () => {
    reads.mostRecentlyWatchedTitle.mockResolvedValue({ kind: "show", tmdbId: 1, name: "Hacks" });
    reads.cachedRecommendations.mockRejectedValue(new Error("TMDB is unreachable"));

    expect(await readRail(reader, "show")).toEqual({ ok: false, reference: "ref-42" });
  });
});

describe("how a rail's outcome is drawn", () => {
  const draw = (outcome: RailOutcome, mode: "show" | "film" = "show") =>
    renderToStaticMarkup(createElement(RailView, { outcome, mode }));

  it("draws a Trending this week rail of links to the catalogue page, with no Add", () => {
    const html = draw({
      ok: true,
      rail: {
        kind: "trending-this-week",
        results: [result(7, "Severance", "show"), result(8, "Andor", "show")],
      },
    });

    expect(html).toContain("Trending this week");
    expect(html).not.toContain("Because you watched");
    expect(html).toContain('href="/catalogue/show/7"');
    expect(html).toContain('href="/catalogue/show/8"');
    expect(html).toContain("Severance");
    expect(html).not.toMatch(/>Add</);
    expect(html).not.toContain("<button");
  });

  it("draws Because you watched with the seed's name", () => {
    const html = draw({
      ok: true,
      rail: {
        kind: "because-you-watched",
        seed: { kind: "show", name: "Hacks" },
        results: [result(7, "Severance", "show")],
      },
    });

    expect(html).toContain("Because you watched");
    expect(html).toContain("Hacks");
    expect(html).not.toContain("Trending this week");
  });

  it("gives the two kinds' trending rails different heading ids", () => {
    const rail = { kind: "trending-this-week", results: [result(1, "A", "show")] } as const;
    expect(draw({ ok: true, rail }, "show")).toContain('id="trending-this-week-show"');
    expect(draw({ ok: true, rail }, "film")).toContain('id="trending-this-week-film"');
  });

  it("draws nothing at all for a successful empty read — no heading over an empty track", () => {
    expect(draw({ ok: true, rail: { kind: "trending-this-week", results: [] } })).toBe("");
    expect(
      draw({
        ok: true,
        rail: { kind: "because-you-watched", seed: { kind: "show", name: "Hacks" }, results: [] },
      }),
    ).toBe("");
  });

  it("draws the inline read failure with its reference for a failed read, and no rail", () => {
    const html = draw({ ok: false, reference: "ref-42" });

    expect(html).toContain("ref-42");
    expect(html).not.toContain("Trending this week");
    expect(html).not.toContain("Because you watched");
    expect(html).toContain("<button");
  });
});

describe("how Recently added is drawn", () => {
  const entry = (id: string, name: string) => ({
    libraryEntryId: id,
    name,
    releaseYear: 2022,
    posterPath: `/${id}.jpg`,
    posterColour: null,
    kind: "show" as const,
  });
  const draw = (outcome: Parameters<typeof RecentlyAddedView>[0]["outcome"]) =>
    renderToStaticMarkup(createElement(RecentlyAddedView, { outcome }));

  it("opens each title's page, in the order it was handed", () => {
    const html = draw({ ok: true, entries: [entry("e-2", "Hacks"), entry("e-1", "Anora")] });

    expect(html).toContain("Recently added");
    expect(html).toContain('href="/titles/e-2"');
    expect(html.indexOf("Hacks")).toBeLessThan(html.indexOf("Anora"));
  });

  it("is absent for an empty library", () => {
    expect(draw({ ok: true, entries: [] })).toBe("");
  });

  it("is the inline read failure with its reference when the read failed", () => {
    const html = draw({ ok: false, reference: "ref-9" });

    expect(html).toContain("ref-9");
    expect(html).not.toContain("Recently added");
  });
});
