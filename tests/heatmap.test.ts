import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildHeatmap,
  cellLabel,
  shadeFor,
  yearWindow,
  yearWindowSince,
} from "@/app/(signed-in)/you/heatmap";
import { YearHeatmap } from "@/app/(signed-in)/you/year-heatmap";
import type { YearWatch } from "@/db/access";

/**
 * Issue #372's heatmap, pure: the window, the bucketing in the reader's zone (DST
 * included), the shading and the labels, and the grid's markup.
 */

function aWatch(watchedAt: string, overrides: Partial<YearWatch> = {}): YearWatch {
  return {
    watchId: `watch-${watchedAt}`,
    libraryEntryId: "entry-1",
    titleName: "Severance",
    seasonNo: 1,
    episodeNo: 2,
    episodeName: "Half Loop",
    watchedAt: new Date(watchedAt),
    ...overrides,
  };
}

describe("the window", () => {
  it("is exactly twelve months ending today", () => {
    const days = yearWindow("2026-10-10");
    expect(days[0]).toBe("2025-10-11");
    expect(days.at(-1)).toBe("2026-10-10");
    expect(days).toHaveLength(365);
  });

  it("holds 366 days when it spans a 29 February", () => {
    const days = yearWindow("2028-10-10");
    expect(days[0]).toBe("2027-10-11");
    expect(days).toContain("2028-02-29");
    expect(days).toHaveLength(366);
  });

  it("starts on 1 March when it ends on 29 February", () => {
    expect(yearWindow("2028-02-29")[0]).toBe("2027-03-01");
  });

  it("asks the database for a little more than the window, never less", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    // The window's first day starts no earlier than 2025-10-10T10:00Z (UTC+14).
    expect(yearWindowSince(now).getTime()).toBeLessThan(Date.parse("2025-10-10T10:00:00Z"));
  });
});

describe("bucketing, in the reader's zone", () => {
  it("puts a watch on the reader's day, not UTC's", () => {
    // 23:30 on 9 October in New York is 03:30 on the 10th in UTC.
    const watches = [aWatch("2026-10-10T03:30:00Z")];

    const inUtc = buildHeatmap(watches, "UTC", "2026-10-10");
    const inNewYork = buildHeatmap(watches, "America/New_York", "2026-10-10");

    expect(inUtc.days.find((one) => one.day === "2026-10-10")?.count).toBe(1);
    expect(inNewYork.days.find((one) => one.day === "2026-10-09")?.count).toBe(1);
    expect(inNewYork.days.find((one) => one.day === "2026-10-10")?.count).toBe(0);
  });

  it("buckets the 23-hour day the clocks go forward on, and its neighbours, correctly", () => {
    // New York springs forward at 02:00 on 8 March 2026: EST (UTC−5) before, EDT (UTC−4)
    // after, so 8 March runs from 05:00Z to 04:00Z the next morning.
    const watches = [
      aWatch("2026-03-08T04:59:00Z"), // 23:59 EST on the 7th
      aWatch("2026-03-08T05:01:00Z"), // 00:01 EST on the 8th
      aWatch("2026-03-09T03:59:00Z"), // 23:59 EDT on the 8th
      aWatch("2026-03-09T04:01:00Z"), // 00:01 EDT on the 9th
    ];

    const { days } = buildHeatmap(watches, "America/New_York", "2026-10-10");
    const count = (day: string) => days.find((one) => one.day === day)?.count;

    expect(count("2026-03-07")).toBe(1);
    expect(count("2026-03-08")).toBe(2);
    expect(count("2026-03-09")).toBe(1);
  });

  it("buckets the 25-hour day the clocks go back on", () => {
    // London falls back at 02:00 BST on 25 October 2026, so that day runs 23:00Z on the
    // 24th to 00:00Z on the 26th.
    const watches = [aWatch("2026-10-24T23:30:00Z"), aWatch("2026-10-25T23:30:00Z")];

    const { days } = buildHeatmap(watches, "Europe/London", "2026-10-30");

    expect(days.find((one) => one.day === "2026-10-25")?.count).toBe(2);
    expect(days.find((one) => one.day === "2026-10-24")?.count).toBe(0);
  });

  it("leaves out a watch outside the twelve months, and counts the rest", () => {
    const heatmap = buildHeatmap(
      [aWatch("2025-10-10T12:00:00Z"), aWatch("2025-10-11T12:00:00Z")],
      "UTC",
      "2026-10-10",
    );

    expect(heatmap.total).toBe(1);
    expect(heatmap.days[0]).toMatchObject({ day: "2025-10-11", count: 1 });
  });

  it("lists a day's watches as the grid prints them", () => {
    const heatmap = buildHeatmap(
      [
        aWatch("2026-10-10T08:00:00Z"),
        aWatch("2026-10-10T09:00:00Z", { seasonNo: null, episodeNo: null, episodeName: null, titleName: "Heat" }),
      ],
      "UTC",
      "2026-10-10",
    );

    expect(heatmap.days.at(-1)?.watches.map((one) => one.what)).toEqual([
      "S01 · E02 · Half Loop",
      "Film",
    ]);
  });

  it("starts each column on a Monday", () => {
    // 11 October 2025 is a Saturday: five blanks (Mon–Fri) before it.
    expect(buildHeatmap([], "UTC", "2026-10-10").leading).toBe(5);
  });
});

describe("shades and labels", () => {
  it("shades by count, from none to five and more", () => {
    expect([0, 1, 2, 3, 4, 5, 40].map(shadeFor)).toEqual([0, 1, 2, 3, 3, 4, 4]);
  });

  it("labels each cell for a screen reader", () => {
    expect(cellLabel(3, "2026-03-04")).toBe("3 watches on 4 March");
    expect(cellLabel(1, "2026-03-04")).toBe("1 watch on 4 March");
    expect(cellLabel(0, "2026-03-04")).toBe("No watches on 4 March");
  });
});

describe("the grid", () => {
  const heatmap = buildHeatmap(
    [aWatch("2026-10-01T12:00:00Z"), aWatch("2026-10-01T13:00:00Z"), aWatch("2026-10-01T14:00:00Z")],
    "UTC",
    "2026-10-10",
  );
  const markup = renderToStaticMarkup(createElement(YearHeatmap, { heatmap }));

  it("has one labelled button per day and a single tab stop, on the latest watched day", () => {
    expect(markup.match(/<button/g)).toHaveLength(365);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup).toMatch(/tabindex="0" aria-label="3 watches on 1 October"/);
  });

  it("lists the selected day's watches beneath the grid", () => {
    expect(markup).toContain("1 October · 3 watches");
    expect(markup).toContain('href="/titles/entry-1"');
  });

  it("uses neutral tones only", () => {
    expect(markup).not.toMatch(/accent/);
  });
});
