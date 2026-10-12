import { describe, expect, it } from "vitest";

import { seasonWatchProgress } from "@/app/(signed-in)/library/progress-remaining";
import type { EpisodeDetail } from "@/db/access";

/**
 * `stillPath`, `airDate` and `runtimeMins` are `null` on every episode here and are never
 * read by anything under test — the season's progress is a count over `(seasonNo,
 * episodeNo, watched)` that no artwork or runtime could change. They are written out
 * rather than cast away so that this factory keeps producing a real `EpisodeDetail`, and a
 * field added to that type in future still fails here rather than being absorbed by an
 * `as`.
 */
const ep = (seasonNo: number, episodeNo: number, watched: boolean): EpisodeDetail => ({
  id: `${seasonNo}-${episodeNo}`,
  seasonNo,
  episodeNo,
  name: `Episode ${episodeNo}`,
  // Derived rather than passed: this factory's one input about watching is `watched`, and
  // a count that disagreed with it would be a fixture describing a row the read cannot
  // produce (`db/access.ts` computes both from one number).
  watches: watched ? 1 : 0,
  stillPath: null,
  airDate: null,
  runtimeMins: null,
  watched,
  upNext: false,
});

/**
 * The title hero's *1 of 8 · Season 1* (Charcoal §8.6, issue #403): one season's count, and
 * which season is the one the reader is in.
 */
describe("seasonWatchProgress", () => {
  const show = [
    ep(0, 1, false),
    ep(1, 1, true),
    ep(1, 2, true),
    ep(2, 1, true),
    ep(2, 2, false),
    ep(2, 3, false),
  ];

  it("counts the season the next episode is in, and only that season", () => {
    expect(seasonWatchProgress(show, show[4])).toEqual({ seasonNo: 2, watched: 1, total: 3 });
  });

  it("falls back to the last regular season when nothing is next", () => {
    // Caught up or finished: no next episode, so the last season stands for the show.
    expect(seasonWatchProgress(show, null)).toEqual({ seasonNo: 2, watched: 1, total: 3 });
  });

  it("does not take the order of the list on trust", () => {
    expect(seasonWatchProgress([...show].reverse(), null)?.seasonNo).toBe(2);
  });

  it("never reports the specials as the season you are in", () => {
    // A next episode in the specials still reads the last regular season.
    expect(seasonWatchProgress(show, show[0])?.seasonNo).toBe(2);
  });

  it("has no season to report for a show with only specials, or none at all", () => {
    expect(seasonWatchProgress([ep(0, 1, true)], null)).toBeNull();
    expect(seasonWatchProgress([], null)).toBeNull();
  });
});
