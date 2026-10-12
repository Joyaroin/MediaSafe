import { describe, expect, it } from "vitest";

import {
  BACK_GESTURE_EDGE_PX,
  startsInBackEdge,
  SWIPE_TO_MARK,
  swipeArmed,
  washScale,
} from "@/app/(signed-in)/up-next/swipe-to-mark";
import { claimsDrag, DRAG_THRESHOLD_PX, releaseDrag } from "@/app/gesture-rules";

/**
 * Swipe a row to mark — issue #408 (handoff §11.3). `tests/gesture-rules.test.ts` holds the
 * shared rules; this holds what Tonight's rows make of them.
 */

describe("the rules a row's swipe is bound with", () => {
  it("is horizontal, at the shared 40px threshold, and rightward only", () => {
    expect(SWIPE_TO_MARK).toEqual({ axis: "horizontal", threshold: 40, commits: [1] });
    expect(SWIPE_TO_MARK.threshold).toBe(DRAG_THRESHOLD_PX);
  });

  it("records nothing for a swipe short of 40px", () => {
    expect(releaseDrag({ dx: 39, dy: 0 }, SWIPE_TO_MARK, true)).toEqual({ kind: "cancel" });
    expect(releaseDrag({ dx: 40, dy: 0 }, SWIPE_TO_MARK, true)).toEqual({
      kind: "commit",
      direction: 1,
    });
  });

  it("records nothing for a swipe to the left, however far", () => {
    expect(releaseDrag({ dx: -200, dy: 0 }, SWIPE_TO_MARK, true)).toEqual({ kind: "cancel" });
  });

  it("never steals a movement that is mostly vertical — the list scrolls", () => {
    expect(claimsDrag({ dx: 10, dy: 30 }, SWIPE_TO_MARK)).toBe(false);
    expect(claimsDrag({ dx: 30, dy: 30 }, SWIPE_TO_MARK)).toBe(false);
    expect(claimsDrag({ dx: 31, dy: 30 }, SWIPE_TO_MARK)).toBe(true);
    // And an unclaimed drag records nothing, however far it went.
    expect(releaseDrag({ dx: 100, dy: 300 }, SWIPE_TO_MARK, false)).toEqual({ kind: "cancel" });
  });
});

describe("the tick fills exactly where letting go would record", () => {
  it.each([0, 10, 39, 40, 41, 200])("at %ipx", (offset) => {
    const commits = releaseDrag({ dx: offset, dy: 0 }, SWIPE_TO_MARK, true).kind === "commit";
    expect(swipeArmed(offset)).toBe(commits);
  });

  it("empties again when the finger comes back under the threshold", () => {
    expect(swipeArmed(45)).toBe(true);
    expect(swipeArmed(30)).toBe(false);
  });
});

describe("Android's back gesture keeps its edge", () => {
  it("leaves a press in the first 24px alone", () => {
    expect(BACK_GESTURE_EDGE_PX).toBe(24);
    expect(startsInBackEdge(0)).toBe(true);
    expect(startsInBackEdge(23)).toBe(true);
    expect(startsInBackEdge(24)).toBe(false);
  });
});

describe("the wash grows under the finger and never past the row", () => {
  it("scales with the drag across the row's width", () => {
    expect(washScale(0, 400)).toBe(0);
    expect(washScale(100, 400)).toBe(0.25);
    expect(washScale(600, 400)).toBe(1);
    expect(washScale(-50, 400)).toBe(0);
  });

  it("draws nothing for a row with no width", () => {
    expect(washScale(100, 0)).toBe(0);
  });
});
