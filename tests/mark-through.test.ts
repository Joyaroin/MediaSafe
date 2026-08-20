import { describe, expect, it } from "vitest";

import type { EpisodeDetail } from "@/db/access";
import {
  coveredThrough,
  markThroughLabel,
} from "@/app/(signed-in)/library/mark-through";

/**
 * The rule that decides where *watched up to here* is drawn and what it would write —
 * issue #196, on the reader's side of the wire.
 *
 * ── Why this is tested apart from the row that draws it ──────────────────────────────
 *
 * `tests/programme-note.test.ts` renders the episode list and asserts the control is
 * there or is not; what it cannot do legibly is enumerate the *set*, because a rendered
 * row shows a control rather than the eleven episodes behind it. The count is what the
 * confirmation puts in front of the reader before anything is written, so an off-by-one
 * here is a number the reader agrees to that is not the number that lands.
 *
 * `db/access.ts`'s `markWatchedThrough` states the same rule against the table and
 * `tests/mark-watched-through.test.ts` proves it there. **The duplication is deliberate
 * and is not a second definition**: the server derives the set from `episode` because a
 * list of ids from a browser is not a thing it may trust, and the browser derives it from
 * what is on screen because the reader has to be told the size before pressing. The two
 * are checked against each other by being written from the same sentence — *above season
 * zero, at or before this episode, not already watched* — and by the pair of tests
 * asserting the same episodes.
 */

function episode(overrides: Partial<EpisodeDetail> = {}): EpisodeDetail {
  return {
    id: "e",
    seasonNo: 1,
    episodeNo: 1,
    name: "Winter Is Coming",
    watched: false,
    upNext: false,
    ...overrides,
  };
}

/** A show as `getTitleDetail` hands one over: ordered, with a special in front. */
function show(
  marks: readonly { season: number; number: number; watched?: boolean }[],
): EpisodeDetail[] {
  return marks.map((one) =>
    episode({
      id: `s${one.season}e${one.number}`,
      seasonNo: one.season,
      episodeNo: one.number,
      name: `S${one.season}E${one.number}`,
      watched: one.watched ?? false,
    }),
  );
}

const ids = (episodes: readonly EpisodeDetail[] | null) =>
  episodes === null ? null : episodes.map((one) => one.id);

describe("coveredThrough", () => {
  it("covers this episode and every earlier one, across the season boundary", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2 },
      { season: 2, number: 1 },
      { season: 2, number: 2 },
    ]);

    expect(ids(coveredThrough(episodes, episodes[2]))).toEqual([
      "s1e1",
      "s1e2",
      "s2e1",
    ]);
  });

  it("is absent on a row with nothing unwatched before it", () => {
    const episodes = show([
      { season: 1, number: 1, watched: true },
      { season: 1, number: 2 },
    ]);

    // *Strike it* already does the whole of what a press here would do, so the control
    // would be a second way to record one episode rather than a way to record many.
    expect(coveredThrough(episodes, episodes[1])).toBeNull();
  });

  it("is absent on the first episode of a show, which has nothing before it at all", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2 },
    ]);

    expect(coveredThrough(episodes, episodes[0])).toBeNull();
  });

  it("is absent on every row of a show already recorded", () => {
    const episodes = show([
      { season: 1, number: 1, watched: true },
      { season: 1, number: 2, watched: true },
      { season: 1, number: 3, watched: true },
    ]);

    // Issue #194's own words: a show already recorded is not covered in dead controls.
    expect(episodes.every((one) => coveredThrough(episodes, one) === null)).toBe(true);
  });

  it("is offered on a watched row with a gap behind it, and covers only the gap", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2, watched: true },
      { season: 1, number: 3, watched: true },
    ]);

    // Progress is a high-water mark (`db/views.ts`), so a skipped episode sits behind a
    // watched one and this is the control that closes it. The already-watched rows are
    // not in the set: a second row against them is a rewatch.
    expect(ids(coveredThrough(episodes, episodes[2]))).toEqual(["s1e1"]);
  });

  it("never counts a special, in the set or in what makes the control appear", () => {
    const episodes = show([
      { season: 0, number: 1 },
      { season: 0, number: 2 },
      { season: 1, number: 1, watched: true },
      { season: 1, number: 2 },
    ]);

    // Two unwatched specials sit before S1E2 and neither of them arms the control: they
    // are not what it would write, so they are not what makes it worth drawing.
    expect(coveredThrough(episodes, episodes[3])).toBeNull();
  });

  it("is never offered on a special itself", () => {
    const episodes = show([
      { season: 0, number: 1 },
      { season: 0, number: 2 },
      { season: 1, number: 1 },
    ]);

    expect(coveredThrough(episodes, episodes[1])).toBeNull();
  });

  it("covers an unwatched special's numbered neighbours and not the special", () => {
    const episodes = show([
      { season: 0, number: 1 },
      { season: 1, number: 1 },
      { season: 1, number: 2 },
    ]);

    expect(ids(coveredThrough(episodes, episodes[2]))).toEqual(["s1e1", "s1e2"]);
  });
});

describe("markThroughLabel", () => {
  it("names the episode it would mark through, in full", () => {
    const label = markThroughLabel(
      episode({ seasonNo: 2, episodeNo: 4, name: "Woe's Hollow" }),
    );

    // `CONTEXT.md`: an episode is never referred to by number alone, and a control whose
    // only text is a glyph is the surface that most needs that rule kept.
    expect(label).toContain("Season 2, Episode 4");
    expect(label).toContain("Woe's Hollow");
  });

  it("says Specials rather than Season 0, as every other surface does", () => {
    const label = markThroughLabel(episode({ seasonNo: 0, episodeNo: 1, name: "Making Of" }));

    expect(label).toContain("Specials");
    expect(label).not.toContain("Season 0");
  });

  it("says an unnamed episode is not yet named rather than printing its number twice", () => {
    const label = markThroughLabel(episode({ seasonNo: 1, episodeNo: 3, name: null }));

    expect(label).toContain("Not yet named");
  });
});
