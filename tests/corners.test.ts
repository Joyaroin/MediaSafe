import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The corners, asserted against the scale they claim to come from — issue #318.
 *
 * There was no scale. Radii lived as per-surface Tailwind utilities at the call site —
 * `rounded-full`, `rounded-2xl`, the linen redesign's `9–22px` on cards, fields and chips —
 * plus two custom properties, `--poster-radius` and `--still-radius`, each defaulting to
 * `7px` and set at call sites as raw pixels (`[--poster-radius:10px]` and its siblings).
 * Nine distinct raw values did nine different jobs, and adjusting "rounder" meant finding
 * all nine.
 *
 * `app/globals.css` now declares one radius scale — `--radius-none` through `--radius-7`,
 * and `--radius-full` — and every one of those nine raw values is retired in favour of it,
 * one notch rounder than what it replaced. `--poster-radius` and `--still-radius` keep
 * their names, exactly as `DESIGN.md` records, and take their values from the scale rather
 * than a literal.
 *
 * Two checks, matching `tests/palette.test.ts` and `tests/press-spring.test.ts`'s own
 * habits:
 *
 *  1. **The scale exists in exactly one declaration site**, and each step is the value
 *     `RATCHET` below says it is — the "one notch rounder" arithmetic, written down rather
 *     than trusted to memory.
 *  2. **A whole-source-tree sweep.** No raw radius survives outside the scale: no
 *     `rounded-full`/`rounded-2xl`/…, no `rounded-[10px]`, no `[--poster-radius:10px]`, no
 *     literal `border-radius: 12px`. Comments are blanked before matching, the same reason
 *     `underline-audit.test.ts` blanks them — this file's own prose names the very numbers
 *     it forbids.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

/** Comments blanked to spaces — same length, so a reported offset still points at the
 *  right place. Every structural check below reads this rather than the raw source. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length))
    .replace(/\/\/.*/g, (line) => " ".repeat(line.length));
}

const CSS = sourceAt("app/globals.css");
const CSS_CODE = stripComments(CSS);

/**
 * **The ratchet.** Every raw value this ticket found, and the step that replaces it. Each
 * new value is the next rung a neighbouring old value already sat on — literally "one notch
 * rounder than the value it replaces" — except the top of the ladder, which has nothing
 * historical above it, and the two pills, which were already a full round of their own
 * element and cannot be rounder than that.
 */
const RATCHET: { readonly token: string; readonly value: string; readonly was: string }[] = [
  { token: "--radius-none", value: "0px", was: "0 — unchanged, the floor" },
  { token: "--radius-1", value: "8px", was: "7 — the poster/still default" },
  { token: "--radius-2", value: "9px", was: "8 — the film rail poster, the Up next still" },
  { token: "--radius-3", value: "10px", was: "9 — the search result poster" },
  { token: "--radius-4", value: "12px", was: "10 — the Up next tile, library cell and list posters" },
  { token: "--radius-5", value: "16px", was: "12 — the field well and four more posters" },
  { token: "--radius-6", value: "18px", was: "16 — rounded-2xl, on every card" },
  { token: "--radius-7", value: "24px", was: "18 — the programme note card" },
  { token: "--radius-full", value: "9999px", was: "rounded-full, and the two pills already at their own half-height" },
];

/** Every declaration of a custom property in the stylesheet, so a second one is a failure
 *  and not a shadow — `tests/press-spring.test.ts`'s own `declaredOnce`. */
