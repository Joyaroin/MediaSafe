import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { snappy } from "@/app/motion";

/**
 * The press, asserted against the spring it claims to come from — issues #270 and #281.
 *
 * The press is CSS and stays CSS: it costs no client boundary and no per-frame JavaScript,
 * and `DESIGN.md`'s motion section holds why. What it is made of changed in #281.
 *
 * ── What #270 shipped, and why this file did not catch it ────────────────────────────
 *
 * #270 made `.pressable`'s timing function `app/motion.ts`'s `snappy`, transcribed into a
 * `linear()` curve, and this suite recomputed all 33 samples from the source spring. The
 * transcription was exact and the assertions below proved it. They proved the wrong
 * property. **A CSS transition's easing scales the delta between two values, not the value
 * itself**, so a curve peaking at `1.0062` applied to a `0.97 → 1` release lands at
 * `1.00019` — 0.019% above rest, 0.05px on a rail card and 0.008px on the checkmark the
 * product is built around. A mathematically exact spring whose spring is unobservable.
 *
 * Fidelity to a source is not the same property as visible effect. This file now asserts
 * the second one directly, and that assertion — **the pop exceeds the resting value** — is
 * the one that would have failed on what shipped.
 *
 * ── The press #281 built ─────────────────────────────────────────────────────────────
 *
 * Two mechanisms, because one transition governing both directions is what made the press
 * feel mushy — a tap shorter than the release never reached full compression:
 *
 *  - **the compression** is a `transition` on `transform`, `--dur-press` (100ms), an
 *    ease-out, `1 → 0.96`. Deliberately *not* the spring: a spring's long settle is the
 *    cause of the mushiness being fixed, and a quarter-second is longer than a tap;
 *  - **the pop** is a `@keyframes`, `--dur-pop` (260ms), run on the `data-popped` mark
 *    `app/motion-provider.tsx` sets when a release qualifies. A keyframe *names values*
 *    rather than scaling a delta, which is the only mechanism that can reach a number the
 *    transition's two endpoints do not contain. `select-land` already proves the pattern.
 *
 * ── Where the pop's stops come from, and what is derived versus chosen ───────────────
 *
 * The same closed form the 33 `linear()` samples came from, so the CSS press and a
 * Motion-animated surface stay one spring rather than two hand-picked feels. SwiftUI
 * describes a spring as a *response* and a *damping fraction*; Motion accepts the same pair
 * as `duration` and `bounce`, where `bounce ≈ 1 - dampingFraction` (`app/motion.ts`).
 * `snappy` is `.snappy`: response `0.30`, damping fraction `0.85`.
 *
 *   ωₙ = 2π / response          the undamped natural frequency
 *   ω_d = ωₙ √(1 − ζ²)          the damped frequency it actually oscillates at
 *   x(t) = 1 − e^(−ζωₙt) · (cos ω_d t + (ζωₙ/ω_d) · sin ω_d t)
 *
 * `x` is the unit step response — the fraction of the distance travelled at `t`. Sampled
 * at 33 even intervals over the settle, it is the *shape* of the pop: when it leaves, where
 * it turns over, how it comes to rest.
 *
 * **The two amplitudes are the register's, not the spring's, and that is the whole of the
 * correction.** A 0.85-damped spring released from `0.96` overshoots to `1.00025` — which
 * is exactly what shipped and exactly what nobody could see. So the curve is normalised to
 * the two numbers #279 names: the rise runs `0.96 → 1.012` scaled by the curve's own peak,
 * the settle runs `1.012 → 1` scaled by the curve's own excess above rest. Both pieces meet
 * at the peak, where the step response's slope is zero, so the join is not a corner. What is
 * derived is every stop's *value in time*; what is chosen is how far it travels — and the
 * choosing is visible in the stylesheet as two numbers rather than hidden in a delta.
 *
 * Two spellings of one rule is two places for the numbers to disagree, and this application
 * has been bitten by exactly that twice (`app/motion.ts`'s own note on the stagger cap;
 * `tests/palette.test.ts`'s seven drifted colours). So this file does what
 * `tests/palette.test.ts` does: it reads `app/globals.css` as text and recomputes the stops
 * from the source the stylesheet cites — `snappy`, imported here, not copied.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");
const CSS = readFileSync(path.join(REPOSITORY_ROOT, "app/globals.css"), "utf8");

/**
 * The stylesheet with its comments blanked, for the same reason `tests/palette.test.ts`
 * does it: `globals.css` is mostly prose, and the prose beside this curve names the very
 * things the assertions look for.
 */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));

