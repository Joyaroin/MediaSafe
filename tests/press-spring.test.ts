import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOLD_MS } from "@/app/(signed-in)/library/use-hold-to-select";
import {
  ICON_BUTTON,
  ICON_BUTTON_OVER_ARTWORK,
  ICON_BUTTON_SQUARE,
  MENU_ITEM,
  PRIMARY_BUTTON_LARGE,
  withoutPress,
} from "@/app/buttons";
import { snappy } from "@/app/motion";

/**
 * The press, asserted against the spring it claims to come from — issues #270, #281, #282.
 *
 * The press is CSS and stays CSS: it costs no client boundary and no per-frame JavaScript,
 * and the motion register holds why. What it is made of changed in #281, and #282
 * gave it a register — two sizes, chosen by one property the call site sets.
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
 * the two numbers the register names: the rise runs compression-to-pop scaled by the curve's
 * own peak, the settle runs pop-to-rest scaled by the curve's own excess above rest. Both
 * pieces meet at the peak, where the step response's slope is zero, so the join is not a
 * corner. What is derived is every stop's *value in time*; what is chosen is how far it
 * travels — and since #282 the choosing is `--press-register`, one property at the call
 * site, resolved below the way a browser resolves it rather than read as a literal.
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

const REST = 1;

/**
 * **The register — issue #282, and the second half of what #279 names.** One rule was wrong
 * for two kinds of thing: the same 4% was a considered movement on a 262px rail card and
 * nothing at all on a 44px checkmark, and both wore the identical utility. The press has two
 * sizes now, and a call site says which of them it is in.
 *
 * The register is **one** property, so there is no way to set half of one and no way to pair
 * a surface compression with a control pop — the compression and the pop are both derived
 * from it, in the stylesheet, in one place. And it is a *property the call site sets* rather
 * than a second utility, which is `--poster-radius`'s pattern and `--poster-radius`'s reason:
 * two utilities setting one property in one cascade layer make *which rule wins* a question
 * about the order Tailwind emits them in rather than about the call site.
 *
 * **The default is the quieter register.** `pressable` *reads* `--press-register` through a
 * fallback and never declares it, so a call site nobody classified is under-stated rather
 * than shouting — and a call site that does classify itself has no cascade argument to win.
 */
const REGISTER_PROPERTY = "--press-register";

/**
 * **The third register — issue #283.** The recording checkmark presses harder than any
 * other control in the application: `0.900` in, `1.045` past rest. It is the act the
 * product is built around and the most repeated gesture in it, and the accent is already
 * rationed to exactly that act — so the loudest press and the only sanctioned
 * use of colour now mark the same thing rather than two different things.
 *
 * It is a **third value of the one property**, declared the same way at the call site, so
 * everything the register already guarantees holds unchanged: one keyframe, one spring,
 * no way to set half a register, and no cascade-ordering question.
 *
 * **Three amplitudes are not on one line**, and that is a fact about the numbers rather
 * than a choice. `(0.96, 1.012)`, `(0.92, 1.030)` and `(0.900, 1.045)` are not collinear —
 * the control step gives up `0.040` of compression for `0.018` of pop and the recording
 * step gives up `0.020` for `0.015` — so a single linear term in `--press-register` cannot
 * reach all three. The stylesheet adds a second, clamped step instead, and the assertions
 * below resolve it the way a browser would rather than reading the literals back.
 */
const REGISTERS = {
  surface: { register: null, compress: 0.96, pop: 1.012 },
  control: { register: 1, compress: 0.92, pop: 1.03 },
  recording: { register: 2, compress: 0.9, pop: 1.045 },
} as const;

const COMPRESS = REGISTERS.surface.compress;
const POP = REGISTERS.surface.pop;

/** The pop keyframe's stop `index` in a register, recomputed from `snappy` — the header's
 *  derivation. The *shape* is the spring's and is one curve; the two amplitudes it travels
 *  between are the register's. */
