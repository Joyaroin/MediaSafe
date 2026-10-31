import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Issue #429 (handoff §11.1) — the staggered entrance rises quickly, and an unstyled
 * `transition-*` utility stops falling back to a curve nobody chose.
 *
 * Before this ticket the ninth row's entrance did not finish until 620ms (240ms of
 * hand-typed `30ms`-a-row delay plus `--dur-slow`'s 380ms). This file pins the new
 * numbers: the stagger rises on `--dur-base` (220ms), each child a `--stagger-step`
 * (20ms) behind the last, so the ninth child's entrance is finished at 380ms —
 * `8 * 20ms + 220ms`. The tenth-child cap and the keyframe's 8px travel are unchanged
 * and are reasserted here so a future edit cannot drop them while chasing the new
 * numbers above. `tests/motion-moments.test.ts` and `tests/press-spring.test.ts`'s
 * "reads every duration it declares" are the prior art for reading `globals.css` as
 * text rather than importing it.
 */

const CSS = readFileSync("app/globals.css", "utf8");
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));

/** The body of a brace-delimited block, starting at the first match of `selector`
 *  at or after `from`. Nested braces are balanced, the same way
 *  `tests/motion-moments.test.ts`'s `block()` does it, so a selector that contains
 *  other rules (`@utility`, `@media`) can be sliced out whole. */
function blockFrom(text: string, selector: string, from = 0): string {
  const start = text.indexOf(selector, from);
  expect(start, `${selector} is declared`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = text.indexOf("{", start); index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`${selector} never closes`);
}

const block = (selector: string): string => blockFrom(CSS_CODE, selector);

/** The `@theme { … }` block, where the ramp's tokens and Tailwind's own defaults for
 *  this app are declared. */
const THEME = block("@theme {");

/** Every `@media (prefers-reduced-motion: reduce) { … }` block, concatenated — the
 *  stagger's still version can live in any one of them. */
const REDUCED_MOTION_BLOCKS = [
  ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g),
].map((match) => match[0]);

/** A single custom property's one declaration, the way
 *  `tests/press-spring.test.ts`'s `declaredOnce` reads the ramp: a second declaration
 *  of the same name is a failure to surface, not a value to pick between. */