function declaredOnce(name: string): string {
  const all = [...CSS_CODE.matchAll(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm"))];
  expect(all, `${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].trim();
}

describe("a named radius scale exists in exactly one declaration site", () => {
  for (const step of RATCHET) {
    it(`${step.token} is ${step.value} (was ${step.was})`, () => {
      expect(declaredOnce(step.token)).toBe(step.value);
    });
  }
});

describe("--poster-radius and --still-radius keep their names and read the scale", () => {
  it("poster's default reads --radius-1, not a literal", () => {
    expect(CSS_CODE).toMatch(/@utility poster \{[\s\S]*?border-radius:\s*var\(--poster-radius,\s*var\(--radius-1\)\);/);
  });

  it("still's default reads --radius-1, not a literal", () => {
    expect(CSS_CODE).toMatch(/@utility still \{[\s\S]*?border-radius:\s*var\(--still-radius,\s*var\(--radius-1\)\);/);
  });

  it("no call site sets a raw pixel value into either custom property", () => {
    const raw = [...CSS_CODE.matchAll(/border-radius:\s*var\(--(?:poster|still)-radius,\s*([^)]+)\)/g)];
    for (const [, fallback] of raw) {
      expect(fallback.trim(), "the fallback must itself be a scale step").toMatch(/^var\(--radius-/);
    }
  });
});

/** Every `.ts`/`.tsx` file under `app/` and `errors/` — the two directories the audit found
 *  a raw radius in — relative to the repository root. A repo-wide walk and not a fixed
 *  list, for `underline-audit.test.ts`'s own reason: a fixed list is exactly how this drifts. */
function radiusSourceFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(path.relative(REPOSITORY_ROOT, full));
    }
  }

  walk(path.join(REPOSITORY_ROOT, "app"));
  walk(path.join(REPOSITORY_ROOT, "errors"));
  return files;
}

/** A raw radius in TS/TSX: a Tailwind radius keyword, or an arbitrary bracket — plain or on
 *  `--poster-radius`/`--still-radius` — whose content is not a `var(--radius-…)` read. */
function rawRadiusIn(source: string): string[] {
  const hits: string[] = [];

  for (const match of source.matchAll(/\brounded(?:-[a-z]{1,2})?-(none|full|xs|sm|md|lg|xl|2xl|3xl)\b/g)) {
    hits.push(match[0]);
  }

  for (const match of source.matchAll(/\[--(?:poster|still)-radius:([^\]]*)\]/g)) {
    if (!/^var\(--radius-/.test(match[1].trim())) hits.push(match[0]);
  }

  for (const match of source.matchAll(/rounded(?:-[a-z]{1,2})?-\[([^\]]*)\]/g)) {
    if (!/^var\(--radius-/.test(match[1].trim())) hits.push(match[0]);
  }

  return hits;
}

describe("no raw radius survives under app/ or errors/", () => {
  it("finds none", () => {
    const violations = radiusSourceFiles()
      .map((file) => ({ file, hits: rawRadiusIn(stripComments(sourceAt(file))) }))
      .filter((entry) => entry.hits.length > 0);

    expect(violations).toEqual([]);
  });

  it("is looking at a tree that has files in it", () => {
    expect(radiusSourceFiles().length).toBeGreaterThan(50);
  });
});

describe("no raw border-radius survives in the stylesheet outside the scale", () => {
  it("finds none", () => {
    const violations = [
      ...CSS_CODE.matchAll(/border-radius:\s*([^;]+);/g),
    ].map((match) => match[1].trim());

    for (const value of violations) {
      expect(value, `border-radius: ${value} must read a --radius-* / --poster-radius / --still-radius var`).toMatch(
        /^var\(--(?:radius-[a-z0-9]+|poster-radius|still-radius)/,
      );
    }
  });
});

describe("the check can fail", () => {
  it("reports a raw Tailwind radius keyword", () => {
    expect(rawRadiusIn('<div className="rounded-full" />')).toEqual(["rounded-full"]);
  });

  it("reports a raw arbitrary radius", () => {
    expect(rawRadiusIn('<div className="rounded-[10px]" />')).toEqual(["rounded-[10px]"]);
  });

  it("reports a raw --poster-radius", () => {
    expect(rawRadiusIn('<div className="[--poster-radius:10px]" />')).toEqual([
      "[--poster-radius:10px]",
    ]);
  });

  it("ignores a radius read through the scale", () => {
    expect(rawRadiusIn('<div className="rounded-[var(--radius-4)]" />')).toEqual([]);
    expect(rawRadiusIn('<div className="[--poster-radius:var(--radius-4)]" />')).toEqual([]);
  });

  it("ignores a radius mentioned only in a comment", () => {
    expect(
      rawRadiusIn(stripComments("// was rounded-full\nconst x = 1;")),
    ).toEqual([]);
  });
});
