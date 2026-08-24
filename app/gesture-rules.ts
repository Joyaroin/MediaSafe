/**
 * What a drag means — the one place in this application that decides whether a pointer
 * that moved has committed to anything (issue #251).
 *
 * ── Why this is a module rather than two `onPointerMove` handlers ────────────────────
 *
 * #245 asks for two drag gestures in one build: the landing screen's horizontal pager,
 * and the episode modal's swipe-down (#254). Both ask the same three questions — *is this
 * drag mine, how far has it got, and does letting go commit* — and both would otherwise
 * answer them inside a component, over a pointer, in a browser. `vitest.config.mts` runs
 * in `node` with no DOM, so a rule that only exists inside a pointer handler is a rule
 * nothing can assert.
 *
 * This is the split `up-next-mark.ts` and `watch-marks.ts` already make one surface over,
 * and it exists for the same stated reason: the binding is a thin hook, the *rules* are
 * pure functions with a suite, and a threshold that quietly stops being 40 fails a test
 * rather than a thumb.
 *
 * ── What it is not ───────────────────────────────────────────────────────────────────
 *
 * It holds no state, reads no clock and knows nothing about pointers, elements or React.
 * A binding tracks the pointer's start and current position, subtracts them, and asks
 * these functions what that difference means. Velocity is deliberately absent: the
 * handoff's rule is a distance (*the drag threshold is 40px*) and a flick that travels
 * fast and far crosses it anyway, so a second, unspecified rule would only be a way for
 * the two to disagree.
 */

/**
 * Which way a committed drag went, along its own axis, in screen coordinates.
 *
 * `1` is rightwards or downwards; `-1` is leftwards or upwards. The names are the axis's
 * and not the surface's on purpose — *forward* and *back* mean opposite things to a pager
 * and to a sheet, and a rule that spoke the surface's language would need to be read
 * differently in each of its two callers.
 */
export type DragDirection = -1 | 1;

/** Which axis a surface is listening on. The other one is the one it must not steal. */
export type DragAxis = "horizontal" | "vertical";

/** A pointer's travel since it went down, in CSS pixels. */
export interface Drag {
  readonly dx: number;
  readonly dy: number;
}

/**
 * What one surface will accept.
 *
 * `commits` is the list of directions that have somewhere to go, and it is a **property
 * of the surface at this moment** rather than of the gesture: the pager's first page can
 * be dragged forwards and not back, its second the other way, and the modal can be thrown
 * down and not up. Naming them lets the rule answer *cancel* for a drag that crossed the
 * threshold into nothing, which is the case a bare threshold silently gets wrong — it
 * would commit, and the surface would then have to undo it.
 *
 * An empty `commits` is legal and means every drag on this axis cancels. That is the
 * honest description of a one-page pager, and it is better than the caller not mounting
 * the binding at all, which is how a surface ends up with two ways to be inert.
 */
export interface DragRules {
  readonly axis: DragAxis;
  /** How far along `axis` the pointer must travel before letting go commits. */
  readonly threshold: number;
  readonly commits: readonly DragDirection[];
}

/**
 * The handoff's own number: *both a tap and a horizontal drag change page; the drag
 * threshold is 40px* (`docs/design/prototypes/mediasafe-mobile-handoff.md`, screen 1).
 *
 * Exported rather than inlined at the binding because the suite asserts the boundary at
 * exactly this value, and a threshold typed at a call site is the same class of mistake
 * `app/motion.ts` exists to make visible for durations.
 */
export const DRAG_THRESHOLD_PX = 40;

/** How far the pointer has travelled along the axis the rules are about. */
function alongAxis(drag: Drag, rules: DragRules): number {
  return rules.axis === "horizontal" ? drag.dx : drag.dy;
}

/** How far it has travelled across it — the part a surface must not act on. */
function acrossAxis(drag: Drag, rules: DragRules): number {
  return rules.axis === "horizontal" ? drag.dy : drag.dx;
}

function directionOf(distance: number): DragDirection {
  return distance < 0 ? -1 : 1;
}

/**
 * **Is this drag this surface's at all?**
 *
 * The on-axis travel has to beat the off-axis travel. A pager that claimed every pointer
 * would eat the page's vertical scroll, and a modal that claimed every pointer would eat
 * a rail's horizontal one — on the exact screen where both live inside each other.
 *
 * Strictly greater, so a perfect diagonal is nobody's. That is the right way for a tie to
 * fall: a diagonal is a drag whose intent the reader has not yet declared, and the frame
 * after it will declare it.
 *
 * A pointer that has not moved is not a drag, and is not claimed — which is what leaves a
 * tap to be a tap.
 */
export function claimsDrag(drag: Drag, rules: DragRules): boolean {
  return Math.abs(alongAxis(drag, rules)) > Math.abs(acrossAxis(drag, rules));
}

/**
 * **How far the surface should be shown to have moved, right now** — the *track* half of
 * the ticket's *commit or cancel or track*.
 *
 * Three rules, and each of them is a thing a reader can see:
 *
 *  - a drag this surface has not claimed moves it **not at all**, so a vertical scroll
 *    does not smear the pager sideways on its way past;
 *  - a drag towards something that is not there moves it **not at all** either — the
 *    first page dragged further right has nowhere to come from, and a surface that slid
 *    anyway would be offering a page it is about to refuse;
 *  - anything else follows the thumb exactly, one pixel per pixel, because the whole
 *    point of tracking is that the page is *under* the finger rather than animating
 *    towards where the finger has been.
 *
 * There is no rubber-banding at the far edge. The commit is what ends the drag, and a
 * surface that stretched past its own threshold would be drawing a state it cannot hold.
 */
export function dragOffset(drag: Drag, rules: DragRules): number {
  if (!claimsDrag(drag, rules)) return 0;

  const travelled = alongAxis(drag, rules);
  if (!rules.commits.includes(directionOf(travelled))) return 0;

  return travelled;
}

/** What letting go does. `commit` carries the direction so the binding does not re-derive
 *  it from a delta this module has already read. */
export type DragOutcome =
  | { readonly kind: "commit"; readonly direction: DragDirection }
  | { readonly kind: "cancel" };

/**
 * **What letting go means** — the whole of the ticket's *commit or cancel*, and the only
 * function of the three a surface is obliged to call.
 *
 * A drag commits when all three hold: this surface claimed it, it travelled at least
 * `threshold` along the axis, and the direction it travelled has somewhere to go.
 * Anything else cancels, and *cancel* is a single outcome rather than three — the page
 * springs back the same way whether the drag was short, sideways, or into a wall, because
 * that is one thing to a reader.
 *
 * `>=` and not `>`: the handoff names 40px as the threshold to cross, and a drag that
 * lands exactly on the named number crossing it is the reading a reader would give it.
 * The suite asserts both sides of that boundary so it cannot drift to the other one.
 */
export function releaseDrag(drag: Drag, rules: DragRules): DragOutcome {
  if (!claimsDrag(drag, rules)) return { kind: "cancel" };

  const travelled = alongAxis(drag, rules);
  if (Math.abs(travelled) < rules.threshold) return { kind: "cancel" };

  const direction = directionOf(travelled);
  if (!rules.commits.includes(direction)) return { kind: "cancel" };

  return { kind: "commit", direction };
}
