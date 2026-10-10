"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import { useEffect } from "react";

import { ownsPointer, releasePops, type PressEnd } from "./gesture-rules";
import { smooth } from "./motion";
import { flattenTilt, usePosterTilt } from "./poster-tilt";

/**
 * One `MotionConfig` at the root, for one reason each — and one `LazyMotion` around it,
 * for a third.
 *
 * `reducedMotion="user"` is the whole of this app's reduced-motion handling for anything
 * animated by Motion. It reads the OS setting and, when it is on, drops transform and
 * layout animation while leaving opacity and colour alone. That is the behaviour
 * `globals.css` already chose for the watch sweep and the poster morph — *the event still
 * happens, it just stops moving through space* — applied globally instead of re-derived
 * per component. Doing it here rather than at call sites is what stops a new animation
 * from silently shipping without a reduced-motion path: there is no call site to forget.
 *
 * The default `transition` means a component that animates without naming one still gets
 * the system's spring instead of Motion's own default. A stray built-in easing curve is
 * the motion equivalent of a `text-[1.37rem]`.
 *
 * ── `LazyMotion`, and what it is actually buying ─────────────────────────────────────
 *
 * Every `m.*` in this application is a **mini** component: it knows how to render and
 * nothing else, and the code that makes it animate arrives separately. Without this
 * wrapper the animation runtime is imported by whichever module renders a motion
 * component — and because this provider is mounted in the root layout, that put the full
 * runtime in the first-load bundle of *every* route, including the several that animate
 * nothing at all. Settings, Import, Welcome and the error surfaces were all parsing an
 * animation engine before they were interactive.
 *
 * `features` is a function rather than the bundle itself, which is the whole trick: the
 * dynamic `import()` inside `motion-features.ts` is a chunk boundary, so the engine is
 * fetched in parallel with the page instead of blocking it. That module's docblock says
 * why it must be `domMax` rather than the smaller `domAnimation`.
 *
 * `strict` is the seam being **enforced rather than remembered**, in the same spirit as
 * `eslint.config.mjs`'s restricted imports: it throws the moment a `motion.*` component
 * renders inside this tree, so the next person to reach for the full import is told at
 * once rather than silently re-adding the bundle this removes. Every call site imports
 * `* as m from "motion/react-m"` instead.
 *
 * This exists as a client island rather than in `layout.tsx` so the root layout stays a
 * server component — it renders `<html>` and `<body>` and holds the metadata, and turning
 * all of that into a client component to set three props would push every child across
 * the boundary with it.
 *
 * ── And since issue #280, the press's one listener ───────────────────────────────────
 *
 * `usePressMarks` below is the whole runtime the press has. It is here because this is
 * already the client island that wraps the entire tree: the alternative is a second
 * provider beside this one, which is a second boundary at the root for a component that
 * renders nothing. Its own docblock argues why it is a document listener rather than a
 * handler on each of the twenty-five `pressable` call sites.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  usePressMarks();
  usePosterTilt();

  return (
    <LazyMotion features={() => import("./motion-features").then((mod) => mod.default)} strict>
      <MotionConfig reducedMotion="user" transition={smooth}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/**
 * The pressed control, while the finger is on it. `globals.css` is what it means — this
 * file only ever puts it on and takes it off.
 *
 * `data-` attributes and not classes, because the two states a library cell already has
 * for the hold gesture are spelled that way (`data-holding`, `data-landed`) and the
 * stylesheet qualifies all of them with `.pressable`. A third spelling of *a state the
 * press is in* would be a third place to look.
 */
const PRESSED = "data-pressed";

/**
 * The control that has just been let go of, for as long as the pop is running.
 *
 * Nothing in this ticket draws it — #279's keyframe is the next commit — and that is
 * deliberate: the trigger and the rule land where they can be verified on their own rather
 * than underneath a stylesheet rewrite.
 */
const POPPED = "data-popped";

/** The nearest pressable ancestor of whatever the pointer was over, itself included. */
function pressableUnder(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(".pressable") : null;
}

