import { describe, expect, it } from "vitest";

import {
  DRAG_THRESHOLD_PX,
  claimsDrag,
  dragOffset,
  releaseDrag,
  type Drag,
  type DragRules,
} from "@/app/gesture-rules";

/**
 * The shared gesture rules, driven directly — issue #251's *the gesture rules are a pure
 * module with their own tests and no DOM*.
 *
 * `vitest.config.mts` runs in `node`, so there is no pointer here and there is not meant
 * to be. Everything below is arithmetic over a delta, which is exactly why the rules were
 * pulled out of the two bindings that will use them: `tests/up-next-card-mark.test.ts` and
 * `tests/watch-marks.test.ts` are the prior art, and they exist for the same reason —
 * their surfaces cannot be driven either.
 *
 * The parent ticket names what is worth covering: *threshold crossed and not crossed, on
 * each axis, in both directions, and the cancel path.* All of that is here, plus the three
 * rules that have no counterpart in a threshold and are the ones that would fail silently:
 * a drag the surface does not own, a drag into a direction with nothing behind it, and the
 * claim being **latched** rather than re-asked every frame.
 */

/** The landing pager, standing on its first page: forward is a leftward drag. */
const PAGER_FIRST: DragRules = {
  axis: "horizontal",
  threshold: DRAG_THRESHOLD_PX,
  commits: [-1],
};

/** The same pager on its second page, where the only way is back. */
const PAGER_SECOND: DragRules = {
  axis: "horizontal",
  threshold: DRAG_THRESHOLD_PX,
  commits: [1],
};

/** A vertical dismiss, downwards only. It was the episode modal's (#254) until issue #273
 *  deleted the route interceptions and the sheet they raised; the rules module is general,
 *  and this is where its vertical axis is driven from. */
const SWIPE_DOWN: DragRules = { axis: "vertical", threshold: DRAG_THRESHOLD_PX, commits: [1] };

/**
 * A whole gesture in one frame — the claim decided from the same delta that is then acted
 * on, which is what a straight drag looks like to a binding.
 *
 * The latch is what makes these two separate arguments in the real module, and the cases
 * where they genuinely differ have their own section at the foot of this file. Everything
 * above it is about the arithmetic and reads better without the claim spelled out twice.
 */
const release = (drag: Drag, rules: DragRules) =>
  releaseDrag(drag, rules, claimsDrag(drag, rules));
const offset = (drag: Drag, rules: DragRules) =>
  dragOffset(drag, rules, claimsDrag(drag, rules));

describe("the threshold, on each axis and in both directions", () => {
  it("commits a horizontal drag that reaches it", () => {
    expect(release({ dx: -DRAG_THRESHOLD_PX, dy: 0 }, PAGER_FIRST)).toEqual({
      kind: "commit",
      direction: -1,
    });
  });

  /**
   * The boundary itself, from below. One pixel short of the named number is short of it —
   * this and the case above are what pin `>=` rather than `>`, and either would pass on
   * its own with the comparison the other way round.
   */
  it("cancels a horizontal drag one pixel short of it", () => {
    expect(release({ dx: -(DRAG_THRESHOLD_PX - 1), dy: 0 }, PAGER_FIRST)).toEqual({
      kind: "cancel",
    });
  });

  it("commits the other direction on the page that has one", () => {
    expect(release({ dx: DRAG_THRESHOLD_PX + 20, dy: 0 }, PAGER_SECOND)).toEqual({
      kind: "commit",
      direction: 1,
    });
  });

  it("commits a downward drag past it on the vertical axis", () => {
    expect(release({ dx: 0, dy: DRAG_THRESHOLD_PX + 5 }, SWIPE_DOWN)).toEqual({
      kind: "commit",
      direction: 1,
    });
  });

  it("cancels a vertical drag short of it", () => {
    expect(release({ dx: 0, dy: 12 }, SWIPE_DOWN)).toEqual({ kind: "cancel" });
  });

  /** A threshold is a distance, so the axis it is measured on is the surface's own. The
   *  same 200px that pages the pager must do nothing at all to the sheet. */
  it("measures only the axis it was given", () => {
    expect(release({ dx: -200, dy: 0 }, SWIPE_DOWN)).toEqual({ kind: "cancel" });
    expect(release({ dx: 0, dy: 200 }, PAGER_FIRST)).toEqual({ kind: "cancel" });
  });
});

describe("a drag into a direction with nothing behind it", () => {
  /**
   * The case a bare threshold gets wrong, and gets wrong *confidently*: the drag is long,
   * it is on the right axis, and there is no page to go to. Without `commits` this would
   * commit and the pager would have to undo it a frame later.
   */
  it("cancels however far it goes", () => {
    expect(release({ dx: 400, dy: 0 }, PAGER_FIRST)).toEqual({ kind: "cancel" });
    expect(release({ dx: 0, dy: -400 }, SWIPE_DOWN)).toEqual({ kind: "cancel" });
  });

  /** And it does not track either, so the surface never draws a page it is about to
   *  refuse. */
  it("does not move the surface while it is happening", () => {
    expect(offset({ dx: 400, dy: 0 }, PAGER_FIRST)).toBe(0);
  });

  /** A surface with nowhere to go in either direction is inert rather than special-cased
   *  by its caller. */
  it("cancels everything when nothing commits", () => {
    const stuck: DragRules = { ...PAGER_FIRST, commits: [] };
    expect(release({ dx: -400, dy: 0 }, stuck)).toEqual({ kind: "cancel" });
    expect(release({ dx: 400, dy: 0 }, stuck)).toEqual({ kind: "cancel" });
  });
});