function declaredOnce(name: string): string {
  const all = [...CSS_CODE.matchAll(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm"))];
  expect(all, `${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].trim();
}

/** A bare `Nms` value as a number. */
function ms(value: string): number {
  const match = /^(\d+(?:\.\d+)?)ms$/.exec(value.trim());
  expect(match, `${value} is not a plain millisecond value`).not.toBeNull();
  return Number(match![1]);
}

/** `calc(var(--stagger-step) * N)`, resolved against the token's own declared value —
 *  never against a copy of `20`, so a change to the token moves this test's expectation
 *  along with it rather than silently disagreeing with it. */
function stepMultiple(expression: string): number {
  const match = /^calc\(\s*var\(--stagger-step\)\s*\*\s*(\d+)\s*\)$/.exec(expression.trim());
  expect(match, `${expression} is not a bare multiple of --stagger-step`).not.toBeNull();
  return Number(match![1]) * ms(declaredOnce("--stagger-step"));
}

/** The stagger's own `@utility` block. */
function staggerUtility(): string {
  return block("@utility stagger-rise {");
}

/** The `animation-delay` a given child selector carries inside the stagger utility. */
function delayFor(nth: string): string {
  const rule = blockFrom(staggerUtility(), `& > *:nth-child(${nth}) {`);
  const match = /animation-delay:\s*([^;]+);/.exec(rule);
  expect(match, `${nth} must declare animation-delay`).not.toBeNull();
  return match![1].trim();
}

describe("the stagger-step token", () => {
  it("is declared on the ramp, in @theme, at 20ms", () => {
    expect(THEME).toMatch(/--stagger-step:\s*20ms;/);
  });

  it("is read somewhere in the stylesheet (reads every duration it declares)", () => {
    // The same guarantee `tests/press-spring.test.ts` already holds `--dur`/`--ease`/
    // `--spring` tokens to, restated for the token this ticket adds: declared and never
    // read is the drift both files exist to catch.
    expect(CSS_CODE).toContain("var(--stagger-step)");
  });
});

describe("the staggered entrance rises on --dur-base", () => {
  it("runs the rise animation for --dur-base, not --dur-slow", () => {
    expect(staggerUtility()).toMatch(/animation:\s*rise-in\s+var\(--dur-base\)\s+var\(--ease-press\)\s+backwards;/);
  });

  it("steps every child's delay by a multiple of --stagger-step, never a hand-typed literal", () => {
    // Every `animation-delay` the stagger utility declares (its still-motion block is a
    // separate `@media` rule and is asserted on its own below) must be a bare multiple
    // of the token — the shape `--stagger-step`'s test above proves is read at all.
    const delays = [...staggerUtility().matchAll(/animation-delay:\s*([^;]+);/g)].map(
      (match) => match[1].trim(),
    );

    expect(delays.length).toBeGreaterThan(0);
    for (const delay of delays) {
      expect(delay).toMatch(/^calc\(\s*var\(--stagger-step\)\s*\*\s*\d+\s*\)$/);
    }
  });

  it("places child 1 at 0ms and steps 20ms per child up to child 9", () => {
    for (let child = 1; child <= 9; child += 1) {
      expect(stepMultiple(delayFor(String(child)))).toBe((child - 1) * 20);
    }
  });

  it("lands the ninth child's entrance at 380ms — 8 * 20ms + --dur-base", () => {
    const delay = stepMultiple(delayFor("9"));
    const duration = ms(declaredOnce("--dur-base"));

    expect(delay).toBe(160);
    expect(duration).toBe(220);
    expect(delay + duration).toBe(380);
  });
});

describe("the tenth-child cap and the keyframe's travel are unchanged", () => {
  it("still sets animation: none past the ninth child", () => {
    const rule = blockFrom(staggerUtility(), "& > *:nth-child(n + 10) {");
    expect(rule).toMatch(/animation:\s*none;/);
  });

  it("still travels 8px in rise-in", () => {
    const keyframe = block("@keyframes rise-in {");
    expect(keyframe).toMatch(/from\s*\{[^}]*transform:\s*translateY\(8px\);/);
    expect(keyframe).toMatch(/to\s*\{[^}]*transform:\s*none;/);
  });
});

describe("the default transition timing function is the app's own ease-out", () => {
  it("sets --default-transition-timing-function to --ease-out-quart in @theme", () => {
    expect(THEME).toMatch(/--default-transition-timing-function:\s*var\(--ease-out-quart\);/);
  });
});

describe("reduced motion keeps a gentle fade instead of collapsing to 1ms", () => {
  const reduced = REDUCED_MOTION_BLOCKS.filter((candidate) => candidate.includes(".stagger-rise"));

  it("has exactly one reduced-motion rule for the stagger", () => {
    expect(reduced).toHaveLength(1);
  });

  it("keeps a real duration rather than 1ms", () => {
    const rule = blockFrom(reduced[0], ".stagger-rise > * {");
    const duration = /animation-duration:\s*([^;]+);/.exec(rule);

    expect(duration, "the reduced-motion rule must still set animation-duration").not.toBeNull();
    expect(duration![1].trim()).not.toBe("1ms");
    expect(ms(duration![1].trim().includes("var(") ? declaredOnce("--dur-base") : duration![1])).toBeGreaterThan(
      1,
    );
  });

  it("drops the rise but keeps the fade — opacity changes, transform does not", () => {
    const keyframe = blockFrom(reduced[0], "@keyframes rise-in {");

    expect(keyframe).toMatch(/from\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*none;/);
    expect(keyframe).toMatch(/to\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;/);
  });
});

/** Attempt 1 of this ticket shipped with the right numbers but a wrong clause of
 *  prose beside one of them (`--stagger-step`'s own comment called 20ms "a fifth of
 *  `--dur-base`"; it is an eleventh). Every other test in this file matches against
 *  `CSS_CODE`, which blanks comments before matching — on purpose, so a comment's
 *  wording can change freely without breaking the suite that pins the values. These
 *  two describe blocks are the exception: they read the raw, unstripped `CSS` and
 *  `docs/redesign/handoff.md` directly, because a wrong comment or a stale doc line
 *  is exactly the defect attempt 1 shipped and nothing else here would catch it. */
const HANDOFF = readFileSync("docs/redesign/handoff.md", "utf8");

/** Collapse whitespace (including the hard-wrapped line breaks inside a CSS block
 *  comment) so a match doesn't depend on exactly where a line wraps. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

/** The block comment immediately above a given line of raw, unstripped CSS — the
 *  prose a reader sees beside the declaration, as opposed to `CSS_CODE` above, which
 *  every other test in this file reads instead. */
function rawCommentBefore(anchor: string): string {
  const at = CSS.indexOf(anchor);
  expect(at, `${anchor} is declared`).toBeGreaterThanOrEqual(0);
  const before = CSS.slice(0, at);

  // The *last* comment in `before`, not the first one the file happens to contain —
  // a lazy `[\s\S]*?` anchored only at `$` would still span every comment in between.
  const comments = [...before.matchAll(/\/\*([\s\S]*?)\*\//g)];
  expect(comments.length, `${anchor} has a comment above it somewhere`).toBeGreaterThan(0);
  const last = comments[comments.length - 1];
  const gap = before.slice(last.index! + last[0].length);

  expect(gap.trim(), `${anchor} has a comment immediately above it, not just somewhere above it`).toBe("");
  return flatten(last[1]);
}

describe("the CSS comments beside the changed values are correct", () => {
  it("--stagger-step's own comment gives the right arithmetic, not a fraction of --dur-base", () => {
    const comment = rawCommentBefore("--stagger-step: 20ms;");

    expect(comment).toMatch(/8 \* 20ms \+ --dur-base = 380ms/);
    expect(comment).not.toMatch(/fifth/);
  });

  it("the stagger-rise utility's comment states the new 380ms landing and the old 620ms it replaced", () => {
    const comment = rawCommentBefore("@utility stagger-rise {");

    expect(comment).toMatch(/`--stagger-step` \(20ms\) behind the last/);
    expect(comment).toMatch(/8 \* 20ms \+ 220ms = 380ms/);
    expect(comment).toMatch(/620ms/);
  });

  it("the reduced-motion stagger comment states the fade is kept at a real duration, not collapsed to 1ms", () => {
    // The comment sits above the `@media` block, not above `.stagger-rise > *` —
    // the rule immediately inside it.
    const comment = rawCommentBefore("@media (prefers-reduced-motion: reduce) {\n  .stagger-rise > * {");

    expect(comment).toMatch(/collapse `animation-duration` to `1ms`/);
    expect(comment).toMatch(/`--dur-base` keeps the same real duration/);
  });
});

describe("docs/redesign/handoff.md §11 matches the code", () => {
  const section11 = HANDOFF.slice(HANDOFF.indexOf("## 11. Motion"), HANDOFF.indexOf("## 12. Accessibility"));

  it("§11.1's token table lists --stagger-step at 20ms, marked new", () => {
    expect(section11).toMatch(/\|\s*`--stagger-step`\s*\|\s*20ms\s*\|[^|]*\|\s*\*\*new\*\*\s*\|/);
  });

  it("§11.1 names --stagger-step as this ticket's own addition, not as one of a stale pair of proposals", () => {
    expect(section11).toMatch(/`--stagger-step` is this ticket's own addition \(#429\)/);
    expect(section11).not.toMatch(/the names of the two new tokens are proposals/i);
  });

  it("§11.1 still credits --dur-slow for arrivals, which `@utility arrive` still uses", () => {
    // Unlike the two rows above, this row names no value this ticket moves — it is
    // listed here only so a future edit that does change it is forced through this
    // test rather than drifting unnoticed, the same guard the rows above are.
    expect(section11).toMatch(/\|\s*`--dur-slow`\s*\|\s*380ms\s*\|\s*Arrivals, the toast\s*\|\s*exists\s*\|/);
  });
});