/**
 * **Did somebody else claim this gesture as a drag?** — the three-state latch
 * `releasePops` takes, answered from the DOM rather than from a surface's internals.
 *
 * A release that comes back to the control it started on is a tap: `null`, *nothing ever
 * claimed anything*. A release that arrives anywhere else is `true`, and there are exactly
 * two ways for that to happen, both of which mean the same thing to a reader:
 *
 *  - a surface **captured** the pointer, which is what the landing pager does the moment
 *    `claimsDrag` says the swipe is its own (`landing-pager.tsx`). From that moment every
 *    event for that pointer is retargeted at the pager's track, which is an ancestor of
 *    the card and therefore not the card. This is #280's *a swipe across a pager card
 *    leaves no pop mark behind*, and it needs no agreement between the two files;
 *  - or the finger simply slid off the control, which the browser already treats as *not
 *    a tap*: a `click` is only delivered to the common ancestor of the two targets, so the
 *    card never hears about it either.
 *
 * Asking the DOM rather than asking the pager is the point. The pager's latch is a ref
 * inside a component this listener cannot see and must not learn about — a listener that
 * knew which surfaces might claim a gesture would be the global handler #277 spent a
 * ticket getting away from.
 */
function claimOver(pressed: Element, target: EventTarget | null): boolean | null {
  return pressableUnder(target) === pressed ? null : true;
}

/**
 * **One delegated pointer listener, for every `pressable` element in the application.**
 *
 * Twenty-five call sites wear `pressable` and every one of them is a server component. A
 * handler per call site would put a client boundary on every tile, cell and row in the
 * product to set one attribute, which is the exact cost given as the reason
 * the press is CSS in the first place. So the marking is delegated: one listener at the
 * document, `closest(".pressable")` from whatever the finger was over, and the call sites
 * stay markup.
 *
 * **Nothing happens on `pointermove`.** #279's user story is a long rail of tiles staying
 * as cheap as it is now, and a document-level move handler is the one addition that would
 * quietly undo it. The whole job is at the two ends of a gesture.
 *
 * **Reduced motion is not consulted here.** The event always happens; only the animation
 * is negotiable, and the stylesheet is where it is dropped — `globals.css`'s
 * `@media (prefers-reduced-motion: reduce)` block covers the press already. A branch here
 * would be a second answer to a question this application answers in two places.
 *
 * ── The three handlers, and why the last one is the important one ────────────────────
 *
 * `pointerdown` marks. `pointerup` unmarks and, when `releasePops` says so, pops.
 * `pointercancel` unmarks and **never** pops: the browser took the pointer away, so
 * nothing was tapped. That is the contract that keeps this listener and the landing
 * pager's hardened drag (#277) apart, and it is a tested property — `releasePops` is a
 * pure function with its own cases in `tests/gesture-rules.test.ts`.
 *
 * `ownsPointer` is #277's rule, reused rather than restated: a second finger's release
 * must not end the first finger's press. `isPrimary` is the other half, and it is the
 * platform's own answer for touch — a hand steadying the phone starts no press.
 *
 * All three are registered in the **capture** phase, so a surface that stops a pointer
 * event's propagation cannot strand a mark on an element the finger has left. Capture
 * runs before React's own handlers and this listener touches nothing they read, so the
 * order costs the pager nothing.
 */
function usePressMarks(): void {
  useEffect(() => {
    /** The press in progress, or `null` between presses. */
    let pressing: { pointerId: number; element: Element } | null = null;
    /** The control still wearing the pop from the last release, if any. */
    let popped: Element | null = null;

    /** A new gesture ends the last one's flourish, which is also what lets the same
     *  control pop twice: the attribute has to come off before it can go back on. */
    function clearPop(): void {
      popped?.removeAttribute(POPPED);
      popped = null;
    }

    function endPress(event: PointerEvent, end: PressEnd): void {
      if (!ownsPointer(pressing, event.pointerId)) return;

      const element = pressing.element;
      pressing = null;
      element.removeAttribute(PRESSED);

      if (!releasePops(end, claimOver(element, event.target))) return;
      element.setAttribute(POPPED, "true");
      popped = element;
    }

    function onPointerDown(event: PointerEvent): void {
      clearPop();
      flattenTilt();
      if (!event.isPrimary) return;

      const element = pressableUnder(event.target);
      if (element === null) return;

      pressing = { pointerId: event.pointerId, element };
      element.setAttribute(PRESSED, "true");
    }

    const onPointerUp = (event: PointerEvent) => endPress(event, "released");
    const onPointerCancel = (event: PointerEvent) => endPress(event, "cancelled");

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);

      // Nothing may outlive the listener that would have taken it off again.
      pressing?.element.removeAttribute(PRESSED);
      clearPop();
    };
  }, []);
}
