import { readFileSync, readdirSync, statSync } from "node:fs";
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
 * Every file the palette can reach — what ships, and only that.
 *
 * `tests` is skipped for the same reason `docs` and `design` are: a suite that asserts
 * *"the markup contains no shadow"* has the word in a regex, and a sweep that counted it
 * would report this file for containing the rule it enforces.
 */
function sourceFiles(): string[] {
  const found: string[] = [];
  const skip = new Set([
    "node_modules",
    ".next",
    ".git",
    "docs",
    "design",
    "drizzle",
    "fixtures",
    "tests",
  ]);

  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(name)) found.push(path);
    }
  })(ROOT);

  return found;
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

  it("finds the source tree it means to sweep", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no non-inset box-shadow", () => {
    const offenders: string[] = [];

    for (const path of files) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const shadow = /box-shadow:\s*([^;]+)/.exec(line);
          if (shadow && !shadow[1].includes("inset")) {
            offenders.push(`${path.slice(ROOT.length + 1)}:${i + 1} — ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });

  it("has no Tailwind shadow or drop-shadow utility that is not an inset ring", () => {
    const offenders: string[] = [];

    /**
     * Class lists only. The first draft of this swept raw lines and reported thirteen
     * files, every one of them a *comment* explaining that the design casts no shadow —
     * including two in this file. Prose about a rule is not a breach of it, so the sweep
     * reads string literals, which is where a class list can actually be.
     */
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const lineOf = (index: number) => source.slice(0, index).split("\n").length;

      const literals = path.endsWith(".css")
        ? // Strip `/* … */` before looking, then treat what is left as one list: a
          // utility can only reach CSS through `@apply`.
          [[source.replace(/\/\*[\s\S]*?\*\//g, ""), 0] as const]
        : [...source.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map(
            (m) => [m[1] ?? m[2] ?? "", m.index ?? 0] as const,
          );

      for (const [literal, index] of literals) {
        for (const token of literal.split(/[\s]+/)) {
          if (!/^(?:drop-shadow|shadow)(?:-.*)?$/.test(token)) continue;
          // `shadow-[inset_0_0_0_1px_var(--color-hair)]` is a hairline ring drawn
          // inside the box — the same thing `field-well` does with `box-shadow: inset`.
          if (token.includes("inset")) continue;
          offenders.push(`${path.slice(ROOT.length + 1)}:${lineOf(index)} — ${token}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("no heading renders lighter than the body beneath it", () => {
  /**
   * The token relationship is asserted above; this is the call-site half of the same
   * criterion. A heading is only as dark as the utility it carries, and the audit found
   * three that carried the wrong one — including the two largest headings in the
   * application, which were drawn at the body colour while every smaller screen title
   * was inked.
   *
   * `text-dim` on a heading is the failure this names. The label register is a separate
   * question and deliberately out of it: `code-line`/`label-line` heads are 10.5px
   * uppercase furniture, not a heading over prose, and they were `--dim` before this
   * change too.
   */
  const headings: Array<[string, string]> = [
    ["app/(signed-in)/titles/[kind]/[tmdbId]/page.tsx", "bill-title mt-5 text-bill-xl text-ink"],
    ["app/(signed-in)/library/programme-note-content.tsx", "bill-title mt-5 text-bill-xl text-ink"],
    ["app/(signed-in)/lists/[listId]/list-title-row.tsx", "bill-title text-bill-md text-ink"],
  ];

  it.each(headings)("%s inks its title heading", (path, className) => {
    expect(readFileSync(join(ROOT, path), "utf8")).toContain(className);
  });

  it("no bill-title or screen-title heading is dimmed", () => {
    const offenders: string[] = [];

    for (const path of sourceFiles()) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/\b(?:bill-title|screen-title)\b/.test(line)) return;
          if (!/\btext-dim\b/.test(line)) return;
          offenders.push(`${path.slice(ROOT.length + 1)}:${i + 1} — ${line.trim()}`);
        });
    }

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

  it("records that --dim does not, so the regression cannot go quiet", () => {
    /**
     * **This is a documented failure, not a passing bar.** The handoff's `--dim`
     * (`#929086`) is 2.93:1 on `--ground`, down from the 3.32:1 it replaced — below AA
     * for normal text (4.5:1) and now below the large-text floor (3:1) as well. It
     * carries the metadata line at 12–13px.
     *
     * It is adopted as given because #255's first criterion is fidelity to the
     * handoff's table, and darkening one value while claiming to have adopted it would
     * leave the stylesheet un-diffable against the document it cites. This assertion
     * pins the number so that the day someone fixes it, this test fails and makes them
     * say so — and so that nobody re-derives the value by accident in the meantime.
     */
    const onGround = contrast(declaredOnce("dim"), declaredOnce("ground"));

    expect(onGround).toBeGreaterThan(2.9);
    expect(onGround).toBeLessThan(3.0);
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
