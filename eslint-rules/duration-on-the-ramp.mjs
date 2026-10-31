/**
 * Issue #332, made mechanical: **the timing ramp becomes enforceable.** The ramp is the
 * `--dur-*` tokens `app/globals.css` declares, `--dur-press` through `--dur-pending-hold`,
 * plus two that are not `--dur-` names: `--stagger-step`, the gap between staggered rows,
 * and `--hold-shown`, the long-press time an element is handed from the hold logic's own
 * constant. A millisecond value written at a call site instead of one of them is exactly
 * the mistake `app/motion.ts`'s own docblock warns against for the type ramp: as visible a
 * mistake as a `text-[1.37rem]` would be.
 *
 * **The only exceptions to the ramp are the ambient loops** — the pending shimmer and the
 * pending bars' offsets down a skeleton (`globals.css`'s `pending-bar`). They run for as
 * long as a read takes, not for a duration anyone waits through, so they keep their own
 * timing. Both live in the stylesheet, which this rule does not read.
 *
 * The rule covers **two surfaces, and both are required**. The reorder list's row-shift
 * transition — the literal that motivated this rule — is written in a style object, not a
 * class name, so a class-name-only rule would miss the one case it exists for. Moving a
 * value out of a class name and into a style object must not be a way around it.
 *
 *  - **A class name.** Either the value of a JSX `className`/`class` attribute, or a
 *    `SCREAMING_SNAKE_CASE` constant — the shape every shared class string in this
 *    repository already takes (`CHIP_BASE`, `GHOST_RECOVERY`, `IN_FLIGHT`, …). Both are
 *    scanned for a `duration-` Tailwind utility that is a bare number (`duration-150`) or
 *    an arbitrary value that is not a ramp token (`duration-[150ms]`).
 *    `duration-[var(--dur-fast)]`, `duration-[var(--stagger-step)]` and
 *    `duration-[var(--hold-shown)]` are left alone.
 *  - **A style object.** Any object literal with a CSS timing property — `transition`,
 *    `transitionDuration`, `transitionDelay`, `animation`, `animationDuration` or
 *    `animationDelay` — whose value contains a raw `Nms`/`Ns` outside of a `var()`
 *    reference.
 *
 * **Why a name check, and not a type-aware class-list parse.** There is no Tailwind AST
 * here, only string and template-literal text — the same ground `cache-key-carries-account`
 * stands on for `userId`. A name check is also what keeps this rule from ever firing on
 * `app/motion.ts`: its spring configs key their timing as `duration` — Motion's own
 * property, in seconds — never as `transitionDuration` or any other CSS timing key, so the
 * numbers `motion.ts` is explicitly not allowed to change are never in this rule's path.
 *
 * **What it does not catch**, so a clean lint run is not mistaken for a proof: a class name
 * assembled through `clsx`/string concatenation into a *lowercase* variable — the
 * `SCREAMING_SNAKE_CASE` check is a name check, not a type check, the same trade-off
 * `cache-key-carries-account.mjs` makes for `userId` — and a duration that reaches a style
 * object through an intermediate variable rather than being written inline.
 */

/** Tailwind's `duration-` utility: a bare number, or an arbitrary `[...]` value. */
const DURATION_UTILITY = /\bduration-(\d+(?:\.\d+)?|\[[^\]]*\])/g;

/** A ramp token — a `--dur-*` token, `--stagger-step` or `--hold-shown` — reached the one
 *  sanctioned way. */
const RAMP_REFERENCE = /^var\(\s*(?:--dur-[\w-]+|--stagger-step|--hold-shown)\s*(?:,[^)]*)?\)$/;

/** A raw duration once every `var(...)` reference has been removed from the text. */
const RAW_DURATION_VALUE = /\b\d+(?:\.\d+)?m?s\b/;

const CSS_TIMING_KEYS = new Set([
  "transition",
  "transitionDuration",
  "transitionDelay",
  "animation",
  "animationDuration",
  "animationDelay",
]);

/** Is this identifier the shape this repository's shared class-name constants take? */
function looksLikeAClassNameConstant(name) {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/** Every raw-text piece a class-name-shaped expression could resolve to: string literals
 *  and template-literal quasis, walked through the ternaries and `&&` chains this
 *  codebase actually writes them with. Stops rather than guesses at anything else — an
 *  identifier, a call, a member expression — the same conservative direction
 *  `cache-key-carries-account.mjs` takes on a key part it cannot follow. */
function collectStringParts(node, parts) {
  if (!node) return;

  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") parts.push(node);
      return;
    case "TemplateLiteral":
      for (const quasi of node.quasis) parts.push(quasi);
      return;
    case "ConditionalExpression":
      collectStringParts(node.consequent, parts);
      collectStringParts(node.alternate, parts);
      return;
    case "LogicalExpression":
      collectStringParts(node.left, parts);
      collectStringParts(node.right, parts);
      return;
    case "JSXExpressionContainer":
      collectStringParts(node.expression, parts);
      return;
    default:
      return;
  }
}

/** The raw text a `Literal` or a `TemplateElement` carries. */
function rawTextOf(node) {
  return node.type === "Literal" ? node.value : node.value.raw;
}

function checkClassNameNode(context, node) {
  const text = rawTextOf(node);
  DURATION_UTILITY.lastIndex = 0;
  let match;
  while ((match = DURATION_UTILITY.exec(text)) !== null) {
    const value = match[1];
    if (value.startsWith("[")) {
      const inner = value.slice(1, -1).trim();
      if (RAMP_REFERENCE.test(inner)) continue;
    }
    context.report({ node, messageId: "rawDurationInClassName" });
    return;
  }
}

function checkStyleValueNode(context, node) {
  const text = rawTextOf(node);
  const withoutRampReferences = text.replace(/var\([^)]*\)/g, "");
  if (RAW_DURATION_VALUE.test(withoutRampReferences)) {
    context.report({ node, messageId: "rawDurationInStyle" });
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const durationOnTheRamp = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require durations to come off the timing ramp in app/globals.css, in both class names and JSX style objects.",
    },
    schema: [],
    messages: {
      rawDurationInClassName:
        "Raw duration in a class name. Durations come off the timing ramp (app/globals.css) — write duration-[var(--dur-fast)] (or whichever token fits) rather than a bare Tailwind duration utility or an arbitrary millisecond value (issue #332).",
      rawDurationInStyle:
        "Raw duration in a style object. Durations come off the timing ramp (app/globals.css) — reference the token with var(--dur-fast) (or whichever fits) rather than a literal millisecond or second value (issue #332).",
    },
  },

  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (node.name.name !== "className" && node.name.name !== "class") return;
        if (!node.value) return;

        const parts = [];
        collectStringParts(node.value, parts);
        for (const part of parts) checkClassNameNode(context, part);
      },

      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") return;
        if (!looksLikeAClassNameConstant(node.id.name)) return;
        if (!node.init) return;

        const parts = [];
        collectStringParts(node.init, parts);
        for (const part of parts) checkClassNameNode(context, part);
      },

      Property(node) {
        if (node.computed) return;
        const keyName = node.key.type === "Identifier" ? node.key.name : null;
        if (keyName === null || !CSS_TIMING_KEYS.has(keyName)) return;

        const parts = [];
        collectStringParts(node.value, parts);
        for (const part of parts) checkStyleValueNode(context, part);
      },
    };
  },
};

export default durationOnTheRamp;
