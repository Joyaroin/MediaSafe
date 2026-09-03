import { describe, expect, it } from "vitest";

import {
  episodeCode,
  remainingInWords,
} from "@/app/(signed-in)/up-next/episode-card-line";

/**
 * The two strings an episode card prints — issue #250, narrowed by #321.
 *
 * They are a module rather than expressions inside the card precisely so this suite can
 * exist: `vitest.config.mts` runs in `node` with no DOM, which is the same split
 * `up-next-mark.ts` and `tests/up-next-tile-mark.test.ts` already draw. A rule that only
 * exists inside a component is a rule nothing here can assert.
 *
 * `airDateInWords` and `episodeMetaLine` were here too, and are deleted with #321: the air
 * date and the runtime come off the meta line, and `episodeMetaLine` was the whole of what
 * read either of them. `library/episode-facts.ts` keeps its own `airDateInWords`, in a
 * longer register for a different surface, and its suite is untouched.
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

  /**
   * Printed, not withheld. *None left after this one* is the most useful thing this line
   * ever says, and an absence at zero would be indistinguishable from a card with no
   * answer at all.
   */
  it("prints zero rather than going absent", () => {
    expect(remainingInWords(0)).toBe("+0 remaining");
  });
});
