"use client";

import { animate, useMotionValue, type MotionValue } from "motion/react";
import { useRef, useState } from "react";

import { pulse } from "@/app/haptics";
import { snappy } from "@/app/motion";
import { useClaimedDrag } from "@/app/use-claimed-drag";
import { startsInBackEdge, SWIPE_TO_MARK, swipeArmed, washScale } from "./swipe-to-mark";

/**
 * Swipe a row to mark — the binding (issue #408, handoff §11.3). `swipe-to-mark.ts` holds
 * the rules and `useClaimedDrag` the pointer: the latched claim that lets a mostly-vertical
 * movement scroll the list, pointer ownership, and the swallowed click of a claimed drag on
 * the row's link.
 *
 * **The row does not move.** A wash grows from its left edge under the finger — `wash`, the
 * `scaleX` of a full-width layer the row draws — and at the threshold `armed` fills the tick
 * with one short vibration; back under it, the tick empties. Letting go past the threshold
 * calls `onCommit`, which is the row's own tick press; the wash withdraws on `snappy`, the
 * spring for what a finger just let go of.
 *
 * `enabled` is false while the row has nothing to record — holding, leaving, or a write in
 * flight — and a press then is left entirely alone, as is one starting in Android's
 * back-gesture edge.
 */
export function useSwipeToMark({
  enabled,
  onCommit,
}: {
  readonly enabled: boolean;
  readonly onCommit: () => void;
}): {
  readonly wash: MotionValue<number>;
  readonly armed: boolean;
  readonly handlers: ReturnType<typeof useClaimedDrag> & {
    onDragStartCapture(event: React.DragEvent): void;
  };
} {
  const wash = useMotionValue(0);
  const [armed, setArmed] = useState(false);
  const width = useRef(0);
  const wasArmed = useRef(false);

  function arm(now: boolean): void {
    if (now === wasArmed.current) return;
    wasArmed.current = now;
    setArmed(now);
    if (now) pulse();
  }

  const drag = useClaimedDrag({
    rules: SWIPE_TO_MARK,
    ignores: (event) => !enabled || startsInBackEdge(event.clientX),
    onDrag(offset) {
      // `0` is also how a gesture ends, either way: the wash withdraws on a spring rather
      // than vanishing.
      if (offset === 0) animate(wash, 0, snappy);
      else wash.jump(washScale(offset, width.current));
      arm(swipeArmed(offset));
    },
    onRelease(outcome) {
      if (outcome.kind === "commit") onCommit();
    },
  });

  return {
    wash,
    armed,
    handlers: {
      ...drag,
      onPointerDown(event) {
        width.current = event.currentTarget.getBoundingClientRect().width;
        drag.onPointerDown(event);
      },
      // A mouse dragging the row's link or poster would start the browser's own drag of
      // it, which cancels the pointer mid-swipe. The row is not something to drag out.
      onDragStartCapture(event) {
        event.preventDefault();
      },
    },
  };
}
