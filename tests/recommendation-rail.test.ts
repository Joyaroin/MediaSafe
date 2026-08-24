import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { catalogueResultsOfKind } from "@/tmdb/mirror";

/**
 * *Because you watched*, and the two properties that would break quietly.
 *
 * The rail is a TMDB read on a screen whose whole job is a different TMDB read, and it is
 * the first thing in this application to show a number that is **not** your rating. Both
 * of those fail silently: a rail that fails looks like a rail with nothing to say, and a
 * borrowed score next to an owned one looks like a number you set.
 */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const RAIL = code("app/(signed-in)/search/recommendation-rail.tsx");
const READ = code("app/(signed-in)/search/recommendations.ts");
const CONTEXT = readFileSync("CONTEXT.md", "utf8");

describe("a rail that failed and a rail with nothing in it", () => {
  /**
   * `SPEC.md` §3's whole discipline, on the newest surface in the app. *No seed* and *TMDB
   * suggested nothing* both render nothing; a **failure** renders the inline read failure.
   * The failure branch is three lines and its absence would look like success.
   */
  it("renders the read failure rather than nothing when the read failed", () => {
    expect(RAIL).toMatch(/if \(!outcome\.ok\)/);
    expect(RAIL).toContain("RailReadFailure");

    // And the empty branch is reached only *after* the failure branch — a reversed order
    // would swallow every failure as "nothing to recommend".
    expect(RAIL.indexOf("!outcome.ok")).toBeLessThan(RAIL.indexOf("outcome.rail === null"));
  });

  /**
   * The one catch in the read, and what it may not do.
   *
   * `mediasafe/no-empty-catch` allows catching in order to *report* — the rule forbids
   * manufacturing a successful-looking empty result out of a failure. This catch returns
   * `ok: false` with a reference, which has no results on it to mistake for an answer.
   */
  it("never turns a failure into an empty list of recommendations", () => {
    expect(READ).not.toMatch(/catch[\s\S]{0,120}(results: \[\]|return \[\])/);
    expect(READ).toMatch(/catch[\s\S]{0,160}ok: false/);
  });

  /**
   * A failing rail must not take the search field with it — `AGENTS.md`'s blast-radius
   * table, *one region failed to load* → inline, replacing that region. The rail is
   * rendered inside its own boundary and returns its failure rather than throwing.
   */
  it("keeps its failure inside itself rather than throwing to the route", () => {
    expect(RAIL).not.toMatch(/\bthrow\b/);
  });
});

describe("the audience score is not your rating", () => {
  /**
   * `CONTEXT.md` defines Rating as one score **you** give a title, and names *score* and
   * *stars* avoid-words for it. The borrowed number needed its own name, and the glossary
   * is where a name becomes binding.
   */
  it("has a glossary entry of its own", () => {
    expect(CONTEXT).toContain("Audience score");
    expect(CONTEXT).toMatch(/\*\*Audience score\*\*[\s\S]{0,600}_Avoid_:[^\n]*rating/);
  });

  /** `0` is TMDB's "nobody voted", not a title the audience scored zero. */
  it("reads an unvoted title as no score rather than as zero", () => {
    const [result] = catalogueResultsOfKind("film", {
      results: [{ id: 1, title: "Unseen", vote_average: 0 }],
    });

    expect(result?.audienceScore).toBeNull();
  });

  it("keeps a real score", () => {
    const [result] = catalogueResultsOfKind("show", {
      results: [{ id: 2, name: "Watched", vote_average: 8.4 }],
    });

    expect(result?.audienceScore).toBe(8.4);
  });

  /**
   * Placement is half the separation: the score appears where you are judging something
   * you do **not** own, and nowhere a library surface could put it beside your rating.
   */
  it("appears on no library surface", () => {
    for (const path of [
      "app/(signed-in)/library/library-entry-cell.tsx",
      "app/(signed-in)/library/programme-note-content.tsx",
      "app/(signed-in)/you/you-title-tile.tsx",
    ]) {
      expect(code(path)).not.toContain("audienceScore");
    }
  });

  /** And it is labelled where it does appear, so the number is visibly somebody else's. */
  it("is labelled rather than left as a bare number", () => {
    expect(RAIL).toContain("Audience {result.audienceScore.toFixed(1)}");
  });
});
