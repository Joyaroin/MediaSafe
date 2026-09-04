import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// `selectable-entry.tsx` reaches for the router the moment a library cell renders — the
// same one-line mock `library-grid.test.ts` and `library-surface.test.ts` both use.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { LibraryEntryCell } from "@/app/(signed-in)/library/library-entry-cell";
import { LibrarySelectionProvider } from "@/app/(signed-in)/library/library-selection";
import { ListIconGrid } from "@/app/(signed-in)/lists/[listId]/list-icon-grid";
import { ListTitleRow } from "@/app/(signed-in)/lists/[listId]/list-title-row";
import { PosterProgressBar } from "@/app/poster-progress-bar";
import type { LibraryEntryRow, LibraryState, ListDetailTitleRow } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";

/**
 * The bar on the poster, and the three surfaces that draw it.
 *
 * It used to be a line under the library card's name and nothing else drew one. It is a
 * `5px` rule across the foot of the artwork now, in one component with three call sites —
 * the bill, and both of a list's views. This file is about the two things that stopped
 * being local to `library-entry-cell.tsx` when it moved: **where in the markup it sits**,
 * which is what makes the poster's own radius clip it, and **that all three surfaces agree
 * about when there is no bar**.
 *
 * The fraction's own arithmetic is `tests/library-progress-fraction.test.ts`'s, and the
 * bill's four cases are `tests/library-grid.test.ts`'s. Neither is restated here.
 */

// `progress-fill transition-[width] duration-[var(--dur-base)]` since #335 — the width
// transition timed off the ramp that makes the bar follow the mark instead of jumping
// after it. `tests/nav-transitions.test.ts` owns asserting that class exists and is wired
// to a ramp token; this only needs the fill to still carry it.
const FILL =
  /<div class="progress-fill h-full bg-accent transition-\[width\] duration-\[var\(--dur-base\)\]" style="width:(\d+(?:\.\d+)?)%"><\/div>/;

describe("the bar itself", () => {
  const bar = (progress: { watched: number; released: number } | null) =>
    renderToStaticMarkup(createElement(PosterProgressBar, { progress }));

  it("fills watched against released", () => {
    expect(bar({ watched: 2, released: 4 })).toMatch(FILL);
    expect(bar({ watched: 2, released: 4 })).toContain('style="width:50%"');
  });

  it("draws nothing at all when there is no progress to draw", () => {
    // A film, or — only on a list — a title this account does not own.
    expect(bar(null)).toBe("");
  });

  it("draws nothing for a show with nothing released, rather than an empty bar", () => {
    // An empty bar says *started and watched none*, which is a claim about the reader
    // rather than about the catalogue. `library-progress-fraction.ts` owns this call.
    expect(bar({ watched: 0, released: 0 })).toBe("");
  });

  it("draws an empty bar once something is released and nothing is watched", () => {
    expect(bar({ watched: 0, released: 4 })).toContain('style="width:0%"');
  });

  it("is hidden from assistive technology, like every other layer of a poster", () => {
    expect(bar({ watched: 1, released: 2 })).toContain('aria-hidden="true"');
    expect(bar({ watched: 1, released: 2 })).not.toContain('role="progressbar"');
  });

  it("takes a translucent ground as its track, not the hairline it had under the name", () => {
    // `bg-hair` is a tone against a known ground and disappears over pale artwork.
    expect(bar({ watched: 1, released: 2 })).toContain("bg-ground/70");
    expect(bar({ watched: 1, released: 2 })).not.toContain("bg-hair");
  });
});

/**
 * The placement, asserted on every surface that draws one.
 *
 * `absolute … bottom-0` positions against the nearest positioned ancestor, and the bar is
 * only clipped to the poster's radius if that ancestor is the `poster` box itself. Markup
 * order is what proves it: the bar has to open after the poster box opens and close before
 * it does. Rendered as a string rather than a DOM, like every other suite here, so the
 * check is that the bar's `<div` falls inside the poster's own element.
 */
