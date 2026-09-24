import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmptyLibrary } from "@/app/(signed-in)/library/empty-library";
import { LibraryEntryCell } from "@/app/(signed-in)/library/library-entry-cell";
import { LibraryGrid } from "@/app/(signed-in)/library/library-grid";
import {
  FilterField,
  LibraryChips,
  ZeroMatches,
} from "@/app/(signed-in)/library/library-filter-bar";
import type { LibraryEntryRow, LibraryState } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";
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
 *  2. **An abandoned entry dims its poster *and* its name.** `library-entry-cell.tsx`:
 *     *"that pairing is the only place the poster is modified."* Half of it is a
 *     rendering fault that reads as a state.
 *  3. **The column ladder.** One number in one class string, and nothing else in the suite
 *     touches a breakpoint.
 *  4. **An unnamed next episode never degrades to a number.** The rule
 *     is hard, *with no degrading surface*.
 *
 * ── Why this asserts on class names, which is usually a bad idea ─────────────────────
 *
 * Because in this design system the class *is* the distinction. The States
 * register separates empty from failed by alignment, heading step, colour and border, and
 * every one of those is a utility class — there is no other artefact to assert against
 * short of rendering to a browser and comparing pixels. The assertions are written against
 * the named utilities (`text-accent`, `border-accent`, `text-center`, `opacity-55`) and
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
    // A show by default, because *Severance* is one and because the chip-and-grid screen
    // these fixtures were written for is the Shows mode. A film fixture overrides it.
    kind: "show" as TitleKind,
    state: "watching" as LibraryState,
    upNext: { episodeName: "Hands" },
    // `null` by default — no bar — so the fixtures this suite already had keep
    // rendering exactly as before. `tests/library-grid.test.ts` is where issue #324's
    // bar itself is covered, case by case.
    progress: null,
    ...overrides,
  };
}

const withSelection = (children: React.ReactNode) => children;

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
   * and a read that failed outright. The States register gives each one a fixed
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
    // state's *button* is solid `accent` by the primary-recovery treatment,
    // so this is a check on the heading text, not a blanket absence of the colour.
    expect(empty).not.toContain("text-bill-lg text-accent");
    expect(zero).not.toContain("text-bill-md text-accent");
  });

  it("puts the empty library one heading step above zero matches and the failure", () => {
    // `errors/failure-treatment.ts`: "text-bill-md is the step the type table
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
    // Buttons: the primary recovery action is solid `accent` with
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
  it("dims an abandoned entry's poster and its name together", () => {
    const abandoned = cell({ state: "abandoned" });

    // `.55` since the linen redesign, up from `.45`. The handoff dims the Up next
    // groups' abandoned tiles at `.55` and names this cell as the other surface that
    // already dims a poster, with the instruction not to leave the two different by
    // accident — `group-tile.tsx` carries the same number.
    expect(abandoned).toContain("opacity-55");
    expect(abandoned).toContain("text-dim");

    // The dimming is the whole of it now: the state word left the card, so an abandoned
    // title is marked by the poster/name pair and nothing else on this surface.
    expect(abandoned).not.toContain("Abandoned");

    // And leaves both alone otherwise — the poster is modified in exactly one place.
    expect(cell()).not.toContain("opacity-55");
  });

  /**
   * The reverse of what this asserted before the state word left the card, and
   * deliberately so. `STATE_LABELS` is still the one table naming the five states in
   * the domain's own words — `title-hero.tsx` prints it on the title's own page — but the
   * bill does not repeat it 472 times. The library is the surface organised *by* state,
   * and the filter chips above the grid are where the reader reads it; a word under every
   * card was the same fact restated once per cell.
   */
  it("names no state on the card at all — the chips above the grid carry that", () => {
    for (const state of ["watching", "caught_up", "finished", "watchlist", "abandoned"] as const) {
      const markup = cell({ state, upNext: null });
      for (const word of ["Watching", "Caught up", "Finished", "Watchlist", "Abandoned"]) {
        expect(markup).not.toContain(word);
      }
    }
  });

  /**
   * ── Four lines became none, and the bar is what is left ──────────────────────────────
   *
   * The cell was a row: a `66px` poster beside a name, a year, the state, and a sentence
   * about what is next (*Nothing to watch now*, *Next — Hands*). Becoming a column cut
   * that to the state alone; this turn cuts the state too, leaving the name and — for a
   * show with something released — the progress bar, which says how far through you are
   * without spending a word on it.
   *
   * The assertions this replaces are deleted rather than rewritten because the strings
   * they checked no longer exist anywhere. `NEXT_LINES` is gone from
   * `library-entry-cell.tsx`, and the fact it carried is on Up next, which since the rails
   * became lists prints the episode's actual name in a full-width row rather than one
   * truncated clause. The two surfaces had been saying the same thing, one of them badly.
   *
   * The year went with them: the poster identifies the title, and the title's own page
   * carries the year. A list's icon cell keeps its year precisely because a list has no
   * state to print there.
   */
  it("prints the name and nothing else under the poster", () => {
    const one = cell();

    expect(one).toContain("Severance");

    // The lines that left. Asserted as absences so that re-adding one is a decision
    // somebody has to make against this test rather than a line that quietly reappears.
    expect(one).not.toContain("Watching");
    expect(one).not.toContain("Next — Hands");
    expect(one).not.toContain("2022");
    expect(cell({ state: "caught_up", upNext: null })).not.toContain("Nothing to watch now");
    expect(cell({ state: "finished", upNext: null })).not.toContain("Nothing left to watch");
  });

  it("never numbers an episode anywhere, which is the rule that outlived the line", () => {
    // An episode is never referred to by number alone. The next-episode line
    // was where that could go wrong on this surface and it is gone, so this now holds the
    // weaker-but-still-real claim that nothing reintroduced a code.
    expect(cell({ upNext: { episodeName: null } })).not.toMatch(/S\d+\s*E\d+/);
  });

  it("is a poster column with the name under it, and still casts no shadow", () => {
    const one = cell();

    expect(one).toContain("<button");
    expect(one).toContain("w-full");

    /**
     * **Not a card any more.** The linen redesign made this an `18px` `--raised` card, and
     * the column layout takes the ground back off it: what identifies a cell now is the
     * poster's own edge, exactly as on the lists icon grid, and a `--raised` panel behind
     * a full-bleed poster would be a ground nobody can see.
     *
     * *No shadow, no lift* survives all of it and is the half that has never
     * moved — the tone step is the only lift this application has.
     */
    expect(one).not.toContain("rounded-[18px]");
    expect(one).not.toContain("bg-raised");
    expect(one).toContain("[--poster-radius:var(--radius-4)]");
    expect(one).not.toMatch(/shadow|translate-y/);
  });
});

