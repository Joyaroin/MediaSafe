import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Issue #429 — the staggered entrance moves onto `--dur-base` and a declared
 * `--stagger-step`, instead of running on `--dur-slow` with a hand-typed 30ms step.
 *
 * Before this ticket, the ninth and last running child of `.stagger-rise` did not finish
 * rising until `240ms + 380ms = 620ms` after a screen's arrival — longer than any other
 * wait on these screens. `--dur-base` (220ms, the ramp's "routine state change") and a
 * new `--stagger-step` (20ms) put the same ninth child's finish at `8 * 20ms + 220ms =
 * 380ms`.
 *
 * Read as text, the same way `tests/press-spring.test.ts` reads the press: there is no
 * DOM here, so what is asserted is what a browser would resolve from the declarations,
 * not a screenshot.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");
const CSS = readFileSync(path.join(REPOSITORY_ROOT, "app/globals.css"), "utf8");

/** The stylesheet with its comments blanked — the prose beside these rules names the
 *  very numbers the assertions below look for. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));

/** Every declaration of a custom property, so a second one is a failure and not a shadow. */
function declaredOnce(name: string): string {
  const all = [...CSS_CODE.matchAll(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm"))];
  expect(all, `${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].trim();
}

/** The body of a named `@utility` or `@keyframes` block, brace-balanced the way
 *  `tests/press-spring.test.ts`'s own helpers are — a lazy match on `\n}` works because
 *  every nested rule's own closing brace is indented and this one never is. */
function namedBlock(atRule: string, name: string): string {
  const match = CSS_CODE.match(new RegExp(`${atRule} ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(match, `globals.css must declare \`${atRule} ${name}\``).not.toBeNull();
  return match![0];
}

const staggerRise = () => namedBlock("@utility", "stagger-rise");
const riseInKeyframes = () => namedBlock("@keyframes", "rise-in");

describe("the stagger-step token", () => {
  it("declares --stagger-step at 20ms, once, on the ramp", () => {
    expect(declaredOnce("--stagger-step")).toBe("20ms");
  });

  it("is read by the stagger it names", () => {
    expect(CSS_CODE, "--stagger-step is declared and never read").toContain(
      "var(--stagger-step)",
    );
  });
});

describe("the staggered entrance rises on --dur-base", () => {
  it("runs the entrance for --dur-base rather than --dur-slow", () => {
    expect(staggerRise()).toMatch(
      /animation:\s*rise-in\s+var\(--dur-base\)\s+var\(--ease-press\)\s+backwards;/,
    );
  });

  it("spaces each of the nine children a multiple of --stagger-step, with no hand-typed delay literal", () => {
    const delays = [
      ...staggerRise().matchAll(/nth-child\((\d+)\)\s*\{\s*animation-delay:\s*([^;]+);/g),
    ];

    expect(delays).toHaveLength(9);
    delays.forEach(([, child, expression], index) => {
      expect(Number(child)).toBe(index + 1);
      expect(expression.trim()).toBe(`calc(var(--stagger-step) * ${index})`);
    });
  });

  it("has no hand-typed millisecond delay literal anywhere in the stagger block", () => {
    // A literal like `30ms` immediately after the property — the mistake this ticket
    // removes. `calc(var(--stagger-step) * 8)` contains digits (the multiplier, the
    // child index) but never a bare `Nms` outside of the token it multiplies.
    expect(staggerRise()).not.toMatch(/animation-delay:\s*\d/);
  });

  it("lands the ninth child's entrance at 380ms: eight steps of --stagger-step, then --dur-base", () => {
    const step = Number(declaredOnce("--stagger-step").replace("ms", ""));
    const duration = Number(declaredOnce("--dur-base").replace("ms", ""));

    const ninthDelay = step * 8;
    expect(ninthDelay).toBe(160);
    expect(ninthDelay + duration).toBe(380);
  });

  it("keeps the tenth-child cap exactly as it was: animation: none past the ninth", () => {
    expect(staggerRise()).toMatch(/nth-child\(n \+ 10\)\s*\{\s*animation:\s*none;\s*\}/);
  });
});

describe("the rise-in keyframe", () => {
  it("still travels 8px", () => {
    expect(riseInKeyframes()).toMatch(/translateY\(8px\)/);
  });

  it("still goes from invisible-and-offset to fully in place", () => {
    expect(riseInKeyframes()).toMatch(/from\s*\{\s*opacity:\s*0;[\s\S]*?\}/);
    expect(riseInKeyframes()).toMatch(/to\s*\{\s*opacity:\s*1;\s*transform:\s*none;\s*\}/);
  });
});

describe("reduced motion keeps a gentle fade rather than collapsing to nothing", () => {
  const reducedStaggerBlocks = [
    ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g),
  ]
    .map((match) => match[0])
    .filter((block) => block.includes(".stagger-rise"));

  it("is the one reduced-motion block covering .stagger-rise", () => {
    expect(reducedStaggerBlocks).toHaveLength(1);
  });

  it("runs the fade at a real duration, not animation-duration: 1ms", () => {
    expect(reducedStaggerBlocks[0]).toMatch(/animation-duration:\s*var\(--dur-base\)/);
    expect(reducedStaggerBlocks[0]).not.toMatch(/animation-duration:\s*1ms/);
  });

  it("drops every child's delay so the fades do not restagger", () => {
    expect(reducedStaggerBlocks[0]).toMatch(/animation-delay:\s*0ms\s*!important/);
  });

  it("keeps opacity and drops the transform, in the reduced-motion keyframe", () => {
    const keyframes = reducedStaggerBlocks[0].match(/@keyframes rise-in \{[\s\S]*?\n {2}\}/);
    expect(keyframes, "the reduced-motion block must still redefine rise-in").not.toBeNull();

    expect(keyframes![0]).toMatch(/from\s*\{\s*opacity:\s*0;\s*transform:\s*none;\s*\}/);
    expect(keyframes![0]).toMatch(/to\s*\{\s*opacity:\s*1;\s*transform:\s*none;\s*\}/);
    expect(keyframes![0]).not.toMatch(/translateY/);
  });
});