function barIsInsideThePoster(markup: string): boolean {
  const poster = markup.indexOf('<div class="poster');
  if (poster === -1) return false;
  const bar = markup.indexOf('class="absolute inset-x-0 bottom-0');
  if (bar === -1) return false;

  // Everything the poster box contains sits before the first `</div>` that closes it, and
  // the bar's own inner fill div is the only nesting between them.
  const closes = markup.indexOf("</div></div></div>", poster);
  return bar > poster && (closes === -1 || bar < closes);
}

describe("where it sits on the library bill", () => {
  const entry = (overrides: Partial<LibraryEntryRow> = {}): LibraryEntryRow => ({
    libraryEntryId: "entry-1",
    titleId: "title-1",
    name: "Severance",
    releaseYear: 2022,
    posterPath: "/severance.jpg",
    kind: "show" as TitleKind,
    state: "watching" as LibraryState,
    upNext: null,
    progress: { watched: 2, released: 4 },
    ...overrides,
  });

  const cell = (overrides: Partial<LibraryEntryRow> = {}) =>
    renderToStaticMarkup(
      createElement(
        LibrarySelectionProvider,
        { value: { selectedEntryId: null, selectedPosterPath: null, select: () => {} } },
        createElement(LibraryEntryCell, { entry: entry(overrides) }),
      ),
    );

  it("draws the bar inside the poster, not under the name", () => {
    const markup = cell();

    expect(barIsInsideThePoster(markup)).toBe(true);
    // The name is the last thing in the cell now — nothing follows it.
    expect(markup).toMatch(/Severance<\/p><\/button>/);
  });

  it("still draws no bar for a film", () => {
    expect(cell({ kind: "film" as TitleKind, progress: null })).not.toContain("bg-ground/70");
  });
});

describe("where it sits on a list", () => {
  const listTitle = (overrides: Partial<ListDetailTitleRow> = {}): ListDetailTitleRow => ({
    titleId: "title-1",
    libraryEntryId: "entry-1",
    kind: "show" as TitleKind,
    tmdbId: 1,
    name: "Severance",
    releaseYear: 2022,
    posterPath: "/severance.jpg",
    position: 1,
    progress: { watched: 2, released: 4 },
    ...overrides,
  });

  const iconGrid = (overrides: Partial<ListDetailTitleRow> = {}) =>
    renderToStaticMarkup(createElement(ListIconGrid, { titles: [listTitle(overrides)] }));

  const row = (overrides: Partial<ListDetailTitleRow> = {}) =>
    renderToStaticMarkup(
      createElement(
        "ul",
        null,
        createElement(ListTitleRow, { title: listTitle(overrides), dragHandle: null }),
      ),
    );

  it("draws it on the icon view's poster", () => {
    expect(barIsInsideThePoster(iconGrid())).toBe(true);
    expect(iconGrid()).toContain('style="width:50%"');
  });

  it("draws it on the row view's poster too, so the two views agree", () => {
    expect(barIsInsideThePoster(row())).toBe(true);
    expect(row()).toContain('style="width:50%"');
  });

  /**
   * The case the library screen cannot produce: a list holds anything in the catalogue,
   * and a title this account has not added has no watches to be a fraction of. `db/access
   * .ts` answers `null` for it and both views must draw nothing rather than an empty bar,
   * which would read as *you have started this and watched none of it*.
   */
  it("draws nothing for a title this account does not own", () => {
    const unowned = { libraryEntryId: null, progress: null };

    expect(iconGrid(unowned)).not.toContain("bg-ground/70");
    expect(row(unowned)).not.toContain("bg-ground/70");
  });

  it("leaves the hand-order numeral alone — it is not part of the bar", () => {
    // The numeral is `--ink` on the poster's top corner and answers a different question
    // (`list-icon-grid.tsx`); a bar arriving at the other corner must not disturb it.
    expect(iconGrid()).toContain("bg-ink");
  });
});
