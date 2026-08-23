import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  addWatchedAccessibleLabel,
  addWatchedLabel,
} from "@/app/(signed-in)/titles/add-watched";

/**
 * What the second add says, and that both surfaces say it from one place — issue #222.
 *
 * `tests/add-to-library-watched.test.ts` holds what the write does. This file holds the
 * two things about the glass that would fail **silently** rather than on sight, which is
 * the line `SPEC.md` §6 draws around what earns a test:
 *
 *  1. **A show does not read as a film.** *Add — watched* on a show is ambiguous in
 *     exactly the direction that costs something — it can be read as *I am watching this*
 *     — and one press writes a whole show's worth of rows. A refactor that collapsed the
 *     two labels into one would look entirely ordinary in a diff and would be caught by
 *     nothing else.
 *  2. **Neither surface writes its own copy.** The search row and the unowned title page
 *     are in different route directories, in different registers, and the label is the
 *     one thing they may never disagree about. That is a fact about the repository rather
 *     than about any render, so it is checked as one — the shape
 *     `tests/remove-from-library-control.test.ts` established.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

/** Every surface that offers the watched add. */
const SURFACES = [
  "app/(signed-in)/search/catalogue-result.tsx",
  "app/(signed-in)/titles/[kind]/[tmdbId]/add-to-library-control.tsx",
];

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

describe("the watched add's label", () => {
  it("says watched for a film and watched all for a show", () => {
    expect(addWatchedLabel("film")).toBe("Add — watched");
    expect(addWatchedLabel("show")).toBe("Add — watched all");
  });

  it("names the title in the accessible name, on both kinds", () => {
    // The plain add's own rule (`catalogue-result.tsx`): a screen reader has no row, only
    // a list of buttons called *Add*.
    expect(addWatchedAccessibleLabel("film", "Arrival")).toContain("Arrival");
    expect(addWatchedAccessibleLabel("show", "The Bear")).toContain("The Bear");
  });

  it("spells out for a show what the visible label leaves to the word all", () => {
    // *All* is enough beside a poster and a year. Read alone it is not, and *released* is
    // the whole of what separates this write from one that claims a watch of an episode
    // that has not aired.
    expect(addWatchedAccessibleLabel("show", "The Bear")).toContain("released");
  });
});

describe("where that label comes from", () => {
  it.each(SURFACES)("%s takes it from the shared module rather than writing it", (file) => {
    const source = sourceAt(file);

    expect(source).toMatch(/from "@\/app\/\(signed-in\)\/titles\/add-watched"/);
    // Not the literal. A second copy on one of the two surfaces is the drift this module
    // exists to prevent, and it would read as perfectly ordinary at its call site.
    expect(source).not.toContain('"Add — watched');
    expect(source).not.toContain(">Add — watched");
  });
});
