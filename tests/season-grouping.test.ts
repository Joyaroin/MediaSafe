import { describe, expect, it } from "vitest";

import { defaultSeason, groupBySeason } from "@/app/(signed-in)/library/season-grouping";

/**
 * Issue #216: Specials (season 0) render after the last real season, not before Season 1,
 * on every surface that groups episodes through this one function. The database order and
 * every derived-state rule are untouched — only where `groupBySeason` places season 0 in
 * its returned entries changes.
 */

const ep = (seasonNo: number) => ({ seasonNo });

describe("groupBySeason", () => {
  it("moves specials after the highest-numbered season", () => {
    const grouped = groupBySeason([ep(0), ep(1), ep(2)]);

    expect(grouped.map(([seasonNo]) => seasonNo)).toEqual([1, 2, 0]);
  });

  it("renders exactly as before for a show with no season zero", () => {
    const grouped = groupBySeason([ep(1), ep(2), ep(3)]);

    expect(grouped.map(([seasonNo]) => seasonNo)).toEqual([1, 2, 3]);
  });

  it("keeps real seasons in ascending order and their episodes grouped correctly", () => {
    const grouped = groupBySeason([ep(0), ep(0), ep(1), ep(1), ep(2)]);

    expect(grouped.map(([seasonNo]) => seasonNo)).toEqual([1, 2, 0]);
    expect(grouped.map(([, inSeason]) => inSeason.length)).toEqual([2, 1, 2]);
  });

  it("groups a show that is nothing but specials into a single season-zero entry", () => {
    const grouped = groupBySeason([ep(0), ep(0)]);

    expect(grouped.map(([seasonNo]) => seasonNo)).toEqual([0]);
    expect(grouped[0][1]).toHaveLength(2);
  });
});

/**
 * Issue #224: the season chosen when a reader opens a show. `defaultSeason` reads the
 * same episodes `groupBySeason` does, and asks nothing that function could not also
 * answer from the same list — `upNext` is a fact `getTitleDetail` attaches to at most one
 * episode.
 */
const epUpNext = (seasonNo: number, upNext = false) => ({ seasonNo, upNext });

describe("defaultSeason", () => {
  it("selects the season holding the up-next episode", () => {
    expect(defaultSeason([epUpNext(1), epUpNext(2, true), epUpNext(3)])).toBe(2);
  });

  it("falls back to the first season, ahead of specials, when nothing is up next", () => {
    // A show with no released episodes — the acceptance criterion's own case — is one
    // instance of "nothing is up next"; `getTitleDetail` gives two more (unstarted, and
    // finished to the edge of what is mirrored), and this makes no distinction between
    // any of them.
    expect(defaultSeason([epUpNext(0), epUpNext(1), epUpNext(2)])).toBe(1);
  });

  it("falls back to specials when the show is nothing but specials", () => {
    expect(defaultSeason([epUpNext(0), epUpNext(0)])).toBe(0);
  });
});
