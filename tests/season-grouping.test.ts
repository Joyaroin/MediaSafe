import { describe, expect, it } from "vitest";

import { groupBySeason } from "@/app/(signed-in)/library/season-grouping";

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
