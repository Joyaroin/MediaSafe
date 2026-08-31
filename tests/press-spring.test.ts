import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { snappy } from "@/app/motion";

/**
 * The press's spring, asserted against the spring it claims to come from — issue #270.
 *
 * The press is CSS and stays CSS: it costs no client boundary and no per-frame JavaScript,
 * and `DESIGN.md`'s motion section holds why. What changed is that its timing function is
 * no longer an ease-out that arrives and stops. It is `app/motion.ts`'s `snappy`,
 * transcribed into a `linear()` easing curve, so a control animated in CSS and a control
 * animated by Motion are the same spring.
 *
 * Two spellings of one rule is two places for the numbers to disagree, and this
 * application has been bitten by exactly that twice (`app/motion.ts`'s own note on the
 * stagger cap; `tests/palette.test.ts`'s seven drifted colours). A curve pasted into a
 * stylesheet is the worst case of it: 33 numbers nobody can check by eye, next to a
 * comment claiming a provenance nothing verifies.
 *
 * So this file does what `tests/palette.test.ts` does. It reads `app/globals.css` as text
 * and recomputes the curve from the **source the stylesheet cites** — `snappy`, imported
 * here, not copied — using the closed form for a damped harmonic oscillator's step
 * response. If either side moves, this fails.
 *
 * ── The derivation ────────────────────────────────────────────────────────────────────
 *
 * SwiftUI describes a spring as a *response* and a *damping fraction*; Motion accepts the
 * same pair as `duration` and `bounce`, where `bounce ≈ 1 - dampingFraction`
 * (`app/motion.ts`). `snappy` is `.snappy`: response `0.30`, damping fraction `0.85`.
 *
 *   ωₙ = 2π / response          the undamped natural frequency
 *   ω_d = ωₙ √(1 − ζ²)          the damped frequency it actually oscillates at
 *   x(t) = 1 − e^(−ζωₙt) · (cos ω_d t + (ζωₙ/ω_d) · sin ω_d t)
 *
 * `x` is the unit step response — the fraction of the distance travelled at time `t`,
 * which is exactly what an easing function's output is. A `linear()` curve is that
 * function sampled at even intervals; the browser interpolates between the samples.
 *
 * The one number the physics does not give is where to stop, because a spring settles
 * asymptotically and a CSS transition has to end. The envelope of the oscillation is
 * `e^(−ζωₙt) / √(1 − ζ²)`, so the settle time is where that falls under one part in a
 * thousand — a tenth of a percent of a 3% press is a hundredth of a pixel.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");
const CSS = readFileSync(path.join(REPOSITORY_ROOT, "app/globals.css"), "utf8");

/**
 * The stylesheet with its comments blanked, for the same reason `tests/palette.test.ts`
 * does it: `globals.css` is mostly prose, and the prose beside this curve names the very
 * things the assertions look for.
 */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));

/** How far off target the spring may be before the transition is allowed to end. */
const SETTLED = 0.001;

/** Samples in the emitted curve. 33 stops over the settle: one every ~13ms. */
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

describe("the press is the spring app/motion.ts already names", () => {
  it("times the press with a linear() curve and not an ease", () => {
    const curve = declaredOnce("--spring-press");
    expect(curve.startsWith("linear("), `--spring-press is ${curve}`).toBe(true);
    expect(curve).not.toMatch(/cubic-bezier|ease-out|steps\(/);
  });

  it("carries snappy's own step response, sample for sample", () => {
    const stops = declaredOnce("--spring-press")
      .replace(/^linear\(|\)$/g, "")
      .split(",")
      .map((stop) => Number(stop.trim()));

    expect(stops).toHaveLength(STOPS);
    for (const stop of stops) expect(Number.isFinite(stop)).toBe(true);

    // Evenly spaced, which is what lets `linear()` omit the input positions.
    stops.forEach((stop, index) => {
      const expected =
        index === STOPS - 1 ? 1 : travelled((index / (STOPS - 1)) * (settleMs / 1000));
      expect(
        Math.abs(stop - expected),
        `stop ${index} is ${stop}, and snappy is at ${expected.toFixed(4)} there`,
      ).toBeLessThanOrEqual(5e-5);
    });

    // Starts where the press starts and ends exactly on target — a transition that ends
    // at 0.9998 leaves the control fractionally scaled for as long as the finger is off.
    expect(stops[0]).toBe(0);
    expect(stops[STOPS - 1]).toBe(1);
  });

  it("runs for as long as the spring takes to settle", () => {
    // A spring curve replayed over `--dur-fast` is not this spring; it is this spring's
    // shape at three times the speed, which is a different perceptual pair.
    expect(declaredOnce("--dur-press")).toBe(`${settleMs}ms`);
  });

  it("overshoots by the amount a 0.85-damped spring overshoots, and no more", () => {
    // The peak of a second-order step response is `1 + e^(−πζ/√(1−ζ²))`, which is a
    // closed form the sampled curve knows nothing about. A trace, and the platform's own
    // trace: `.snappy` is what a pointer touches, and winding it past that is where
    // motion stops reading as physics (`app/motion.ts`).
    const stops = declaredOnce("--spring-press")
      .replace(/^linear\(|\)$/g, "")
      .split(",")
      .map((stop) => Number(stop.trim()));
    const peak = Math.max(...stops);
    const theoretical = 1 + Math.exp((-Math.PI * damping) / Math.sqrt(1 - damping * damping));

    expect(peak).toBeGreaterThan(1);
    expect(Math.abs(peak - theoretical)).toBeLessThan(0.001);
  });

  it("is what the shared press utility is actually timed with", () => {
    // The curve existing as a token proves nothing. `pressable` is the utility every
    // tappable surface in the application wears, and the transform is the press.
    expect(pressableUtility()).toMatch(
      /transform\s+var\(--dur-press\)\s+var\(--spring-press\)/,
    );
    expect(pressableUtility()).toMatch(/&:active\s*\{[\s\S]*?transform:\s*scale\(0\.97\)/);
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
    // server component renders, and the spring must not have dragged it over the line.
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
    expect(motionCode).not.toMatch(/linear\(|cubic-bezier/);
  });
});

describe("reduced motion stops the movement, not the event", () => {
  const reducedBlocks = [...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g)]
    .map((match) => match[0])
    .filter((block) => /\.pressable[^[]/.test(block));

  it("still covers the press it now springs", () => {
    expect(reducedBlocks).toHaveLength(1);
    expect(reducedBlocks[0]).toMatch(/\.pressable\s*\{[\s\S]*?transition:\s*none/);
    expect(reducedBlocks[0]).toMatch(/\.pressable:active\s*\{[\s\S]*?transform:\s*none/);
  });

  it("leaves the control able to be pressed", () => {
    // The event still happens; it stops moving through space. Anything that took the
    // control out of the document or off the pointer would be the other thing.
    expect(reducedBlocks[0]).not.toMatch(/pointer-events|display\s*:|visibility/);
  });
});
