import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmptyLibrary } from "@/app/(signed-in)/library/empty-library";
import { LibraryEntryCell } from "@/app/(signed-in)/library/library-entry-cell";
import { LibraryGrid } from "@/app/(signed-in)/library/library-grid";
import { LibrarySelectionProvider } from "@/app/(signed-in)/library/library-selection";
import type { LibraryEntryRow, LibraryState } from "@/db/access";
import { ReadFailure } from "@/errors/read-failure";

/**
 * `selectable-entry.tsx` (issue #58) wraps every cell's button in `useRouter()`, which
 * throws outside a mounted Next.js app router — a real router is not this suite's job to
 * stand up, for the same reason `search-surface.tsx`'s own state machine carries no
 * render test here. Stubbed to the one method the cell's click handler can reach, so the
 * markup below still renders and nothing after this asserts on navigation.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

/**
 * The four things about this screen that would go wrong **silently**.
 *
 * `tests/library-grid.test.ts` covers the query. This covers the render, and only the
 * parts of it whose failure nothing else would announce:
 *
 *  1. **An empty library and a failed read look nothing like each other.** The one bug
 *     this whole ticket is shaped around. If a later edit centres the failure or drops its
 *     `signal` rule, every test still passes, the app still works, and a database that is
 *     down starts reading as a library with nothing in it — which is exactly how
 *     `tvtracker` shipped it for its entire life.
 *  2. **An abandoned entry dims its plate *and* its name.** `DESIGN.md`: *"that pairing is
 *     the only place the plate is modified."* Half of it is a rendering fault that reads
 *     as a state.
 *  3. **The column ladder.** One number in one class string, and nothing else in the suite
 *     touches a breakpoint.
 *  4. **An unnamed next episode never degrades to a number.** The rule
 *     `docs/design/v1-surfaces.md` §4 calls hard *with no degrading surface*.
 *
 * ── Why this asserts on class names, which is usually a bad idea ─────────────────────
 *
 * Because in this design system the class *is* the distinction. `DESIGN.md`'s States
 * section separates empty from failed by alignment, heading step, colour and border, and
 * every one of those is a utility class — there is no other artefact to assert against
 * short of rendering to a browser and comparing pixels. The assertions are written against
 * what `DESIGN.md` names (`text-signal`, `border-signal`, `text-center`, `opacity-45`) and
 * not against whole class strings, so restyling that keeps the treatment keeps these
 * passing.
 *
 * `renderToStaticMarkup` and `createElement` rather than a test renderer and JSX: the
 * suite is `environment: "node"` over `tests/**` and nothing here needs a DOM, an act()
 * or a `.tsx` include rule. React is already a dependency; this adds none.
 */

function entry(overrides: Partial<LibraryEntryRow> = {}): LibraryEntryRow {
  return {
    libraryEntryId: "entry-1",
    titleId: "title-1",
    name: "Severance",
    releaseYear: 2022,
    posterPath: "/severance.jpg",
    state: "watching" as LibraryState,
    upNext: { episodeName: "Hands" },
    ...overrides,
  };
}

const NO_SELECTION = { selectedEntryId: null, select: () => {} };

const withSelection = (children: React.ReactNode) =>
  createElement(LibrarySelectionProvider, { value: NO_SELECTION }, children);

const cell = (overrides: Partial<LibraryEntryRow> = {}) =>
  renderToStaticMarkup(
    withSelection(createElement(LibraryEntryCell, { entry: entry(overrides) })),
  );

