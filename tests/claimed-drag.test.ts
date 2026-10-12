import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DRAG_THRESHOLD_PX, type DragOutcome, type DragRules } from "@/app/gesture-rules";
import {
  createClaimedDrag,
  type ClaimedDragOptions,
  type DragPointerEvent,
} from "@/app/use-claimed-drag";

/**
 * The drag binding lifted out of `LandingPager` (issue #399), driven gesture by gesture.
 *
 * `tests/gesture-rules.test.ts` holds what a delta means. This holds the three things the
 * pager's binding did with those answers, which the pager's own suite could only check by
 * reading its source for the names of the guards: the latched claim, pointer ownership
 * (issue #277), and the swallowed click.
 *
 * The rules are swipe to mark's (handoff §11.3): horizontal, 40px, rightward only — the
 * binding's next caller.
 */

const SWIPE: DragRules = { axis: "horizontal", threshold: DRAG_THRESHOLD_PX, commits: [1] };

function harness(ignores?: ClaimedDragOptions["ignores"]) {
  const drag = createClaimedDrag();
  const offsets: number[] = [];
  const outcomes: DragOutcome[] = [];
  const captured: number[] = [];

  const options: ClaimedDragOptions = {
    rules: SWIPE,
    ignores,
    onDrag: (offset) => offsets.push(offset),
    onRelease: (outcome) => outcomes.push(outcome),
  };

  const pointer = (
    x: number,
    y: number,
    over: Partial<Omit<DragPointerEvent, "currentTarget">> = {},
  ): DragPointerEvent => ({
    pointerId: 1,
    isPrimary: true,
    clientX: x,
    clientY: y,
    currentTarget: { setPointerCapture: (id) => captured.push(id) },
    ...over,
  });

  /** Whether the click a release generates reaches the element under the pointer. */
  const clickReaches = (): boolean => {
    let stopped = false;
    drag.click({ preventDefault: () => {}, stopPropagation: () => (stopped = true) });
    return !stopped;
  };

  return {
    down: (x: number, y: number, over = {}) => drag.down(pointer(x, y, over), options),
    move: (x: number, y: number, over = {}) => drag.move(pointer(x, y, over), options),
    up: (x: number, y: number, over = {}) => drag.up(pointer(x, y, over), options),
    cancel: (over = {}) => drag.cancel(pointer(0, 0, over), options),
    clickReaches,
    offsets,
    outcomes,
    captured,
  };
}

describe("a tap is a tap", () => {
  it("captures nothing, reports no travel and delivers its click", () => {
    const g = harness();
    g.down(100, 100);
    g.up(100, 100);

    expect(g.captured).toEqual([]);
    expect(g.outcomes).toEqual([{ kind: "cancel" }]);
    expect(g.clickReaches()).toBe(true);
  });
});

describe("a drag the surface claims", () => {
  it("captures its pointer once, tracks, commits past the threshold and swallows the click", () => {
    const g = harness();
    g.down(100, 100);
    g.move(110, 102);
    g.move(160, 104);
    g.up(160, 104);

    expect(g.captured).toEqual([1]);
    expect(g.offsets).toEqual([10, 60, 0]);
    expect(g.outcomes).toEqual([{ kind: "commit", direction: 1 }]);
    expect(g.clickReaches()).toBe(false);
  });

  it("cancels a release short of the threshold, and still swallows the click", () => {
    const g = harness();
    g.down(100, 100);
    g.move(130, 100);
    g.up(130, 100);

    expect(g.outcomes).toEqual([{ kind: "cancel" }]);
    expect(g.clickReaches()).toBe(false);
  });

  it("swallows one click per gesture and no more", () => {
    const g = harness();
    g.down(100, 100);
    g.move(160, 100);
    g.up(160, 100);

    expect(g.clickReaches()).toBe(false);
    expect(g.clickReaches()).toBe(true);
  });

  /** The latch: a thumb on an arc that turns vertical mid-drag is still this surface's. */
  it("keeps the claim it latched when a later frame leans the other way", () => {
    const g = harness();
    g.down(100, 100);
    g.move(120, 101);
    g.move(125, 160);

    expect(g.offsets).toEqual([20, 25]);
  });
});

describe("a drag the surface refuses", () => {
  /** Vertical scrolling wins when the movement is mostly vertical. */
  it("never moves, never captures, and leaves the click to what was under the pointer", () => {
    const g = harness();
    g.down(100, 100);
    g.move(102, 130);
    g.move(160, 140);
    g.up(160, 140);

    expect(g.offsets).toEqual([0, 0, 0]);
    expect(g.captured).toEqual([]);
    expect(g.outcomes).toEqual([{ kind: "cancel" }]);
    expect(g.clickReaches()).toBe(true);
  });

  it("starts nothing from a press it ignores", () => {
    const g = harness((event) => event.clientX < 24);
    g.down(10, 100);
    g.move(80, 100);
    g.up(80, 100);

    expect(g.offsets).toEqual([]);
    expect(g.outcomes).toEqual([]);
    expect(g.clickReaches()).toBe(true);
  });
});

describe("whose pointer it is — issue #277", () => {
  it("ignores a second finger rather than letting it re-seat the first", () => {
    const g = harness();
    g.down(100, 100);
    g.move(120, 100);
    g.down(300, 100, { pointerId: 2, isPrimary: false });
    g.move(140, 100);

    expect(g.offsets).toEqual([20, 40]);
  });

  it("ends nothing on a release from a pointer that is not the gesture's", () => {
    const g = harness();
    g.down(100, 100);
    g.move(120, 100);
    g.up(120, 100, { pointerId: 2 });
    g.move(150, 100);

    expect(g.outcomes).toEqual([]);
    expect(g.offsets).toEqual([20, 50]);
  });

  it("refuses a primary pointer of another type over a claimed gesture", () => {
    const g = harness();
    g.down(100, 100);
    g.move(120, 100);
    g.down(300, 300, { pointerId: 2 });
    g.move(150, 100);

    expect(g.offsets).toEqual([20, 50]);
  });

  /** An unclaimed gesture may be one whose release was lost; replacing it is the recovery. */
  it("replaces a gesture that never claimed anything", () => {
    const g = harness();
    g.down(100, 100);
    g.down(200, 100, { pointerId: 2 });
    g.move(250, 100, { pointerId: 2 });
    g.move(250, 100);

    expect(g.offsets).toEqual([50]);
  });
});

describe("a pointer the browser takes away", () => {
  it("withdraws, commits nothing and arms no click swallow", () => {
    const g = harness();
    g.down(100, 100);
    g.move(160, 100);
    g.cancel();

    expect(g.offsets).toEqual([60, 0]);
    expect(g.outcomes).toEqual([]);
    expect(g.clickReaches()).toBe(true);
  });
});

describe("the binding writes no rule of its own", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "..", "app", "use-claimed-drag.ts"),
    "utf8",
  );

  it("takes every decision from the shared rules module", () => {
    expect(source).toContain('from "./gesture-rules"');
    expect(source).not.toMatch(/threshold:\s*\d/);
    expect(source).not.toMatch(/Math\.abs/);
  });
});
