import { describe, expect, it } from "vitest";

import { unwatchCount } from "@/app/(signed-in)/library/unwatch-confirm";

/**
 * Issue #315. `unwatchCount` is the one piece of the watch menu's confirmation that is a
 * rule rather than markup — `watch-menu.tsx`'s own docblock and `tests/watch-menu-sweep
 * .test.ts` explain why the dialog itself is asserted by reading source instead of by
 * rendering it, so this is where the number itself gets an actual test.
 */
describe("unwatchCount", () => {
  it("names one watch in the singular", () => {
    // Unlike `mark-up-to.ts`'s `markUpToCount`, a count of one is not a case that should
    // never have been drawn — it is the ordinary case: most watched episodes carry
    // exactly one watch, and that is exactly the one Unwatch removes.
    expect(unwatchCount(1)).toBe("1 watch");
  });

  it("names more than one watch in the plural", () => {
    expect(unwatchCount(2)).toBe("2 watches");
    expect(unwatchCount(5)).toBe("5 watches");
  });

  it("groups a rewatched episode's count the way every other count in the app does", () => {
    // `lists/title-count.ts`'s own reasoning for `en-GB`, borrowed rather than
    // re-decided: a formatting difference between two confirmations that count things is
    // not something anyone would ever see side by side to catch.
    expect(unwatchCount(1234)).toBe("1,234 watches");
  });

  it("never drops to zero — Unwatch is never offered on an unwatched episode", () => {
    // `programme-note-episodes.tsx`'s own rule: "A watched row offers an unwatch. That is
    // the whole rule." This is not a case the confirmation is asked to word gracefully;
    // it is asserted here only so a future caller sees this function was never meant to
    // answer it, rather than discovering that by reading the arithmetic.
    expect(unwatchCount(0)).toBe("0 watches");
  });
});
