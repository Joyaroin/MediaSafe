import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RatingControl } from "@/app/(signed-in)/library/rating-control";

/**
 * The rating control (issue #113) — the one place in the application that writes
 * `library_entry.rating`.
 *
 * What this checks is everything the render could get wrong **silently**, which for this
 * control is unusually much, because `SPEC.md` §7's rules are about what is *not* there:
 *
 *  1. **Ten cells, not five.** `DESIGN.md` said five until this ticket and the prototype
 *     built five; ADR-0001's `CHECK (rating BETWEEN 1 AND 10)` is what settles it, and a
 *     scale that silently stops at 5 is a control that cannot express half the column.
 *  2. **One chosen cell, carrying `aria-pressed`.** The inversion is the entire feedback,
 *     so a value that renders no inverted cell is a rating nobody can see they gave.
 *  3. **Nothing pushes the reader to rate.** No prompt, no nag, no empty state — the
 *     unrated render says *Your rating* and nothing else, because an unrated title
 *     asking to be rated is the rating-grind session §7 records as declined.
 *  4. **It fits.** Ten equal cells whose width comes from the row rather than from a
 *     digit count, which is what makes the same markup fit the 420px desktop panel and
 *     the phone route's narrower one — §10.3 flagged that fit in advance.
 *  5. **It is on title detail and nowhere else.** The last one is a fact about the
 *     repository rather than about a render, so it is checked as one.
 *
 * `RatingControl` reaches its write through `rating-action.ts` and not through
 * `title-detail-actions.ts`, which is what keeps `server-only` out of its import graph and
 * makes this file possible at all — `tests/programme-note.test.ts` explains the boundary.
 */

const render = (rating: number | null) =>
  renderToStaticMarkup(
    createElement(RatingControl, {
      libraryEntryId: "entry-1",
      titleName: "The Bear",
      rating,
      onRated: () => {},
    }),
  );

/** Every cell's number, in the order they are rendered. */
function cellNumbers(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>(\d+)<\/button>/g)].map((one) => one[1]);
}

/** The `aria-pressed="true"` cell's number, or `null` where no cell carries one. */
function pressedNumber(markup: string): string | null {
  const match = markup.match(/<button[^>]*aria-pressed="true"[^>]*>(\d+)<\/button>/);
  return match ? match[1] : null;
}

describe("the rating control", () => {
  it("renders ten cells, numbered 1 to 10", () => {
    expect(cellNumbers(render(null))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });

  it("inverts the chosen value to solid signal with ink text, and marks it pressed", () => {
    const markup = render(7);

    expect(pressedNumber(markup)).toBe("7");
    expect(markup).toMatch(
      /<button[^>]*class="[^"]*bg-signal text-ink[^"]*"[^>]*>7<\/button>/,
    );
  });

  it("marks exactly one cell pressed, and leaves the other nine unpressed", () => {
    const markup = render(3);

    expect([...markup.matchAll(/aria-pressed="true"/g)]).toHaveLength(1);
    expect([...markup.matchAll(/aria-pressed="false"/g)]).toHaveLength(9);
  });

  it("rates 10 like any other value — the two-digit cell is a cell", () => {
    const markup = render(10);

    expect(pressedNumber(markup)).toBe("10");
    // Its width comes from the row, not from its digits, so it carries the same classes
    // as every other chosen cell would.
    expect(markup).toMatch(
      /<button[^>]*class="[^"]*flex-1[^"]*bg-signal text-ink[^"]*"[^>]*>10<\/button>/,
    );
  });

  it("shows no chosen cell at all until a rating has been given", () => {
    const markup = render(null);

    expect(pressedNumber(markup)).toBeNull();
    // `hover:bg-signal` is on every cell and is the preview, not a choice — the lookbehind
    // is what makes this assert the absence of the inversion rather than of the word.
    expect(markup).not.toMatch(/(?<!hover:)bg-signal/);
  });

  it("says nothing to an unrated title beyond naming the control", () => {
    // Everything outside a tag, with the ten numbers removed: the whole of the prose.
    const prose = render(null)
      .replace(/<[^>]*>/g, " ")
      .replace(/\d+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(prose).toBe("Your rating");
  });

  it("carries tabular numerals and label typography on every cell", () => {
    const markup = render(null);

    expect([...markup.matchAll(/data-numeric/g)]).toHaveLength(10);
    // Eleven, not ten: the ten cells plus the *Your rating* label above them, which is a
    // code line for the same reason every other section head on this surface is.
    expect([...markup.matchAll(/class="code-line/g)]).toHaveLength(11);
  });

  it("sizes its cells from the row, with 1px gaps over rule", () => {
    const markup = render(null);

    // `gap-px` over a `rule` ground is DESIGN.md's "1px gaps over rule"; `flex-1` on
    // every cell is what makes ten of them fit a 420px panel and a phone alike, rather
    // than a fixed horizontal padding that fits one and overflows the other.
    expect(markup).toContain("flex items-stretch gap-px bg-rule");
    expect([...markup.matchAll(/flex-1/g)]).toHaveLength(10);
  });

  it("is a group named for the title, and each cell is named by its number alone", () => {
    const markup = render(null);

    expect(markup).toContain('aria-label="Rate The Bear"');
    // Exactly one `aria-label` in the whole control — the group's. A cell's accessible
    // name is its own text, so labelling it again would be redundant, and labelling it
    // with the title would make the scale unusable to listen to.
    expect([...markup.matchAll(/aria-label=/g)]).toHaveLength(1);
    expect([...markup.matchAll(/The Bear/g)]).toHaveLength(1);
  });
});

describe("where the rating control appears", () => {
  it("is imported by title detail's content and by nothing else", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const importers = sourceFiles(path.join(root, "app"))
      .filter((file) => /from "[^"]*rating-control"/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));

    // Not the tile, not a hover card, not a prompt after finishing — `SPEC.md` §7's
    // "title detail and nowhere else", checked rather than remembered.
    expect(importers).toEqual(["app/(signed-in)/library/programme-note-content.tsx"]);
  });

  it("puts no rating on the library tile, not even a reserved slot", () => {
    const tile = readFileSync(
      path.resolve(import.meta.dirname, "../app/(signed-in)/library/library-entry-cell.tsx"),
      "utf8",
    );

    expect(tile).not.toMatch(/\brating\b/i);
  });

  it("adds no seventh filter chip, and no Unrated one", () => {
    const bar = readFileSync(
      path.resolve(import.meta.dirname, "../app/(signed-in)/library/library-filter-bar.tsx"),
      "utf8",
    );

    expect(bar).not.toMatch(/unrated/i);
    expect(bar).not.toMatch(/\brating\b/i);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
