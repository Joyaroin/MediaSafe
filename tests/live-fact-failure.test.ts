import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIVE_FACT_FAILURE } from "@/app/(signed-in)/library/live-fact-copy";

/**
 * The sentence a live-only section of title detail says when its read failed.
 *
 * Tested as a string and off the component's source rather than rendered, because
 * `live-title-facts.tsx`'s import graph reaches `title-detail-actions.ts` →
 * `tmdb/catalogue.ts`, which is `import "server-only"` and throws on import outside Next's
 * own build. `tests/programme-note.test.ts` records the same boundary. That is why
 * `live-fact-copy.ts` exists: it has no imports, so the sentence is reachable here.
 */
describe("the live-fact failure sentence", () => {
  /**
   * It says something failed, without claiming the catalogue is empty. *TMDB has nothing
   * for this* over a request that timed out is the same lie `tvtracker` told, one field
   * down.
   */
  it("says that a read failed, without claiming the catalogue is empty", () => {
    expect(LIVE_FACT_FAILURE.toLowerCase()).toContain("did not load");
    expect(LIVE_FACT_FAILURE).not.toContain("TMDB");
  });

  /**
   * No technical string. *The one technical string allowed anywhere is the reference id*,
   * drawn beside the failure by `ReferenceLine` rather than interpolated into it. A digit
   * appearing here is the first sign of an HTTP status having been let in.
   */
  it("carries no status, code or interpolation", () => {
    expect(LIVE_FACT_FAILURE).not.toMatch(/\d/);
    expect(LIVE_FACT_FAILURE).not.toContain("${");
  });
});

/**
 * The constant is the one actually rendered — the assertion that keeps the block above
 * from being a test of a string nobody uses.
 */
describe("the failure branch goes through the named sentence", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "app", "(signed-in)", "library", "live-title-facts.tsx"),
    "utf8",
  );

  it("renders the constant rather than prose written at the branch", () => {
    expect(source).toContain("{LIVE_FACT_FAILURE}");
  });

  /** And the sentence has not been pasted back in beside the constant that replaced it. */
  it("does not also carry the sentence as a literal", () => {
    expect(source).not.toContain("This did not load.");
  });
});