describe("whose drag it is", () => {
  it("is the surface's when the on-axis travel wins", () => {
    expect(claimsDrag({ dx: -50, dy: 10 }, PAGER_FIRST)).toBe(true);
  });

  /**
   * The rule that keeps the pager out of a page scroll. Both these drags are well past
   * the threshold on the pager's own axis; both are further still on the other one.
   */
  it("is not the surface's when the off-axis travel wins", () => {
    expect(claimsDrag({ dx: -50, dy: 90 }, PAGER_FIRST)).toBe(false);
    expect(release({ dx: -50, dy: 90 }, PAGER_FIRST)).toEqual({ kind: "cancel" });
    expect(offset({ dx: -50, dy: 90 }, PAGER_FIRST)).toBe(0);
  });

  /** A perfect diagonal is nobody's — a tie falls to *not yet declared*. */
  it("is nobody's on an exact diagonal", () => {
    expect(claimsDrag({ dx: -60, dy: 60 }, PAGER_FIRST)).toBe(false);
    expect(claimsDrag({ dx: -60, dy: 60 }, SWIPE_DOWN)).toBe(false);
  });

  /** A pointer that went down and did not move is a tap, and a tap is what the labels
   *  are for. */
  it("is nobody's when the pointer has not moved", () => {
    expect(claimsDrag({ dx: 0, dy: 0 }, PAGER_FIRST)).toBe(false);
    expect(release({ dx: 0, dy: 0 }, PAGER_FIRST)).toEqual({ kind: "cancel" });
  });
});

describe("the claim is an argument, so the binding can latch it", () => {
  /**
   * **The bug this shape exists for.** A thumb travelling along an arc puts in a frame or
   * two where the vertical component wins. If the claim were re-derived inside these
   * functions, the page would snap back to nothing on that frame and out again on the
   * next — under the finger, mid-drag.
   *
   * `{ dx: -80, dy: 90 }` is such a frame: `claimsDrag` says no, and a gesture the binding
   * already latched as its own carries on regardless.
   */
  const arc: Drag = { dx: -80, dy: 90 };

  it("would disown the arc frame if the claim were re-derived", () => {
    expect(claimsDrag(arc, PAGER_FIRST)).toBe(false);
  });

  it("keeps tracking an already-claimed gesture through it", () => {
    expect(dragOffset(arc, PAGER_FIRST, true)).toBe(-80);
    expect(offset(arc, PAGER_FIRST)).toBe(0);
  });

  it("commits an already-claimed gesture that ends on such a frame", () => {
    expect(releaseDrag(arc, PAGER_FIRST, true)).toEqual({ kind: "commit", direction: -1 });
    expect(release(arc, PAGER_FIRST)).toEqual({ kind: "cancel" });
  });

  /**
   * And the latch cuts both ways: a gesture the binding decided was **not** its own stays
   * not its own, however square to the axis it later becomes. That is what stops a rail
   * scroll or a page scroll turning into a page change halfway through.
   */
  it("keeps refusing a gesture it never claimed", () => {
    const square: Drag = { dx: -300, dy: 0 };
    expect(dragOffset(square, PAGER_FIRST, false)).toBe(0);
    expect(releaseDrag(square, PAGER_FIRST, false)).toEqual({ kind: "cancel" });
  });
});

describe("tracking, while the thumb is still down", () => {
  /** One pixel per pixel: the page is under the finger, not animating towards it. */
  it("follows the pointer exactly along its own axis", () => {
    expect(offset({ dx: -18, dy: 3 }, PAGER_FIRST)).toBe(-18);
    expect(offset({ dx: 4, dy: 26 }, SWIPE_DOWN)).toBe(26);
  });

  /** Tracking says nothing about committing. A drag can be visibly under way and still
   *  be about to spring back, which is the whole of *short of it, the page springs
   *  back*. */
  it("tracks a drag that has not yet reached the threshold", () => {
    const drag = { dx: -(DRAG_THRESHOLD_PX - 1), dy: 0 };
    expect(offset(drag, PAGER_FIRST)).toBe(-(DRAG_THRESHOLD_PX - 1));
    expect(release(drag, PAGER_FIRST)).toEqual({ kind: "cancel" });
  });

  /** No rubber-band, no clamp: past the threshold the surface is still under the thumb,
   *  and the commit is what ends the drag. */
  it("does not stretch or clamp past the threshold", () => {
    expect(offset({ dx: -300, dy: 0 }, PAGER_FIRST)).toBe(-300);
  });
});

describe("the threshold is the handoff's own number", () => {
  it("is 40 pixels", () => {
    expect(DRAG_THRESHOLD_PX).toBe(40);
  });
});
