import { describe, expect, it } from "vitest";

import {
  airDateInWords,
  episodeCode,
  episodeMetaLine,
  remainingInWords,
} from "@/app/(signed-in)/up-next/episode-card-line";

/**
 * The four strings an episode card prints — issue #250.
 *
 * They are a module rather than four expressions inside the card precisely so this suite
 * can exist: `vitest.config.mts` runs in `node` with no DOM, which is the same split
 * `up-next-mark.ts` and `tests/up-next-tile-mark.test.ts` already draw. A rule that only
 * exists inside a component is a rule nothing here can assert.
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

describe("airDateInWords", () => {
  it("writes the short month, so the card's last line does not wrap", () => {
    expect(airDateInWords("2026-03-12")).toBe("12 Mar 2026");
  });

  /**
   * An `air_date` is a `date` column with no instant in it. Reading it in the runner's
   * local zone would move a date across midnight for anyone west of UTC — the same
   * exposure `db/views.ts` refuses for the comparison, refused here for the rendering.
   */
  it("does not shift the date into the local zone", () => {
    expect(airDateInWords("2026-01-01")).toBe("1 Jan 2026");
    expect(airDateInWords("2026-12-31")).toBe("31 Dec 2026");
  });

  it("is null where TMDB has not dated the episode", () => {
    expect(airDateInWords(null)).toBeNull();
  });
});

describe("episodeMetaLine", () => {
  it("joins the date and the runtime with the build's own separator", () => {
    expect(episodeMetaLine({ airDate: "2026-03-12", runtimeMins: 47 })).toBe(
      "12 Mar 2026 · 47 min",
    );
  });

  it("drops the date it does not have rather than placeholding it", () => {
    expect(episodeMetaLine({ airDate: null, runtimeMins: 47 })).toBe("47 min");
  });

  it("drops the runtime it does not have", () => {
    expect(episodeMetaLine({ airDate: "2026-03-12", runtimeMins: null })).toBe(
      "12 Mar 2026",
    );
  });

  /**
   * `null` and not `""`: the card renders no `<p>` at all for it, rather than an empty one
   * holding the space a real line would have. `title-meta-line.ts` states the same reason
   * for the same shape.
   */
  it("is null when the catalogue has neither fact", () => {
    expect(episodeMetaLine({ airDate: null, runtimeMins: null })).toBeNull();
  });
});
