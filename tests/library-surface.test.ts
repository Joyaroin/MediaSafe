import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmptyLibrary } from "@/app/(signed-in)/library/empty-library";
import { LibraryEntryCell } from "@/app/(signed-in)/library/library-entry-cell";
import { LibraryGrid } from "@/app/(signed-in)/library/library-grid";
import { LibrarySelectionProvider } from "@/app/(signed-in)/library/library-selection";
import {
  FilterField,
  LibraryChips,
  ZeroMatches,
} from "@/app/(signed-in)/library/library-filter-bar";
import type { LibraryEntryRow, LibraryState } from "@/db/access";
import { GHOST_RECOVERY, SOLID_RECOVERY } from "@/errors/recovery-buttons";
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
 * The things about this screen that would go wrong **silently**.
 *
 * `tests/library-grid.test.ts` covers the query. This covers the render, and only the
 * parts of it whose failure nothing else would announce:
 *
 *  1. **An empty library and a failed read look nothing like each other.** The one bug
 *     this whole ticket is shaped around. If a later edit centres the failure or drops its
 *     `accent` rule, every test still passes, the app still works, and a database that is
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
 * what `DESIGN.md` names (`text-accent`, `border-accent`, `text-center`, `opacity-45`) and
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

describe("the empty library, zero matches, and a failed read", () => {
  const empty = renderToStaticMarkup(createElement(EmptyLibrary));
  const zero = renderToStaticMarkup(createElement(ZeroMatches, { onClear: () => {} }));
  const failed = renderToStaticMarkup(
    createElement(ReadFailure, { reference: "abc123", retry: () => {} }),
  );

  /**
   * Three states `page.tsx` and `LibrarySurface` between them keep structurally apart:
   * genuinely nothing stored, a filter that matched nothing in a library that is intact,
   * and a read that failed outright. `DESIGN.md`'s States section gives each one a fixed
   * shape rather than a form of words, which is what makes this worth asserting on class
   * names — see the file-level comment above.
   */

  it("are centred alike, except the failure", () => {
    expect(empty).toContain("text-center");
    expect(zero).toContain("text-center");
    expect(failed).not.toContain("text-center");
  });

  it("share one heading colour between them, and the failure alone takes the other", () => {
    expect(failed).toContain("text-accent");
    // Vermilion is the failure's, and appears on no heading of the other two. The empty
    // state's *button* is solid `accent` by DESIGN.md's own primary-recovery treatment,
    // so this is a check on the heading text, not a blanket absence of the colour.
    expect(empty).not.toContain("text-bill-lg text-accent");
    expect(zero).not.toContain("text-bill-md text-accent");
  });

  it("puts the empty library one heading step above zero matches and the failure", () => {
    // `errors/failure-treatment.ts`: "text-bill-md is the step DESIGN.md's type table
    // names for the zero-match and read-failure headlines" — the same step, so the
    // failure is told apart from zero matches by colour and border, not by size.
    expect(empty).toContain("text-bill-lg");
    expect(zero).toContain("text-bill-md");
    expect(failed).toContain("text-bill-md");
    expect(zero).not.toContain("text-bill-lg");
    expect(failed).not.toContain("text-bill-lg");
  });

  it("differ by the top accent rule, which only the failure has", () => {
    // The literal string `errors/failure-treatment.ts` exports as `FAILURE_SECTION` — not
    // a bare "border-accent" search, which the zero-match state's own *ghost* recovery
    // button would also match and make this pass for the wrong reason.
    expect(failed).toContain("border-t-2 border-accent");
    expect(empty).not.toContain("border-t-2 border-accent");
    expect(zero).not.toContain("border-t-2 border-accent");
  });

  it("differ by the reference id, which only the failure has", () => {
    expect(failed).toContain("Reference abc123");
    expect(empty).not.toContain("Reference");
    expect(zero).not.toContain("Reference");
  });

  it("gives the empty library the one primary action, and zero matches a lesser one", () => {
    // `DESIGN.md`, Buttons: the primary recovery action is solid `accent` with
    // `accent-ink` text; every other recovery action, including "Clear the filter", is the ghost
    // treatment — a border rather than a fill. `errors/recovery-buttons.ts` names both
    // class strings once, so the test is against those rather than a guess at a substring
    // neither treatment's `hover:` half would also match.
    expect(empty).toContain(SOLID_RECOVERY);
    expect(empty).not.toContain(GHOST_RECOVERY);
    expect(zero).toContain(GHOST_RECOVERY);
    expect(zero).not.toContain(SOLID_RECOVERY);
  });

  it("names the actions each button actually offers", () => {
    expect(empty).toContain("Bring your library in");
    expect(zero).toContain("Clear the filter");
    expect(zero).not.toContain("Bring your library in");
  });

  it("points the empty library's button at the import route, not the first-run offer", () => {
    // `/welcome` would just redirect straight back past this screen — the offer is
    // already answered by the time a reader can be here (issue #75).
    expect(empty).toContain('href="/import"');
    expect(empty).not.toContain('href="/welcome"');
  });
});

