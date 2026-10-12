import { DRAG_THRESHOLD_PX, type DragRules } from "@/app/gesture-rules";

/**
 * Swipe a row to mark — Charcoal, issue #408 (handoff §11.3). The decisions, with no
 * pointer and no React in them, so `tests/swipe-to-mark.test.ts` can state them as rules;
 * `use-swipe-to-mark.ts` is the thin binding over `useClaimedDrag`.
 *
 * A shortcut to the row's tick, and nothing more: tapping the tick still records exactly
 * what a swipe does, and a swipe records only through the same `mark()`.
 */

/** `app/gesture-rules.ts`'s own rules, pointed rightward only: the row's swipe never
 *  goes the other way. */
export const SWIPE_TO_MARK: DragRules = {
  axis: "horizontal",
  threshold: DRAG_THRESHOLD_PX,
  commits: [1],
};

/** The strip along the screen's left edge that belongs to Android's back gesture. */
export const BACK_GESTURE_EDGE_PX = 24;

/** A press that starts in the back-gesture strip is the system's, not the row's. */
export function startsInBackEdge(clientX: number): boolean {
  return clientX < BACK_GESTURE_EDGE_PX;
}

/**
 * Whether letting go here would record the watch — the moment the tick fills, with one
 * short vibration. The same line `releaseDrag` draws, so the tick never shows filled for a
 * release that would record nothing, or empty for one that would.
 */
export function swipeArmed(offset: number): boolean {
  return offset >= SWIPE_TO_MARK.threshold;
}

/**
 * How far across the row the wash reaches, as the `scaleX` of a full-width layer — the row
 * itself never moves, and a size is never animated (handoff §11.4).
 */
export function washScale(offset: number, rowWidth: number): number {
  if (rowWidth <= 0) return 0;
  return Math.min(1, Math.max(0, offset / rowWidth));
}
