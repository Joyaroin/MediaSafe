import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SYNOPSIS_PROSE } from "@/app/(signed-in)/library/programme-note-section";

/**
 * Issue #331 — balanced wrapping on screen and bill titles, pretty wrapping on the
 * synopsis only (`SPEC.md`'s spec-326 Polish section).
 *
 * `text-wrap: balance` and `text-wrap: pretty` are CSS, so the same idiom
 * `tests/corners.test.ts` and `tests/press-spring.test.ts` use applies: read the
 * declaration sites as text and assert the property is there, rather than reaching for a
 * browser to measure a line break no jsdom environment actually computes.
 *
 * Two seams, both already named symbols rather than new ones:
 *
 *  - `bill-title` and `screen-title`, the two `@utility` bundles `app/globals.css`
 *    declares — every screen title and bill title in the application reads one of the
 *    two, so a property added to the bundle reaches every call site without a second
 *    change anywhere else.
 *  - `SYNOPSIS_PROSE`, `programme-note-section.ts`'s exported class string — the one
 *    place the synopsis (title and episode) is set, per that module's own docblock.
 *
 * A third check sweeps `app/` and `errors/` for `text-pretty` outside `SYNOPSIS_PROSE`'s
 * own declaration, because the acceptance criterion is not just "the synopsis is pretty"
 * but "nothing else is" — in particular no list row and no grid cell, which is the
 * performance guidance the spec cites for restricting pretty wrapping in the first place.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length))
    .replace(/\/\/.*/g, (line) => " ".repeat(line.length));
}

const CSS_CODE = stripComments(sourceAt("app/globals.css"));

/** The full body of one `@utility name { ... }` block. */
function utilityBody(name: string): string {
  const match = CSS_CODE.match(new RegExp(`@utility ${name}\\s*\\{([^}]*)\\}`));
  expect(match, `@utility ${name} must exist in app/globals.css`).not.toBeNull();
  return match![1];
}

describe("screen titles and bill titles wrap balanced", () => {
  it("bill-title declares text-wrap: balance", () => {
    expect(utilityBody("bill-title")).toMatch(/text-wrap:\s*balance;/);
  });

  it("screen-title declares text-wrap: balance", () => {
    expect(utilityBody("screen-title")).toMatch(/text-wrap:\s*balance;/);
  });
});

describe("the synopsis wraps pretty", () => {
  it("SYNOPSIS_PROSE carries the pretty-wrap utility", () => {
    expect(SYNOPSIS_PROSE.split(/\s+/)).toContain("text-pretty");
  });
});

/** Every `.ts`/`.tsx` file under `app/` and `errors/`, relative to the repository root —
 *  `tests/corners.test.ts`'s own walk, for its own reason: a fixed list of "the list rows
 *  and grid cells" is exactly the kind of list that drifts as new ones are added. */
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
  walk(path.join(REPOSITORY_ROOT, "errors"));
  return files;
}

describe("no list row or grid cell receives pretty wrapping", () => {
  it("text-pretty appears nowhere outside SYNOPSIS_PROSE's own declaration", () => {
    const SYNOPSIS_PROSE_FILE = "app/(signed-in)/library/programme-note-section.ts";

    const violations = sourceFiles()
      .filter((file) => file !== SYNOPSIS_PROSE_FILE)
      .map((file) => ({ file, source: stripComments(sourceAt(file)) }))
      .filter((entry) => /\btext-pretty\b/.test(entry.source))
      .map((entry) => entry.file);

    expect(violations).toEqual([]);
  });

  it("is looking at a tree that has files in it", () => {
    expect(sourceFiles().length).toBeGreaterThan(50);
  });
});
