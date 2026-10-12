import { describe, expect, it } from "vitest";

import {
  lastPaintable,
  newlyFilled,
  paintedThrough,
  paintStartsOn,
  strokeSummary,
  upNextAfterStroke,
  type PaintEpisode,
  type PaintRow,
} from "@/app/(signed-in)/library/paint-to-mark";

/**
 * Paint to mark — issue #408 (handoff §11.3). The stroke's decisions, as rules; the pointer
 * half is `use-paint-to-mark.ts` and its browser half `tests/e2e/gestures.spec.ts`.
 */

const TODAY = "2026-10-12";
const AIRED = "2026-01-01";
const LATER = "2026-12-01";

const watched: PaintEpisode = { upNext: false, watched: true, airDate: AIRED };
const upNext: PaintEpisode = { upNext: true, watched: false, airDate: AIRED };
const ready: PaintEpisode = { upNext: false, watched: false, airDate: AIRED };
const undated: PaintEpisode = { upNext: false, watched: false, airDate: null };
const notOut: PaintEpisode = { upNext: false, watched: false, airDate: LATER };

/** Six rows, 56px each, from the top of the viewport. */
const ROWS: readonly PaintRow[] = Array.from({ length: 6 }, (_, index) => ({
  top: index * 56,
  bottom: (index + 1) * 56,
}));

describe("where a stroke can start — open question 2", () => {
  it("starts on the Up next episode, and on nothing else", () => {
    expect(paintStartsOn(upNext)).toBe(true);
    expect(paintStartsOn(ready)).toBe(false);
    expect(paintStartsOn(watched)).toBe(false);
  });

  it("does not start on an Up next episode the reader has just marked", () => {
    expect(paintStartsOn({ ...upNext, watched: true })).toBe(false);
  });
});

describe("how far a stroke can reach", () => {
  it("runs over every unwatched, aired episode after the start", () => {
    expect(lastPaintable([watched, upNext, ready, ready, ready], 1, TODAY)).toBe(4);
  });

  it("stops before an episode that has not aired — it has no tick to fill", () => {
    expect(lastPaintable([watched, upNext, ready, notOut, ready], 1, TODAY)).toBe(2);
  });

  it("counts an undated episode as aired, as its row's tick does", () => {
    expect(lastPaintable([upNext, undated, ready], 0, TODAY)).toBe(2);
  });

  it("stops before an episode already watched", () => {
    expect(lastPaintable([upNext, ready, watched, ready], 0, TODAY)).toBe(1);
  });

  it("is the start itself when nothing after it can be painted", () => {
    expect(lastPaintable([watched, upNext], 1, TODAY)).toBe(1);
  });
});

describe("which tick the finger has reached", () => {
  it("fills down to the row under the finger", () => {
    expect(paintedThrough(ROWS, 1, 5, 60)).toBe(1);
    expect(paintedThrough(ROWS, 1, 5, 200)).toBe(3);
  });

  it("empties back to the start as the finger goes up, and never above it", () => {
    expect(paintedThrough(ROWS, 1, 5, 120)).toBe(2);
    expect(paintedThrough(ROWS, 1, 5, 10)).toBe(1);
    expect(paintedThrough(ROWS, 1, 5, -400)).toBe(1);
  });

  it("stops at the last paintable row, however far the finger goes", () => {
    expect(paintedThrough(ROWS, 1, 3, 300)).toBe(3);
    expect(paintedThrough(ROWS, 1, 5, 9999)).toBe(5);
  });
});

describe("one short vibration per tick filled", () => {
  it("counts the ticks a move filled, and none for emptying", () => {
    expect(newlyFilled(1, 1)).toBe(0);
    expect(newlyFilled(1, 3)).toBe(2);
    expect(newlyFilled(3, 2)).toBe(0);
  });
});

describe("the foot bar's sentence", () => {
  it("counts the episodes the one write recorded", () => {
    expect(strokeSummary(1)).toBe("1 episode marked");
    expect(strokeSummary(4)).toBe("4 episodes marked");
    expect(strokeSummary(1200)).toBe("1,200 episodes marked");
  });
});

describe("where Up next goes once the stroke is recorded", () => {
  const ids = ["s1e1", "s1e2", "s1e3", "s2e1"];

  it("moves to the episode after the stroke, across a season", () => {
    expect(upNextAfterStroke(ids, "s1e2")).toBe("s1e3");
    expect(upNextAfterStroke(ids, "s1e3")).toBe("s2e1");
  });

  it("is nothing once the stroke reached the last episode", () => {
    expect(upNextAfterStroke(ids, "s2e1")).toBeNull();
    expect(upNextAfterStroke(ids, "missing")).toBeNull();
  });
});
