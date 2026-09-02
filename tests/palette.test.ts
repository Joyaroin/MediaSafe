import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The palette, asserted against the document it claims to come from.
 *
 * Issue #255 exists because the seven colour tokens carried an *exploration* board's
 * turn 9 while the stylesheet cited `design_handoff_phone_linen` — a name, not a path,
 * pointing at nothing committed. Nobody could check the values against anything, so
 * nobody did, and all seven had drifted from the handoff that actually landed.
 *
 * The fix is not "the right hex is in the file now". It is that the handoff is committed
 * and **this test reads both**, so a value that drifts again fails CI rather than waiting
 * for someone to notice a heading looks wrong. That is the whole point: the audit was the
 * ticket, and an audit nothing re-runs is a one-time opinion.
 *
 * Everything here is a string and arithmetic — no DOM, no browser, no snapshot. Issue
 * #245's testing decisions rule a browser runner out of this suite by name, and a
 * contrast ratio is a pure function of two hex values.
 */

const ROOT = join(__dirname, "..");
const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

/**
 * The stylesheet with its comments blanked to spaces — same length, so a character
 * offset still points at the same place, which the source-order assertion depends on.
 *
 * Every structural check below reads this rather than `CSS`. `globals.css` is two-thirds
 * prose by volume, and that prose *names the things it forbids*: the block explaining
 * that `--well`, `--body` and `--rule-soft` are not declared contains all three names,
 * and the one explaining why the explicit dark rule must follow the media query quotes
 * both selectors. Searching the raw file finds the argument and reports it as the breach.
 */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));
const HANDOFF = readFileSync(
  join(ROOT, "docs/design/prototypes/mediasafe-mobile-handoff.md"),
  "utf8",
);
const DESIGN_DOC = readFileSync(join(ROOT, "DESIGN.md"), "utf8");

/** The seven the handoff supplies. `--ink` is ours and is asserted separately. */
const HANDOFF_TOKENS = [
  "ground",
  "raised",
  "hair",
  "text",
  "dim",
  "accent",
  "accent-ink",
] as const;

/**
 * Reads a declaration out of the stylesheet **and proves there is only one of it**.
 * `--ground: …` appearing twice is the drift this file's one-declaration-site argument
 * exists to prevent, so two matches is a failure rather than a first-wins read.
 */
function declaredOnce(name: string): string {
  const all = [...CSS_CODE.matchAll(new RegExp(`^\\s*--${name}:\\s*(#[0-9a-f]{6});`, "gim"))];
  expect(all, `--${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].toLowerCase();
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the seven tokens carry the handoff's values", () => {
  /**
   * The handoff's table is fenced CSS inside the committed Markdown. Parsed rather than
   * transcribed, so this test cannot agree with a stylesheet that both drifted the same
   * way — the document is the authority and the code is what is being checked.
   */
  const fromHandoff = new Map(
    [...HANDOFF.matchAll(/^\s*--([a-z-]+):\s*(#[0-9a-f]{6});/gim)].map(
      ([, name, hex]) => [name, hex.toLowerCase()] as const,
    ),
  );

  it("finds all seven in the committed handoff", () => {
    // Guards the parse itself: a renamed heading or a reformatted fence would otherwise
    // make every assertion below vacuously pass against an empty map.
    for (const token of HANDOFF_TOKENS) {
      expect(fromHandoff.get(token), `the handoff must state --${token}`).toMatch(
        /^#[0-9a-f]{6}$/,
      );
    }
  });

  it.each(HANDOFF_TOKENS)("--%s matches, and is declared once", (token) => {
    expect(declaredOnce(token)).toBe(fromHandoff.get(token));
  });

  /**
   * `DESIGN.md`'s §2 table is the third place these seven appear, and until #255 nothing
   * read it — so it had gone on quoting #134's Catalogue Wall values through two palette
   * changes, describing a `#ffffff` raised step against a `#f6f5f3` ground that no build
   * had produced in months. A table nobody checks is not documentation of the palette, it
   * is a second palette, and it is the exact drift this ticket exists to end.
   */
  const fromDesignDoc = new Map(
    [...DESIGN_DOC.matchAll(/^\|\s*`--([a-z-]+)`\s*\|[^|]*\|\s*`(#[0-9a-f]{6})`\s*\|/gim)].map(
      ([, name, hex]) => [name, hex.toLowerCase()] as const,
    ),
  );

  it("finds the seven in DESIGN.md's own table", () => {
    for (const token of HANDOFF_TOKENS) {
      expect(fromDesignDoc.get(token), `DESIGN.md §2 must list --${token}`).toMatch(
        /^#[0-9a-f]{6}$/,
      );
    }
  });

  it.each(HANDOFF_TOKENS)("DESIGN.md's --%s agrees with the stylesheet", (token) => {
    expect(fromDesignDoc.get(token)).toBe(declaredOnce(token));
  });
});

