import { describe, expect, it } from "vitest";

import {
  DRAG_THRESHOLD_PX,
  claimsDrag,
  deliversClick,
  dragOffset,
  ownsPointer,
  releaseDrag,
  releasePops,
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

/**
 * ── The pointer audit — issue #277 ───────────────────────────────────────────────────
 *
 * Everything above is arithmetic over a delta and says nothing about **which pointer the
 * delta was measured from**, or about what happens to the click a finished gesture leaves
 * behind. Both were the binding's own business until #277 read it again, and both are the
 * shape of rule this module exists to hold: a fact about a gesture, decided without a DOM.
 *
 * **This is a hardening on a hypothesis, not a reproduced fix.** #277's report is
 * second-hand — a tap on a next-episodes card that appears to land on the recording
 * control — and the owner does not have the device. What is asserted below stands on its
 * own merits: a second finger must not move the origin the first one is being measured
 * from, and a gesture the surface claimed must not also arrive somewhere as a press. If
 * the Android misfire survives this, this suite is not where it was addressed.
 */

describe("a gesture belongs to one pointer, and only that one", () => {
  /** The pointer that opened the gesture. A binding holds the whole of its own state; this
   *  rule reads the one field of it that decides ownership. */
  const gesture = { pointerId: 4 };

  it("is driven by the pointer it began with", () => {
    expect(ownsPointer(gesture, 4)).toBe(true);
  });

  /**
   * **The case this exists for.** A second finger arriving mid-drag sends its own moves
   * and its own release, and a binding that read `event.clientX` without asking whose it
   * was would measure the first finger's drag from the second finger's origin — a page
   * that jumps under the thumb, or a release that parks the track mid-drag.
   */
  it("is not driven by a second pointer that arrives mid-gesture", () => {
    expect(ownsPointer(gesture, 9)).toBe(false);
  });

  /** Between gestures there is no pointer to own anything, and a stray move or release
   *  belongs to nobody rather than to the last gesture that ended. */
  it("owns nothing at all between gestures", () => {
    expect(ownsPointer(null, 4)).toBe(false);
  });

  /**
   * `0` is a legal pointer id, and it is the one a falsy check gets wrong. A binding that
   * wrote `gesture?.pointerId && …` would disown its own gesture for the whole of a
   * session where the browser numbered from zero — silently, and only on some engines.
   */
  it("does not read a pointer id of zero as no pointer", () => {
    expect(ownsPointer({ pointerId: 0 }, 0)).toBe(true);
    expect(ownsPointer(null, 0)).toBe(false);
  });
});

describe("a gesture the surface claimed is not also a press on a child", () => {
  /**
   * A drag that began on a link travels and is released, and the browser fires a click on
   * the way out like it would for any other press. The surface has already acted on that
   * gesture — it paged, or it sprang back — so delivering the click as well makes one
   * gesture mean two things.
   */
  it("does not deliver the click a claimed gesture generates", () => {
    expect(deliversClick(true)).toBe(false);
  });

  /**
   * And the other edge, which is the one that would take the whole surface out: a gesture
   * the binding watched and refused — a page scroll going past, a rail's own swipe — is
   * somebody else's, and its click is theirs.
   */
  it("delivers the click of a gesture it watched and did not claim", () => {
    expect(deliversClick(false)).toBe(true);
  });

  /**
   * A tap never latches a claim at all: the pointer went down and did not move, so
   * `claimsDrag` was never asked. `null` is that state, and it is a **tap** — the one
   * thing on this surface that must always be delivered.
   */
  it("delivers a tap, which never latched a claim either way", () => {
    expect(deliversClick(null)).toBe(true);
    expect(claimsDrag({ dx: 0, dy: 0 }, PAGER_FIRST)).toBe(false);
  });
});

/**
 * ── What a release just produced — issue #280 ────────────────────────────────────────
 *
 * `deliversClick` above answers half of *what did this pointer just produce*: whether the
 * click a finished gesture leaves behind may be delivered. #279 adds the other half. The
 * press now **pops** past its resting size on release, and a pop is a claim about the
 * gesture rather than a decoration on it — it means *that was a tap and it landed*. A
 * gesture that turned into a drag did not tap anything, and a pointer the browser took
 * away did not either.
 *
 * So the two answers live in one module, and the point of the last block in this file is
 * that they **agree**. A pop that survived a claimed drag, or a click swallowed under a
 * flourish that ran anyway, is one gesture meaning two things — the failure
 * stated for the season row's check, arriving here as motion instead of navigation.
 *
 * There is no DOM here and there is not meant to be, which is the whole reason the rule is
 * a function rather than three branches inside the delegated listener in
 * `app/motion-provider.tsx`. That listener owns *which element* and *whose pointer*; this
 * owns *whether*.
 */

describe("whether a release pops", () => {
  /** The ordinary tap: the pointer went down on a control and came up on it, and no
   *  surface ever asked whether the delta was a drag, because there was no delta. */
  it("pops a release that never latched a claim", () => {
    expect(releasePops("released", null)).toBe(true);
  });

  /**
   * **The case this rule exists for** — #279's *a press that becomes a swipe does not
   * pop*. The pager claimed the gesture and paged; the control under the thumb was the
   * thing the swipe was made *of*, not the thing the reader tapped.
   */
  it("does not pop a release whose pointer was claimed as a drag", () => {
    expect(releasePops("released", true)).toBe(false);
  });

  /**
   * A gesture some surface watched and refused is somebody else's, and on this surface
   * that somebody is the control the finger is still resting on. It pops, for the same
   * reason its click is delivered.
   */
  it("pops a release from a gesture that was watched and refused", () => {
    expect(releasePops("released", false)).toBe(true);
  });

  /**
   * `pointercancel` is the browser taking the pointer away — a native scroll starting, a
   * gesture handed to the system. Nothing was tapped, so nothing pops, **whatever the
   * claim was**. This is the contract that keeps the delegated listener and the pager
   * apart, and #279 states it as a tested property rather than a convention.
   */
  it("never pops a cancelled pointer, whatever the claim was", () => {
    expect(releasePops("cancelled", null)).toBe(false);
    expect(releasePops("cancelled", false)).toBe(false);
    expect(releasePops("cancelled", true)).toBe(false);
  });
});

describe("the pop rule and the click rule agree about what a pointer produced", () => {
  /**
   * One gesture, one answer. The click is delivered exactly when the pop runs, because
   * both are the same sentence — *that was a tap and it landed*. Written as an equality
   * over all three claims rather than three restated literals, so a change to either rule
   * that does not move the other fails here rather than shipping as a control that flashes
   * without navigating, or navigates without flashing.
   */
  it("says the same thing for every claim a release can carry", () => {
    for (const claimed of [true, false, null] as const) {
      expect(releasePops("released", claimed), `claimed: ${String(claimed)}`).toBe(
        deliversClick(claimed),
      );
    }
  });

  /**
   * And they part company on exactly one thing, which is the one thing `deliversClick`
   * cannot be asked: a cancelled pointer generates no click at all, so there is nothing
   * for that rule to refuse — while the press is a mark on an element that very much
   * still exists and must come off without a flourish.
   */
  it("differs only where there is no click to have an opinion about", () => {
    expect(releasePops("cancelled", null)).toBe(false);
    expect(deliversClick(null)).toBe(true);
  });

  /**
   * The two rules over one whole gesture, driven from the same delta the pager's binding
   * would latch from: a swipe across a card claims the drag, so the card's click is
   * swallowed **and** its pop does not run. This is #280's *a swipe across a pager card
   * leaves no pop mark behind*, said in the only place it can be said without a browser.
   */
  it("leaves a swipe across a card with neither a click nor a pop", () => {
    const swipe: Drag = { dx: -120, dy: 8 };
    const claimed = claimsDrag(swipe, PAGER_FIRST);

    expect(claimed).toBe(true);
    expect(releaseDrag(swipe, PAGER_FIRST, claimed)).toEqual({ kind: "commit", direction: -1 });
    expect(deliversClick(claimed)).toBe(false);
    expect(releasePops("released", claimed)).toBe(false);
  });
});
