import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RemoveControl } from "@/app/(signed-in)/library/remove-control";

/**
 * Where *Remove from library* is, and where it is not — issue #142.
 *
 * `tests/remove-from-library.test.ts` holds what the write does to the database. This file
 * holds the three things about the surface that would fail **silently** rather than on
 * sight, which is the line `SPEC.md` §6 draws around what earns a test:
 *
 *  1. **It is on title detail and nowhere else.** A tile, a rail, a grid cell or a swipe
 *     gaining this control is the ticket's own named failure — an irreversible action under
 *     a gesture made while scrolling — and it is a fact about the repository rather than
 *     about any render, so it is checked as one. `tests/rating-control.test.ts` established
 *     this shape for *the rating is on title detail and nowhere else*.
 *  2. **Abandon and remove carry different copy.** The two sit next to each other and the
 *     whole ticket exists to stop somebody destroying years of watches meaning to tidy up.
 *     A refactor that made the remove row echo the abandon row's reassurance would look
 *     completely ordinary in a diff.
 *  3. **A failed count offers no confirmation.** The route's boundary must have no form in
 *     it at all, rather than a form that is conditionally hidden.
 *
 * `RemoveControl` imports `next/link` and nothing else — no action, no `server-only` — which
 * is what makes it renderable here at all. `tests/programme-note.test.ts` explains that
 * boundary.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

const render = () =>
  renderToStaticMarkup(
    createElement(RemoveControl, { libraryEntryId: "entry-1", titleName: "The Bear" }),
  );

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("the remove control", () => {
  it("leads to the confirmation for this entry, and writes nothing itself", () => {
    const markup = render();

    expect(markup).toContain('href="/library/entry-1/remove"');
    // A link, not a form or a button: nothing is destroyed from the page the control is on.
    expect(markup).not.toMatch(/<button|<form/);
  });

  it("names the title it would remove, for anybody listening rather than looking", () => {
    expect(render()).toContain('aria-label="Remove The Bear from your library"');
  });

  it("is never vermilion", () => {
    // `DESIGN.md`: vermilion is the live signal, reserved for recording a watch, and the
    // abandon control is already named as the thing that must never take it. This is
    // quieter still.
    expect(render()).not.toMatch(/signal/);
  });
});

describe("abandon and remove, which must not read as the same thing", () => {
  it("promises the opposite of what the abandon row promises", () => {
    const markup = render();
    const abandon = sourceAt("app/(signed-in)/library/abandon-control.tsx");

    // The abandon row's reassurance, read from the control that renders it rather than
    // restated here — if that sentence is ever reworded, this fails and asks the question.
    expect(abandon).toContain("Watching it again clears it");

    // The remove block's counterweight, in the same voice and to the opposite effect.
    expect(markup).toContain("Nothing brings them back");
    expect(markup).not.toContain("Watching it again clears it");
    // No in-app recovery is implied anywhere in it — `SPEC.md`'s caveat is that watches
    // this application recorded are restorable by no means at all.
    expect(markup).not.toMatch(/undo|restore|recover|trash|grace period/i);
  });

  it("is a block where the abandon control is a row, so the two do not read as a pair", () => {
    const abandon = sourceAt("app/(signed-in)/library/abandon-control.tsx");
    const remove = sourceAt("app/(signed-in)/library/remove-control.tsx");

    expect(abandon).toContain("justify-between");
    expect(remove).not.toContain("justify-between");
  });
});

describe("where the remove control appears", () => {
  it("is imported by title detail's content and by nothing else", () => {
    const importers = sourceFiles(path.join(REPOSITORY_ROOT, "app"))
      .filter((file) => /from "[^"]*remove-control"/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(REPOSITORY_ROOT, file));

    // Not a tile, not a rail, not a grid cell, not a swipe — the ticket's first acceptance
    // criterion, checked rather than remembered.
    expect(importers).toEqual(["app/(signed-in)/library/programme-note-content.tsx"]);
  });

  it("puts no removal on the tile, the grid, or either up next surface", () => {
    const browsing = [
      "app/(signed-in)/library/library-entry-cell.tsx",
      "app/(signed-in)/library/library-grid.tsx",
      "app/(signed-in)/library/selectable-entry.tsx",
      "app/(signed-in)/library/up-next-grid.tsx",
      "app/(signed-in)/library/up-next-row.tsx",
      "app/(signed-in)/up-next/up-next-dominant-card.tsx",
    ];

    for (const file of browsing) {
      expect({ file, mentions: /\bremove\b/i.test(sourceAt(file)) }).toEqual({
        file,
        mentions: false,
      });
    }
  });

  it("is reachable from one route, and that route is the confirmation", () => {
    const routes = sourceFiles(path.join(REPOSITORY_ROOT, "app"))
      .filter((file) => /\/remove\//.test(file))
      .map((file) => path.relative(REPOSITORY_ROOT, file))
      .sort();

    expect(routes).toEqual([
      "app/(signed-in)/library/[entryId]/remove/actions.ts",
      "app/(signed-in)/library/[entryId]/remove/error.tsx",
      "app/(signed-in)/library/[entryId]/remove/page.tsx",
      "app/(signed-in)/library/[entryId]/remove/remove-frame.tsx",
      "app/(signed-in)/library/[entryId]/remove/remove-title-form.tsx",
    ]);
  });
});

describe("a count that could not be read", () => {
  it("has a boundary of its own, so the failure does not replace the whole page", () => {
    // Its existence is the assertion: without it a failed count reaches the library's
    // boundary or the root's, and the reader is told something failed without being told it
    // was the thing they came here to read.
    expect(sourceAt("app/(signed-in)/library/[entryId]/remove/error.tsx")).toContain(
      "ReadFailure",
    );
  });

  it("offers no confirmation under it — the form is not in that render at all", () => {
    const boundary = sourceAt("app/(signed-in)/library/[entryId]/remove/error.tsx");

    expect(boundary).not.toContain("RemoveTitleForm");
    expect(boundary).not.toContain("removeTitleAction");
  });

  it("never turns a failed count into a zero", () => {
    // `titleFootprint` throws, and the page calls it without a `try`. Both halves are the
    // rule; the second is the one a well-meaning edit would break.
    const page = sourceAt("app/(signed-in)/library/[entryId]/remove/page.tsx");

    expect(page).toContain("await titleFootprint(");
    expect(page).not.toMatch(/\btry\s*\{/);
    expect(page).not.toMatch(/\bcatch\b/);
  });
});