/**
 * Issue #303 — the morph's source. `selectable-entry.tsx`'s own docblock has the reasoning
 * for the raw `viewTransitionName` style rather than React's `<ViewTransition>`: it is
 * what keeps this cell renderable here at all, so this suite is the one place the actual
 * name (not just its presence in source) can be asserted against a render.
 */
describe("the library entry cell's poster morph source", () => {
  it("carries the same name family the title's own page uses", () => {
    const markup = cell();

    // `poster-transition-name.ts`'s one function, not a hand-spelled copy of it — a rename
    // there would otherwise leave this cell pairing against a stale name.
    expect(markup).toContain('view-transition-name:rail-poster-entry-1');
  });

  it("names a different cell by its own entry id", () => {
    const markup = renderToStaticMarkup(
      withSelection(createElement(LibraryEntryCell, { entry: entry({ libraryEntryId: "e2" }) })),
    );

    expect(markup).toContain("view-transition-name:rail-poster-e2");
  });
});

describe("the grid", () => {
  const grid = renderToStaticMarkup(
    withSelection(
      createElement(LibraryGrid, { entries: [entry(), entry({ libraryEntryId: "e2" })] }),
    ),
  );

  it("changes its column count at the documented breakpoints and nothing else", () => {
    // 3 · 4 at 640px · 5 at 1280px · 6 at 1536px. The counts doubled when the cell became
    // a poster column rather than a full-width row; the breakpoints did not move, and the
    // ramp is the lists icon grid's own because they are the same content at the same size.
    expect(grid).toContain("grid-cols-3");
    expect(grid).toContain("sm:grid-cols-4");
    expect(grid).toContain("xl:grid-cols-5");
    expect(grid).toContain("2xl:grid-cols-6");

    // Nothing else is allowed to differ between devices, so no other breakpoint prefix
    // may appear anywhere in the grid or its cells.
    expect(grid).not.toMatch(/(sm|md|lg|xl|2xl):(?!grid-cols)/);
  });

  it("spaces its cells as cards rather than dividing them with hairlines", () => {
    // The reverse of what this asserted before the linen redesign, and deliberately so.
    // Turn 9 replaces the hairline-divided grid with `--raised` cards on a `10px` gap;
    // `library-grid.tsx` has the reason it became possible, which is that `--raised` now
    // sits *below* the ground rather than above it, so a card needs no line to be a card.
    //
    // `<ol` is not necessarily the markup's first tag: React hoists a `<link
    // rel="preload">` ahead of it for the grid's own above-the-fold posters (issue #178),
    // so the match allows anything before the `<ol` rather than anchoring to the start.
    const [, gridClasses] = grid.match(/<ol[^>]*class="([^"]*)"/) ?? [];
    expect(gridClasses).toBeDefined();
    // Two gaps, not one. The cells stopped being cards on a `--raised` ground, so what
    // separates two of them sideways is whitespace alone — and the vertical gap has to
    // clear a two-line name plus a state label before the next poster begins. Equal gaps
    // in both directions read as a denser grid than it is.
    expect(gridClasses).toContain("gap-x-3.5");
    expect(gridClasses).toContain("gap-y-5");

    // The dividing borders are gone from the cells entirely — not merely overridden.
    expect(grid).not.toContain("border-b border-r border-hair");
  });
});

