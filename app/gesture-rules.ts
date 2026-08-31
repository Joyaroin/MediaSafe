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
 * It holds no state, reads no clock and knows nothing about elements or React. A binding
 * tracks the pointer's start and current position, subtracts them, and asks these functions
 * what that difference means. Velocity is deliberately absent: the handoff's rule is a
 * distance (*the drag threshold is 40px*) and a flick that travels fast and far crosses it
 * anyway, so a second, unspecified rule would only be a way for the two to disagree.
 *
 * **This said *knows nothing about pointers* until issue #277**, and the two rules at the
 * foot of the file are why it no longer does. They know a pointer's **id** and nothing
 * else: not its position, not its target, not its buttons. That is still a number a binding
 * hands in rather than a DOM this module reaches for, and it is the narrowest thing that
 * can answer *whose gesture is this* — which was the audit's finding and could not be
 * asserted anywhere while it lived inside a handler.
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
 *
 * ── This is asked **once per gesture**, and the binding is what remembers ────────────
 *
 * It takes the delta so far, so asking it again a frame later can give a different answer:
 * a thumb travelling along an arc puts in a frame or two where the vertical component
 * wins, and a surface that re-asked every frame would snap back to nothing and out again
 * mid-drag. So the two functions below take the answer rather than re-deriving it, and the
 * binding **latches** it the first time the pointer has moved at all. Which way a gesture
 * was going when it began is a fact about the gesture, not about its latest frame.
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
 *
 * `claimed` is the binding's latched answer to `claimsDrag`, passed in rather than asked
 * again — see that function's own note for why re-asking mid-drag is wrong.
 */
export function dragOffset(drag: Drag, rules: DragRules, claimed: boolean): number {
  if (!claimed) return 0;

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
 *
 * `claimed` is the binding's latched answer, as above.
 */
export function releaseDrag(drag: Drag, rules: DragRules, claimed: boolean): DragOutcome {
  if (!claimed) return { kind: "cancel" };

  const travelled = alongAxis(drag, rules);
  if (Math.abs(travelled) < rules.threshold) return { kind: "cancel" };

  const direction = directionOf(travelled);
  if (!rules.commits.includes(direction)) return { kind: "cancel" };

  return { kind: "commit", direction };
}

/**
 * ── The pointer audit — issue #277 ───────────────────────────────────────────────────
 *
 * Everything above is arithmetic over a delta and deliberately knows nothing about
 * pointers. The two rules below are the smallest things that are *about* a pointer and are
 * still decidable without one: **whose gesture an event belongs to**, and **whether the
 * click a finished gesture leaves behind may be delivered**. Both were the landing pager's
 * own business, written inline over `event.pointerId` and a boolean ref, and neither could
 * be asserted by anything.
 *
 * **This is a hardening on a hypothesis and not a reproduced fix.** #277's report is
 * second-hand — on Android a tap on a next-episodes card sometimes appears to land on the
 * recording control rather than opening the card — and the owner does not have the device.
 * These rules stand on their own merits, which is the whole basis on which they ship: a
 * second finger must not move the origin the first one is being measured from, and a
 * gesture a surface has claimed must not also arrive at a child as a press. If the misfire
 * survives them, it was not addressed here, and `DESIGN.md` §7 says so in the same words.
 */

/** The one thing about a gesture that decides whose events it is. A binding holds much
 *  more than this; the rule reads only the field it is about. */
export interface GesturePointer {
  readonly pointerId: number;
}

/**
 * **Is this event's pointer the one the gesture in progress belongs to?**
 *
 * `false` between gestures, and `false` for every pointer but the gesture's own. A binding
 * that skipped this measures one finger's travel from another finger's origin the moment a
 * second one lands — the page jumps under the thumb — and lets any release at all end a
 * drag, which parks the track mid-gesture until the next press.
 *
 * A type predicate rather than a bare `boolean`, so a handler that has asked the question
 * is holding a gesture the compiler knows is there. `G` is the caller's own gesture shape,
 * not this interface, so nothing has to be narrowed twice.
 *
 * The comparison is `===` against `null` and not a falsy check: `0` is a legal pointer id
 * and is the value a truthiness test gets wrong, on some engines only, for a whole session.
 */
export function ownsPointer<G extends GesturePointer>(
  gesture: G | null,
  pointerId: number,
): gesture is G {
  return gesture !== null && gesture.pointerId === pointerId;
}

/**
 * **May the click this gesture is about to generate reach a child?**
 *
 * A pointer that went down on a link, travelled and was released generates a click like any
 * other press. If the surface has already acted on that travel — paged, or sprung back —
 * then delivering the click as well makes one gesture mean two things, which is the failure
 * `SPEC.md` states for the season row's check one level down: *a gesture must never be two
 * things at once.*
 *
 * The argument is the binding's **latched** claim, in the three states it really has:
 *
 *  - `true` — the surface claimed the gesture, so the click is its own and is swallowed;
 *  - `false` — the surface watched the gesture and refused it (a page scroll going past, a
 *    rail's own swipe), so the click belongs to whoever the pointer was over;
 *  - `null` — the pointer never moved, so the claim was never asked. That is a **tap**, and
 *    a tap is the one thing on a surface like this that must always be delivered.
 *
 * The last two answering the same way is the point of taking `boolean | null` rather than a
 * `boolean` the binding has already flattened: a `?? false` at the call site reads as a
 * default and is in fact the whole of *a tap still opens the card*.
 */
export function deliversClick(claimed: boolean | null): boolean {
  return claimed !== true;
}