describe("every design path a comment cites resolves to a committed file", () => {
  /**
   * The failure #255 exists to end, made mechanical.
   *
   * `globals.css` cited the palette's source as `design_handoff_phone_linen` — not a path,
   * not a file, nothing a reader could open — and because nothing checked, all seven values
   * drifted from the document that name was gesturing at. The parent spec names this as
   * the thing `tvtracker` already carries a dozen times.
   *
   * So: anything shaped like a path into `docs/design/` or `design/` must exist. This
   * cannot stop somebody writing a bare name again, but it does stop a *path* from rotting
   * — including the moment one of these prototypes is renamed and fifty comments quietly
   * stop resolving.
   */
  // `app/globals.css` is already in `sourceFiles()`; only `DESIGN.md` has to be added.
  const citingFiles = [join(ROOT, "DESIGN.md"), ...sourceFiles()];
  const cited = new Set<string>();

  for (const path of citingFiles) {
    for (const [, reference] of readFileSync(path, "utf8").matchAll(
      /`((?:docs\/)?design\/[\w./-]+\.(?:md|html|js))`/g,
    )) {
      cited.add(reference);
    }
  }

  it("finds the citations it means to check", () => {
    // Without this the assertion below passes by matching nothing at all — which is how a
    // sweep quietly stops being one.
    expect(cited.size).toBeGreaterThanOrEqual(3);
    expect([...cited]).toContain("docs/design/prototypes/mediasafe-mobile-handoff.md");
  });

  it("resolves every one of them", () => {
    const dangling = [...cited].filter((reference) => !existsSync(join(ROOT, reference)));

    expect(dangling).toEqual([]);
  });

  it("keeps the pathless name out of every file that is not explaining it", () => {
    /**
     * `design_handoff_phone_linen` is the string the stylesheet used to cite the palette
     * by. Two files are allowed to say it — `globals.css`, whose docblock explains what
     * replaced it, and `DESIGN.md`'s glossary — because naming the discarded term is how
     * a reader who meets it in an old branch finds out what it meant.
     *
     * Everywhere else it is a citation, and a citation to a name is what this whole
     * ticket is about. The exemption is two files rather than "comments", because there
     * is no mechanical difference between explaining a bad citation and making one, and
     * a rule that cannot tell them apart should name its exceptions instead of guessing.
     */
    const explaining = new Set(["app/globals.css", "DESIGN.md"]);
    const offenders = citingFiles
      .map(relative)
      .filter((path) => !explaining.has(path))
      .filter((path) => readFileSync(join(ROOT, path), "utf8").includes("design_handoff_phone_linen"));

    expect(offenders).toEqual([]);
  });
});

describe("the heading step", () => {
  it("is darker than the body colour in light, which is the whole reason it survives", () => {
    // The handoff's `--text` (`#34342f`) is darker than the `--ink` it replaced
    // (`#3d3c35`). Adopting the table without re-deriving `--ink` would have rendered
    // every heading in the application lighter than the body beneath it.
    const ink = declaredOnce("ink");
    const text = declaredOnce("text");

    expect(luminance(ink)).toBeLessThan(luminance(text));
  });

  it("keeps a real step rather than merely clearing the bar", () => {
    const ground = declaredOnce("ground");

    // A heading a rounding error darker than the body is not a hierarchy. The old
    // palette's step was 1.55x; the new body colour is far stronger, so a proportional
    // step would land on black. 1.2x is the floor this holds well above (1.32x).
    expect(contrast(declaredOnce("ink"), ground)).toBeGreaterThan(
      contrast(declaredOnce("text"), ground) * 1.2,
    );
  });

  it("is never lighter than the body colour in dark either", () => {
    // In dark the word "darker" inverts — a heading below `--dark-text` on a `#0a0a0b`
    // ground recedes into the page. `--dark-text` is already 18:1 there, so the dark
    // counterpart is declared deliberately equal. Equal is not lighter, which is the
    // property #255 is actually protecting.
    expect(luminance(declaredOnce("dark-ink"))).toBeGreaterThanOrEqual(
      luminance(declaredOnce("dark-text")),
    );
  });
});

describe("the three tokens the handoff proposes and this repository does not declare", () => {
  // Its artwork well is `--raised`, its soft rule is `--hair`, and its body colour is
  // `--text`. Declaring them would mean three more values to map twice for dark, against
  // a stylesheet whose entire argument is one declaration site per token.
  it.each(["well", "body", "rule-soft"])("--%s is not declared", (name) => {
    expect(CSS_CODE).not.toMatch(new RegExp(`^\\s*--${name}:`, "im"));
  });

  it.each(["bg-well", "text-body", "border-rule-soft"])(
    "%s is not a utility anything can reach for",
    (utility) => {
      expect(CSS_CODE).not.toContain(utility);
    },
  );
});

