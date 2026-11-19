import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildHeatmap,
  cellLabel,
  groupDayByTitle,
  seasonsInWords,
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
    expect(markup.match(/<button[^>]*aria-label=/g)).toHaveLength(365);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup).toMatch(/tabindex="0" aria-label="3 watches on 1 October"/);
  });

  it("lists the selected day's watches beneath the grid, one collapsed row per title", () => {
    expect(markup).toContain("1 October · 3 watches");
    // Three watches of one episode: one title, one distinct episode, closed.
    expect(markup).toMatch(/<button[^>]*aria-expanded="false"[^>]*>/);
    expect(markup).toContain("Severance</span><span");
    expect(markup).toContain(" · 1 episode · season 1");
  });

  it("uses neutral tones only", () => {
    expect(markup).not.toMatch(/accent/);
  });
});

describe("a day grouped by title", () => {
  function day(...watches: YearWatch[]) {
    return buildHeatmap(watches, "UTC", "2026-10-10").days.at(-1)?.watches ?? [];
  }
  function episode(entry: string, name: string, season: number, number: number, at: string, id?: string) {
    return aWatch(at, {
      watchId: id ?? `${entry}-${season}-${number}-${at}`,
      libraryEntryId: entry,
      titleName: name,
      seasonNo: season,
      episodeNo: number,
      episodeName: null,
    });
  }

  it("makes one row per title, counting distinct episodes and naming the seasons", () => {
    const groups = groupDayByTitle(
      day(
        episode("bear", "The Bear", 1, 1, "2026-10-10T08:00:00Z"),
        episode("bear", "The Bear", 1, 2, "2026-10-10T08:01:00Z"),
        episode("bear", "The Bear", 3, 1, "2026-10-10T08:02:00Z"),
      ),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].line).toBe("The Bear · 3 episodes · seasons 1 and 3");
    expect(groups[0].lead).toBe("The Bear");
    expect(groups[0].libraryEntryId).toBe("bear");
  });

  it("counts an episode rewatched the same day once", () => {
    const [group] = groupDayByTitle(
      day(
        episode("bear", "The Bear", 2, 4, "2026-10-10T08:00:00Z"),
        episode("bear", "The Bear", 2, 4, "2026-10-10T09:00:00Z"),
      ),
    );

    expect(group.line).toBe("The Bear · 1 episode · season 2");
    expect(group.episodes).toHaveLength(1);
  });

  it("makes one 'Film' row for a film watched twice", () => {
    const film = { seasonNo: null, episodeNo: null, episodeName: null, libraryEntryId: "heat", titleName: "Heat" };
    const groups = groupDayByTitle(
      day(
        aWatch("2026-10-10T08:00:00Z", { ...film, watchId: "a" }),
        aWatch("2026-10-10T20:00:00Z", { ...film, watchId: "b" }),
      ),
    );

    expect(groups.map((one) => one.line)).toEqual(["Heat · Film"]);
    expect(groups[0].episodes).toEqual([]);
  });

  it("orders titles by their latest watch that day, newest first", () => {
    const groups = groupDayByTitle(
      day(
        episode("a", "Alpha", 1, 1, "2026-10-10T07:00:00Z"),
        episode("a", "Alpha", 1, 2, "2026-10-10T12:00:00Z"),
        episode("b", "Beta", 1, 1, "2026-10-10T09:00:00Z"),
        episode("c", "Gamma", 1, 1, "2026-10-10T20:00:00Z"),
      ),
    );

    // Alpha has more watches, but Beta was watched after Alpha's first and before Gamma:
    // only the latest watch counts.
    expect(groups.map((one) => one.titleName)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it("breaks a tie on the instant by lower-cased name, then entry id", () => {
    const at = "2026-10-10T10:00:00Z";
    const groups = groupDayByTitle(
      day(
        episode("z-1", "banana", 1, 1, at),
        episode("y-2", "Apple", 1, 1, at),
        episode("a-3", "apple", 1, 1, at),
        episode("m-4", "Cherry", 1, 1, at),
      ),
    );

    expect(groups.map((one) => one.libraryEntryId)).toEqual(["a-3", "y-2", "z-1", "m-4"]);
  });

  it("lists a group's episodes by season and episode, whatever order they were watched in", () => {
    const [group] = groupDayByTitle(
      day(
        episode("bear", "The Bear", 2, 1, "2026-10-10T08:00:00Z"),
        episode("bear", "The Bear", 1, 10, "2026-10-10T08:01:00Z"),
        episode("bear", "The Bear", 1, 2, "2026-10-10T08:02:00Z"),
      ),
    );

    expect(group.episodes.map((one) => one.what)).toEqual(["S01 · E02", "S01 · E10", "S02 · E01"]);
  });

  it("writes season ranges in words", () => {
    expect(seasonsInWords([2])).toBe("season 2");
    expect(seasonsInWords([1, 2, 3, 4, 5])).toBe("seasons 1–5");
    expect(seasonsInWords([1, 3])).toBe("seasons 1 and 3");
    expect(seasonsInWords([1, 2, 3, 5])).toBe("seasons 1–3 and 5");
    expect(seasonsInWords([5, 1, 3, 1])).toBe("seasons 1, 3 and 5");
    expect(seasonsInWords([1, 2])).toBe("seasons 1–2");
    expect(seasonsInWords([0])).toBe("specials");
    expect(seasonsInWords([0, 1])).toBe("season 1 and specials");
  });
});