/** How far off target the spring may be before the curve is allowed to stop. */
const SETTLED = 0.001;

/** Samples in the pop keyframe. 33 stops over the settle, as the `linear()` curve had. */
const STOPS = 33;

/** `snappy`, read as the perceptual pair it was transcribed from. */
const response = snappy.duration as number;
const damping = 1 - (snappy.bounce as number);

const naturalFrequency = (2 * Math.PI) / response;
const dampedFrequency = naturalFrequency * Math.sqrt(1 - damping * damping);
const decay = damping * naturalFrequency;

/** The fraction of the distance travelled at `t` seconds. */
function travelled(t: number): number {
  return (
    1 -
    Math.exp(-decay * t) *
      (Math.cos(dampedFrequency * t) + (decay / dampedFrequency) * Math.sin(dampedFrequency * t))
  );
}

/** Where the oscillation's envelope falls under `SETTLED`, rounded up to a whole ms. */
const settleMs = Math.ceil(
  (Math.log(1 / Math.sqrt(1 - damping * damping) / SETTLED) / decay) * 1000,
);

/** When the step response first turns over, and how far past rest it is when it does —
 *  the closed form `1 + e^(−πζ/√(1−ζ²))` the sampled curve knows nothing about. */
const peakTime = Math.PI / dampedFrequency;
const peakExcess = Math.exp((-Math.PI * damping) / Math.sqrt(1 - damping * damping));

/** The press's three sizes. #279's surface register, which is also the default and the
 *  quieter of the two it names. */
const COMPRESS = 0.96;
const REST = 1;
const POP = 1.012;

/** The pop keyframe's stop `index`, recomputed from `snappy` — the header's derivation. */
function popStop(index: number): number {
  // A spring settles asymptotically and an animation has to end. The last stop is rest
  // exactly: a keyframe that finished at 1.0022 would leave the control fractionally
  // scaled for as long as the mark stays on it.
  if (index === STOPS - 1) return REST;

  const t = (index / (STOPS - 1)) * (settleMs / 1000);
  const x = travelled(t);

  return t <= peakTime
    ? COMPRESS + (x / (1 + peakExcess)) * (POP - COMPRESS)
    : REST + ((x - 1) / peakExcess) * (POP - REST);
}

