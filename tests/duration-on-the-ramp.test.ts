import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";

import durationOnTheRamp from "@/eslint-rules/duration-on-the-ramp.mjs";

/**
 * Issue #332, machine-checked rather than remembered: **the timing ramp becomes
 * enforceable.** `app/globals.css` declares seven duration tokens — `--dur-fast` through
 * `--dur-pending-hold` — and until this rule existed, nothing stopped a call site from
 * writing a millisecond value of its own instead of reaching for one of them. Eighteen did.
 *
 * The rule covers **two surfaces, and both are required**: a Tailwind class name
 * (`duration-150`, `duration-[150ms]`) and a CSS-in-JS style object
 * (`{ transition: "transform 150ms ease" }`). The motivating literal — the reorder list's
 * row-shift transition — is written in a style object, so a class-name-only rule would miss
 * the very case it exists for; moving a value out of a class name and into a style object
 * must not be a way around it.
 *
 * It is an **ESLint rule and not a test**, for the reason `tests/no-empty-catch.test.ts`
 * gives: `SPEC.md` §6 puts lint in CI and nothing else, so a vitest assertion would never
 * see a pull request and `npm run lint` will.
 *
 * ── Why a name check, and not a full class-list parse ──────────────────────────────────
 *
 * There is no Tailwind AST here, only string and template-literal text, the same ground
 * `cache-key-carries-account.mjs` stands on for `userId`. Two structural signals carry the
 * two required surfaces without one:
 *
 *  - **A class name** is either the value of a JSX `className`/`class` attribute, or a
 *    `SCREAMING_SNAKE_CASE` constant — the shape every shared class string in this
 *    repository already takes (`CHIP_BASE`, `GHOST_RECOVERY`, `IN_FLIGHT`, …). Both are
 *    scanned for a `duration-` Tailwind utility whose value is a bare number
 *    (`duration-150`) or an arbitrary value that is not a ramp token
 *    (`duration-[150ms]`); `duration-[var(--dur-fast)]` is left alone.
 *  - **A style object** is any object literal with a CSS timing property —
 *    `transition`, `transitionDuration`, `transitionDelay`, `animation`,
 *    `animationDuration` or `animationDelay` — whose value contains a raw `Nms`/`Ns`
 *    outside of a `var()` reference. This is why `app/motion.ts`'s spring configs are
 *    untouched: their key is `duration`, not `transitionDuration`, and they hold seconds
 *    for Motion's own API rather than a CSS string.
 *
 * **What this does not catch**, so a clean lint run is not mistaken for a proof: a class
 * name assembled through `clsx`/string concatenation with a raw duration buried inside a
 * *lowercase* variable (the SCREAMING_SNAKE_CASE check is a name check, not a type check —
 * the same trade-off `cache-key-carries-account.mjs` makes for `userId`), and a duration
 * that reaches a style object through an intermediate variable rather than being written
 * inline.
 */

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("duration-on-the-ramp", durationOnTheRamp, {
  valid: [
    // The ramp, reached through `var()` — the escape hatch the rule must leave open.
    '<div className="transition-colors duration-[var(--dur-fast)]" />',
    "const CHIP_BASE = \"bg-raised transition-opacity duration-[var(--dur-fast)]\";",
    'const style = { transition: "transform var(--dur-fast) ease" };',
    '<div style={{ transitionDuration: "var(--dur-base)" }} />',
    // Not a class name at all — a lowercase variable is not the shape this repository's
    // class constants take, so the rule leaves it alone rather than guessing.
    'const message = "please wait, duration-150ish seconds";',
    // Not the className/class attribute.
    '<div id="duration-150" />',
    // `app/motion.ts`'s own shape: a `duration` key for Motion's spring API, in seconds,
    // and never a CSS timing property. Must never fire — this is the ramp's own module.
    'const smooth = { type: "spring", duration: 0.3, bounce: 0 };',
    // An object with an unrelated "transition" value that carries no digits at all.
    'const nav = { transition: "fade" };',
  ],
  invalid: [
    // The bare Tailwind scale — never expressible as a ramp token.
    {
      code: '<div className="transition-colors duration-150" />',
      errors: [{ messageId: "rawDurationInClassName" }],
    },
    // An arbitrary value that is a literal millisecond figure rather than a token.
    {
      code: '<div className="transition-colors duration-[150ms]" />',
      errors: [{ messageId: "rawDurationInClassName" }],
    },
    // The shared-constant shape every real violation in this codebase took.
    {
      code: 'export const GHOST_RECOVERY = `code-line transition-colors duration-150 hover:bg-accent`;',
      errors: [{ messageId: "rawDurationInClassName" }],
    },
    // The motivating case: a style object, not a class name, carrying the same literal.
    {
      code: 'const style = { transition: "transform 150ms ease" };',
      errors: [{ messageId: "rawDurationInStyle" }],
    },
    // The other CSS timing keys.
    {
      code: '<div style={{ transitionDuration: "200ms" }} />',
      errors: [{ messageId: "rawDurationInStyle" }],
    },
    {
      code: '<div style={{ animationDuration: "0.26s" }} />',
      errors: [{ messageId: "rawDurationInStyle" }],
    },
  ],
});

describe("the rule as the repository actually runs it", () => {
  const eslint = new ESLint();

  it("is enabled by eslint.config.mjs, so `npm run lint` enforces a class name", async () => {
    const [result] = await eslint.lintText(
      'export function Button() {\n' +
        '  return <button className="transition-colors duration-150">Go</button>;\n' +
        "}\n",
      { filePath: "app/a-file-that-is-not-on-disk.tsx" },
    );

    expect(result.messages.map((message) => message.ruleId)).toContain(
      "mediasafe/duration-on-the-ramp",
    );
  });

  it("is enabled by eslint.config.mjs, so `npm run lint` enforces a style object", async () => {
    const [result] = await eslint.lintText(
      'export function Row() {\n' +
        '  return <li style={{ transition: "transform 150ms ease" }} />;\n' +
        "}\n",
      { filePath: "app/a-file-that-is-not-on-disk.tsx" },
    );

    expect(result.messages.map((message) => message.ruleId)).toContain(
      "mediasafe/duration-on-the-ramp",
    );
  });

  it("leaves a ramp token alone", async () => {
    const [result] = await eslint.lintText(
      'export function Button() {\n' +
        '  return <button className="transition-colors duration-[var(--dur-fast)]">Go</button>;\n' +
        "}\n",
      { filePath: "app/a-file-that-is-not-on-disk.tsx" },
    );

    expect(result.messages.map((message) => message.ruleId)).not.toContain(
      "mediasafe/duration-on-the-ramp",
    );
  });

  it("never fires on app/motion.ts's spring configuration shape", async () => {
    const [result] = await eslint.lintText(
      'import type { Transition } from "motion/react";\n' +
        'export const smooth: Transition = { type: "spring", duration: 0.3, bounce: 0 };\n',
      { filePath: "app/a-file-that-is-not-on-disk.ts" },
    );

    expect(result.messages.map((message) => message.ruleId)).not.toContain(
      "mediasafe/duration-on-the-ramp",
    );
  });
});