function popStop(index: number, compress: number = COMPRESS, pop: number = POP): number {
  // A spring settles asymptotically and an animation has to end. The last stop is rest
  // exactly: a keyframe that finished at 1.0022 would leave the control fractionally
  // scaled for as long as the mark stays on it.
  if (index === STOPS - 1) return REST;

  const t = (index / (STOPS - 1)) * (settleMs / 1000);
  const x = travelled(t);

  return t <= peakTime
    ? compress + (x / (1 + peakExcess)) * (pop - compress)
    : REST + ((x - 1) / peakExcess) * (pop - REST);
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

/** Every custom property `@utility pressable` declares, as the expression it declares it
 *  with. `--press-register` is deliberately not among them — see `REGISTERS` above. */
function pressableCustomProperties(): Record<string, string> {
  const declared: Record<string, string> = {};

  for (const [, name, value] of pressableUtility().matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
    expect(declared[name], `${name} is declared twice on \`pressable\``).toBeUndefined();
    declared[name] = value.trim();
  }

  return declared;
}

/** The stylesheet's own variables, with a register selected the way a call site selects one:
 *  by setting a single property, or by setting nothing at all. */
function variablesFor(register: number | null): Record<string, string> {
  const variables = pressableCustomProperties();
  if (register !== null) variables[REGISTER_PROPERTY] = String(register);
  return variables;
}

/**
 * The subset of `calc()` this stylesheet uses — numbers, the four operators and parentheses.
 * A recursive descent rather than a regular expression, because the point of resolving at
 * all is that the assertions see the number a browser would compute rather than the number
 * a human wrote down beside it.
 */
function arithmetic(source: string): number {
  let at = 0;
  const skip = (): void => {
    while (/\s/.test(source[at] ?? "")) at += 1;
  };

  /* `min()`, `max()` and `clamp()` are new in #283 and they are why the third register is
     expressible at all: three amplitudes are not on one line, so the stylesheet selects
     between them with a clamped step rather than with a single multiplication. A browser
     evaluates these wherever it evaluates `calc()`, so this parser has to as well — a
     suite that could not read them would be asserting against a value the browser never
     computes, which is the whole failure this file exists to catch. */
  function call(name: string): number {
    const args: number[] = [];
    for (;;) {
      args.push(sum());
      skip();
      if (source[at] !== ",") break;
      at += 1;
    }
    expect(source[at], `unbalanced parentheses in ${source}`).toBe(")");
    at += 1;

    if (name === "min") return Math.min(...args);
    if (name === "max") return Math.max(...args);
    expect(args, `clamp() takes three arguments in ${source}`).toHaveLength(3);
    return Math.min(Math.max(args[0], args[1]), args[2]);
  }

  function primary(): number {
    skip();
    const named = /^(min|max|clamp)\(/.exec(source.slice(at));
    if (named) {
      at += named[0].length;
      return call(named[1]);
    }

    if (source[at] === "(") {
      at += 1;
      const value = sum();
      skip();
      expect(source[at], `unbalanced parentheses in ${source}`).toBe(")");
      at += 1;
      return value;
    }

    const number = /^[+-]?\d*\.?\d+/.exec(source.slice(at));
    expect(number, `${source} is not arithmetic at character ${at}`).not.toBeNull();
    at += number![0].length;
    return Number(number![0]);
  }

  function product(): number {
    let value = primary();
    for (;;) {
      skip();
      const operator = source[at];
      if (operator !== "*" && operator !== "/") return value;
      at += 1;
      const right = primary();
      value = operator === "*" ? value * right : value / right;
    }
  }

  function sum(): number {
    let value = product();
    for (;;) {
      skip();
      const operator = source[at];
      if (operator !== "+" && operator !== "-") return value;
      at += 1;
      const right = product();
      value = operator === "+" ? value + right : value - right;
    }
  }

  const value = sum();
  skip();
  expect(at, `${source} has input left over`).toBe(source.length);
  return value;
}

/**
 * `var()` substitution followed by that arithmetic — what the browser does to one of these
 * declarations on one element. A suite that read the stops as literal numbers could not see
 * whether one property reaches *both* halves of the press, and that is the whole property
 * #282 adds.
 */
function cssValue(expression: string, variables: Record<string, string>): number {
  let text = expression;

  for (let pass = 0; text.includes("var(") && pass < 10; pass += 1) {
    text = text.replace(/var\(\s*(--[a-z-]+)\s*(?:,\s*([^(),]*))?\)/g, (_, name, fallback) => {
      const value = variables[name] ?? fallback;
      expect(value, `${name} is read and never declared`).toBeDefined();
      return `(${value})`;
    });
  }

  expect(text, `${expression} still reaches a variable`).not.toContain("var(");
  return arithmetic(text.replaceAll("calc(", "("));
}

/** The pop's stops, in the order the keyframe declares them, resolved in a register. */
function popStops(register: number | null = null): { at: number; scale: number }[] {
  const variables = variablesFor(register);

  return [
    ...keyframesBlock("press-pop").matchAll(/([\d.]+)%\s*\{\s*transform:\s*scale\((.+)\);/g),
  ].map((stop) => ({ at: Number(stop[1]), scale: cssValue(stop[2], variables) }));
}

/** How far the pop carries the control past rest in a register. */
function popPeak(register: number | null = null): number {
  return Math.max(...popStops(register).map((stop) => stop.scale));
}

/** The scale the compression drives to in a register — read out of the pressed rule rather
 *  than assumed, so the register has to actually reach it. */
function compression(register: number | null = null): number {
  const pressed = pressableUtility().match(/&:active[\s\S]*?\{([\s\S]*?)\}/);
  expect(pressed, "`pressable` must still scale under a press").not.toBeNull();

  const scale = pressed![1].match(/transform:\s*scale\((.+)\);/);
  expect(scale, "the pressed rule must still be a scale").not.toBeNull();

  return cssValue(scale![1], variablesFor(register));
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
    // **Updated from a literal `scale(0.96)`.** #282 made the compression the register's,
    // so the number is derived from `--press-register` rather than written down — and the
    // assertion resolves the declaration the way a browser would rather than reading it.
    expect(compression(REGISTERS.surface.register)).toBeCloseTo(COMPRESS, 6);
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
    // In **both** registers, because #282 gave the pop two amplitudes and a register that
    // popped to rest would be the shipped failure again, arriving on half the tree.
    for (const { register, pop } of Object.values(REGISTERS)) {
      const peak = popPeak(register);

      expect(peak).toBeGreaterThan(REST);
      // #270 shipped 1.00019 — 0.05px on a rail card. A percent is the floor of visible.
      expect(peak).toBeGreaterThanOrEqual(1.01);
      expect(Math.abs(peak - pop)).toBeLessThan(5e-4);
    }
  });

  /** A keyframe and not a transition, run off the mark the one delegated listener sets on
   *  a release that qualified (`app/motion-provider.tsx`, issue #280). */
  it("runs a keyframe on the release mark, over roughly a quarter second", () => {
    expect(declaredOnce("--dur-pop")).toBe("260ms");
    expect(popRule()).toMatch(/animation:\s*press-pop\s+var\(--dur-pop\)/);
    // The stops are the spring; a second easing over them would be a second opinion.
    expect(popRule()).toMatch(/animation:[^;]*\blinear\b/);
  });

  it("carries snappy's own step response, sample for sample, in either register", () => {
    // One shape, two amplitudes: #282 normalised the stops onto the register's own two
    // numbers, so the spring has to survive the register rather than only the default.
    for (const [name, { register, compress, pop }] of Object.entries(REGISTERS)) {
      const stops = popStops(register);

      expect(stops).toHaveLength(STOPS);
      stops.forEach((stop, index) => {
        // Evenly spaced in time — what makes the samples a curve rather than a list.
        expect(stop.at).toBeCloseTo((index * 100) / (STOPS - 1), 5);
        const expected = popStop(index, compress, pop);
        expect(
          Math.abs(stop.scale - expected),
          `${name} stop ${index} is ${stop.scale}, and snappy puts it at ${expected.toFixed(4)}`,
        ).toBeLessThanOrEqual(5e-5);
      });

      // Starts where the compression left the control and ends exactly at rest.
      expect(stops[0].scale).toBeCloseTo(compress, 6);
      expect(stops[STOPS - 1].scale).toBe(REST);
    }
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

/**
 * ── The register — issue #282 ────────────────────────────────────────────────────────
 *
 * The press has two sizes and the call site names which. Everything here is asserted on
 * the values a browser would resolve, in a register and out of it, because the failure
 * this ticket guards against is the shipped one restated: a register declared in a
 * stylesheet, spelled correctly, that half of the press never reads.
 */
describe("the press has three registers and one property chooses between them", () => {
  it("presses at the quieter surface register when nothing is set", () => {
    expect(compression(null)).toBeCloseTo(REGISTERS.surface.compress, 6);
    expect(popPeak(null)).toBeCloseTo(REGISTERS.surface.pop, 3);
  });

  it("presses a control harder and pops it further when the register is declared", () => {
    const { register, compress, pop } = REGISTERS.control;

    expect(compression(register)).toBeCloseTo(compress, 6);
    expect(popPeak(register)).toBeCloseTo(pop, 3);
  });

  /** **Issue #283.** The third value of the same property, resolved the same way. */
  it("presses hardest of all at the recording register", () => {
    const { register, compress, pop } = REGISTERS.recording;

    expect(compression(register)).toBeCloseTo(compress, 6);
    expect(popPeak(register)).toBeCloseTo(pop, 3);
  });

  /**
   * **There is a loudest, and it is the recording one — #283.** Asserted as an ordering
   * over the whole table rather than against a copy of `0.900`: a fourth register added
   * above this one, or a control register quietly wound past it, is the failure that
   * would make *the loudest press in the application* stop being true while every
   * individual number still looked right.
   */
  it("makes the recording register the loudest there is", () => {
    const compressions = Object.values(REGISTERS).map((r) => compression(r.register));
    const peaks = Object.values(REGISTERS).map((r) => popPeak(r.register));

    expect(compression(REGISTERS.recording.register)).toBe(Math.min(...compressions));
    expect(popPeak(REGISTERS.recording.register)).toBe(Math.max(...peaks));

    // And strictly, not merely not-quieter: a register indistinguishable from the control
    // one is a table entry rather than a press.
    expect(compression(REGISTERS.recording.register)).toBeLessThan(
      compression(REGISTERS.control.register),
    );
    expect(popPeak(REGISTERS.recording.register)).toBeGreaterThan(
      popPeak(REGISTERS.control.register),
    );
  });

  /** The two are different presses and not the same press twice — a 44px checkmark travels
   *  further than a 262px card does, which is the whole of #279's fourth user story. */
  it("makes the two registers differ, in both halves of the press", () => {
    const control = REGISTERS.control.register;

    expect(compression(control)).toBeLessThan(compression(null));
    expect(popPeak(control)).toBeGreaterThan(popPeak(null));

    /* #279's fourth user story, in pixels. An edge travels half the scale delta, so on
       the 44px checkmark the quiet register moves it 0.88px — under a single device pixel,
       the same *technically correct and invisible* this whole spec is about — and the
       control register moves it 1.76px. The 262px rail card gets 5.24px from the quiet
       one, which is why the quiet one is right for a card and wrong for a checkmark. */
    const CHECKMARK = 44;

    expect((CHECKMARK * (REST - compression(null))) / 2).toBeLessThan(1);
    expect((CHECKMARK * (REST - compression(control))) / 2).toBeGreaterThan(1);
  });

  /**
   * **One property, not a pair.** Both halves are derived from it inside the stylesheet, so
   * there is no way to set half a register and no way to pair a surface compression with a
   * control pop — the failure a `--press-compress`/`--press-pop` pair at the call site
   * would make available on the first day.
   */
  it("gives the call site exactly one property, and derives both halves from it", () => {
    const declared = pressableCustomProperties();
    const read = [...pressableUtility().matchAll(/var\(\s*(--press-[a-z-]+)/g)].map(
      (match) => match[1],
    );
    const settable = [...new Set(read)].filter((name) => !(name in declared));

    expect(settable).toEqual([REGISTER_PROPERTY]);

    // And `pressable` never *declares* it, so the call site's own declaration has no
    // equal-specificity rule to beat. `--poster-radius`'s reason, restated.
    expect(declared[REGISTER_PROPERTY]).toBeUndefined();
    expect(pressableUtility()).toContain(`var(${REGISTER_PROPERTY}, `);
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
  const EPISODE_ROW = "app/(signed-in)/up-next/up-next-episode-row.tsx";
  const WATCH_MARK = "app/(signed-in)/library/watch-mark-motion.tsx";

  /** The episode row's own 44px hit box, read as its exported class string. */
  function recordingHitBox(): string {
    const hitBox = readFileSync(path.join(REPOSITORY_ROOT, WATCH_MARK), "utf8").match(
      /export const RECORDING_HIT_BOX =\s*"([^"]*)"/,
    );
    expect(hitBox, "watch-mark-motion.tsx must still export RECORDING_HIT_BOX").not.toBeNull();
    return hitBox![1];
  }

  /** The Up next row's check hit box — built from the recording hit box rather than
   *  restated, so it is that string plus the in-flight treatment. */
  function checkHitBox(): string {
    const source = readFileSync(path.join(REPOSITORY_ROOT, EPISODE_ROW), "utf8");
    expect(source, "up-next-episode-row.tsx must build CHECK_HIT_BOX on RECORDING_HIT_BOX").toMatch(
      /const CHECK_HIT_BOX = `\$\{RECORDING_HIT_BOX\}/,
    );
    return recordingHitBox();
  }

  it("puts the press on the recording control", () => {
    // Recording a watch is the most repeated act in the app and had no physical answer at
    // all: the checkmark's hit box carried a hover invert and nothing under the thumb.
    expect(recordingHitBox().split(/\s+/)).toContain("pressable");
  });

  it("puts it on the up-next row's checkmark too", () => {
    // The same act on the other surface it happens on.
    expect(checkHitBox()).toMatch(/(^|\s)pressable(\s|$)/);
  });

  /**
   * **Issue #283, read the way this suite already reads these two.** Both hit boxes, as
   * class strings, declaring the loud register — and the numbers those strings resolve to
   * are the ones asserted above, so *the recording control is in the loud register* is one
   * claim end to end rather than a spelling here and a table over there.
   */
  it("presses both recording hit boxes in the loud register", () => {
    const loud = REGISTER_CLASS.recording as string;

    for (const classes of [recordingHitBox(), checkHitBox()]) {
      expect(classes.split(/\s+/)).toContain(loud);
    }

    expect(compression(REGISTERS.recording.register)).toBeCloseTo(0.9, 6);
    expect(popPeak(REGISTERS.recording.register)).toBeCloseTo(1.045, 3);
  });

  /**
   * **It is scale and the pop and nothing else.** The tone step (#284) is qualified by
   * `.bg-raised`, so a bare 44px hit box gets no ground painted under it and no backplate
   * the design never drew — and neither hit box may reach for the accent under a thumb,
   * because colour in this world means *this was recorded* and a control that tints while
   * being pressed is claiming to have written something it has not. The accent stays on
   * the glyph, which is what marks the recorded state. `tests/palette.test.ts` proves no
   * press rule anywhere raises a shadow; this is the call sites' half of it.
   */
  it("tints nothing and raises no shadow at either recording hit box", () => {
    for (const classes of [recordingHitBox(), checkHitBox()]) {
      const tokens = classes.split(/\s+/);

      // No surface of its own, so the tone step cannot reach it.
      expect(tokens).not.toContain("bg-raised");

      for (const token of tokens) {
        expect(token, `${token} paints under a press`).not.toMatch(
          /^(?:[\w-]+:)*(?:active|group-active):/,
        );
        expect(token, `${token} is a shadow`).not.toMatch(/shadow/);
      }

      // The accent may appear on the glyph and never on the pressed state of the box.
      expect(classes).not.toMatch(/active:[\w[\]-]*accent/);
    }
  });

  /**
   * **The checkmark moves and the row around it does not.** On the Up next row the check
   * is a *sibling* of the row's own `pressable` link inside an `<li>` that wears no press
   * at all, so `motion-provider.tsx`'s `closest(".pressable")` from the checkmark finds
   * the checkmark rather than scaling the whole row every time the 44px check is pressed.
   */
  it("moves the checkmark and not the up-next row around it", () => {
    const source = codeOf(EPISODE_ROW);

    // The row element is not itself pressable. Its classes are `ROW`, shared with the
    // film rows (`up-next-card-styles.ts`), and the hold adds a wash and nothing else.
    const row = codeOf("app/(signed-in)/up-next/up-next-card-styles.ts").match(
      /export const ROW =\s*"([^"]*)"/,
    );
    expect(row, "the row must still declare its ROW classes").not.toBeNull();
    expect(row![1]).not.toMatch(/(^|\s)pressable(\s|$)/);
    expect(source).toContain("className={`${held ? `${ROW} watch-hold` : ROW} ${SWIPEABLE}`}");
    // `SWIPEABLE` is swipe to mark's (#408) and adds no press either.
    expect(source).toMatch(/export const SWIPEABLE = "(?![^"]*\bpressable\b)[^"]*"/);

    // And the control slot is rendered after the pressable link closes, so the check is a
    // sibling of it rather than a descendant.
    const linkCloses = source.indexOf("</Link>");
    expect(linkCloses).toBeGreaterThan(-1);
    expect(source.indexOf("{control}", linkCloses)).toBeGreaterThan(linkCloses);
    expect(source.indexOf("{control}")).toBeGreaterThan(source.indexOf("</RowLink>"));

    // The listener takes the nearest pressable ancestor, which is what makes that
    // structural fact the whole of the property.
    expect(codeOf(ROOT_CLIENT_COMPONENT)).toContain("closest");
  });

  /**
   * **Reduced motion drops the movement and keeps the write.** The register is two numbers
   * the compression and the pop are made of, so the one `@media` block that already drops
   * both drops them at every register — it must not be qualified by one. And nothing about
   * the preference reaches the hit boxes themselves: they still carry their handlers, so
   * the press still registers and still records.
   */
  it("drops the loud movement under reduced motion and still records", () => {
    const reduced = [
      ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g),
    ]
      .map((match) => match[0])
      .filter((block) => /\.pressable[^[]/.test(block));

    expect(reduced).toHaveLength(1);
    expect(reduced[0]).not.toContain(REGISTER_PROPERTY);

    // The write is untouched: the card's check still calls the mark, and the episode row's
    // hit box is still class strings a server component renders.
    expect(codeOf(EPISODE_ROW)).toContain("onClick={mark.mark}");
    expect(codeOf(WATCH_MARK)).not.toMatch(/^\s*"use client"/m);
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
 *  things these assertions look for — `motion-provider.tsx` discusses `pointermove`
 *  and must not read as one. */
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

/**
 * ── Classifying what exists — issue #282 ─────────────────────────────────────────────
 *
 * A register nobody applied is a table in a stylesheet. This is the other half: every
 * element in the application that wears `pressable` is either **deliberately** left on the
 * default surface register or **declares** the control one, and the manifest below is where
 * that deliberateness is written down. A new call site fails here until somebody decides
 * which of the two it is, which is the only form *none is left ambiguous* can take when the
 * quieter register is spelled by saying nothing.
 *
 * The whole-tree sweep rather than a fixed list of files, for `tests/underline-audit.test.ts`'s
 * reason: a rule about *every* call site that only looks at the ones it was told about is
 * how the rule stops being true. #279 counted twenty-five call sites and the tree has
 * thirteen class strings; the sweep is what settles that rather than either number.
 */
type Register = "surface" | "control" | "recording";

const PRESS_CALL_SITES: Readonly<Record<string, readonly Register[]>> = {
  // Surfaces — cards, cells, rows and tiles. They keep the default and say nothing, and a
  // large tile staying quiet is what keeps a grid of them from reading as a trampoline.
  "app/(signed-in)/library/library-entry-cell.tsx": ["surface"],
  /* A custom list's icon view (`list-icon-grid.tsx`). A poster with a name under it is the
     same surface the library grid and the Up next groups draw, at the same register. */
  "app/(signed-in)/lists/[listId]/list-icon-grid.tsx": ["surface"],
  /* A list's card on Lists — the whole card is the link since Charcoal (#402), a surface. */
  "app/(signed-in)/lists/list-row.tsx": ["surface"],
  "app/(signed-in)/up-next/film-row.tsx": ["surface"],
  /* The Up next row, which replaced the rail's tile. **Two surface sites in one file**,
     which is new and is not a second register: an episode row and a pending row are the
     same surface at two states of the same title, and they are two elements because one
     of them has a mark slot and the other has nothing to put in it. The check inside the
     episode row is `RECORDING_HIT_BOX`'s, declared in `watch-mark-motion.tsx` below and
     not spelled here. */
  "app/(signed-in)/up-next/up-next-episode-row.tsx": ["surface", "surface"],
  "app/(signed-in)/up-next/upcoming-films.tsx": ["surface"],
  "app/(signed-in)/up-next/upcoming-row.tsx": ["surface"],
  "app/(signed-in)/you/you-title-tile.tsx": ["surface"],

  // Issue #433 — every surface a reader can open answers the finger the same way.
  /* The search screen's "Because you watched" rail — a card that opens catalogue detail. */
  "app/(signed-in)/search/recommendation-rail.tsx": ["surface"],
  /* The empty-state suggestion rail's card. Its own *Add* pill (below, in the bare-control
     section) already presses on its own register; this is the second, quieter press on the
     poster/name link, so the Link comes first in source order and the button second. */
  "app/(signed-in)/up-next/suggestion-card.tsx": ["surface", "control"],
  /* A list's title rows — list detail, both the owned (`PosterLink`) and unowned (`Link`)
     branches share one `rowClass`, so this is one call site. */
  "app/(signed-in)/lists/[listId]/list-title-row.tsx": ["surface"],
  /* The watch menu's option rows — Rewatch, Undo, Unwatch — hand-rolled rather than
     `MENU_ITEM`, because this menu's rows carry a description line `MENU_ITEM` has no slot
     for. */
  "app/(signed-in)/library/watch-menu.tsx": ["surface"],
  /* Settings' one still-inert row — *Import a library*, a plain navigating link. Every
     control beside it is already a button built on `app/buttons.ts`'s `BASE` (issue #431). */
  "app/(signed-in)/settings/page.tsx": ["surface"],
  /* The sidebar's navigation items — the desktop counterpart of the phone tab bar, and the
     one asymmetry the ticket names: it takes the tab bar's own control register rather
     than the surface default. */
  "app/sidebar-nav.tsx": ["control"],

  // Bare controls — a 44px hit box with no surface of its own. Scale and the pop and
  // nothing else, at the register that makes 44px move as much as 262px does.
  "app/(signed-in)/library/watch-mark-motion.tsx": ["recording"],
  "app/(signed-in)/search/catalogue-result.tsx": ["control"],
  // The search field's ✕ — clears the query and keeps the focus in the field.
  "app/(signed-in)/search/search-surface.tsx": ["control"],
  // *Undo* while an Up next card holds after a mark — a bare pill inside the card.
  "app/(signed-in)/up-next/up-next-card.tsx": ["control"],
  // The empty-state suggestions' *Add* (#365) — the search result's pill, under a poster.
  // Issue #433 adds the card's own quieter press above, as this file's first call site; the
  // pill stays this register, as this file's second.

  // The phone tab bar — issue #295. Four 44px hit boxes rendered from one `<Link>`, so
  // one class string is four call sites, and they are controls rather than surfaces.
  "app/tab-bar.tsx": ["control"],

  // The shared button base — issue #431. `BASE` is the one site every button variant
  // composes, and it declares no register of its own (the default, left quiet, is what
  // lets `PRIMARY_BUTTON`, `SECONDARY_BUTTON`, the pills and every other plain button stay
  // on the surface register). `MENU_ITEM` does not build on `BASE` — it is its own call
  // site, a surface in the same sense a card or a row is — so it is the second string this
  // file finds, in the order both appear in `app/buttons.ts`.
  "app/buttons.ts": ["surface", "surface"],
};

/** How a call site spells a register, as Tailwind spells an arbitrary property —
 *  `upcoming-row.tsx`'s own `[--poster-radius:10px]` is the same form. The surface one
 *  has no spelling at all, which is what *the default is spelled by saying nothing* means. */
const REGISTER_CLASS: Readonly<Record<Register, string | null>> = {
  surface: null,
  control: `[${REGISTER_PROPERTY}:${REGISTERS.control.register}]`,
  recording: `[${REGISTER_PROPERTY}:${REGISTERS.recording.register}]`,
};

/** Every class string in the application that puts `pressable` on an element. A `.pressable`
 *  *selector* is not one — `motion-provider.tsx` holds the only one of those — so the word
 *  has to appear as a class token and not merely as a substring. */
function pressClassStrings(file: string): string[] {
  const strings = [...codeOf(file).matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map(
    (match) => match[1] ?? match[2],
  );

  return strings.filter((value) => /(^|\s)pressable(\s|$)/.test(value));
}

describe("every pressable call site declares a register or is deliberately left quiet", () => {
  const found = appSourceFiles()
    .map((file) => ({ file, strings: pressClassStrings(file) }))
    .filter((site) => site.strings.length > 0);

  it("classifies every call site in the tree and no others", () => {
    expect(found.map((site) => site.file).sort()).toEqual(Object.keys(PRESS_CALL_SITES).sort());

    for (const { file, strings } of found) {
      expect(strings, `${file} has call sites this suite has not classified`).toHaveLength(
        PRESS_CALL_SITES[file].length,
      );
    }
  });

  it("puts each declared register on its own call sites and on nothing else", () => {
    for (const { file, strings } of found) {
      strings.forEach((classes, index) => {
        const wanted = REGISTER_CLASS[PRESS_CALL_SITES[file][index]];
        const tokens = classes.split(/\s+/).filter((token) => token.includes(REGISTER_PROPERTY));

        if (wanted === null) {
          // Not merely *not the loud register* — nothing at all, because the default is
          // the quietest one and spelling it out would be a second place for it to live.
          expect(tokens, `${file} call site ${index} must stay on the default`).toEqual([]);
        } else {
          expect(tokens, `${file} call site ${index} must declare ${wanted}`).toEqual([wanted]);
        }
      });
    }
  });

  /**
   * **The loudest press has exactly two call sites — issue #283.** *No other call site
   * declares this register* is the acceptance criterion, and it is a claim about the whole
   * tree rather than about the two files that were edited, so it is swept for. A third
   * control reaching for the recording register is how *the loudest press marks the act
   * the product is built around* stops being true without any number changing.
   */
  it("declares the recording register at the recording hit box and nowhere else", () => {
    const declaring = found
      .filter((site) =>
        site.strings.some((classes) =>
          classes.split(/\s+/).includes(REGISTER_CLASS.recording as string),
        ),
      )
      .map((site) => site.file)
      .sort();

    expect(declaring).toEqual(["app/(signed-in)/library/watch-mark-motion.tsx"]);

    // And no register above it anywhere — a `[--press-register:3]` would resolve to the
    // recording numbers under the stylesheet's clamp and read as a fourth register that
    // does not exist.
    const spelled = new Set(
      found.flatMap((site) =>
        site.strings.flatMap((classes) =>
          classes.split(/\s+/).filter((token) => token.includes(REGISTER_PROPERTY)),
        ),
      ),
    );
    expect([...spelled].sort()).toEqual(
      [REGISTER_CLASS.control, REGISTER_CLASS.recording].sort(),
    );
  });

  /**
   * **The register costs no client boundary.** It is a class token on a string, so it
   * cannot make a server component a client one — and this pins that rather than trusting
   * it. The four files below were already `"use client"` for their own reasons (a pointer
   * gesture, an optimistic mark, an in-flight write, and — since #295 put the press on the
   * tab bar — `usePathname`) and every other call site renders on the server, which is the
   * argument for the press being CSS at all.
   */
  it("leaves every call site on the boundary it was already on", () => {
    const client = found
      .filter((site) => /^\s*"use client"/m.test(readFileSync(
        path.join(REPOSITORY_ROOT, site.file), "utf8",
      )))
      .map((site) => site.file)
      .sort();

    expect(client).toEqual([
      "app/(signed-in)/library/watch-menu.tsx",
      "app/(signed-in)/search/catalogue-result.tsx",
      "app/(signed-in)/search/search-surface.tsx",
      "app/(signed-in)/up-next/film-row.tsx",
      "app/(signed-in)/up-next/suggestion-card.tsx",
      "app/(signed-in)/up-next/up-next-card.tsx",
      "app/(signed-in)/up-next/up-next-episode-row.tsx",
      "app/sidebar-nav.tsx",
      "app/tab-bar.tsx",
    ]);
  });
});

/**
 * ── The hold, re-derived onto the press's scale — issue #285 ─────────────────────────
 *
 * A library cell can be tapped and the same cell can be held for `HOLD_MS` to select it,
 * and until this ticket the two moved on **two unrelated scales**: the hold compressed to
 * `0.95` and landed on `1.035`, chosen beside the press rather than from it, while the
 * press ran the register's own `0.96`/`1.012`. One cell, one finger, two hands.
 *
 * So the hold's two numbers are now the press's two numbers — `var(--press-compress)` and
 * `var(--press-pop)`, read off the same element the press reads them off, which for a
 * library cell is the quiet surface register it never declares. Nothing else about the
 * hold moves: it is still a **timer made visible**, still `HOLD_MS` of linear ramp rather
 * than the press's 100ms ease-out, and `select-land` still turns over at 55% over
 * `--dur-base`. What changed is where the amplitudes come from, and this suite is what
 * stops them from being picked beside the press a second time.
 *
 * The assertions resolve the declarations the way a browser would, through the same
 * `cssValue` the register uses, because *the hold reads `--press-compress`* is the whole
 * property and a suite that read `0.96` as a literal could not tell the two apart.
 */

/** The stylesheet's own note over the hold's rules — where the derivation is cited. */
function holdNote(): string {
  const match = CSS.match(/\/\* ── Hold to select[\s\S]*?\*\//);
  expect(match, "globals.css must still open its hold section with a note").not.toBeNull();
  return match![0];
}

/** The rule that compresses a cell while the hold's timer runs. */
function holdRule(): string {
  const match = CSS_CODE.match(/\.pressable\[data-holding="true"\]\s*\{[\s\S]*?\n\}/);
  expect(match, "globals.css must still compress a cell being held").not.toBeNull();
  return match![0];
}

/** The rule that plays the arrival once the hold lands. */
function landRule(): string {
  const match = CSS_CODE.match(/\.pressable\[data-landed="true"\]\s*\{[\s\S]*?\n\}/);
  expect(match, "globals.css must still animate the hold's arrival").not.toBeNull();
  return match![0];
}

/** The scale a held cell is driven to, resolved in a register the way a browser would. */
function holdScale(register: number | null = null): number {
  const scale = holdRule().match(/transform:\s*scale\((.+)\);/);
  expect(scale, "the hold must still be a scale").not.toBeNull();
  return cssValue(scale![1], variablesFor(register));
}

/** `select-land`'s stops, in the order the keyframe declares them, resolved in a register. */
function selectLandStops(register: number | null = null): { at: number; scale: number }[] {
  const variables = variablesFor(register);

  return [
    ...keyframesBlock("select-land").matchAll(/([\d.]+)%\s*\{\s*transform:\s*scale\((.+)\);/g),
  ].map((stop) => ({ at: Number(stop[1]), scale: cssValue(stop[2], variables) }));
}

/**
 * How many blocks deep a selector sits in the stylesheet. `0` is the top level and is
 * therefore **unlayered**, which is the whole of why the hold's rules beat `pressable`'s:
 * `@utility` puts those in the `utilities` cascade layer, and an unlayered rule wins
 * against a layered one however specific the layered one is.
 */
function blockDepthOf(selector: string): number {
  const at = CSS_CODE.indexOf(selector);
  expect(at, `globals.css must declare ${selector}`).toBeGreaterThan(-1);

  let depth = 0;
  for (const character of CSS_CODE.slice(0, at)) {
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
  }
  return depth;
}

describe("the hold and the press are one hand on a library cell", () => {
  it("compresses a held cell to the press's own compression, derived and not copied", () => {
    // The value a browser resolves, in the register a library cell is in — the quiet one,
    // because a cell declares nothing. `0.95` was the number this replaced.
    expect(holdScale(null)).toBeCloseTo(REGISTERS.surface.compress, 6);

    // And derived rather than transcribed: a literal that happened to equal the register
    // today is exactly the drift the ticket exists to close.
    expect(holdRule()).toContain("var(--press-compress)");
  });

  it("lands the hold on the press's own pop, derived and not copied", () => {
    const stops = selectLandStops(null);

    expect(stops).toHaveLength(3);
    expect(stops[0].scale).toBeCloseTo(REGISTERS.surface.compress, 6);
    expect(Math.max(...stops.map((stop) => stop.scale))).toBeCloseTo(REGISTERS.surface.pop, 6);
    expect(stops[stops.length - 1].scale).toBe(REST);

    expect(keyframesBlock("select-land")).toContain("var(--press-compress)");
    expect(keyframesBlock("select-land")).toContain("var(--press-pop)");
  });

  /** #279's seventeenth user story, as one number: the cell a finger taps and the cell the
   *  same finger holds travel between the same two sizes. */
  it("gives the tap and the hold one scale on the same cell", () => {
    expect(holdScale(null)).toBeCloseTo(compression(null), 6);
    expect(Math.max(...selectLandStops(null).map((stop) => stop.scale))).toBeCloseTo(
      popPeak(null),
      3,
    );
  });

  /**
   * **The hold stays its own rules.** #279's eighteenth user story: a `500ms` hold is a
   * timer made visible, not a press, and the long linear ramp is what makes the wait
   * legible as a wait. An ease-out over the press's 100ms would spend the first half of
   * the gesture looking finished.
   */
  it("still reads as a timer rather than as a press", () => {
    // `HOLD_MS` is imported rather than written down: the compression has to finish at the
    // exact moment the hold lands, and a second copy of 500 is how that stops being true.
    expect(holdRule()).toMatch(new RegExp(`transition:\\s*transform\\s+${HOLD_MS}ms\\s+linear`));
    expect(holdRule()).not.toContain("--dur-press");
    expect(holdRule()).not.toContain("--ease-out-quart");

    // The wait is an order of magnitude longer than the press's answer to a finger, which
    // is what a reader is being shown while the timer runs.
    expect(HOLD_MS).toBeGreaterThanOrEqual(4 * Number(declaredOnce("--dur-press").replace("ms", "")));
  });

  /** `select-land`'s role and timing are unchanged — only its two numbers moved. */
  it("keeps the arrival's role and its timing", () => {
    expect(landRule()).toMatch(/animation:\s*select-land\s+var\(--dur-base\)\s+var\(--ease-out-quart\)/);
    expect(selectLandStops(null).map((stop) => stop.at)).toEqual([0, 55, 100]);
  });

  /**
   * **The hold's rules still win against the press on the same element**, and they win for
   * the reason they always did: they are unlayered, and `@utility pressable` is in the
   * `utilities` layer, so no amount of specificity down there can reach them.
   */
  it("keeps the hold's rules winning against the press, and the reason beside them", () => {
    expect(blockDepthOf('.pressable[data-holding="true"]')).toBe(0);
    expect(blockDepthOf('.pressable[data-landed="true"]')).toBe(0);
    expect(pressableUtility()).not.toContain("data-holding");

    // Recorded where the rules live.
    expect(holdNote()).toMatch(/[Uu]nlayered/);
  });

  /**
   * **A cell being held does not also run the press's pop.** Both are `animation` on one
   * element, and a release that lands a selection is an ordinary release as far as the
   * delegated listener can tell — so both marks can be on one cell at once, and the
   * flourish meaning *that was a tap* must not play over the arrival meaning *this is now
   * selected*. One gesture saying two things.
   *
   * The two rules are **equal specificity** — one class and one attribute each — and both
   * are unlayered, so nothing but position in the file separates them and the later one
   * wins. That makes *`press-pop` is declared first* load-bearing rather than incidental,
   * and it is what this asserts: the property, not the comment claiming it.
   */
  it("does not run the press's pop on a cell being held", () => {
    // Same shape on both sides, so neither can out-specify the other.
    expect(popRule().split("{")[0].trim()).toBe('.pressable[data-popped="true"]');
    expect(landRule().split("{")[0].trim()).toBe('.pressable[data-landed="true"]');
    expect(blockDepthOf('.pressable[data-popped="true"]')).toBe(0);

    // And the arrival is declared last, which is the whole of why it wins.
    expect(CSS_CODE.indexOf('.pressable[data-landed="true"]')).toBeGreaterThan(
      CSS_CODE.indexOf('.pressable[data-popped="true"]'),
    );
  });

  /**
   * **And the tone step does not reach a held cell either.** #284 paints the ground tone on
   * a pressed element that carries its own raised surface; on a library cell the raised
   * surface is the `<li>` and `pressable` is the `<button>` inside it, so the two never
   * meet. Asserted rather than assumed, because moving `bg-raised` onto the button is a
   * one-word change that would put a colour change under the hold's 500ms wait.
   */
  it("leaves the tone step off the held cell", () => {
    const cell = pressClassStrings("app/(signed-in)/library/library-entry-cell.tsx");

    expect(cell).toHaveLength(1);
    expect(cell[0].split(/\s+/)).not.toContain("bg-raised");
  });

  /**
   * Reduced motion covers **both** halves of the hold — the ramp and the arrival — and
   * neither the gesture nor the selection is dropped with them. The event always happens.
   */
  it("drops the hold's movement without dropping the hold", () => {
    const blocks = [
      ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g),
    ]
      .map((match) => match[0])
      .filter((block) => block.includes("data-holding"));

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/\[data-holding="true"\]\s*\{[\s\S]*?transform:\s*none/);
    expect(blocks[0]).toMatch(/\[data-holding="true"\]\s*\{[\s\S]*?transition:\s*none/);
    expect(blocks[0]).toMatch(/\[data-landed="true"\][\s\S]*?animation:\s*none/);

    // Holding still selects: the timer never asks about the preference, exactly as the
    // press's own listener never does. Only the animation is negotiable.
    const hold = codeOf("app/(signed-in)/library/use-hold-to-select.ts");
    expect(hold).toContain("HOLD_MS");
    expect(hold).not.toContain("prefers-reduced-motion");
    expect(hold).not.toContain("matchMedia");
  });

  /**
   * **The prose cites the derivation rather than a number it no longer has.** A comment
   * claiming a provenance beside a value that stopped coming from it is the exact failure
   * this file exists to prevent, and the hold's note was one edit away from being it.
   */
  it("cites the hold's new derivation in the stylesheet", () => {
    expect(holdNote()).toContain("--press-compress");
    expect(holdNote()).toContain("--press-pop");

    // And no copy of the numbers the hold used to carry survives in the *rules*. The
    // prose may name them — this file records a reversal as a reversal — but a literal
    // amplitude left in a declaration is the thing being removed.
    expect(CSS_CODE).not.toContain("1.035");
    expect(CSS_CODE).not.toContain("scale(0.95)");
  });
});

/**
 * ── The bar wears the press — issue #295 ─────────────────────────────────────────────
 *
 * The four most-pressed controls in the application had no press. Of the call sites swept
 * above, the phone tab bar was not one: #279's press reached every tile, cell, row and
 * button except the bar that is on screen at all times and answered nothing under a thumb.
 *
 * It joins at the **control** register — it is five small hit boxes (four until #399), the same kind of
 * thing as the search screen's add — rather than at the surface one a card gets, and no
 * fourth register is introduced. What is new is one class on the child that leads.
 */
const TAB_BAR = "app/tab-bar.tsx";

/** The class that marks the element leading its parent's press. */
const LEAD_CLASS = "press-lead";

/** The one class string the five tabs share, as tokens. One string and not five is the
 *  whole of *each tab carries it*: the bar renders `TABS` through a single `<Link>`, so a
 *  tab that did not press would have to be a second element rather than a missing token. */
function tabPressTokens(): string[] {
  const strings = pressClassStrings(TAB_BAR);

  expect(strings, "the five tabs must press through one shared class string").toHaveLength(1);
  return strings[0].split(/\s+/);
}

/** A named class-string constant in `tab-bar.tsx`, read the way `CHECK_HIT_BOX` is read
 *  above — the source, with its comments blanked, so the prose cannot answer for it. */
function tabConstant(name: string): string {
  const match = codeOf(TAB_BAR).match(new RegExp(`const ${name} =\\s*"([^"]*)"`));

  expect(match, `tab-bar.tsx must still declare ${name}`).not.toBeNull();
  return match![1];
}

describe("the phone tab bar wears the press", () => {
  it("presses every one of the five tabs", () => {
    const source = codeOf(TAB_BAR);

    // Five destinations, one `<Link>`, one class string.
    expect([...codeOf("app/destinations.ts").matchAll(/\{\s*href:\s*"\//g)]).toHaveLength(5);
    expect(source).toMatch(/DESTINATIONS\.map\(/);
    expect(source).toMatch(/TABS\.map\(/);
    expect(source).toMatch(/className=\{`\$\{TAB\}\s/);

    expect(tabPressTokens()).toContain("pressable");
  });

  it("presses at the control register and not at the surface one", () => {
    const tokens = tabPressTokens();

    expect(tokens).toContain(REGISTER_CLASS.control as string);
    expect(tokens).not.toContain(REGISTER_CLASS.recording as string);

    // And the register it declares is the one that resolves to #279's control numbers —
    // the claim is *this bar presses like a control*, end to end, not a spelling here and
    // a table over there.
    expect(compression(REGISTERS.control.register)).toBeCloseTo(REGISTERS.control.compress, 6);
    expect(compression(REGISTERS.control.register)).toBeLessThan(compression(null));
    expect(popPeak(REGISTERS.control.register)).toBeCloseTo(REGISTERS.control.pop, 3);
  });
});

/**
 * What a leading child multiplies its parent's compression by. A nested transform
 * composes with its parent's, so the icon's compression is this **times** the tab's own —
 * which is why the lead is a factor and not a fourth row in the register table.
 */
function leadFactor(register: number | null = null): number {
  const rule = pressableUtility().match(
    new RegExp(`&:active \\.${LEAD_CLASS}[\\s\\S]*?\\{([\\s\\S]*?)\\}`),
  );
  expect(rule, "`pressable` must compress a leading child further than itself").not.toBeNull();

  const scale = rule![1].match(/transform:\s*scale\((.+)\);/);
  expect(scale, "the lead must still be a scale").not.toBeNull();

  return cssValue(scale![1], variablesFor(register));
}

/** What the tab's icon and its label are actually driven to, resolved the way a browser
 *  would: the label takes the tab's own compression, the icon takes it again through the
 *  lead. Both come off one press, which is what keeps them one gesture. */
function tabCompressions(): { icon: number; label: number } {
  const control = REGISTERS.control.register;
  const label = compression(control);

  return { icon: label * leadFactor(control), label };
}

describe("the tab bar's icon leads its label", () => {
  it("puts the lead on the icon and not on the label", () => {
    expect(tabConstant("TAB_ICON").split(/\s+/)).toContain(LEAD_CLASS);
    expect(tabConstant("TAB_LABEL").split(/\s+/)).not.toContain(LEAD_CLASS);

    // And both are the strings the bar actually renders, not two constants beside it.
    const source = codeOf(TAB_BAR);
    expect(source).toContain("className={TAB_ICON}");
    expect(source).toContain("className={TAB_LABEL}");
  });

  it("compresses the icon deeper than the label", () => {
    const { icon, label } = tabCompressions();

    expect(icon).toBeLessThan(label);
    // Deeper by an amount, not by a rounding error: the lead exists so the bar reads as a
    // bar rather than as a search row, and a factor of 0.999 would be #270's failure again.
    expect(label - icon).toBeGreaterThan(0.01);
  });

  /**
   * **Slightly deeper, and no deeper than that.** The lead is not a fourth register and
   * must not reach past the one that is deliberately the loudest — #283 gives the
   * recording checkmark `0.900` because it is the act the product is built around, and a
   * tab icon overtaking it would make *the loudest press in the application* stop being
   * true without any number in the register table changing.
   */
  it("stays short of the deepest press in the application", () => {
    expect(tabCompressions().icon).toBeGreaterThan(REGISTERS.recording.compress);
  });

  /**
   * **No register moved.** #295 is the motion around #279's numbers, not a re-tune: the
   * lead is one property the press derives nothing else from, so the three registers
   * resolve to exactly the six amplitudes they resolved to before it existed.
   */
  it("leaves all three registers where #279 and #283 left them", () => {
    for (const { register, compress, pop } of Object.values(REGISTERS)) {
      expect(compression(register)).toBeCloseTo(compress, 6);
      expect(popPeak(register)).toBeCloseTo(pop, 3);
    }
  });

  /**
   * **The lead costs no client boundary and no handler.** It is a class token on a child,
   * so the bar is still a client component only for `usePathname` — the reason it has
   * been one since #102 — and the press's one delegated listener (asserted above) is
   * still the whole of its runtime.
   *
   * **Issue #323 reverses the narrower half of this: the bar now carries one handler,
   * and only one.** Pressing Up next while already on Up next has something to do besides
   * navigate, and `use-up-next-repress.ts` is where that gesture is decided — this bar
   * only hands it to the one `<Link>` it belongs to. What the lead's own claim still holds:
   * no state, no delegated listener of the bar's own and no `matchMedia` branch.
   *
   * **Issue #334 narrows the "no effect" half the same way.** The accessibility guarantee
   * that used to ride on `display: none` alone cannot survive as a class or a delegated
   * listener now that the bar fades instead of cutting (`tab-bar.tsx`'s own docblock has
   * the reasoning): it has to react to `data-selecting` off the DOM, synchronously with
   * the mutation, which is exactly what a `useEffect` and a `MutationObserver` are for.
   * The assertion below is narrowed again to say exactly that one exception, rather than
   * widened to say nothing.
   */
  it("adds no state, no bare pointer listener and no matchMedia branch to the bar", () => {
    const source = codeOf(TAB_BAR);

    expect(source).not.toContain("useState");
    expect(source).not.toContain("addEventListener");
    expect(source).not.toMatch(/onPointer|onTouch/);
    expect(source).not.toContain("matchMedia");

    // The one handler this bar wires up, and nowhere else — every other tab's `<Link>` is
    // still bare.
    expect(source.match(/onClick=/g)).toHaveLength(1);
    expect(source).toContain('onClick={href === "/up-next" ? onUpNextLinkClick : undefined}');

    // The one effect this bar wires up, and nowhere else: the `inert` guarantee, off a
    // `MutationObserver` rather than a bare `addEventListener` (still forbidden above)
    // or a second `useState` (also still forbidden above).
    expect(source.match(/useEffect\(/g)).toHaveLength(1);
    expect(source).toContain("new MutationObserver(sync)");
  });

  /**
   * **Reduced motion drops the lead, in the block that already drops the press.** The
   * lead is the compression again one element down, so a second `@media` block would be a
   * second answer to one preference — and a reader who asked for no movement would get a
   * bar whose icons still shrank under a thumb.
   */
  it("drops the lead under reduced motion, with the rest of the press", () => {
    const blocks = [
      ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g),
    ]
      .map((match) => match[0])
      .filter((block) => block.includes(LEAD_CLASS));

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(
      new RegExp(`\\.pressable:active \\.${LEAD_CLASS}[\\s\\S]*?transform:\\s*none`),
    );
    expect(blocks[0]).toMatch(
      new RegExp(`\\.pressable \\.${LEAD_CLASS}\\s*\\{[\\s\\S]*?transition:\\s*none`),
    );

    // The same block, not one of its own: it is the one that drops the compression too.
    expect(blocks[0]).toMatch(/\.pressable\s*\{[\s\S]*?transition:\s*none/);
    expect(blocks[0]).toMatch(/\.pressable\[data-popped="true"\]\s*\{[\s\S]*?animation:\s*none/);

    // And the navigation still happens: nothing here takes a tab off the pointer.
    expect(blocks[0]).not.toMatch(/pointer-events|display\s*:|visibility/);
  });
});

/**
 * ── The shared button base wears the press — issue #431 ─────────────────────────────
 *
 * Every button in the application is built on `app/buttons.ts`'s `BASE`, so one change
 * there reaches Tonight's row *Mark watched*, the action toast's *Undo*, every *Try
 * again*, the sign-in button, the back control and the list back control at once — they
 * were all dead under a touch because the shared base never wore `pressable`, not because
 * any one of them opted out.
 */
describe("the shared button base wears the press", () => {
  const BUTTONS = "app/buttons.ts";

  /** `BASE`'s own template literal, read as source rather than imported, so this does not
   *  care which variant happens to compose it. */
  function baseDeclaration(): string {
    const match = codeOf(BUTTONS).match(/const BASE = `([^`]*)`/);
    expect(match, "app/buttons.ts must still declare BASE as a template literal").not.toBeNull();
    return match![1];
  }

  /** A top-level `const`/`export const` declaration, as the one line of source that makes
   *  it — comments already blanked, so prose discussing the name cannot match instead. */
  function declaration(name: string): string {
    const match = new RegExp(`(?:export )?const ${name} =[^;]*;`).exec(codeOf(BUTTONS));
    expect(match, `app/buttons.ts must still declare ${name}`).not.toBeNull();
    return match![0];
  }

  it("carries pressable and no transition utility of its own", () => {
    const base = baseDeclaration();

    expect(base.split(/\s+/)).toContain("pressable");
    // Two transition utilities on one element fight over `transition-property`, and the
    // later-emitted one wins — `app/tab-bar.tsx`'s own docblock already names this failure.
    expect(base).not.toMatch(/transition-\[/);
    expect(base).not.toMatch(/\bduration-\[/);
  });

  it("drives the filled, plain and destructive variants' hover colour from its own transition list", () => {
    // The hover classes are untouched — what moved is which transition drives them, and
    // none of the three may have grown a second transition utility of its own to do it.
    expect(declaration("PRIMARY")).toBe("const PRIMARY = `${FILLED} hover:brightness-95`;");
    expect(declaration("PLAIN")).toBe('const PLAIN = "text-text hover:text-dim";');
    expect(declaration("DESTRUCTIVE")).toBe(
      'const DESTRUCTIVE = "danger-line text-danger hover:bg-danger hover:text-ground";',
    );
    for (const variant of ["PRIMARY", "PLAIN", "DESTRUCTIVE"]) {
      expect(declaration(variant), `${variant} must not add its own transition utility`).not.toMatch(
        /transition-/,
      );
    }

    // `pressable` is what is left to drive them, and it has to actually carry all three
    // properties those three hovers change — `filter` and `background-color` already did;
    // `color` is the one this ticket adds, for `hover:text-dim` and `hover:text-ground`.
    const transition = pressableUtility().match(/transition:\s*([\s\S]*?);/);
    expect(transition, "`pressable` must still declare one `transition` list").not.toBeNull();
    expect(transition![1]).toMatch(/\bcolor\b/);
    expect(transition![1]).toMatch(/\bbackground-color\b/);
    expect(transition![1]).toMatch(/\bfilter\b/);
  });

  it("gives every icon-only button constant the small-control register", () => {
    const control = REGISTER_CLASS.control as string;

    // The register rides in through an interpolated constant rather than a literal in the
    // declaration's own source, so these are read as the strings a consumer actually gets.
    for (const classes of [ICON_BUTTON, ICON_BUTTON_SQUARE, ICON_BUTTON_OVER_ARTWORK]) {
      expect(classes.split(/\s+/)).toContain("pressable");
      expect(classes.split(/\s+/)).toContain(control);
    }
  });

  it("leaves the menu item on the surface register, spelled by saying nothing", () => {
    expect(MENU_ITEM.split(/\s+/)).toContain("pressable");
    expect(MENU_ITEM).not.toContain(REGISTER_PROPERTY);
  });

  it("drops the CSS press on Tonight's featured Mark watched, whose layoutId morph it must not fight", () => {
    const source = codeOf("app/(signed-in)/up-next/tonight-featured.tsx");

    expect(source).toContain("withoutPress(PRIMARY_BUTTON_LARGE)");
    // Its own Motion press is the next ticket's; this ticket removes only the CSS one.
    expect(source).toContain("layoutId={shape}");
    expect(source).not.toMatch(/className=\{`\$\{PRIMARY_BUTTON_LARGE\}/);
  });

  it("withoutPress strips exactly the pressable token and nothing else", () => {
    expect(PRIMARY_BUTTON_LARGE.split(/\s+/)).toContain("pressable");

    const stripped = withoutPress(PRIMARY_BUTTON_LARGE);
    expect(stripped.split(/\s+/)).not.toContain("pressable");
    expect(stripped.split(/\s+/)).toEqual(
      PRIMARY_BUTTON_LARGE.split(/\s+/).filter((token) => token !== "pressable"),
    );
  });
});
