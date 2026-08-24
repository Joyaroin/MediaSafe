import { describe, expect, it } from "vitest";

import type { EpisodeDetail } from "@/db/access";
import {
  coveredUpTo,
  markUpToCount,
  markUpToLabel,
  withLiveWatched,
} from "@/app/(signed-in)/library/mark-up-to";

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
 * `db/access.ts`'s `markWatchedUpTo` states the same rule against the table and
 * `tests/mark-watched-up-to.test.ts` proves it there. **The duplication is deliberate
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
    // The three mirrored facts #253 put on `EpisodeDetail` for the episode page. Null
    // throughout: the rule under test is *above season zero, at or before this episode,
    // not already watched*, and no still, date or runtime is part of that sentence.
    stillPath: null,
    airDate: null,
    runtimeMins: null,
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

describe("coveredUpTo", () => {
  it("covers this episode and every earlier one, across the season boundary", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2 },
      { season: 2, number: 1 },
      { season: 2, number: 2 },
    ]);

    expect(ids(coveredUpTo(episodes, episodes[2]))).toEqual([
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

    // The checkmark already does the whole of what a press here would do, so the control
    // would be a second way to record one episode rather than a way to record many.
    expect(coveredUpTo(episodes, episodes[1])).toBeNull();
  });

  it("is absent on the first episode of a show, which has nothing before it at all", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2 },
    ]);

    expect(coveredUpTo(episodes, episodes[0])).toBeNull();
  });

  it("is absent on every row of a show already recorded", () => {
    const episodes = show([
      { season: 1, number: 1, watched: true },
      { season: 1, number: 2, watched: true },
      { season: 1, number: 3, watched: true },
    ]);

    // Issue #194's own words: a show already recorded is not covered in dead controls.
    expect(episodes.every((one) => coveredUpTo(episodes, one) === null)).toBe(true);
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
    expect(ids(coveredUpTo(episodes, episodes[2]))).toEqual(["s1e1"]);
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
    expect(coveredUpTo(episodes, episodes[3])).toBeNull();
  });

  it("is never offered on a special itself", () => {
    const episodes = show([
      { season: 0, number: 1 },
      { season: 0, number: 2 },
      { season: 1, number: 1 },
    ]);

    expect(coveredUpTo(episodes, episodes[1])).toBeNull();
  });

  it("covers an unwatched special's numbered neighbours and not the special", () => {
    const episodes = show([
      { season: 0, number: 1 },
      { season: 1, number: 1 },
      { season: 1, number: 2 },
    ]);

    expect(ids(coveredUpTo(episodes, episodes[2]))).toEqual(["s1e1", "s1e2"]);
  });
});

describe("withLiveWatched", () => {
  /**
   * The bug the two-axis review of #196 found, at the seam that fixes it.
   *
   * Without this, the control's visibility came off the server's `EpisodeDetail[]` while
   * the row's own strike came off the marks store — so a landed press dimmed the rows and
   * left every control standing. The second press then offered to record episodes that
   * already carried a watch, and the write inserted nothing: a count agreed to that was
   * not the count that landed, which is the one failure the confirmation exists to stop.
   */
  it("takes the store's answer over the server's once a press has landed", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2 },
      { season: 1, number: 3 },
    ]);

    // What the store looks like the instant a press through S1E3 is applied.
    const landed = withLiveWatched(episodes, () => true);

    expect(coveredUpTo(landed, landed[2])).toBeNull();
    // And the same list before it: the control was there to be pressed.
    expect(coveredUpTo(episodes, episodes[2])).not.toBeNull();
  });

  it("brings the control back when a press is rolled back", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2 },
    ]);

    // A lost write puts every covered row back to unwatched (`watch-marks.ts`), and the
    // control has to come back with them — there is work to redo.
    const rolledBack = withLiveWatched(episodes, () => false);

    expect(ids(coveredUpTo(rolledBack, rolledBack[1]))).toEqual(["s1e1", "s1e2"]);
  });

  it("leaves the server's answer standing for an episode the store has never seen", () => {
    const episodes = show([
      { season: 1, number: 1, watched: true },
      { season: 1, number: 2 },
    ]);

    // `null` is *no surface has shown this episode*, which is not *unwatched* — the same
    // distinction `watch-marks.ts`'s seeding rule turns on.
    const untouched = withLiveWatched(episodes, () => null);

    expect(untouched.map((one) => one.watched)).toEqual([true, false]);
  });

  it("returns the very same objects where nothing has changed", () => {
    const episodes = show([{ season: 1, number: 1 }]);

    // Identity matters here rather than being a nicety: this runs inside a
    // `useSyncExternalStore` snapshot (`use-live-episodes.ts`), and a fresh object every
    // call is a re-render every call, for ever.
    expect(withLiveWatched(episodes, () => null)[0]).toBe(episodes[0]);
    expect(withLiveWatched(episodes, () => false)[0]).toBe(episodes[0]);
  });
});

describe("markUpToCount", () => {
  /**
   * The number the reader agrees to before anything is written. It had no test until the
   * two-axis review of #196 pointed that out — and the count is the whole of what makes
   * a mistaken tap catchable, so an off-by-one here is the confirmation failing at the
   * one job it has.
   */
  it("names the size of the write, singular and plural", () => {
    const episodes = show([
      { season: 1, number: 1 },
      { season: 1, number: 2 },
      { season: 1, number: 3 },
    ]);

    expect(markUpToCount(coveredUpTo(episodes, episodes[2]) ?? [])).toBe("3 episodes");
    expect(markUpToCount([episodes[0]])).toBe("1 episode");
  });

  it("groups a long-running show's thousands the way every other count does", () => {
    // `lists/title-count.ts` formats `en-GB`; a confirmation that did not would differ
    // from its sibling in a way nobody would ever see the two side by side to catch.
    const many = Array.from({ length: 1234 }, (_, index) =>
      episode({ id: `e${index}`, episodeNo: index + 1 }),
    );

    expect(markUpToCount(many)).toBe("1,234 episodes");
  });

  it("counts what a press writes, not what the row sits above", () => {
    const episodes = show([
      { season: 0, number: 1 },
      { season: 1, number: 1 },
      { season: 1, number: 2, watched: true },
      { season: 1, number: 3 },
    ]);

    // The special is not written and the already-watched episode is not re-written, so
    // the number is 2 — not the 4 rows above and including this one.
    expect(markUpToCount(coveredUpTo(episodes, episodes[3]) ?? [])).toBe("2 episodes");
  });
});

describe("markUpToLabel", () => {
  it("names the episode it would mark up to, in full", () => {
    const label = markUpToLabel(
      episode({ seasonNo: 2, episodeNo: 4, name: "Woe's Hollow" }),
    );

    // `CONTEXT.md`: an episode is never referred to by number alone, and a control whose
    // only text is a glyph is the surface that most needs that rule kept.
    expect(label).toContain("Season 2, Episode 4");
    expect(label).toContain("Woe's Hollow");
  });

  it("says Specials rather than Season 0, as every other surface does", () => {
    const label = markUpToLabel(episode({ seasonNo: 0, episodeNo: 1, name: "Making Of" }));

    expect(label).toContain("Specials");
    expect(label).not.toContain("Season 0");
  });

  it("says an unnamed episode is not yet named rather than printing its number twice", () => {
    const label = markUpToLabel(episode({ seasonNo: 1, episodeNo: 3, name: null }));

    expect(label).toContain("Not yet named");
  });
});
