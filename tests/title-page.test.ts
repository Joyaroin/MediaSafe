import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  finishedSeasons,
  nextToWatch,
  seasonMarkTarget,
  titlePrimaryAction,
} from "@/app/(signed-in)/library/title-page";
import type { EpisodeDetail } from "@/db/access";

/**
 * Issue #357 — the title page's rules, as the functions that decide them. Each takes what
 * the page already holds and returns what the reader is offered, so the page is one render
 * of these answers rather than a second place the rules live.
 */

const TODAY = "2026-09-23";

let counter = 0;

function episode(over: Partial<EpisodeDetail> = {}): EpisodeDetail {
  counter += 1;
  return {
    id: `episode-${counter}`,
    seasonNo: 1,
    episodeNo: 1,
    name: `Episode ${counter}`,
    stillPath: null,
    airDate: "2026-01-01",
    runtimeMins: 50,
    overview: null,
    watched: false,
    watches: 0,
    upNext: false,
    ...over,
  } as EpisodeDetail;
}

/** A season of `count` episodes, all aired, the first `watched` of them watched. */
function season(seasonNo: number, count: number, watched = 0): EpisodeDetail[] {
  return Array.from({ length: count }, (_, index) =>
    episode({
      seasonNo,
      episodeNo: index + 1,
      watched: index < watched,
      watches: index < watched ? 1 : 0,
    }),
  );
}

describe("the main button", () => {
  it("offers Add for a title that is not in the library", () => {
    expect(
      titlePrimaryAction({ owned: false, kind: "show", state: null, nextEpisode: null }),
    ).toEqual({ kind: "add", label: "Add" });
    expect(
      titlePrimaryAction({ owned: false, kind: "film", state: null, nextEpisode: null }),
    ).toEqual({ kind: "add", label: "Add" });
  });

  it("offers the next episode for a show being watched", () => {
    const next = episode({ seasonNo: 4, episodeNo: 1 });

    expect(
      titlePrimaryAction({ owned: true, kind: "show", state: "watching", nextEpisode: next }),
    ).toEqual({ kind: "mark-episode", label: "Mark S4 E1 watched", episode: next });
  });

  it("still offers the next episode for a show that was given up on", () => {
    const next = episode({ seasonNo: 2, episodeNo: 3 });

    expect(
      titlePrimaryAction({ owned: true, kind: "show", state: "abandoned", nextEpisode: next }),
    ).toEqual({ kind: "mark-episode", label: "Mark S2 E3 watched", episode: next });
  });

  it("offers nothing for a show with no episode left to watch", () => {
    expect(
      titlePrimaryAction({ owned: true, kind: "show", state: "caught_up", nextEpisode: null }),
    ).toEqual({ kind: "none" });
    expect(
      titlePrimaryAction({ owned: true, kind: "show", state: "finished", nextEpisode: null }),
    ).toEqual({ kind: "none" });
  });

  it("offers Mark watched for a film not yet seen, and Watch again for one that has been", () => {
    expect(
      titlePrimaryAction({ owned: true, kind: "film", state: "watchlist", nextEpisode: null }),
    ).toEqual({ kind: "mark-film", label: "Mark watched" });
    expect(
      titlePrimaryAction({ owned: true, kind: "film", state: "finished", nextEpisode: null }),
    ).toEqual({ kind: "rewatch-film", label: "Watch again" });
  });
});

describe("the next episode to watch", () => {
  it("is the first aired, unwatched regular episode after the furthest one watched", () => {
    const episodes = [...season(1, 3, 3), ...season(2, 3, 1)];

    expect(nextToWatch(episodes, TODAY)).toBe(episodes[4]);
  });

  it("skips a gap behind the furthest watched episode rather than going back to it", () => {
    const episodes = season(1, 4);
    const withGap = episodes.map((one, index) =>
      index === 2 ? { ...one, watched: true, watches: 1 } : one,
    );

    expect(nextToWatch(withGap, TODAY)).toBe(withGap[3]);
  });

  it("is the first episode when nothing has been watched", () => {
    const episodes = season(1, 3);

    expect(nextToWatch(episodes, TODAY)).toBe(episodes[0]);
  });

  it("is nothing when the next episode has not aired yet", () => {
    const episodes = [...season(1, 2, 2), episode({ seasonNo: 1, episodeNo: 3, airDate: "2026-10-01" })];

    expect(nextToWatch(episodes, TODAY)).toBeNull();
  });

  it("is nothing when the next episode has no air date", () => {
    const episodes = [...season(1, 1, 1), episode({ seasonNo: 1, episodeNo: 2, airDate: null })];

    expect(nextToWatch(episodes, TODAY)).toBeNull();
  });

  it("never offers a special", () => {
    const episodes = [episode({ seasonNo: 0, episodeNo: 1 }), ...season(1, 1, 1)];

    expect(nextToWatch(episodes, TODAY)).toBeNull();
  });
});

