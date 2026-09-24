import { describe, expect, it } from "vitest";

import { episodePath, locateEpisode } from "@/app/(signed-in)/library/episode-run";
import { groupBySeason } from "@/app/(signed-in)/library/season-grouping";

/**
 * *Previous and next move between episodes without returning to the show*, and *the first
 * and last episode of a run render without a broken control* — two of issue #253's
 * acceptance criteria, and the whole of what `episode-run.ts` decides.
 *
 * Driven from plain objects, with no React, no database and no browser, because the rule
 * is a rule about order and both of the things it depends on — the list and the position
 * in it — are known before anything starts. That is the same standard `mark-up-to.test.ts`
 * holds its own pure module to.
 */

/** An episode as the run cares about it: an id, and the season it is in. `locateEpisode`
 *  is structurally typed on exactly these two, so this is the whole of the input. */
const ep = (seasonNo: number, episodeNo: number) => ({
  id: `s${seasonNo}e${episodeNo}`,
  seasonNo,
  episodeNo,
});

/**
 * A show as `getTitleDetail` hands one over: ordered `(season_no, episode_no)`, **specials
 * first**, because that is what Postgres does with a zero. Every fixture below is built
 * this way rather than in the order a reader sees, so that the reordering under test is
 * something the module does and not something the fixture arrived with.
 */
const SHOW = [ep(0, 1), ep(0, 2), ep(1, 1), ep(1, 2), ep(1, 3), ep(2, 1)];

/** The ids either side, said compactly so a failure prints something readable. */
const around = (episodeId: string) => {
  const found = locateEpisode(SHOW, episodeId);
  return found === null
    ? null
    : { previous: found.previous?.id ?? null, next: found.next?.id ?? null };
};

describe("locateEpisode", () => {
  it("finds the episode the route names", () => {
    expect(locateEpisode(SHOW, "s1e2")?.episode).toMatchObject({
      seasonNo: 1,
      episodeNo: 2,
    });
  });

  it("moves within a season", () => {
    expect(around("s1e2")).toEqual({ previous: "s1e1", next: "s1e3" });
  });

  it("moves across a season boundary rather than stopping at it", () => {
    // The criterion in its plainest form: a reader at the end of season one reaches
    // season two without going back to the show.
    expect(around("s1e3")).toEqual({ previous: "s1e2", next: "s2e1" });
  });

  /**
   * **The run is the order on the glass, not the order in the table.**
   *
   * `SHOW` arrives specials-first, and issue #216 puts specials **last** on every surface
   * that draws a season list. So the first episode of the run is `s1e1` and it has nothing
   * before it — walking the array as handed over would have given it `s0e2`, a *previous*
   * pointing at a row the season list the reader came from draws below, not above.
   *
   * This is the assertion that fails if `locateEpisode` ever stops going through
   * `groupBySeason`.
   */
  it("puts the first numbered episode at the front of the run, not after the specials", () => {
    expect(around("s1e1")).toEqual({ previous: null, next: "s1e2" });
  });

  /** And the specials are at the far end, reachable from the last numbered episode. */
  it("puts the specials after the highest-numbered season", () => {
    expect(around("s2e1")).toEqual({ previous: "s1e3", next: "s0e1" });
    expect(around("s0e1")).toEqual({ previous: "s2e1", next: "s0e2" });
  });

  /**
   * A special is **in** the run and is not walked past. Season 0 is excluded from derived
   * state (`db/views.ts`) and from the *watched up to here* set (`mark-up-to.ts`) because
   * both of those are about what a watch means; neither is a reason to strand a special's
   * own page with a *previous* that nothing arrives from.
   */
  it("does not skip a special when moving through the run", () => {
    expect(around("s0e2")).toEqual({ previous: "s0e1", next: null });
  });

  /**
   * The two ends, which is where the *no broken control* criterion is decided: the caller
   * draws nothing where this answers `null`, so `null` at both ends is what makes that
   * possible without a disabled target.
   */
  it("has no previous at the front and no next at the back", () => {
    expect(around("s1e1")?.previous).toBeNull();
    expect(around("s0e2")?.next).toBeNull();
  });

  it("has neither on a show with one episode", () => {
    expect(locateEpisode([ep(1, 1)], "s1e1")).toMatchObject({
      previous: null,
      next: null,
    });
  });

  /**
   * `null`, not a throw and not a partial answer — a URL naming an episode of another
   * show, one a sweep repointed, or a film, which has no episodes at all. `page.tsx`
   * turns this into `notFound()`, because a read that succeeded and found nothing is not
   * a read that failed.
   */
  it("answers null for an episode this show does not have", () => {
    expect(locateEpisode(SHOW, "s9e9")).toBeNull();
  });

  it("answers null for a film, which has no episodes to locate", () => {
    expect(locateEpisode([], "s1e1")).toBeNull();
  });

  /**
   * The run is exactly the season list, flattened — asserted against `groupBySeason`
   * itself rather than against a second hand-written expectation of specials-last.
   *
   * Two copies of an ordering is how the page and the list it was opened from come to
   * disagree about what *next* means, which is the failure this whole module exists to
   * make impossible. If `groupBySeason` changes, this test changes with it rather than
   * against it.
   */
  it("walks the same order the season list draws", () => {
    const onScreen = groupBySeason(SHOW).flatMap(([, inSeason]) => inSeason.map((one) => one.id));

    const walked: string[] = [onScreen[0]];
    for (;;) {
      const next = locateEpisode(SHOW, walked[walked.length - 1])?.next;
      if (next === null || next === undefined) break;
      walked.push(next.id);
    }

    expect(walked).toEqual(onScreen);
  });
});

describe("episodePath", () => {
  /**
   * **Its own surface, carrying one id** — issue #289. It sat beneath the owning library
   * entry until then, on #253's reasoning that a title you have not added has no entry id
   * and so no URL to build. The entry has left the address: two ids in one path can
   * disagree, and the ownership that used to be structural in the URL's shape is now the
   * `ownedBy` in `libraryEntryIdForEpisode`, which is where every other read in this
   * codebase keeps it.
   */
  it("is the episode's own route, under no entry", () => {
    expect(episodePath("episode-9")).toBe("/episodes/episode-9");
    expect(episodePath("episode-9")).not.toContain("/library/");
  });

  /**
   * Keyed by the episode's own id and never by its numbers. `db/tables.ts`: *`season_no`
   * and `episode_no` are borrowed attributes, not identity* — TMDB renumbers seasons and
   * inserts specials, and a URL built on the numbers would silently come to name a
   * different episode after a sweep. A bookmark that still resolves and is now about
   * something else is worse than one that 404s.
   */
  it("names the episode by id, so a renumbering cannot repoint a bookmark", () => {
    const path = episodePath("episode-9");

    expect(path).toContain("episode-9");
    expect(path).not.toMatch(/\/s\d|season|\/\d+\/\d+$/);
  });
});
