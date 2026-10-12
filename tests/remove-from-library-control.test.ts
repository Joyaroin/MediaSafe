import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Where *Remove from library* is, and where it is not — issue #142.
 *
 * `tests/remove-from-library.test.ts` holds what the write does to the database. This file
 * holds the things about the surface that would fail **silently** rather than on sight:
 *
 *  1. **It is on title detail and nowhere else** — in the head's ⋯ menu. It was also a
 *     section at the foot of the page until the UI overhaul deleted that copy
 *     (`remove-control.tsx`); one door to the confirmation is enough. A tile, a rail, a
 *     grid cell or a swipe gaining it is the ticket's own named failure — an irreversible
 *     action under a gesture made while scrolling.
 *  2. **The confirmation says it cannot be undone**, and the library tile's *watching it
 *     again clears this* is never echoed there.
 *  3. **A failed count offers no confirmation.** The route's boundary must have no form in
 *     it at all, rather than a form that is conditionally hidden.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

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

describe("giving up and removing, which must not read as the same thing", () => {
  it("promises the opposite of what the library tile promises", () => {
    expect(sourceAt("app/(signed-in)/library/programme-note-content.tsx")).toContain(
      "Watching it again clears this",
    );

    const confirmation = sourceAt("app/(signed-in)/titles/[entryId]/remove/page.tsx");
    expect(confirmation).toContain("cannot be undone");
    expect(confirmation).not.toContain("Watching it again clears");
  });
});

describe("where the remove entry appears", () => {
  it("is linked from the title's ⋯ menu and from nothing else", () => {
    const linkers = sourceFiles(path.join(REPOSITORY_ROOT, "app"))
      .filter((file) => !/\/remove\//.test(file))
      .filter((file) => /\/remove`/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(REPOSITORY_ROOT, file));

    expect(linkers).toEqual(["app/(signed-in)/library/title-actions.tsx"]);
    expect(sourceAt("app/(signed-in)/library/title-actions.tsx")).toContain(
      "Remove from library",
    );
  });

  it("puts no removal on the tile, the grid, or the up next surface", () => {
    // The desktop TONIGHT row (`up-next-grid.tsx`, `up-next-row.tsx`) named here until
    // issue #136 deleted it, and the phone home's dominant card
    // (`up-next-dominant-card.tsx`) until issue #138 deleted that too. #250 then deleted
    // the phone's five groups; Up next's browsing surfaces are now the desktop rail's tile
    // and the phone's two rails, so those are what this checks — the list follows the
    // surfaces that exist, which is the whole point of reading them off disk rather than
    // remembering them.
    const browsing = [
      "app/(signed-in)/library/library-entry-cell.tsx",
      "app/(signed-in)/library/library-grid.tsx",
      "app/(signed-in)/library/selectable-entry.tsx",
      "app/(signed-in)/up-next/up-next-episode-row.tsx",
      "app/(signed-in)/up-next/film-row.tsx",
      "app/(signed-in)/up-next/tonight-featured.tsx",
      "app/(signed-in)/up-next/tonight-list.tsx",
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
      "app/(signed-in)/titles/[entryId]/remove/actions.ts",
      "app/(signed-in)/titles/[entryId]/remove/error.tsx",
      // Issue #180's pending boundary. It belongs on this list for the reason the list
      // exists — it is a render of this route, and the thing worth knowing about it is the
      // same thing worth knowing about `error.tsx`: there is no form on it. That half is
      // asserted in `tests/library-pending.test.ts`, beside the other two states.
      "app/(signed-in)/titles/[entryId]/remove/loading.tsx",
      "app/(signed-in)/titles/[entryId]/remove/page.tsx",
      "app/(signed-in)/titles/[entryId]/remove/remove-frame.tsx",
      "app/(signed-in)/titles/[entryId]/remove/remove-title-form.tsx",
    ]);
  });
});

describe("a count that could not be read", () => {
  it("has a boundary of its own, so the failure does not replace the whole page", () => {
    // Its existence is the assertion: without it a failed count reaches the library's
    // boundary or the root's, and the reader is told something failed without being told it
    // was the thing they came here to read.
    expect(sourceAt("app/(signed-in)/titles/[entryId]/remove/error.tsx")).toContain(
      "ReadFailure",
    );
  });

  it("offers no confirmation under it — the form is not in that render at all", () => {
    const boundary = sourceAt("app/(signed-in)/titles/[entryId]/remove/error.tsx");

    expect(boundary).not.toContain("RemoveTitleForm");
    expect(boundary).not.toContain("removeTitleAction");
  });

  it("never turns a failed count into a zero", () => {
    // `titleFootprint` throws, and the page calls it without a `try`. Both halves are the
    // rule; the second is the one a well-meaning edit would break.
    const page = sourceAt("app/(signed-in)/titles/[entryId]/remove/page.tsx");

    expect(page).toContain("await titleFootprint(");
    expect(page).not.toMatch(/\btry\s*\{/);
    expect(page).not.toMatch(/\bcatch\b/);
  });
});
