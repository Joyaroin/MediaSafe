import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Issue #330 — the plate line, and the dark poster ring that replaces it (the
 * spec-326 Polish section).
 *
 * A card reads as raised without a shadow, and artwork reads as mounted on the sheet
 * rather than pasted onto it, through one CSS device: an inset `box-shadow` at 9% ink,
 * mixed `in oklab` — a call-site expression, never a declared token, on the same argument
 * `tests/wrapping.test.ts` and `tests/corners.test.ts` already make for reading the
 * declaration sites as text rather than reaching for a browser that cannot render a shadow
 * any more legibly than a string can.
 *
 * Three things this file holds:
 *
 *  1. **The expression itself** — declared once as the reusable `plate-line` utility, and
 *     read (not re-declared) by `.poster` and `.still` for their light-scheme default.
 *  2. **The dark poster ring** — both dark selectors (`prefers-color-scheme` and the
 *     explicit `data-theme="dark"`) override `.poster`/`.still` to the hairline token
 *     instead, so artwork carries exactly one ring, never both.
 *  3. **Every raised container**, swept the way `tests/accent-sweep.test.ts` sweeps the
 *     accent: a manifest of every `bg-raised` site under `app/`, each one either a
 *     documented raised container that must carry `plate-line` or a documented exception
 *     (a control, a chip, a hover-only fill, an avatar well, artwork's own internal
 *     filler) — and a whole-tree walk that fails on anything the manifest does not name,
 *     so a new card added later cannot silently skip the line.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

/** Comments blanked to spaces — `tests/corners.test.ts`'s own `stripComments`, for its own
 *  reason: this file's prose discusses `bg-raised` and `plate-line` by name. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length))
    .replace(/\/\/.*/g, (line) => " ".repeat(line.length));
}

const CSS_CODE = stripComments(sourceAt("app/globals.css"));

/** The full body of one `@utility name { ... }` block — `tests/wrapping.test.ts`'s own
 *  helper. */
function utilityBody(name: string): string {
  const match = CSS_CODE.match(new RegExp(`@utility ${name}\\s*\\{([^}]*)\\}`));
  expect(match, `@utility ${name} must exist in app/globals.css`).not.toBeNull();
  return match![1];
}

const PLATE_LINE_DECLARATION =
  "box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-text) 9%, transparent);";
const POSTER_RING_DECLARATION = "box-shadow: inset 0 0 0 1px var(--color-hair);";

describe("the plate line is a call-site expression, not a token", () => {
  it("no custom property named --plate-line is declared", () => {
    expect(CSS_CODE).not.toMatch(/--plate-line/);
  });

  it("the reusable plate-line utility carries exactly the 9%-ink inset hairline", () => {
    expect(utilityBody("plate-line").replace(/\s+/g, " ").trim()).toBe(PLATE_LINE_DECLARATION);
  });

  it("appears exactly three times in the stylesheet: the utility, and .poster/.still's own default", () => {
    const hits = [...CSS_CODE.matchAll(/box-shadow:\s*inset 0 0 0 1px color-mix\(in oklab, var\(--color-text\) 9%, transparent\);/g)];
    expect(hits).toHaveLength(3);
  });

  it("field-well does not carry it — the field's own inset ring is the focus indicator", () => {
    expect(utilityBody("field-well")).not.toContain("color-mix(in oklab, var(--color-text) 9%, transparent)");
  });
});

describe("artwork: the plate line in light, the hairline-token ring in dark, never both", () => {
  it("poster's own box-shadow is the plate line by default", () => {
    expect(utilityBody("poster")).toContain(PLATE_LINE_DECLARATION);
  });

  it("still's own box-shadow is the plate line by default", () => {
    expect(utilityBody("still")).toContain(PLATE_LINE_DECLARATION);
  });

  it("the system-dark override replaces both with the hairline-token ring", () => {
    const match = CSS_CODE.match(
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \.poster,\s*:root:not\(\[data-theme="light"\]\) \.still \{([^}]*)\}/,
    );
    expect(match, "a system-dark override for .poster and .still must exist").not.toBeNull();
    expect(match![1]).toContain(POSTER_RING_DECLARATION);
  });

  it("the explicit data-theme=\"dark\" override replaces both with the hairline-token ring", () => {
    const match = CSS_CODE.match(
      /:root\[data-theme="dark"\] \.poster,\s*:root\[data-theme="dark"\] \.still \{([^}]*)\}/,
    );
    expect(match, 'an explicit dark override for .poster and .still must exist').not.toBeNull();
    expect(match![1]).toContain(POSTER_RING_DECLARATION);
  });

  it("the ring reads the hairline token, not a second color-mix", () => {
    const match = CSS_CODE.match(
      /:root\[data-theme="dark"\] \.poster,\s*:root\[data-theme="dark"\] \.still \{([^}]*)\}/,
    );
    expect(match![1]).not.toContain("color-mix");
  });
});

/** Every `.ts`/`.tsx` file under `app/`, relative to the repository root — the same walk
 *  `tests/corners.test.ts` and `tests/accent-sweep.test.ts` each run for their own sweep. */