describe("the filter chips", () => {
  const chips = (value: "all" | LibraryState = "all") =>
    renderToStaticMarkup(createElement(LibraryChips, { value, onChange: () => {} }));

  /**
   * #132 wrapped each chip's label in a `<span>` so it can sit `z-10` above the travelling
   * `<ChipGround />` — the label is no longer a button's direct text child. This walks each
   * `<button>...</button>` block (they don't nest, so stopping at the first `</button>`
   * after each opening tag is exact) and returns the one whose block contains the label.
   */
  const chipButton = (markup: string, label: string) =>
    [...markup.matchAll(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)]
      .map((match) => match[0])
      .find((button) => button.includes(`>${label}<`));

  it("renders exactly six, in the domain's words and the settled order", () => {
    const markup = chips();
    const labels = [...markup.matchAll(/<span class="relative z-10">([^<]+)<\/span>/g)].map(
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

  it("fills the selected chip with ink and sets its label in the ground colour", () => {
    const markup = chips("finished");
    const finishedButton = chipButton(markup, "Finished");

    expect(finishedButton).toContain('aria-pressed="true"');
    // `bg-ink` since the linen redesign, where `--text` became a mid-tone body colour
    // and full strength moved to `--ink` (`app/globals.css`). The travelling
    // `layoutId` ground is unchanged in mechanism; it is an `18px`-radius pill now.
    expect(finishedButton).toContain("bg-ink");
    expect(finishedButton).toContain("text-ground");
    expect(finishedButton).toContain("rounded-[var(--radius-6)]");
  });

  it("keeps the Watching chip vermilion even unselected, and every other chip dim", () => {
    const markup = chips("all");
    const watchingButton = chipButton(markup, "Watching");
    const finishedButton = chipButton(markup, "Finished");

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

  it("says filter, and never search — the two words belong to different screens", () => {
    expect(field).toContain("Filter your library");
    expect(field.toLowerCase()).not.toContain("search");
  });

  it("is a text field, not a search field, so no browser clear control appears uninvited", () => {
    expect(field).toContain('type="text"');
    expect(field).not.toContain('type="search"');
  });
});

/**
 * Issue #197's *phone only*, from the one side a node harness can see.
 *
 * Everything the selection does is `tests/bulk-selection.test.ts`'s. This is the other
 * half of that split — the acceptance criterion *selection is unavailable on the desktop;
 * the programme note pane behaves exactly as before* — and it is checked here because it
 * is a claim about **markup**: a cell with no selection provider above it must render as
 * though this ticket had not happened.
 *
 * `cell()` above wraps in `LibrarySelectionProvider` and nothing else, which is precisely
 * the desktop's tree, so this asserts on the same render the rest of the file uses.
 */
describe("a library cell with no selection provider above it", () => {
  const plain = cell();

  it("carries none of the hold gesture's own attributes", () => {
    expect(plain).not.toContain("data-holding");
    expect(plain).not.toContain("data-landed");
    expect(plain).not.toContain("aria-pressed");
  });

  it("shows no check badge and no selection ring", () => {
    // `bg-ink` is the badge's fill and nothing else in a cell uses it — the title is
    // `text-ink`, which this does not match.
    expect(plain).not.toContain("bg-ink");
    expect(plain).not.toContain("outline-ink");
  });

  it("spends its one accent on the progress bar and nothing else", () => {
    // The accent's role here is still the live edge of the record — it just moved off the
    // *Watching* word, which left the card, and onto the bar that says the same thing
    // without a word. A screen may show only one role, and #197 draws selection in `--ink`
    // precisely so this stays the only accent in the cell (`selectable-entry.tsx`'s
    // `SELECTED`).
    // `plain` has no progress and so draws no bar — the cell carries no accent at all,
    // which is the point: the accent is the bar's and only the bar's.
    expect(plain).not.toContain("accent");
    expect(cell({ progress: { watched: 2, released: 4 } })).toContain("bg-accent");
  });

  it("still lets a reader select the title's text and long-press its poster", () => {
    // Both are the browser's own answers to a press, given up only where the hold has
    // claimed the gesture (`selectable-entry.tsx`).
    expect(plain).not.toContain("select-none");
    expect(plain).not.toContain("touch-callout");
  });

  it("keeps the plain press acknowledgement it has had since #56", () => {
    expect(plain).toContain("pressable");
  });
});