/** Every declaration of a custom property, so a second one is a failure and not a shadow. */
function declaredOnce(name: string): string {
  const all = [...CSS_CODE.matchAll(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm"))];
  expect(all, `${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].trim();
}

/** The body of the `@utility pressable` block, comments already blanked. */
function pressableUtility(): string {
  const match = CSS_CODE.match(/@utility pressable \{[\s\S]*?\n\}/);
  expect(match, "globals.css must still declare `@utility pressable`").not.toBeNull();
  return match![0];
}

/** The body of a named `@keyframes` block. */
function keyframesBlock(name: string): string {
  const match = CSS_CODE.match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(match, `globals.css must declare \`@keyframes ${name}\``).not.toBeNull();
  return match![0];
}

/** The pop's stops, in the order the keyframe declares them. */
function popStops(): { at: number; scale: number }[] {
  return [
    ...keyframesBlock("press-pop").matchAll(
      /([\d.]+)%\s*\{\s*transform:\s*scale\(([\d.]+)\)/g,
    ),
  ].map((stop) => ({ at: Number(stop[1]), scale: Number(stop[2]) }));
}

/** The rule that runs the pop, keyed off the mark the delegated listener sets. */
function popRule(): string {
  const match = CSS_CODE.match(/\.pressable\[data-popped="true"\]\s*\{[\s\S]*?\n\}/);
  expect(match, "globals.css must run the pop off `data-popped`").not.toBeNull();
  return match![0];
}

describe("the compression answers the finger", () => {
  /**
   * **Updated from *runs for as long as the spring takes to settle*.** That assertion was
   * true of #270's press and is the mushiness #281 removes: one transition governed both
   * directions, so a tap shorter than `425ms` never reached full compression and started
   * easing back from wherever it had got to. `settleMs` is still recomputed here rather
   * than written down, because *the compression is not the spring's settle* is only a
   * property if the spring's settle is a live number.
   */
  it("compresses in a tenth of a second, which is shorter than a tap", () => {
    expect(declaredOnce("--dur-press")).toBe("100ms");
    expect(settleMs).toBeGreaterThan(400);
  });

  /**
   * **Updated from *times the press with a linear() curve and not an ease*.** The reversal
   * is deliberate and #281 states it: a spring's long settle is the cause of the feel being
   * fixed, so the compression is explicitly not the spring. What carries the spring now is
   * the pop, as named values in a keyframe rather than as an easing over a delta.
   */
  it("is timed with an ease-out and not with a spring", () => {
    const easing = declaredOnce("--ease-out-quart");
    const [x1, y1] = easing.replace(/^cubic-bezier\(|\)$/g, "").split(",").map(Number);

    // An ease-out leaves fast: its first control point sits above the diagonal.
    expect(easing.startsWith("cubic-bezier("), `--ease-out-quart is ${easing}`).toBe(true);
    expect(y1).toBeGreaterThan(x1);

    expect(pressableUtility()).toMatch(/transform\s+var\(--dur-press\)\s+var\(--ease-out-quart\)/);
    expect(pressableUtility()).not.toMatch(/linear\(/);
  });

  /** The scale a finger actually gets, on the utility every tappable surface wears. The
   *  mark the delegated listener sets and the platform's own `:active` are one rule, so
   *  there is no second opinion about what *pressed* means. */
  it("presses the surface to 0.96, marked or native", () => {
    const pressed = pressableUtility().match(/&:active[\s\S]*?\{[\s\S]*?\}/);
    expect(pressed, "`pressable` must still scale under a press").not.toBeNull();
    expect(pressed![0]).toMatch(/transform:\s*scale\(0\.96\)/);
    expect(pressableUtility()).toMatch(/&\[data-pressed="true"\]/);
  });
});

describe("the release pops past rest", () => {
  /**
   * **The assertion #270 did not have.** Its curve was transcribed perfectly and reached
   * `1.00019` on screen, because a transition's easing scales the delta between two values
   * and neither of them was above rest. A keyframe names the value, so this is checkable at
   * all — and it is checked against the resting size, not against a copy of the number.
   */
  it("exceeds the resting value by an amount a screenshot would show", () => {
    const peak = Math.max(...popStops().map((stop) => stop.scale));

    expect(peak).toBeGreaterThan(REST);
    // #270 shipped 1.00019 — 0.05px on a rail card. A percent is the floor of visible.
    expect(peak).toBeGreaterThanOrEqual(1.01);
    expect(Math.abs(peak - POP)).toBeLessThan(5e-4);
  });

  /** A keyframe and not a transition, run off the mark the one delegated listener sets on
   *  a release that qualified (`app/motion-provider.tsx`, issue #280). */
  it("runs a keyframe on the release mark, over roughly a quarter second", () => {
    expect(declaredOnce("--dur-pop")).toBe("260ms");
    expect(popRule()).toMatch(/animation:\s*press-pop\s+var\(--dur-pop\)/);
    // The stops are the spring; a second easing over them would be a second opinion.
    expect(popRule()).toMatch(/animation:[^;]*\blinear\b/);
  });

  it("carries snappy's own step response, sample for sample", () => {
    const stops = popStops();

    expect(stops).toHaveLength(STOPS);
    stops.forEach((stop, index) => {
      // Evenly spaced in time, which is what makes the samples a curve rather than a list.
      expect(stop.at).toBeCloseTo((index * 100) / (STOPS - 1), 5);
      expect(
        Math.abs(stop.scale - popStop(index)),
        `stop ${index} is ${stop.scale}, and snappy puts it at ${popStop(index).toFixed(4)}`,
      ).toBeLessThanOrEqual(5e-5);
    });

    // Starts where the compression left the control and ends exactly at rest.
    expect(stops[0].scale).toBe(COMPRESS);
    expect(stops[STOPS - 1].scale).toBe(REST);
  });

  /** The pop's shape is the spring's, so the peak has to fall where the spring's does —
   *  two thirds through, rather than at the halfway a keyframe picked by eye would put it
   *  (`select-land`, the other press in this stylesheet, turns over at 55%). */
  it("turns over where the spring turns over", () => {
    const stops = popStops();
    const peak = Math.max(...stops.map((stop) => stop.scale));

    // The top is a short plateau because the stops are written to four decimals, so the
    // turnover is the middle of it rather than whichever sample is listed first.
    const plateau = stops.filter((stop) => stop.scale === peak);
    const peakAt = plateau.reduce((total, stop) => total + stop.at, 0) / plateau.length;

    expect(Math.abs(peakAt - (peakTime / (settleMs / 1000)) * 100)).toBeLessThan(
      100 / (STOPS - 1),
    );
  });
});

describe("the stylesheet keeps no motion token nothing consumes", () => {
  /**
   * #281 re-points the press's spring rather than deleting it: the 33 `linear()` samples
   * became the pop keyframe's stops, and `--spring-press` went with them. A curve left
   * behind that nothing reads is the drift this file exists to prevent, arriving as
   * abandonment rather than as disagreement.
   */
  it("reads every duration, easing and spring it declares", () => {
    const declared = [...CSS_CODE.matchAll(/^\s*(--(?:dur|ease|spring)-[a-z-]+):/gm)].map(
      (match) => match[1],
    );

    expect(declared.length).toBeGreaterThan(0);
    for (const token of declared) {
      expect(CSS_CODE, `${token} is declared and never read`).toContain(`var(${token})`);
    }
  });

  it("has no `linear()` press curve left over", () => {
    expect(CSS_CODE).not.toContain("--spring-press");
  });
});

describe("the press answers the gesture the product is built around", () => {
  it("puts the press on the recording control", () => {
    // Recording a watch is the most repeated act in the app and had no physical answer at
    // all: the checkmark's hit box carried a hover invert and nothing under the thumb.
    const hitBox = readFileSync(
      path.join(REPOSITORY_ROOT, "app/(signed-in)/library/watch-mark-motion.tsx"),
      "utf8",
    ).match(/export const RECORDING_HIT_BOX =\s*"([^"]*)"/);
    expect(hitBox, "watch-mark-motion.tsx must still export RECORDING_HIT_BOX").not.toBeNull();
    expect(hitBox![1].split(/\s+/)).toContain("pressable");
  });

  it("puts it on the up-next card's checkmark too", () => {
    // The same act on the other surface it happens on — the rail card's own hit box,
    // which is a separate string because its width is per-branch.
    const card = readFileSync(
      path.join(REPOSITORY_ROOT, "app/(signed-in)/up-next/up-next-episode-card.tsx"),
      "utf8",
    );
    const hitBox = card.match(/const CHECK_HIT_BOX = `([^`]*)`/);
    expect(hitBox, "up-next-episode-card.tsx must still declare CHECK_HIT_BOX").not.toBeNull();
    expect(hitBox![1]).toMatch(/(^|\s)pressable(\s|$)/);
  });

  it("costs no client boundary and no per-frame JavaScript", () => {
    // The whole reason the press is in CSS. `watch-mark-motion.tsx` is class strings a
    // server component renders, and neither the spring nor the pop may have dragged it
    // over the line.
    const motionSource = readFileSync(
      path.join(REPOSITORY_ROOT, "app/(signed-in)/library/watch-mark-motion.tsx"),
      "utf8",
    );
    expect(motionSource).not.toMatch(/^\s*"use client"/m);

    // And the curve is spelled once, in the stylesheet. A copy of it in TypeScript is the
    // drift this file exists to prevent, arriving from the other direction — so the code
    // of `app/motion.ts`, comments blanked, must contain no curve at all. (Its prose says
    // the word `linear()` on purpose, which is why the comments go first.)
    const motionCode = readFileSync(path.join(REPOSITORY_ROOT, "app/motion.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(motionCode).not.toMatch(/linear\(|cubic-bezier|@keyframes/);
  });
});

describe("reduced motion stops the movement, not the event", () => {
  const reducedBlocks = [...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g)]
    .map((match) => match[0])
    .filter((block) => /\.pressable[^[]/.test(block));

  it("drops the compression and the pop, both", () => {
    expect(reducedBlocks).toHaveLength(1);
    expect(reducedBlocks[0]).toMatch(/\.pressable\s*\{[\s\S]*?transition:\s*none/);
    expect(reducedBlocks[0]).toMatch(/transform:\s*none/);
    // Extended rather than replaced: the keyframe is the half #281 added, and a
    // reduced-motion block that covered only the transition would still pop.
    expect(reducedBlocks[0]).toMatch(
      /\.pressable\[data-popped="true"\]\s*\{[\s\S]*?animation:\s*none/,
    );
  });

  it("leaves the control able to be pressed", () => {
    // The event still happens; it stops moving through space. Anything that took the
    // control out of the document or off the pointer would be the other thing.
    expect(reducedBlocks[0]).not.toMatch(/pointer-events|display\s*:|visibility/);
  });
});

/**
 * ── The trigger — issues #279 and #280 ──────────────────────────────────────────────
 *
 * Everything above is the stylesheet, read as text. This is the one piece of runtime the
 * press has: a **single delegated pointer listener**, in the root client component that
 * already wraps the whole tree, which marks the nearest `pressable` ancestor of whatever
 * a finger came down on and — when the release qualifies — marks it as having popped.
 *
 * `vitest.config.mts` runs in `node`, so the marking itself cannot be driven here, and
 * `tests/gesture-rules.test.ts` is where the *rule* it applies is asserted with no DOM at
 * all. What is left is structural, and it is structural in the way this application keeps
 * failing: the cost of a press is the thing #270's suite already guards, and *one listener
 * at the root* versus *a handler per call site* is exactly that cost restated for the
 * trigger. `tests/upcoming-surface.test.ts` reads the pager's source for the same reason
 * and says so.
 *
 * **This is also the run's stated main risk.** #277 hardened the landing pager's pointer
 * handling hours before this listener was written, and the two share `pointerdown`,
 * `pointerup` and `pointercancel` over the same surfaces. The audit below is what keeps
 * the press from growing a second opinion about a gesture somewhere else in the tree.
 */

/** Every `.ts`/`.tsx` file under `app/`, relative to the repository root — the same
 *  whole-tree audit `tests/underline-audit.test.ts` runs, and for the same reason: a fixed
 *  list of files to check is how a rule like this drifts in the first place. */
function appSourceFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(path.relative(REPOSITORY_ROOT, full));
    }
  }

  walk(path.join(REPOSITORY_ROOT, "app"));
  return files;
}

/** A source file with its comments blanked. The prose in this codebase names the very
 *  things these assertions look for — `landing-pager.tsx` discusses `pointermove` at
 *  length and must not read as one. */
function codeOf(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ROOT_CLIENT_COMPONENT = "app/motion-provider.tsx";

describe("the press has a trigger, and there is one of it", () => {
  const provider = codeOf(ROOT_CLIENT_COMPONENT);

  /**
   * **Exactly one.** Twenty-five call sites wear `pressable`, and the press costing them
   * nothing is the whole argument for it being CSS at all — a per-call-site handler would
   * put a client boundary on every tile, cell and row in the application, which is the
   * thing `costs no client boundary` above exists to prevent, arriving from the other
   * side.
   */
  it("adds one delegated pointerdown listener in the whole application", () => {
    const listening = appSourceFiles().filter((file) =>
      /addEventListener\(\s*"pointerdown"/.test(codeOf(file)),
    );

    expect(listening).toEqual([ROOT_CLIENT_COMPONENT]);
  });

  /** The root layout renders `<html>` and holds the metadata. It stays a server component,
   *  which is why the listener lives in the client island it already mounts rather than in
   *  the layout itself. */
  it("leaves the root layout a server component", () => {
    expect(codeOf("app/layout.tsx")).not.toMatch(/^\s*"use client"/m);
    expect(codeOf("app/layout.tsx")).toContain("MotionProvider");
  });

  /**
   * All three, and the third is the one that matters. A `pointercancel` is the browser
   * taking the pointer away — a native scroll starting under the thumb — and a listener
   * that only knew about `pointerup` would leave the mark on an element the reader has
   * stopped touching, for as long as they stay on the page.
   */
  it("clears the mark on a cancelled pointer as well as on a release", () => {
    expect(provider).toMatch(/addEventListener\(\s*"pointerup"/);
    expect(provider).toMatch(/addEventListener\(\s*"pointercancel"/);
  });

  /**
   * **No per-frame JavaScript.** #279's user story is a rail of many tiles staying as
   * cheap as it is now, and a `pointermove` handler on the document is the one addition
   * that would quietly undo the scrolling work an earlier pass did. The listener's whole
   * job happens on the two ends of a gesture.
   */
  it("does no work while the finger is moving", () => {
    expect(provider).not.toContain("pointermove");
    expect(provider).not.toContain("requestAnimationFrame");
  });

  /**
   * The rule is the shared module's, not this file's — #279's *the two answers to what
   * did this pointer just produce live in one module*. A branch spelled out here would be
   * a second opinion about a gesture, decidable only in a browser.
   */
  it("takes the pop rule from the shared gesture module", () => {
    expect(provider).toContain("./gesture-rules");
    expect(provider).toContain("releasePops");
  });

  /**
   * **The mark is set regardless of the reduced-motion preference.** The event always
   * happens; only the animation is negotiable, and the stylesheet is where it is dropped
   * (see the block above). A `matchMedia` here would be a second answer to a question the
   * application answers in two places already — `MotionConfig` for Motion, and the
   * `@media` block for CSS.
   */
  it("does not ask about reduced motion before marking the press", () => {
    expect(provider).not.toContain("prefers-reduced-motion");
    expect(provider).not.toContain("matchMedia");
  });
});