describe("both dark paths", () => {
  /**
   * Two selectors, not one: the system asked (`prefers-color-scheme` inside a media
   * query) and the reader answered (`[data-theme="dark"]`). They cannot share a block,
   * so what repeats is the mapping — and a token missing from one of the two is a
   * colour that silently keeps its light value for half the readers in dark.
   */
  const mapped = ["ground", "raised", "hair", "text", "dim", "accent", "accent-ink", "ink"];

  const systemBlock = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\}/.exec(
    CSS_CODE,
  );
  const chosenBlock = /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/.exec(CSS_CODE);

  it("both blocks are present", () => {
    expect(systemBlock, "the system-preference dark block").not.toBeNull();
    expect(chosenBlock, "the reader's explicit dark block").not.toBeNull();
  });

  it.each(mapped)("the system preference maps --%s", (token) => {
    expect(systemBlock?.[1]).toContain(`--${token}: var(--dark-${token});`);
  });

  it.each(mapped)("the reader's explicit choice maps --%s", (token) => {
    expect(chosenBlock?.[1]).toContain(`--${token}: var(--dark-${token});`);
  });

  it("the explicit choice wins, which is a matter of source order and nothing else", () => {
    // `:root[data-theme="dark"]` and `:root:not([data-theme="light"])` have identical
    // specificity — `:not()` takes its argument's. Moving the explicit rule above the
    // media query would silently stop a reader's chosen *Dark* winning on a device set
    // to light, and no specificity calculation would warn anyone.
    expect(CSS_CODE.indexOf(':root[data-theme="dark"]')).toBeGreaterThan(
      CSS_CODE.indexOf("@media (prefers-color-scheme: dark)"),
    );
  });
});
/**
 * The directories that ship, walked from their own roots.
 *
 * **Rooted, not filtered.** The first draft walked the repository root with a skip-list
 * and no `.claude` entry in it, so it swept `.claude/worktrees/` — 2107 files from
 * twenty-one sibling branches, against 228 real ones. Every sweep below was auditing
 * other people's work-in-progress, and the "did we find anything" guard passed on the
 * strength of it. Naming the three directories that render is the fix: a skip-list is a
 * claim about everything that exists, and this repository grows directories.
 */
const SHIPPING_DIRECTORIES = ["app", "errors", "lib"];

function sourceFiles(): string[] {
  const found: string[] = [];

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(name)) found.push(path);
    }
  }

  for (const dir of SHIPPING_DIRECTORIES) walk(join(ROOT, dir));
  return found;
}

