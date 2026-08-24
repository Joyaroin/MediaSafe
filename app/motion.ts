import type { Transition } from "motion/react";

/**
 * The motion vocabulary, in one module so that a duration typed at a call site is as
 * visible a mistake as a `text-[1.37rem]` would be in the type ramp.
 *
 * ## Why springs, and why these numbers
 *
 * The brief was Apple's motion philosophy. The load-bearing part of that philosophy is
 * not a curve, it is **interruptibility**: a sheet you throw and catch halfway does not
 * stop and restart, it carries its velocity into wherever you sent it next. A CSS
 * transition cannot do that — it is defined by a duration and an endpoint, so redirecting
 * it mid-flight restarts from a standstill. That is the specific glassiness this replaces.
 *
 * SwiftUI describes a spring as a **response** (how long the settle takes) and a
 * **damping fraction** (how much it overshoots). Motion's spring accepts the same
 * perceptual pair as `duration` and `bounce`, where `bounce ≈ 1 - dampingFraction`. So
 * these are not invented numbers that felt about right; they are the platform's own
 * defaults, transcribed:
 *
 * | here      | SwiftUI    | response | dampingFraction |
 * | --------- | ---------- | -------- | --------------- |
 * | `smooth`  | `.smooth`  | 0.30     | 1.00            |
 * | `snappy`  | `.snappy`  | 0.30     | 0.85            |
 * | `bouncy`  | `.bouncy`  | 0.40     | 0.70            |
 *
 * "Multiplied to the max gracefully" is spent on **where** these are used and on the
 * authored moments they serve — not on winding the numbers past the platform's, which is
 * how motion stops reading as physics and starts reading as a cartoon.
 *
 * Reduced motion is not handled here. `<MotionConfig reducedMotion="user">` in the root
 * layout is what honours it, globally and once, by dropping transform and layout
 * animation while leaving opacity and colour intact — the event still happens, it just
 * stops moving through space.
 */

/** No overshoot. Anything carrying content to a destination: panels, routes, layout. */
export const smooth: Transition = { type: "spring", duration: 0.3, bounce: 0 };

/** A trace of overshoot. The default for anything a pointer touches directly. */
export const snappy: Transition = { type: "spring", duration: 0.3, bounce: 0.15 };

/** Visible overshoot. Reserved for arrival, never for departure or for routine state. */
export const bouncy: Transition = { type: "spring", duration: 0.4, bounce: 0.3 };

/** Slower and heavier — a sheet has more mass than a chip. */
export const sheet: Transition = { type: "spring", duration: 0.45, bounce: 0.12 };

/**
 * Exits are duration-based on purpose. Nothing can catch a thing that is already
 * leaving, so a spring's interruptibility buys nothing, and `140ms` keeps a dismissal
 * from feeling like it has to be waited through. Mirrors `--dur-fast`.
 */
export const exit: Transition = { duration: 0.14, ease: [0.25, 1, 0.5, 1] };

/**
 * ── The stagger and the press live in CSS, and deliberately not here ─────────────────
 *
 * There used to be a second half to this module: `riseIn`, `staggerDelay`, `STAGGER_STEP`,
 * `STAGGER_CAP` and a `pressable` variant. Every one of them was a **second spelling of a
 * rule this application already states somewhere else**, and none of the five had a single
 * importer — so the version the build actually ran was always the other one, and these sat
 * beside it drifting.
 *
 * `globals.css` says why the other one wins, in its own words at `@utility stagger-rise`:
 * *kept in CSS rather than given to Motion on purpose … a spring buys interruptibility,
 * and nothing can catch a grid that is appearing.* A declarative, uncatchable reveal is
 * what a keyframe is for, and doing it in CSS costs no client boundary — the library cell
 * and the rail tiles stay server components. The press is the same story: `.pressable` in
 * `globals.css` is the one every call site wears.
 *
 * Two spellings of one rule is two places for the numbers to disagree, and they already
 * had: the cap lived here as `STAGGER_CAP = 10` and there as `:nth-child(n + 10)`, with
 * nothing holding the pair together. The rule now has one home.
 *
 * What stays here is what only Motion can express — the springs above, for the things a
 * finger can catch mid-flight. That is the dividing line `DESIGN.md`'s motion section
 * draws, and it is now also the line this file's exports fall on.
 */