describe("the empty library and a failed read", () => {
  const empty = renderToStaticMarkup(createElement(EmptyLibrary));
  const failed = renderToStaticMarkup(
    createElement(ReadFailure, { reference: "abc123", retry: () => {} }),
  );

  it("are opposite in alignment", () => {
    expect(empty).toContain("text-center");
    expect(failed).not.toContain("text-center");
  });

  it("are opposite in heading colour", () => {
    expect(failed).toContain("text-signal");
    // Vermilion is the failure's, and appears on no heading of the empty state. The
    // *button* is solid `signal` by DESIGN.md's own primary-recovery treatment, so the
    // test is that no text is set in it.
    expect(empty).not.toContain("text-signal");
  });

  it("differ by the signal rule, which only the failure has", () => {
    expect(failed).toContain("border-signal");
    expect(empty).not.toContain("border-signal");
  });

  it("differ by the reference id, which only the failure has", () => {
    expect(failed).toContain("Reference abc123");
    expect(empty).not.toContain("Reference");
  });
});

describe("the library entry cell", () => {
  it("dims an abandoned entry's plate and its name together", () => {
    const abandoned = cell({ state: "abandoned" });

    expect(abandoned).toContain("opacity-45");
    expect(abandoned).toContain("text-stock-dim");
    expect(abandoned).toContain("Abandoned");

    // And leaves both alone otherwise — the plate is modified in exactly one place.
    expect(cell()).not.toContain("opacity-45");
  });

  it("names every state in CONTEXT.md's words", () => {
    expect(cell({ state: "watching" })).toContain("Watching");
    expect(cell({ state: "caught_up", upNext: null })).toContain("Caught up");
    expect(cell({ state: "finished", upNext: null })).toContain("Finished");
    expect(cell({ state: "watchlist", upNext: null })).toContain("Watchlist");
    expect(cell({ state: "abandoned", upNext: null })).toContain("Abandoned");
  });

  it("keeps caught up and finished on different lines", () => {
    expect(cell({ state: "caught_up", upNext: null })).toContain("Nothing to watch now");
    expect(cell({ state: "finished", upNext: null })).toContain("Nothing left to watch");
  });

  it("names the next episode, and never numbers one", () => {
    expect(cell()).toContain("Next — Hands");

    const unnamed = cell({ upNext: { episodeName: null } });
    expect(unnamed).toContain("Next episode not named yet");
    expect(unnamed).not.toMatch(/S\d+\s*E\d+/);
  });

  it("says nothing rather than something wrong when a title has no year", () => {
    expect(cell({ releaseYear: null })).not.toContain("data-numeric");
    expect(cell()).toContain("2022");
  });

  it("is a full-width button with no shadow, radius, lift or scale", () => {
    const one = cell();

    expect(one).toContain("<button");
    expect(one).toContain("w-full");
    expect(one).not.toMatch(/rounded|shadow|scale-|translate-y/);
  });
});

describe("the grid", () => {
  const grid = renderToStaticMarkup(
    withSelection(
      createElement(LibraryGrid, { entries: [entry(), entry({ libraryEntryId: "e2" })] }),
    ),
  );

  it("changes its column count at the documented breakpoints and nothing else", () => {
    // 1 · 2 at 640px · 3 at 1280px · 4 at 1536px — SPEC.md §10.3.
    expect(grid).toContain("grid-cols-1");
    expect(grid).toContain("sm:grid-cols-2");
    expect(grid).toContain("xl:grid-cols-3");
    expect(grid).toContain("2xl:grid-cols-4");

    // Nothing else is allowed to differ between devices, so no other breakpoint prefix
    // may appear anywhere in the grid or its cells.
    expect(grid).not.toMatch(/(sm|md|lg|xl|2xl):(?!grid-cols)/);
  });

  it("draws its structure with hairlines rather than gaps", () => {
    expect(grid).toContain("border-b border-r border-rule");

    // The Hairline Rule is about the space *between* cells, so the assertion is on the
    // grid's own class list and not on the markup: the `gap-4` inside a cell is the
    // plate-to-title measure `DESIGN.md` asks for, and would fail a blanket search.
    const [, gridClasses] = grid.match(/^<ol[^>]*class="([^"]*)"/) ?? [];
    expect(gridClasses).toBeDefined();
    expect(gridClasses).not.toMatch(/gap/);
  });
});