/**
 * Source with comments blanked — block and line, and length preserved so an offset still
 * points at the right line.
 *
 * Every sweep reads this. This repository comments at length *about the rules it keeps*,
 * so a sweep over raw text finds the explanation and reports it as the breach: the first
 * draft of the shadow sweep named thirteen files, every one of them a comment saying the
 * design casts no shadow. `tests/underline-audit.test.ts` strips for the same reason and
 * says so in the same words.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
}

/** Every whitespace-separated token of every string literal — where a class list can be. */
function classTokens(source: string): Array<{ token: string; index: number }> {
  const out: Array<{ token: string; index: number }> = [];

  // Single quotes as well as double and backtick. Leaving `'…'` out was a false pass
  // waiting to happen — nothing in the linter makes a class list pick its quote.
  for (const match of source.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const body = match[1] ?? match[2] ?? match[3] ?? "";
    for (const token of body.split(/\s+/)) {
      if (token) out.push({ token, index: match.index ?? 0 });
    }
  }

  return out;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function relative(path: string): string {
  return path.slice(ROOT.length + 1);
}

describe("no drop shadow appears anywhere", () => {
  /**
   * The handoff's Geometry table: *none on cards — the `--raised` / `--ground` step is
   * the only lift*. That step is why the redesign inverted `--raised` below `--ground`
   * in the first place, so a shadow anywhere is the redesign arguing with itself.
   *
   * `inset` is a different thing wearing the same property name — a hairline ring drawn
   * inside the box, which is how `field-well` and the up-next tile draw their borders.
   */
  const files = sourceFiles();

  it("sweeps the shipping tree and nothing else", () => {
    // Both halves matter. Too few means the walk broke and every sweep below is vacuous;
    // too many means it has escaped into `.claude/worktrees` again, which is exactly how
    // this started.
    expect(files.length).toBeGreaterThan(100);
    expect(files.length).toBeLessThan(600);

    // Relative, not absolute. The repository's own worktrees live *under*
    // `.claude/worktrees/`, so when this suite runs inside one every absolute path
    // contains the string and the guard reads as a permanent failure — which is what the
    // first version of this line did.
    expect(files.map(relative).filter((path) => path.startsWith(".claude"))).toEqual([]);
    expect(
      files.map(relative).every((path) => SHIPPING_DIRECTORIES.some((d) => path.startsWith(d))),
    ).toBe(true);
  });

  it("has no non-inset box-shadow", () => {
    const offenders: string[] = [];

    for (const path of files) {
      const source = readFileSync(path, "utf8");

      // Matched against the whole file rather than line by line: a declaration wrapped
      // across two lines is still one declaration, and a line-based scan reads the tail
      // of it as ordinary text and lets it through.
      for (const match of code(source).matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
        if (match[1].includes("inset")) continue;
        offenders.push(
          `${relative(path)}:${lineOf(source, match.index ?? 0)} — ${match[1].trim()}`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("has no Tailwind shadow or drop-shadow utility that is not an inset ring", () => {
    const offenders: string[] = [];

    /**
     * `(?:[\w-]+:)*` is the half the first draft was missing, and it made the sweep a
     * decoration rather than a check: `hover:shadow-md` and `md:shadow-lg` are exactly
     * how a shadow would arrive in a Tailwind codebase, and neither matched.
     *
     * `shadow-none` is excluded because it removes one.
     */
    const SHADOW = /^(?:[\w-]+:)*(?:drop-shadow|shadow)(?:-.+)?$/;

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const stripped = code(source);

      const tokens = path.endsWith(".css")
        ? // A utility can only reach CSS through `@apply`, so the whole stripped file is
          // one list rather than a set of literals to find.
          stripped.split(/\s+/).map((token) => ({ token, index: 0 }))
        : classTokens(stripped);

      for (const { token, index } of tokens) {
        if (!SHADOW.test(token)) continue;
        // `shadow-[inset_0_0_0_1px_var(--color-hair)]` is a hairline ring drawn inside
        // the box — the same thing `field-well` does with `box-shadow: inset`.
        if (token.includes("inset") || token.endsWith("shadow-none")) continue;
        offenders.push(`${relative(path)}:${lineOf(source, index)} — ${token}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * ── The press's depth — issue #284 ──────────────────────────────────────────────────
 *
 * Scale alone reads flat at any amount, so #279 gives the press depth as well as size, and
 * the depth it gives it is **the one this palette already has**: the `--raised` / `--ground`
 * step the handoff's Geometry table calls *the only lift there is*. A pressed surface paints
 * the ground tone over its own raised, at its own radius, and comes back on release.
 *
 * It is asserted here rather than in `tests/press-spring.test.ts` because the properties are
 * this suite's own: the sweep above proves the application casts no shadow, and the block at
 * the top of `app/globals.css` proves the accent means *recorded* and nothing else. The tone
 * step is the first thing since either rule was written that could quietly break both — a
 * press is exactly where a shadow or a tint would look reasonable — so it is checked beside
 * them rather than beside the spring arithmetic.
 */

/** The body of the `@utility pressable` block, comments already blanked. */
function pressableUtility(): string {
  const match = CSS_CODE.match(/@utility pressable \{[\s\S]*?\n\}/);
  expect(match, "globals.css must still declare `@utility pressable`").not.toBeNull();
  return match![0];
}

/**
 * The innermost rules of a block — selector list and declarations. Read structurally rather
 * than grepped for a spelling, so the assertions below are about *what the stylesheet does*
 * and not about how the selector happens to be typed.
 */
function nestedRules(block: string): Array<{ selector: string; body: string }> {
  return [...block.matchAll(/([^{}();]+?)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, " "),
    body: match[2].trim(),
  }));
}

/** A motion token's single declared value — `--dur-press`, an easing, a duration. */
function motionToken(name: string): string {
  const all = [...CSS_CODE.matchAll(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm"))];
  expect(all, `${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].trim();
}

/** The property names a declaration list sets — `background-color: var(--ground);` → the name. */
function propertiesOf(declarations: string): string[] {
  return declarations
    .split(";")
    .map((declaration) => declaration.split(":")[0].trim())
    .filter((property) => /^[a-z-]+$/.test(property));
}

/** The properties a block declares itself, with every nested rule removed first. */
function ownProperties(block: string): string[] {
  return propertiesOf(block.replace(/[^{}();]+?\{[^{}]*\}/g, " ").replace(/^[^{]*\{/, ""));
}

/** Every rule inside `pressable` that paints a background — the tone step, and only it. */
function toneRules(): Array<{ selector: string; body: string }> {
  return nestedRules(pressableUtility()).filter((rule) => /background/.test(rule.body));
}

/** Every rule in the stylesheet that applies to a pressed element, `&` resolved. */
function pressRules(): Array<{ selector: string; body: string }> {
  return [
    ...nestedRules(pressableUtility()).map((rule) => ({
      ...rule,
      selector: rule.selector.replace(/&/g, ".pressable"),
    })),
    ...nestedRules(CSS_CODE).filter((rule) => rule.selector.includes(".pressable")),
  ];
}

/** The two blocks that repaint the palette in dark — the media query and the explicit choice. */
function darkBlocks(): string[] {
  return [...CSS_CODE.matchAll(/:root(?:\[data-theme="dark"\]|:not\(\[data-theme="light"\]\))\s*\{[^}]*\}/g)].map(
    (match) => match[0],
  );
}

describe("a pressed surface settles toward the ground", () => {
  it("paints the ground token while the press is held", () => {
    const tone = toneRules();

    // One rule, not two: `:active` is what the platform gives a mouse and a keyboard,
    // `data-pressed` is what the delegated listener gives a finger, and two declarations
    // would be two opinions about what *pressed* means.
    expect(tone).toHaveLength(1);
    expect(tone[0].selector).toContain(":active");
    expect(tone[0].selector).toContain('[data-pressed="true"]');

    // The token itself, not a hex and not a mix. `--ground` is one of the seven the
    // handoff supplies and both dark paths remap, which is the whole of why this works
    // in light and dark without a second declaration.
    expect(tone[0].body).toMatch(/^background-color:\s*var\(--ground\);?$/);
  });

  it("takes the compression's own 100ms, and gives it back on release", () => {
    const transition = pressableUtility().match(/transition:([^;]+);/);
    expect(transition, "`pressable` must still declare a transition").not.toBeNull();

    // The tone runs for the length of the compression — the same token, so the two
    // halves of the press cannot drift into different durations.
    expect(transition![1]).toMatch(
      /background-color\s+var\(--dur-press\)\s+var\(--ease-out-quart\)/,
    );
    expect(motionToken("--dur-press")).toBe("100ms");

    // And it returns. Nothing paints a background unconditionally, so the release drops
    // the rule and the element falls back to the surface it already had — through the
    // same transition, which is what makes the return an animation rather than a cut.
    expect(ownProperties(pressableUtility()).filter((p) => p.startsWith("background"))).toEqual(
      [],
    );
  });

  it("does not overshoot in either direction", () => {
    // A colour has no mass to carry past the tone it is heading for, so the step is an
    // ease and never the pop's curve. An easing whose ordinates stay inside [0,1] cannot
    // produce a value outside its two endpoints; `linear()` sampled from a spring can,
    // and that is exactly what `press-pop` is for.
    const easing = motionToken("--ease-out-quart");
    expect(easing).toMatch(/^cubic-bezier\([^)]+\)$/);

    const [, y1, , y2] = easing
      .replace(/^cubic-bezier\(|\)$/g, "")
      .split(",")
      .map(Number);
    for (const ordinate of [y1, y2]) {
      expect(ordinate).toBeGreaterThanOrEqual(0);
      expect(ordinate).toBeLessThanOrEqual(1);
    }

    const tone = toneRules()[0];
    expect(tone.body).not.toMatch(/animation|linear\(/);
  });

  it("gives a bare control with no surface of its own no backplate", () => {
    // Of the twenty-five call sites only two carry a surface on the same element; the
    // rest are transparent links and buttons inside somebody else's raised surface, and
    // a ground painted on one of those is a backplate the design never drew. So the step
    // is qualified by the element having a surface, and it means one thing everywhere.
    expect(toneRules()[0].selector).toContain(".bg-raised");

    // Nothing else in the stylesheet paints a background on a press, qualified or not —
    // an unqualified rule anywhere would put the backplate back.
    const painting = pressRules().filter((rule) =>
      propertiesOf(rule.body).some((property) => property.startsWith("background")),
    );
    expect(painting).toHaveLength(1);
    expect(painting[0].selector).toContain(".bg-raised");

    // And no pseudo-element, which is the other way a backplate arrives.
    expect(CSS_CODE).not.toMatch(/\.pressable[^{]*::(?:before|after)/);
  });

  it("paints at the pressed element's own radius, so it declares none", () => {
    // A background is clipped by whatever `border-radius` the call site set, which is why
    // the step needs no radius of its own and adds no radius token. Anything else here —
    // an inset, a clip, a second box — would be this file having an opinion about a
    // measure that belongs to the call site.
    expect(propertiesOf(toneRules()[0].body)).toEqual(["background-color"]);
  });

  it("raises no shadow and never reaches for the accent", () => {
    // Both are rules older than the press and both are exactly where a press would break
    // them: there are no drop shadows anywhere in this application — the tone step is
    // what replaced them — and colour here means *this was recorded*, so a control that
    // tints under a thumb claims to have written something it has not.
    for (const rule of pressRules()) {
      expect(rule.body, rule.selector).not.toMatch(/box-shadow|drop-shadow/);
      expect(rule.body, rule.selector).not.toMatch(/accent/);
    }
  });

  it("adds no token, and therefore works in light and in dark", () => {
    // The step is `--ground` over `--raised`, and both are among the seven the handoff
    // supplies and both dark paths remap — so one declaration serves both schemes, which
    // is the whole argument of the block at the top of the stylesheet.
    expect(HANDOFF_TOKENS).toContain("ground");

    // Both dark paths, and there are two of them — the system's answer and the reader's.
    // Checking a list nobody counted is how this assertion would pass against none.
    const dark = darkBlocks();
    expect(dark).toHaveLength(2);
    for (const block of dark) expect(block).toMatch(/--ground:\s*var\(--dark-ground\)/);

    // Nothing new was declared to get here — no tone, no elevation, no blur, no radius.
    const declared = [...CSS_CODE.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((match) => match[1]);
    expect(
      declared.filter((name) => /shadow|elevation|blur|press-tone|pressed/.test(name)),
    ).toEqual([]);
  });

  it("drops the animation under reduced motion and keeps the state", () => {
    const reduced = [
      ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g),
    ]
      .map((match) => match[0])
      .filter((block) => /\.pressable[^[]/.test(block));

    expect(reduced).toHaveLength(1);

    // The transition goes, so the tone changes instantly rather than over 100ms — the
    // same one line that already drops the compression, because the tone rides the same
    // transition rather than a second mechanism that would need its own opt-out.
    expect(reduced[0]).toMatch(/\.pressable\s*\{[\s\S]*?transition:\s*none/);

    // What must *not* happen: the pressed state itself is untouched. A reduced-motion
    // block that unpainted the ground would answer a finger with nothing at all, and
    // `DESIGN.md` §6 is explicit — pressed is still pressed, it stops moving to get there.
    for (const rule of nestedRules(reduced[0])) {
      expect(propertiesOf(rule.body).filter((property) => property.startsWith("background")))
        .toEqual([]);
    }
  });

  it("leaves `pressable` where it was, and never on a raised parent", () => {
    /**
     * The alternative to a self-painting element is moving `pressable` up onto the raised
     * parent, and #279 rejects it by name: on the Up next episode card the checkmark is a
     * *sibling* inside that raised `<li>`, so the whole card would scale when the check is
     * pressed. This is that rejection made checkable — the tone step is not allowed to buy
     * its simplicity by restructuring markup.
     */
    const carriers: string[] = [];

    for (const path of sourceFiles()) {
      if (path.endsWith(".css")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of code(source).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const list = (match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/);
        if (list.includes("pressable") && list.includes("bg-raised")) carriers.push(relative(path));
      }
    }

    expect(carriers.sort()).toEqual([
      "app/(signed-in)/library/lists-rail.tsx",
      "app/(signed-in)/up-next/upcoming-row.tsx",
    ]);
  });

  it("is recorded in DESIGN.md as the whole of the press's depth", () => {
    const at = DESIGN_DOC.indexOf("#284");
    expect(at, "DESIGN.md must record the tone step").toBeGreaterThan(-1);

    // The entry has to say what the depth *is* and what it is not, because the two rules
    // it could quietly break are stated in this same document and a reader who finds only
    // "the press has depth now" learns nothing about either.
    // A window either side of the marker: the entry names the step in its own heading,
    // which sits before the issue number rather than after it.
    const entry = DESIGN_DOC.slice(Math.max(0, at - 400), at + 2000);
    expect(entry).toMatch(/`--raised`\s*\/\s*`--ground`|raised\/ground/);
    expect(entry).toMatch(/shadow/);
    expect(entry).toMatch(/accent/);
  });
});

describe("the three names the handoff proposes never reach a class list either", () => {
  // Asserted over the source tree as well as the stylesheet. Checking only `globals.css`
  // left the case that actually matters unguarded: a component reaching for `bg-well`
  // does not need the token declared to be wrong, it needs only to have been written.
  it.each(["bg-well", "text-body", "border-rule-soft"])("%s is used nowhere", (utility) => {
    const offenders: string[] = [];

    for (const path of sourceFiles()) {
      const source = readFileSync(path, "utf8");
      for (const { token, index } of classTokens(code(source))) {
        if (token === utility) offenders.push(`${relative(path)}:${lineOf(source, index)}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("no heading renders lighter than the body beneath it", () => {
  /**
   * The token relationship is asserted above; this is the call-site half of the same
   * criterion. A heading is only as dark as the utility it carries, and the audit found
   * three carrying the wrong one — including the two largest headings in the
   * application, drawn at the body colour while every smaller screen title was inked.
   *
   * **Properties, not a list of the three that were fixed.** A fixed list is what let
   * the underline drift to fourteen occurrences before anyone counted
   * (`tests/underline-audit.test.ts`, which says so in its own docblock), and it would
   * have caught none of these three, because none of them was on anybody's list.
   *
   * The label register is deliberately outside this. `code-line`/`label-line` heads are
   * 10.5px uppercase furniture rather than a heading over prose, and they were `--dim`
   * before this change as well — a real question, but not this ticket's.
   */
  const inClassLists = (predicate: (token: string) => boolean) => {
    const hits: Array<{ path: string; source: string; index: number }> = [];

    for (const path of sourceFiles()) {
      const source = readFileSync(path, "utf8");
      for (const match of code(source).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const body = match[1] ?? match[2] ?? match[3] ?? "";
        const tokens = body.split(/\s+/).filter(Boolean);
        if (tokens.some(predicate)) {
          hits.push({ path, source, index: match.index ?? 0 });
        }
      }
    }

    return hits;
  };

  const classListsWith = (needle: string) =>
    inClassLists((token) => token === needle).map(({ path, source, index }) => ({
      where: `${relative(path)}:${lineOf(source, index)}`,
      tokens: (code(source).slice(index).match(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/) ?? [""])[0]
        .split(/\s+/)
        .map((token) => token.replace(/["'`]/g, "")),
    }));

  it("finds the heading registers it means to check", () => {
    // The registers exist and are used; without this the three properties below pass by
    // finding nothing at all.
    expect(classListsWith("screen-title").length).toBeGreaterThanOrEqual(4);

    /**
     * **One, and it used to be two.**
     *
     * `text-bill-xl` was the title on both title screens — the owned one and the
     * catalogue one. The owned screen's restructure puts its title inside a hero card
     * beside a thumbnail rather than under a full-width poster, and 2.4rem in a 420px
     * pane beside an image is a title that wraps before it reads; it takes `text-bill-lg`
     * there now. Catalogue detail is unchanged and keeps the largest step.
     *
     * So the two title screens no longer set their titles alike, which is a real
     * divergence and is the accepted cost of restructuring one of them and not the other.
     * If catalogue detail ever takes the same hero, this floor goes back to two — and if
     * it drops to nought, the register is unused and the checks below have nothing to
     * check, which is what this line is for.
     */
    expect(classListsWith("text-bill-xl").length).toBeGreaterThanOrEqual(1);
  });

  it("inks every screen title", () => {
    const offenders = classListsWith("screen-title")
      .filter(({ tokens }) => !tokens.includes("text-ink"))
      .map(({ where }) => where);

    expect(offenders).toEqual([]);
  });

  it("inks every heading at the largest step in the ramp", () => {
    // `text-bill-xl` is 2.4rem — the biggest type the application sets. Both uses were
    // drawn at `--text` until #255, which is the inversion `--ink` exists to prevent.
    const offenders = classListsWith("text-bill-xl")
      .filter(({ tokens }) => !tokens.includes("text-ink"))
      .map(({ where }) => where);

    expect(offenders).toEqual([]);
  });

  it("dims no heading in either register", () => {
    const offenders = inClassLists(
      (token) => token === "bill-title" || token === "screen-title",
    )
      .filter(({ path, source, index }) => {
        const literal = code(source).slice(index).match(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/);
        void path;
        return (literal?.[0] ?? "").split(/\s+/).some((t) => t.replace(/["'`]/g, "") === "text-dim");
      })
      .map(({ path, source, index }) => `${relative(path)}:${lineOf(source, index)}`);

    expect(offenders).toEqual([]);
  });
});

describe("the contrast the palette actually ships", () => {
  it("keeps body text and headings well clear of WCAG AA on both surfaces", () => {
    for (const surface of ["ground", "raised"] as const) {
      const bg = declaredOnce(surface);
      expect(contrast(declaredOnce("text"), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(declaredOnce("ink"), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("holds --dim to a floor it currently sits on, and never lets it get lighter", () => {
    /**
     * `--dim` is the weakest thing in the palette. The handoff's `#929086` is 2.93:1 on
     * `--ground`, down from the 3.32:1 it replaced — below AA for normal text (4.5:1)
     * and now below the large-text floor (3:1) too, while carrying the metadata line at
     * 12–13px. It is adopted as given because #255's first criterion is fidelity to the
     * handoff's table, and the argument for that sits at the declaration site.
     *
     * **A floor, not a window.** The first draft asserted `< 3.0` as well, to pin the
     * number — which would have failed the day somebody darkened `--dim` to fix exactly
     * the problem the comment complains about. A test that blocks its own remedy is
     * worse than no test. Drift *back* toward the light is what this catches; drift
     * toward legibility is what it is supposed to allow.
     *
     * Nothing is lost by dropping the ceiling: `--dim` is already pinned to the
     * handoff's own value by the seven-token comparison above, so a change in either
     * direction still has to be deliberate and still has to update the document.
     */
    expect(contrast(declaredOnce("dim"), declaredOnce("ground"))).toBeGreaterThanOrEqual(2.9);
  });

  it("keeps type on the accent legible, which the accent-ink pairing exists for", () => {
    expect(contrast(declaredOnce("accent-ink"), declaredOnce("accent"))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(declaredOnce("dark-accent-ink"), declaredOnce("dark-accent")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * ── The route-level pending state waits behind a named delay — issue #301 ────────────
 *
 * `DESIGN.md` §9 measured the server render at 175–235ms for Up next and 156–235ms for
 * the library. Held invisible past the slower of those, a navigation that resolves before
 * the hold ends never shows the pending bars at all, and the existing fade and rise land
 * on real content instead of on a swap nobody caused.
 *
 * Asserted here in the same shape the motion tokens above already are — `motionToken()`
 * reads the one declaration site, the way `--dur-press` and `--dur-pop` are read for the
 * press — so the interval cannot drift from the ramp without this file noticing.
 */
describe("the route-level pending state waits behind a named delay", () => {
  it("declares the delay once, on the same ramp as every other duration", () => {
    // `motionToken` itself asserts there is exactly one declaration site.
    expect(motionToken("--dur-pending-hold")).toMatch(/^\d+ms$/);
  });

  it("clears the slower of the two measured renders, with room for jitter", () => {
    const ms = Number(motionToken("--dur-pending-hold").replace("ms", ""));
    // DESIGN.md §9: Up next 175–235ms, library 156–235ms.
    expect(ms).toBeGreaterThan(235);
  });

  it("holds with opacity, not display, so nothing reserves or drops layout", () => {
    const utility = CSS_CODE.match(/@utility route-pending-hold \{[\s\S]*?\n\}/);
    expect(utility, "globals.css must declare `route-pending-hold`").not.toBeNull();
    expect(utility![0]).toMatch(/opacity:\s*0;/);
    expect(utility![0]).not.toMatch(/display:\s*none/);
  });

  it("flips visible off the token, once, rather than fading over it", () => {
    // `animation-delay` is what gates the flip on `--dur-pending-hold`; the animation's
    // own duration is `1ms` — the flip itself, not a second entrance to animate. A read
    // that resolves first tears this node down before the delay ever elapses.
    const utility = CSS_CODE.match(/@utility route-pending-hold \{[\s\S]*?\n\}/)![0];
    expect(utility).toMatch(/animation:\s*route-pending-reveal\s+1ms\s+var\(--dur-pending-hold\)\s+forwards;/);

    const keyframes = CSS_CODE.match(/@keyframes route-pending-reveal \{[\s\S]*?\n\}/);
    expect(keyframes, "globals.css must declare the reveal keyframes").not.toBeNull();
    expect(keyframes![0]).toMatch(/opacity:\s*1;/);
  });

  /**
   * The ten `loading.tsx` files this ticket converts — `DESIGN.md` §9 radius 1, a whole
   * route's own pending state. `PendingLine`'s other three callers are radius 2
   * (`programme-note-episodes.tsx`) and radius 4 (`up-next-pending-card.tsx`,
   * `up-next-episode-row.tsx`) — a region or a tile pending beside content that has
   * already rendered — and §9 is explicit that a delayed region there is a blank gap,
   * not a read in progress, so those three must keep painting immediately.
   */
  const ROUTE_LOADING_FILES = [
    "app/(signed-in)/library/loading.tsx",
    "app/(signed-in)/up-next/loading.tsx",
    "app/(signed-in)/you/loading.tsx",
    "app/(signed-in)/lists/loading.tsx",
    "app/(signed-in)/lists/[listId]/loading.tsx",
    "app/(signed-in)/titles/[entryId]/loading.tsx",
    "app/(signed-in)/titles/[entryId]/remove/loading.tsx",
    "app/(signed-in)/catalogue/[kind]/[tmdbId]/loading.tsx",
    "app/(signed-in)/settings/loading.tsx",
    "app/(signed-in)/settings/delete-account/loading.tsx",
  ];

  const IMMEDIATE_PENDING_FILES = [
    "app/(signed-in)/library/programme-note-episodes.tsx",
    "app/(signed-in)/up-next/up-next-pending-card.tsx",
    "app/(signed-in)/up-next/up-next-episode-row.tsx",
  ];

  const pendingLineTag = (source: string): string => {
    const match = source.match(/<PendingLine[\s\S]*?\/>/);
    expect(match, "must render <PendingLine />").not.toBeNull();
    return match![0];
  };

  it("finds all ten route boundaries this ticket converts", () => {
    // Without this the two properties below would hold vacuously against a wrong path.
    for (const path of ROUTE_LOADING_FILES) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });

  it.each(ROUTE_LOADING_FILES)("%s holds its pending render", (path) => {
    expect(pendingLineTag(readFileSync(join(ROOT, path), "utf8"))).toMatch(/\bheld\b/);
  });

  it.each(IMMEDIATE_PENDING_FILES)("%s keeps painting immediately, unheld", (path) => {
    expect(pendingLineTag(readFileSync(join(ROOT, path), "utf8"))).not.toMatch(/\bheld\b/);
  });
});
