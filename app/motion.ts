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
 * perceptual pair as `duration` and `bounce`, where `bounce ≈ 1 - dampingFraction`.
 *
 * The bounce values below **are** the platform's own damping fractions, transcribed
 * exactly — `.smooth`/`.snappy`/`.bouncy` read as `dampingFraction` 1.00/0.85/0.70, which
 * is `bounce` 0/0.15/0.30. The durations are not a transcription: SwiftUI's own
 * `response` for all three presets is a flat `0.5`, and what ships below runs roughly 40%
 * shorter. That is a choice made for the web, not a number decoded from the platform.
 *
 * | here      | SwiftUI    | duration (here) | SwiftUI's response | dampingFraction |
 * | --------- | ---------- | ---------------- | ------------------- | --------------- |
 * | `smooth`  | `.smooth`  | 0.30              | 0.50                 | 1.00            |
 * | `snappy`  | `.snappy`  | 0.30              | 0.50                 | 0.85            |
 * | `bouncy`  | `.bouncy`  | 0.40              | 0.50                 | 0.70            |
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
 *
 * ── #270 reversed one word of this, and left the conclusion standing ─────────────────
 *
 * The press is still in CSS, still has no variant here, and this module gains nothing
 * back. What was wrong is *the press is the same story*. The grid's story is that a spring
 * buys nothing because nothing can catch a reveal — and that had come to be read as
 * *therefore a press is flat*. A press cannot be caught either, but it can still have a
 * spring's **shape**, and those are two properties rather than one. `linear()` holds an
 * arbitrary function of time, so the press was given `snappy` itself, sampled: response
 * `0.30`, damping fraction `0.85`, the numbers above rather than an approximation of them,
 * so a control animated in CSS and one animated here are the same spring.
 *
 * So the dividing line narrows to what it can actually defend: what only Motion can
 * express is **interruptibility**. Not spring shape.
 *
 * ── #281 kept all of that and moved where the spring is written ─────────────────────
 *
 * `globals.css`'s `--spring-press` is gone, and none of the above changes: the press is
 * still in CSS, this module still gains nothing back, and the press is still `snappy`.
 * What was wrong was the **timing function** as the place to put it. A transition's easing
 * scales the *delta* between two values rather than a value, so a curve peaking at `1.0062`
 * over a `0.97 → 1` release arrived at `1.00019` — a faithful transcription of the spring
 * above, and 0.008px of movement on the checkmark this product is built around.
 *
 * The press is now a 100ms compression and a `press-pop` keyframe, and that keyframe's 33
 * stops are the same step response, from the same closed form, normalised to sizes a
 * reader can see. `tests/press-spring.test.ts` recomputes every one of them from `snappy`
 * and now also asserts the pop exceeds rest: this note's own warning about two spellings,
 * answered first by making the second spelling a function of the first, and then by
 * asserting that the second one does anything at all.
 */
