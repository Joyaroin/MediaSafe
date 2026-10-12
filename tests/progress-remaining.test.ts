import { describe, expect, it } from "vitest";

import {
  progressEpisode,
  progressLine,
  remainingCount,
  remainingLine,
  seasonWatchProgress,
} from "@/app/(signed-in)/library/progress-remaining";
import type { EpisodeDetail } from "@/db/access";

/**
 * Issue #228: progress and remaining, read from the same `episodes`
 * `TitleDetailRow` already carries — matching `library_entry_progress` /
 * `library_entry_remaining` (`db/views.ts`) exactly, so a client-side answer here is never a
 * second definition of the one those views already evaluate server-side.
 */

/**
 * `stillPath`, `airDate` and `runtimeMins` are `null` on every episode here and are never
 * read by anything under test — issue #253 put them on `EpisodeDetail` for the episode
 * page, and progress and remaining are counts over `(seasonNo, episodeNo, watched)` that
 * no artwork or runtime could change. They are written out rather than cast away so that
 * this factory keeps producing a real `EpisodeDetail`, and a field added to that type in
 * future still fails here rather than being absorbed by an `as`.
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

describe("progressEpisode", () => {
  it("is null when nothing has been watched", () => {
    expect(progressEpisode([ep(1, 1, false), ep(1, 2, false)])).toBeNull();
  });

  it("is the highest-numbered watched episode within a season", () => {
    expect(progressEpisode([ep(1, 1, true), ep(1, 2, true), ep(1, 3, false)])?.episodeNo).toBe(2);
  });

  it("prefers a later season over a higher episode number in an earlier one", () => {
    const episode = progressEpisode([ep(1, 9, true), ep(2, 1, true), ep(2, 2, false)]);
    expect(episode).toMatchObject({ seasonNo: 2, episodeNo: 1 });
  });

  it("ignores specials (season 0), watched or not", () => {
    expect(progressEpisode([ep(0, 1, true), ep(1, 1, false)])).toBeNull();
  });
});

describe("remainingCount", () => {
  it("counts every unwatched season-numbered episode", () => {
    expect(remainingCount([ep(1, 1, true), ep(1, 2, false), ep(2, 1, false)])).toBe(2);
  });

  it("is zero once every real episode has a watch", () => {
    expect(remainingCount([ep(1, 1, true), ep(1, 2, true)])).toBe(0);
  });

  it("does not count specials", () => {
    expect(remainingCount([ep(0, 1, false), ep(0, 2, false)])).toBe(0);
  });
});

describe("progressLine and remainingLine", () => {
  it("say 'Not started' and the full remaining count for an unwatched show", () => {
    const episodes = [ep(1, 1, false), ep(1, 2, false)];
    expect(progressLine(episodes)).toBe("Not started");
    expect(remainingLine(episodes)).toBe("2 episodes");
  });

  it("name the furthest watched episode by its spoken name", () => {
    const episodes = [ep(1, 1, true), ep(1, 2, false)];
    expect(progressLine(episodes)).toBe("Season 1, Episode 1 — Episode 1");
    expect(remainingLine(episodes)).toBe("1 episode");
  });
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
    // A next episode in the specials still reads the last regular season, the way
    // `watchProgress` leaves the specials out of the whole-show count.
    expect(seasonWatchProgress(show, show[0])?.seasonNo).toBe(2);
  });

  it("has no season to report for a show with only specials, or none at all", () => {
    expect(seasonWatchProgress([ep(0, 1, true)], null)).toBeNull();
    expect(seasonWatchProgress([], null)).toBeNull();
  });
});
