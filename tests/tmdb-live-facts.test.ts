import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  castFrom,
  crewFrom,
  synopsisFrom,
  watchProvidersFrom,
  type TmdbCreditsPayload,
  type TmdbOverviewPayload,
  type TmdbWatchProvidersPayload,
} from "@/tmdb/live-facts";

/**
 * The mapping behind title detail's three live-only sections, against fixtures shaped
 * like TMDB's documented responses. `tests/fixtures/tmdb/README.md` says where these
 * came from and why they are not a live capture.
 *
 * Every case here is one the mapping has to survive without throwing and without
 * inventing a value TMDB did not send — the same discipline `tests/tmdb-mirror.test.ts`
 * holds its own fixtures to.
 */

function fixture<T>(name: string): T {
  const file = path.join(import.meta.dirname, "fixtures", "tmdb", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const movieCredits = fixture<TmdbCreditsPayload>("movie-credits");
const tvCredits = fixture<TmdbCreditsPayload>("tv-credits");
const movieProviders = fixture<TmdbWatchProvidersPayload>("movie-watch-providers");
const tvProviders = fixture<TmdbWatchProvidersPayload>("tv-watch-providers");

describe("synopsisFrom", () => {
  it("passes an overview through", () => {
    expect(synopsisFrom({ overview: "A film about a support group." })).toBe(
      "A film about a support group.",
    );
  });

  it("turns TMDB's empty string into null rather than an empty paragraph", () => {
    expect(synopsisFrom({ overview: "" })).toBeNull();
  });

  it("turns a missing overview into null", () => {
    expect(synopsisFrom({} as TmdbOverviewPayload)).toBeNull();
  });
});

describe("castFrom", () => {
  const cast = castFrom(movieCredits);

  it("returns the lead cast in TMDB's own billing order", () => {
    expect(cast.map((member) => member.name)).toEqual([
      "Edward Norton",
      "Brad Pitt",
      "Helena Bonham Carter",
      "Meat Loaf",
      "Jared Leto",
      "Zach Grenier",
      "Eion Bailey",
      "Christina Cabot",
    ]);
  });

  it("caps the list rather than listing the whole call sheet", () => {
    // The fixture carries nine cast entries; the ninth (order 8, "David Andrews") and
    // the malformed tenth are both past the cap.
    expect(cast).toHaveLength(8);
  });

  it("drops a cast member TMDB sent with no name", () => {
    expect(cast.some((member) => member.id === 99999)).toBe(false);
  });

  it("turns an empty character into null rather than an empty credit line", () => {
    const uncredited = cast.find((member) => member.id === 5);
    expect(uncredited?.character).toBeNull();
  });

  it("keeps a real character name", () => {
    const narrator = cast.find((member) => member.id === 819);
    expect(narrator?.character).toBe("The Narrator");
  });
});

describe("crewFrom", () => {
  it("keeps only the named jobs a programme would credit", () => {
    const crew = crewFrom(movieCredits);
    expect(crew.map((member) => member.job)).toEqual(["Director", "Writer"]);
    // The director of photography and the editor are real credits and are not this
    // section's job — a page about the title, not a scroll through every department.
    expect(crew.some((member) => member.job === "Director of Photography")).toBe(false);
    expect(crew.some((member) => member.job === "Editor")).toBe(false);
  });

  it("credits one person once, under the first job the fixture lists", () => {
    const crew = crewFrom(movieCredits);
    // David Fincher is listed twice — Director, then Producer (not a lead job anyway).
    // Only the Director credit survives, and only once.
    expect(crew.filter((member) => member.id === 7467)).toHaveLength(1);
    expect(crew.find((member) => member.id === 7467)?.job).toBe("Director");
  });

  it("recognises a show's Creator credit, and keeps it over a later Director credit for the same person", () => {
    const crew = crewFrom(tvCredits);
    expect(crew.map((member) => `${member.name} — ${member.job}`)).toEqual([
      "Vince Gilligan — Creator",
    ]);
  });
});

describe("watchProvidersFrom", () => {
  it("returns the streaming services for the requested region", () => {
    const providers = watchProvidersFrom(movieProviders, "US");
    expect(providers.map((provider) => provider.name)).toEqual([
      "Netflix",
      "Disney Plus",
    ]);
  });

  it("never returns a rent or buy listing — this is reserved for streaming", () => {
    const providers = watchProvidersFrom(movieProviders, "US");
    expect(providers.some((provider) => provider.name === "Apple TV")).toBe(false);
  });

  it("reads free and ads-supported services, not only flatrate", () => {
    const providers = watchProvidersFrom(movieProviders, "CA");
    expect(providers.map((provider) => provider.name)).toEqual(["Crave", "Tubi"]);
  });

  it("returns nothing for a region TMDB has no listing for, rather than throwing", () => {
    expect(watchProvidersFrom(movieProviders, "JP")).toEqual([]);
  });

  it("deduplicates a provider TMDB lists in two buckets of the same region", () => {
    const providers = watchProvidersFrom(tvProviders, "US");
    expect(providers.filter((provider) => provider.id === 337)).toHaveLength(1);
  });

  it("drops a provider TMDB sent with no name", () => {
    const providers = watchProvidersFrom(tvProviders, "GB");
    expect(providers).toEqual([]);
  });
});
