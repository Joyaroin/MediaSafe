import { describe, expect, it } from "vitest";

import { seasonProgress } from "@/app/(signed-in)/up-next/up-next-mark";
import type { QueuedEpisode } from "@/db/access";
import {
  episodeCode,
  remainingInWords,
  seasonCountInWords,
} from "@/app/(signed-in)/up-next/episode-card-line";

/**
 * The two strings an episode card prints — issue #250, narrowed by #321.
 *
 * They are a module rather than expressions inside the card precisely so this suite can
 * exist: `vitest.config.mts` runs in `node` with no DOM, which is the same split
 * `up-next-mark.ts` and `tests/up-next-tile-mark.test.ts` already draw. A rule that only
 * exists inside a component is a rule nothing here can assert.
 */
describe("episodeCode", () => {
  it("pads both numbers to two digits", () => {
    expect(episodeCode(2, 5)).toBe("S02 · E05");
  });

  it("leaves numbers already two digits alone", () => {
    expect(episodeCode(12, 24)).toBe("S12 · E24");
  });

  it("does not truncate a three-digit episode", () => {
    expect(episodeCode(1, 104)).toBe("S01 · E104");
  });

  /**
   * The card is not allowed to be the one surface in the build that calls season zero
   * `S00`. `season-grouping.ts` owns that answer for the heading and for the spoken name,
   * and this asks it rather than spelling a third one.
   */
  it("calls season zero Specials, unpadded", () => {
    expect(episodeCode(0, 3)).toBe("Specials · E03");
  });
});

describe("remainingInWords", () => {
  it("reads as an addition to the episode being offered", () => {
    expect(remainingInWords(8)).toBe("+8 remaining");
  });

  /** Withheld at zero: with aired-only counting, zero is *this is the last one out*. */
  it("goes absent at zero", () => {
    expect(remainingInWords(0)).toBeNull();
  });
});

/**
 * Issue #538: a Tonight row counts the season, not the show. `n` is what is watched before
 * the episode on the row, `m` what has aired in its season — the featured slot's own
 * `N of M`, from the same `seasonProgress`.
 */
describe("seasonCountInWords", () => {
  it("reads as n of m in the season", () => {
    expect(seasonCountInWords({ watched: 1, released: 10 })).toBe("1 of 10 this season");
  });

  it("reads 0 of 8 on the first episode of a new season", () => {
    const entry = {
      seasonNo: 1,
      seasonWatched: 8,
      seasonReleased: 8,
      queue: { episodes: [queued(1, 8, 8), queued(2, 1, 8)], more: false },
    };
    // Season 2's opener, with the finale of season 1 marked from the row.
    expect(seasonCountInWords(seasonProgress(entry, entry.queue.episodes[1], 1))).toBe(
      "0 of 8 this season",
    );
  });

  it("counts what is watched before a season's last episode, not the episode itself", () => {
    const entry = {
      seasonNo: 1,
      seasonWatched: 9,
      seasonReleased: 10,
      queue: { episodes: [queued(1, 10, 10)], more: false },
    };
    expect(seasonCountInWords(seasonProgress(entry, entry.queue.episodes[0], 0))).toBe(
      "9 of 10 this season",
    );
  });

  it("is the same count the row has after marking the episode in front of it", () => {
    const entry = {
      seasonNo: 1,
      seasonWatched: 1,
      seasonReleased: 10,
      queue: { episodes: [queued(1, 2, 10), queued(1, 3, 10)], more: false },
    };
    expect(seasonCountInWords(seasonProgress(entry, entry.queue.episodes[0], 0))).toBe(
      "1 of 10 this season",
    );
    expect(seasonCountInWords(seasonProgress(entry, entry.queue.episodes[1], 1))).toBe(
      "2 of 10 this season",
    );
  });
});

function queued(seasonNo: number, episodeNo: number, seasonReleased: number) {
  return {
    episodeId: `e-${seasonNo}-${episodeNo}`,
    seasonNo,
    episodeNo,
    episodeName: null,
    stillPath: null,
    seasonReleased,
  } as unknown as QueuedEpisode;
}
