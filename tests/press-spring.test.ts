import { readFileSync, readdirSync } from "node:fs";
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
