import { describe, expect, it } from "vitest";

import {
  initialsFrom,
  plural,
  qualification,
  watchTimeInWords,
} from "@/app/(signed-in)/you/figures";

/**
 * The pure half of You — issue #247.
 *
 * Everything here is a function over numbers and strings, so all of it runs without a
 * database and without a browser, exactly as the suite around the Stats page's own figures
 * module did for the page You replaces. The surface itself is rendered in
 * `tests/you-surface.test.ts`.
 *
 * `plural` is asserted here since issue #249, which retired `/stats` and with it the module
 * holding the copy that used to carry these cases. It is not You's alone
 * any more: `library/progress-remaining.ts` imports it from this file now that the other
 * copy is gone, so the irregular noun below is a shared contract rather than a local one.
 *
 * ── What is worth asserting on a page made of figures ────────────────────────────────
 *
 * Not that a number appears. The failures worth catching are the ones that leave the page
 * rendering perfectly while it says something untrue:
 *
 *  - a watch-time total rounded *up* into the unit above, so the figure printed is larger
 *    than the data supports;
 *  - a qualification that names one incompleteness and silently drops the other;
 *  - a qualification printed when there is nothing to qualify, which teaches a reader to
 *    skip the line on the day it means something;
 *  - the undated watches described as *not counted here*, which was true on the retired
 *    Stats page and is false on You — every figure on this page counts them
 *    (Watch time: *a watch with no date still counts*).
 */

describe("the plural `s`, and the noun English does not pluralise regularly", () => {
  it("pluralises a regular noun on the count", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(2, "day")).toBe("2 days");
  });

  it("takes the irregular plural as an argument rather than guessing it", () => {
    expect(plural(1, "watch", "watches")).toBe("1 watch");
    expect(plural(2, "watch", "watches")).toBe("2 watches");
  });

  it("groups thousands, so a real history reads as a number rather than a run of digits", () => {
    expect(plural(1_156, "watch", "watches")).toBe("1,156 watches");
  });
});

describe("watch time, in months, days and hours", () => {
  it("is `none` at zero rather than a measurement of nothing", () => {
    expect(watchTimeInWords(0)).toBe("none");
  });

  it("reports minutes on their own below an hour, rather than rounding to none", () => {
    expect(watchTimeInWords(40)).toBe("40 minutes");
    expect(watchTimeInWords(1)).toBe("1 minute");
  });

  it("reports hours, then days, then months as the total reaches each", () => {
    expect(watchTimeInWords(60)).toBe("1 hour");
    expect(watchTimeInWords(60 * 5)).toBe("5 hours");
    expect(watchTimeInWords(60 * 24)).toBe("1 day");
    expect(watchTimeInWords(60 * 24 * 3 + 60 * 4)).toBe("3 days, 4 hours");
  });

  /**
   * A mean month is not a whole number of minutes, so these two round *up* to the next
   * minute before adding the days and hours they are testing for. Rounding down would sit
   * a fraction of a minute below two months, and truncation — the property under test two
   * cases below — would correctly eat an hour of it.
   */
  const twoMonths = Math.ceil(2 * 30.436875 * 24 * 60);

  it("names all three units when all three are there", () => {
    expect(watchTimeInWords(twoMonths + 4 * 24 * 60 + 6 * 60)).toBe(
      "2 months, 4 days, 6 hours",
    );
  });

  it("drops a unit that is zero rather than printing it", () => {
    expect(watchTimeInWords(twoMonths + 6 * 60)).toBe("2 months, 6 hours");
  });

  it("truncates rather than rounding up, so the figure never exceeds the data", () => {
    // One minute short of two hours is one hour.
    expect(watchTimeInWords(119)).toBe("1 hour");
    // One minute short of a day is hours, not a day.
    expect(watchTimeInWords(60 * 24 - 1)).toBe("23 hours");
  });

  it("says nothing about minutes once there is an hour to report", () => {
    expect(watchTimeInWords(60 * 3 + 25)).toBe("3 hours");
  });
});

describe("watch time, with a years term above the ramp", () => {
  /**
   * Minutes for a whole number of mean Gregorian months, rounded up past the fraction —
   * the same reasoning `twoMonths` above gives for why this must ceil rather than floor.
   */
  const monthsInMinutes = (months: number) =>
    Math.ceil(months * 30.436875 * 24 * 60);

  it("stays a months figure just under a year, unchanged from today's ramp", () => {
    expect(watchTimeInWords(monthsInMinutes(11))).toBe("11 months");
  });

  it("reads exactly a year as a year, not twelve months", () => {
    expect(watchTimeInWords(monthsInMinutes(12))).toBe("1 year");
  });

  it("drops a zero month while keeping the year", () => {
    expect(watchTimeInWords(monthsInMinutes(12) + 4 * 24 * 60)).toBe("1 year, 4 days");
  });

  it("caps at three parts, dropping the smallest of what would be four", () => {
    expect(
      watchTimeInWords(monthsInMinutes(14) + 4 * 24 * 60 + 6 * 60),
    ).toBe("1 year, 2 months, 4 days");
  });

  it("agrees with itself in the singular at one year, one month and one day", () => {
    expect(watchTimeInWords(monthsInMinutes(13) + 1 * 24 * 60)).toBe(
      "1 year, 1 month, 1 day",
    );
  });
});

describe("the initials an identity provider's missing avatar falls back to", () => {
  it("takes the first letter of the first and last names", () => {
    expect(initialsFrom("Adham Sedik")).toBe("AS");
    expect(initialsFrom("Mary  Jane  Watson")).toBe("MW");
  });

  it("takes one letter from a single name", () => {
    expect(initialsFrom("adham")).toBe("A");
  });

  it("is empty when there is no letter to take, rather than inventing a placeholder", () => {
    expect(initialsFrom("")).toBe("");
    expect(initialsFrom("   ")).toBe("");
  });

  it("counts a character rather than a code unit", () => {
    expect(initialsFrom("😀 Sedik")).toBe("😀S");
  });
});

describe("the one line that qualifies the figures", () => {
  it("is absent when there is nothing to qualify", () => {
    expect(qualification({ watchesWithoutRuntime: 0, undatedWatches: 0 })).toBeNull();
  });

  it("names the watches carrying no runtime, and says the times are a floor", () => {
    const line = qualification({ watchesWithoutRuntime: 3, undatedWatches: 0 });

    expect(line).toContain("3 watches");
    expect(line).toContain("no runtime");
    expect(line).toContain("floor");
    expect(line).not.toContain("no date");
  });

  it("names the undated watches, and does not claim they are left out", () => {
    const line = qualification({ watchesWithoutRuntime: 0, undatedWatches: 2 });

    expect(line).toContain("2 watches");
    expect(line).toContain("no date");
    expect(line).not.toContain("not counted");
    expect(line).not.toContain("no runtime");
  });

  it("names both in one line when both are there", () => {
    const line = qualification({ watchesWithoutRuntime: 3, undatedWatches: 2 });

    expect(line).toContain("no runtime");
    expect(line).toContain("no date");
    expect(line?.split(".").filter((part) => part.trim() !== "")).toHaveLength(1);
  });

  it("agrees with itself in the singular", () => {
    const line = qualification({ watchesWithoutRuntime: 1, undatedWatches: 1 });

    expect(line).toContain("1 watch carried no runtime");
    expect(line).toContain("1 watch carries no date");
    expect(line).not.toContain("1 watches");
  });
});
