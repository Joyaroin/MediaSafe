"use client";

import { useState } from "react";

import {
  claimsDrag,
  deliversClick,
  dragOffset,
  ownsPointer,
  releaseDrag,
  type DragOutcome,
  type DragRules,
} from "./gesture-rules";

/**
 * The pointer half of a drag gesture — lifted out of `LandingPager` before the pager was
 * retired (Charcoal slice 5, issue #399), because swipe to mark (slice 14) needs exactly
 * this binding and the pager was the only place it had been audited.
 *
 * `app/gesture-rules.ts` decides what a delta means. This decides **whose delta it is**:
 *
 * - **The latched claim.** `claimsDrag` is asked once, the first time the pointer moves at
 *   all, and its answer stands for the rest of the gesture. Re-asking every frame is the
 *   bug the latch exists for — a thumb on an arc puts in a frame or two where the other
 *   axis wins, and the surface would snap back to nothing and out again under the finger.
 * - **Pointer ownership** (issue #277). A second finger neither starts a gesture nor
 *   re-seats the one in flight, and a release from any pointer but the gesture's own ends
 *   nothing. A claimed gesture captures its pointer, so its release comes back here even
 *   when it lands off the element.
 * - **The swallowed click.** A claimed gesture that began on a link would otherwise also
 *   navigate on release. `deliversClick` is the rule; the capture-phase handler is where
 *   it is applied, at most once per gesture. A tap, and a gesture this surface watched and
 *   refused, keep their clicks.
 *
 * ── A core with no React in it, and a hook that holds one ───────────────────────────
 *
 * `vitest.config.mts` runs in `node` with no DOM, so the core takes plain event-shaped
 * objects — React's `PointerEvent` is one, and a test hands in a literal. That is what
 * lets `tests/claimed-drag.test.ts` drive whole gestures rather than read this file's
 * source for the names of the guards, which is all the pager's suite could do.
 */

/** The parts of a pointer event the binding reads. */
export interface DragPointerEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly clientX: number;
  readonly clientY: number;
  readonly currentTarget: { setPointerCapture(pointerId: number): void };
}

/** The parts of a click the binding may swallow. */
export interface DragClickEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

export interface ClaimedDragOptions {
  readonly rules: DragRules;
  /** Asked once, as the pointer goes down: a press this surface leaves alone entirely —
   *  for swipe to mark, one that starts inside Android's back-gesture edge. */
  readonly ignores?: (event: DragPointerEvent) => boolean;
  /** How far the surface should be shown to have moved: `dragOffset`'s answer on every
   *  move, and `0` when the gesture ends either way. */
  readonly onDrag: (offset: number) => void;
  /** What letting go did. Not called for a pointer the browser cancelled — nothing was
   *  let go, so nothing is committed. */
  readonly onRelease: (outcome: DragOutcome) => void;
}

interface Gesture {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  /** `null` until the pointer has moved, then `claimsDrag`'s one answer. */
  claimed: boolean | null;
}

export function createClaimedDrag() {
  let gesture: Gesture | null = null;

  /**
   * The claim the gesture that just ended finished on, held only for the click its release
   * is about to generate. Three states and not a boolean: *claimed*, *refused* and *there
   * was nothing to claim* are different facts, and only the first swallows a click.
   */
  let released: boolean | null = null;

  return {
    down(event: DragPointerEvent, options: ClaimedDragOptions): void {
      released = null;

      // A second finger is not a second gesture. A pen or a mouse is always primary for its
      // own type, so it is refused only while the live gesture is claimed — captured, and
      // so certain to release here. An unclaimed gesture is replaced instead, which is the
      // only recovery from a `pointerdown` whose release never arrived.
      if (!event.isPrimary) return;
      if (gesture?.claimed === true) return;
      if (options.ignores?.(event)) return;

      // Nothing is captured yet: a press that turns out to be a tap on a link has to stay
      // a click, and capture is taken only once the drag is real.
      gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, claimed: null };
    },

    move(event: DragPointerEvent, options: ClaimedDragOptions): void {
      const from = gesture;
      if (!ownsPointer(from, event.pointerId)) return;

      const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };

      if (from.claimed === null) {
        // Deciding on a zero delta would latch *not ours* before the reader did anything.
        if (delta.dx === 0 && delta.dy === 0) return;

        from.claimed = claimsDrag(delta, options.rules);
        if (from.claimed) event.currentTarget.setPointerCapture(event.pointerId);
      }

      options.onDrag(dragOffset(delta, options.rules, from.claimed));
    },

    up(event: DragPointerEvent, options: ClaimedDragOptions): void {
      const from = gesture;
      if (!ownsPointer(from, event.pointerId)) return;

      gesture = null;
      // Armed for the click this release generates, and only for it.
      released = from.claimed;
      options.onDrag(0);

      const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };
      options.onRelease(releaseDrag(delta, options.rules, from.claimed ?? false));
    },

    /** A cancelled pointer generates no click, so nothing is left armed to swallow one. */
    cancel(event: DragPointerEvent, options: ClaimedDragOptions): void {
      if (!ownsPointer(gesture, event.pointerId)) return;

      gesture = null;
      released = null;
      options.onDrag(0);
    },

    /** Read and cleared in one go, so at most one click is swallowed per gesture. */
    click(event: DragClickEvent): void {
      const claimed = released;
      released = null;

      if (deliversClick(claimed)) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/**
 * The handlers to spread on the element a gesture starts from. `onClickCapture` is the
 * capture phase on purpose: it has to run before the link underneath the pointer does.
 *
 * Sets no `touch-action`. That is the caller's to choose, because it is intersected down
 * the whole ancestor chain — the pager learned that a `pan-y` on its track took native
 * horizontal scrolling away from every rail inside it.
 */
export function useClaimedDrag(options: ClaimedDragOptions) {
  const [drag] = useState(createClaimedDrag);

  return {
    onPointerDown: (event: React.PointerEvent) => drag.down(event, options),
    onPointerMove: (event: React.PointerEvent) => drag.move(event, options),
    onPointerUp: (event: React.PointerEvent) => drag.up(event, options),
    onPointerCancel: (event: React.PointerEvent) => drag.cancel(event, options),
    onClickCapture: (event: React.MouseEvent) => drag.click(event),
  };
}
