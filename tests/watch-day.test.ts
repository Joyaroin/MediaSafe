import { describe, expect, it } from "vitest";

import { watchDayInWords } from "@/app/(signed-in)/you/watch-day";

/**
 * Issue #371's relative day, in the reader's zone. `now` is fixed: Saturday 10 October
 * 2026, 12:00 UTC.
 */
const now = new Date("2026-10-10T12:00:00Z");

describe("the day a watch happened, in words", () => {
  it("says Today and Yesterday for the two most recent days", () => {
    expect(watchDayInWords(new Date("2026-10-10T08:00:00Z"), "UTC", now)).toBe("Today");
    expect(watchDayInWords(new Date("2026-10-09T23:59:00Z"), "UTC", now)).toBe("Yesterday");
  });

  it("names the weekday for the rest of the past week", () => {
    expect(watchDayInWords(new Date("2026-10-06T20:00:00Z"), "UTC", now)).toBe("Tue");
    expect(watchDayInWords(new Date("2026-10-04T20:00:00Z"), "UTC", now)).toBe("Sun");
  });

  it("gives a date past a week, and the year only once it is not this one", () => {
    expect(watchDayInWords(new Date("2026-10-03T20:00:00Z"), "UTC", now)).toBe("3 Oct");
    expect(watchDayInWords(new Date("2025-03-04T20:00:00Z"), "UTC", now)).toBe("4 Mar 2025");
  });

  it("buckets by the reader's own midnight, not UTC's", () => {
    // 23:30 on the 9th in New York is already the 10th in UTC.
    const lateEvening = new Date("2026-10-10T03:30:00Z");
    expect(watchDayInWords(lateEvening, "UTC", now)).toBe("Today");
    expect(watchDayInWords(lateEvening, "America/New_York", now)).toBe("Yesterday");

    // And the other way: 00:30 on the 10th in Tokyo is still the 9th in UTC.
    const pastMidnight = new Date("2026-10-09T15:30:00Z");
    expect(watchDayInWords(pastMidnight, "UTC", now)).toBe("Yesterday");
    expect(watchDayInWords(pastMidnight, "Asia/Tokyo", now)).toBe("Today");
  });
});
