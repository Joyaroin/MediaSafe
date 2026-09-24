import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Issue #336 — search results land in the same rhythm as *Because you watched* beside
 * them, rather than appearing all at once while the rail staggers.
 *
 * `AGENTS.md`'s discipline for this repository is a caller, not a fifth surface: no new
 * keyframe, no new `@utility`, no raw duration. So what is worth asserting is exactly
 * that — the results list and the rail's own track carry the *same* class, the "nothing
 * found" sentence carries the single-element arrival utility every other whole-region
 * reveal already uses, and neither addition introduces a literal the timing ramp does not
 * already own.
 */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const SEARCH_SURFACE = code("app/(signed-in)/search/search-surface.tsx");
const RAIL = code("app/(signed-in)/search/recommendation-rail.tsx");
const GLOBALS = readFileSync("app/globals.css", "utf8");

describe("search results arrive in the same rhythm as the rail beside them", () => {
  it("gives the results list the same stagger utility the rail's track already uses", () => {
    const resultsBlock = SEARCH_SURFACE.match(/function Results\([\s\S]*?\n}/)![0];
    expect(resultsBlock).toMatch(/className="[^"]*\bstagger-rise\b[^"]*"/);

    // Not a second implementation of the idea — the rail's own track carries the
    // identical class name, so the two surfaces genuinely share one rule.
    expect(RAIL).toMatch(/className="[^"]*\bstagger-rise\b[^"]*"/);
  });

  it("gives the 'nothing found' sentence the existing single-element arrival utility", () => {
    const noResultsBlock = SEARCH_SURFACE.match(/function NoResults\([\s\S]*?\n}/)![0];
    expect(noResultsBlock).toMatch(/className="[^"]*\barrive\b[^"]*"/);
    // `arrive-panel` is the heavier, further-travelling variant for a panel swap — the
    // sentence is a region filling in, not a replacement, so it takes the plain one.
    expect(noResultsBlock).not.toMatch(/\barrive-panel\b/);
  });

  it("declares no new keyframe or utility to do either — both are the existing ones", () => {
    expect(GLOBALS.match(/@utility stagger-rise\s*\{/g)).toHaveLength(1);
    expect(GLOBALS.match(/@utility arrive\s*\{/g)).toHaveLength(1);
    expect(SEARCH_SURFACE).not.toMatch(/@utility|@keyframes/);
  });

  it("introduces no raw duration literal on the search screen", () => {
    expect(SEARCH_SURFACE).not.toMatch(/\d+m?s\b/);
  });

  it("changes no control — the two states still branch on the same phases", () => {
    // The motion is a class on markup already there; the discriminated union that decides
    // what renders is untouched.
    expect(SEARCH_SURFACE).toContain('<NoResults query={phase.answer.query} />');
    expect(SEARCH_SURFACE).toContain("<Results results={group.state.results} />");
  });
});
