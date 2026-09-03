import { describe, expect, it } from "vitest";

import { libraryProgressFraction } from "@/app/(signed-in)/library/library-progress-fraction";

/**
 * Issue #324: the library card bar's fraction, in isolation from the query and the
 * render — the pure rule `SPEC.md`'s Testing Decisions ask for.
 */
describe("libraryProgressFraction", () => {
  it("is null when nothing has released, regardless of watched", () => {
    expect(libraryProgressFraction(0, 0)).toBeNull();
  });

  it("is zero for something released and nothing watched — an empty bar, not no bar", () => {
    expect(libraryProgressFraction(0, 4)).toBe(0);
  });

  it("is the watched share of what has released", () => {
    expect(libraryProgressFraction(2, 4)).toBe(0.5);
  });

  it("is 1 when every released episode has been watched", () => {
    expect(libraryProgressFraction(4, 4)).toBe(1);
  });
});