describe("Mark season watched", () => {
  it("covers every aired, unwatched episode up to the season's last aired one", () => {
    const episodes = season(4, 8, 2);
    const target = seasonMarkTarget(episodes, 4, TODAY);

    expect(target?.through).toBe(episodes[7]);
    expect(target?.covered).toEqual(episodes.slice(2));
  });

  it("stops at the last episode that has aired", () => {
    const episodes = [...season(1, 2), episode({ seasonNo: 1, episodeNo: 3, airDate: "2026-12-01" })];
    const target = seasonMarkTarget(episodes, 1, TODAY);

    expect(target?.through).toBe(episodes[1]);
    expect(target?.covered).toEqual(episodes.slice(0, 2));
  });

  it("includes earlier seasons' gaps, the way marking up to an episode does", () => {
    const episodes = [...season(1, 2, 1), ...season(2, 2)];
    const target = seasonMarkTarget(episodes, 2, TODAY);

    expect(target?.covered).toEqual([episodes[1], episodes[2], episodes[3]]);
  });

  it("is offered for no season that is already watched", () => {
    expect(seasonMarkTarget(season(1, 3, 3), 1, TODAY)).toBeNull();
  });

  it("is offered for no season that has not aired", () => {
    const episodes = [episode({ seasonNo: 1, episodeNo: 1, airDate: "2027-01-01" })];

    expect(seasonMarkTarget(episodes, 1, TODAY)).toBeNull();
  });

  it("is offered for no specials", () => {
    expect(seasonMarkTarget([episode({ seasonNo: 0, episodeNo: 1 })], 0, TODAY)).toBeNull();
  });
});

describe("a season's tick", () => {
  it("marks each regular season whose every episode is watched", () => {
    const episodes = [...season(1, 2, 2), ...season(2, 2, 1), ...season(3, 1, 1)];

    expect([...finishedSeasons(episodes)].sort()).toEqual([1, 3]);
  });

  it("never ticks specials", () => {
    expect(finishedSeasons([episode({ seasonNo: 0, watched: true, watches: 1 })]).size).toBe(0);
  });
});

/**
 * Issue #440 — the title hero's *N of M* season count rolls the way Tonight's already
 * does (`tests/motion-moments.test.ts`'s "rolls only the featured episode line and the
 * count"), through the existing `Roll` rather than a second mechanism. Read as source,
 * the way that file reads `tonight-featured.tsx`: there is no rendering harness in this
 * repo for a component with its own state, and what matters here — which text is inside
 * the `Roll` and which is not — is a textual fact about the markup, not a runtime one.
 */
describe("the title hero's season count (issue #440)", () => {
  const TITLE_HERO = readFileSync("app/(signed-in)/library/title-hero.tsx", "utf8");

  it("rolls the watched count through the existing Roll, keyed on the fraction", () => {
    expect(TITLE_HERO).toMatch(/<Roll\s+rollKey=\{`\$\{watched\}\/\$\{total\}`\}/);
  });

  it("does not roll the season heading beside the count", () => {
    const [, rollBody] = TITLE_HERO.match(
      /<Roll\s+rollKey=\{`\$\{watched\}\/\$\{total\}`\}[^>]*>([\s\S]*?)\n\s*<\/Roll>/,
    )!;

    expect(rollBody).not.toContain("seasonHeading");
  });

  it("adds no second Roll to the hero", () => {
    expect(TITLE_HERO.match(/<Roll\b/g)).toHaveLength(1);
  });
});