describe("the library entry cell", () => {
  it("dims an abandoned entry's plate and its name together", () => {
    const abandoned = cell({ state: "abandoned" });

    expect(abandoned).toContain("opacity-45");
    expect(abandoned).toContain("text-dim");
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
    expect(grid).toContain("border-b border-r border-hair");

    // The Hairline Rule is about the space *between* cells, so the assertion is on the
    // grid's own class list and not on the markup: the `gap-4` inside a cell is the
    // plate-to-title measure `DESIGN.md` asks for, and would fail a blanket search.
    const [, gridClasses] = grid.match(/^<ol[^>]*class="([^"]*)"/) ?? [];
    expect(gridClasses).toBeDefined();
    expect(gridClasses).not.toMatch(/gap/);
  });
});

describe("the filter chips", () => {
  const chips = (value: "all" | LibraryState = "all") =>
    renderToStaticMarkup(createElement(LibraryChips, { value, onChange: () => {} }));

  it("renders exactly six, in CONTEXT.md's words and SPEC.md §7's order", () => {
    const markup = chips();
    const labels = [...markup.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(
      (match) => match[1],
    );

    expect(labels).toEqual([
      "All",
      "Watching",
      "Caught up",
      "Finished",
      "Watchlist",
      "Abandoned",
    ]);
  });

  it("inverts the selected chip to a text-coloured ground with ground-coloured text", () => {
    const markup = chips("finished");
    const finishedButton = markup.match(/<button[^>]*>Finished<\/button>/)?.[0];

    expect(finishedButton).toContain('aria-pressed="true"');
    expect(finishedButton).toContain("bg-text");
    expect(finishedButton).toContain("text-ground");
  });

  it("keeps the Watching chip vermilion even unselected, and every other chip dim", () => {
    const markup = chips("all");
    const watchingButton = markup.match(/<button[^>]*>Watching<\/button>/)?.[0];
    const finishedButton = markup.match(/<button[^>]*>Finished<\/button>/)?.[0];

    expect(watchingButton).toContain('aria-pressed="false"');
    expect(watchingButton).toContain("text-accent");
    expect(finishedButton).toContain("text-dim");
    expect(finishedButton).not.toContain("text-accent");
  });
});

describe("the filter field", () => {
  const field = renderToStaticMarkup(
    createElement(FilterField, { value: "", onChange: () => {} }),
  );

  it("says filter, and never search — CONTEXT.md gives the two words to different screens", () => {
    expect(field).toContain("Filter your library");
    expect(field.toLowerCase()).not.toContain("search");
  });

  it("is a text field, not a search field, so no browser clear control appears uninvited", () => {
    expect(field).toContain('type="text"');
    expect(field).not.toContain('type="search"');
  });
});