function sourceFiles(): string[] {
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

/** Every `bg-raised` line in a file, comments blanked first. One entry per occurrence,
 *  which is what lets a file with two raised containers (`you-list-card.tsx`) be asserted
 *  on both rather than merely "has some". */
function bgRaisedLines(file: string): string[] {
  return stripComments(sourceAt(file))
    .split("\n")
    .filter((line) => /\bbg-raised\b/.test(line));
}

/**
 * Every raised container the plate line reaches, named by the ticket's own four
 * categories: result rows, list rows, rail cards, programme-note panels. `you-list-card.tsx`
 * carries two — the missing-artwork frame and the populated collage are both cards on
 * You's lists rail.
 */
const RAISED_CONTAINERS: readonly { readonly file: string; readonly count: number }[] = [
  { file: "app/(signed-in)/search/catalogue-result.tsx", count: 1 }, // a result row
  { file: "app/(signed-in)/lists/list-row.tsx", count: 1 }, // a list row
  { file: "app/(signed-in)/up-next/upcoming-row.tsx", count: 1 }, // a list row
  { file: "app/(signed-in)/you/recently-watched.tsx", count: 1 }, // a list row: You's Recently watched
  { file: "app/(signed-in)/up-next/up-next-card-styles.ts", count: 1 }, // a list row: Up next's cards
  { file: "app/(signed-in)/library/programme-note-section.ts", count: 1 }, // a programme-note panel
];

/**
 * Every other `bg-raised` site under `app/`, named with the reason it is not one of the
 * four raised-container categories above — the same documented-exception shape
 * `tests/accent-sweep.test.ts` holds its own sweep to.
 */
const EXEMPT_BG_RAISED: readonly { readonly file: string; readonly count: number; readonly reason: string }[] = [
  { file: "app/(signed-in)/settings/theme-control.tsx", count: 1, reason: "a segmented control option" },
  { file: "app/(signed-in)/lists/[listId]/list-view-control.tsx", count: 1, reason: "a segmented control track" },
  { file: "app/(signed-in)/library/chip.tsx", count: 1, reason: "a filter chip" },
  { file: "app/(signed-in)/library/library-filter-bar.tsx", count: 1, reason: "the Watching chip" },
  { file: "app/(signed-in)/library/library-surface.tsx", count: 1, reason: "the Shows/Films/Lists segmented control track" },
  { file: "app/(signed-in)/you/year-heatmap.tsx", count: 1, reason: "the heatmap's empty-day shade, a cell rather than a container" },
  { file: "app/(signed-in)/lists/[listId]/list-title-row.tsx", count: 1, reason: "raised only on hover, not at rest" },
  { file: "app/(signed-in)/you/you-surface.tsx", count: 1, reason: "a stat figure card outside this ticket's named categories" },
  { file: "app/(signed-in)/you/you-hero.tsx", count: 2, reason: "the account avatar well" },
  { file: "app/(signed-in)/you/you-heading.tsx", count: 1, reason: "the Settings button, a control rather than a container" },
  { file: "app/buttons.ts", count: 2, reason: "the secondary button and the menu item, controls rather than containers" },
  { file: "app/(signed-in)/library/watch-menu.tsx", count: 1, reason: "a menu item, raised only on hover" },
];

/** `you-list-card.tsx` carries both a must-carry and an exempt site, so a file's
 *  `bg-raised` lines are split by whether the line also reads `plate-line` rather than
 *  assumed to belong to one category outright. */
function withPlateLine(file: string): string[] {
  return bgRaisedLines(file).filter((line) => /\bplate-line\b/.test(line));
}

function withoutPlateLine(file: string): string[] {
  return bgRaisedLines(file).filter((line) => !/\bplate-line\b/.test(line));
}

describe("every raised container carries the plate line", () => {
  for (const { file, count } of RAISED_CONTAINERS) {
    it(`${file}: all ${count} raised container(s) carry plate-line`, () => {
      expect(withPlateLine(file)).toHaveLength(count);
    });
  }
});

describe("nothing else does", () => {
  for (const { file, count, reason } of EXEMPT_BG_RAISED) {
    it(`${file} (${reason}) is untouched`, () => {
      expect(withoutPlateLine(file)).toHaveLength(count);
    });
  }

  it("every bg-raised line in the manifest's must-carry files is accounted for by the two counts together", () => {
    for (const { file, count } of RAISED_CONTAINERS) {
      const exempt = EXEMPT_BG_RAISED.find((entry) => entry.file === file);
      expect(bgRaisedLines(file)).toHaveLength(count + (exempt?.count ?? 0));
    }
  });

  it("the manifest accounts for every bg-raised site under app/ — nothing undocumented", () => {
    const documented = new Set([...RAISED_CONTAINERS, ...EXEMPT_BG_RAISED].map((entry) => entry.file));
    const undocumented = sourceFiles().filter(
      (file) => bgRaisedLines(file).length > 0 && !documented.has(file),
    );

    expect(undocumented).toEqual([]);
  });

  it("plate-line appears in app/ exactly as many times as the manifest above expects", () => {
    const expected = RAISED_CONTAINERS.reduce((total, entry) => total + entry.count, 0);
    const actual = sourceFiles().reduce(
      (total, file) => total + [...stripComments(sourceAt(file)).matchAll(/\bplate-line\b/g)].length,
      0,
    );

    expect(actual).toBe(expected);
  });

  it("is looking at a tree that has files in it", () => {
    expect(sourceFiles().length).toBeGreaterThan(50);
  });
});
