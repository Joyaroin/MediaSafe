import { describe, expect, it } from "vitest";

import { upNextHeadingWord } from "@/app/(signed-in)/up-next/up-next-heading-band";

/**
 * The Up next heading's band rule, driven directly — issue #319, spec #317.
 *
 * `upNextHeadingWord` takes the instant and the zone as arguments and reads no clock of
 * its own, which is what makes *9am in Auckland* a case a test can state rather than a
 * fact that depends on when the suite happens to run — `tests/upcoming-grouping.test.ts`
 * is the prior art for the same move.
 */

/** An instant on 2026-08-24, built in UTC so every case states its own zone rather than
 *  inheriting the runner's. */
function utc(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 7, 24, hour, minute));
}

describe("the three bands, in UTC", () => {
  it("is This morning from midnight up to midday", () => {
    expect(upNextHeadingWord("UTC", utc(0, 0))).toBe("This morning");
    expect(upNextHeadingWord("UTC", utc(9, 0))).toBe("This morning");
  });

  it("is This afternoon at the midday boundary, not the tail of the morning", () => {
    expect(upNextHeadingWord("UTC", utc(11, 59))).toBe("This morning");
    expect(upNextHeadingWord("UTC", utc(12, 0))).toBe("This afternoon");
  });

  it("is This afternoon from midday up to six", () => {
    expect(upNextHeadingWord("UTC", utc(15, 0))).toBe("This afternoon");
  });

  it("is Tonight at the six o'clock boundary, not the tail of the afternoon", () => {
    expect(upNextHeadingWord("UTC", utc(17, 59))).toBe("This afternoon");
    expect(upNextHeadingWord("UTC", utc(18, 0))).toBe("Tonight");
  });

  it("is Tonight from six until midnight", () => {
    expect(upNextHeadingWord("UTC", utc(23, 59))).toBe("Tonight");
  });
});

describe("the word follows the reader's zone, not the server's", () => {
  /**
   * 21:00 UTC is already Tonight in UTC itself. In New York (EDT, UTC-4 in August) the
   * same instant is 17:00 — still the afternoon. A module that read a device or server
   * clock instead of this argument could not tell the two apart.
   */
  it("is still the afternoon four hours west, when UTC has already turned to Tonight", () => {
    const instant = utc(21, 0);
    expect(upNextHeadingWord("UTC", instant)).toBe("Tonight");
    expect(upNextHeadingWord("America/New_York", instant)).toBe("This afternoon");
  });

  /**
   * 23:00 UTC is Tonight in UTC. Auckland (NZST, UTC+12 in the southern winter — no
   * daylight saving in August) has already turned over to 11:00 the next morning.
   */
  it("is already the next morning twelve hours east, when UTC has not yet turned over", () => {
    const instant = utc(23, 0);
    expect(upNextHeadingWord("UTC", instant)).toBe("Tonight");
    expect(upNextHeadingWord("Pacific/Auckland", instant)).toBe("This morning");
  });
});
