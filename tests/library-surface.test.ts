import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmptyLibrary } from "@/app/(signed-in)/library/empty-library";
import { LibraryEntryCell } from "@/app/(signed-in)/library/library-entry-cell";
import { LibraryGrid } from "@/app/(signed-in)/library/library-grid";
import { LibraryChips, ZeroMatches } from "@/app/(signed-in)/library/library-filter-bar";
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
    posterColour: null,
    // A show by default, because *Severance* is one and because the chip-and-grid screen
    // these fixtures were written for is the Shows mode. A film fixture overrides it.
    kind: "show" as TitleKind,
    state: "watching" as LibraryState,
    upNext: { episodeName: "Hands", seasonNo: 1, episodeNo: 2 },
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

  /**
   * Charcoal (issue #397) frames all three in the one outlined panel (handoff §6), so a
   * frame no longer tells them apart — it used to be centring for the two empty states and
   * an accent top rule for the failure. What tells them apart now is the voice of the
   * heading and the reference id below: the two empty states head in the serif
   * (`bill-title`), the failure at Row size in the sans, and only the failure carries a
   * reference.
   */
  it("share one frame, the outlined panel", () => {
    for (const markup of [empty, zero, failed]) expect(markup).toContain("hair-line");
    expect(empty).not.toContain("text-center");
    expect(zero).not.toContain("text-center");
  });

  it("head the two empty states in the serif, and the failure alone in the sans at Row size", () => {
    expect(empty).toContain("bill-title");
    expect(zero).toContain("bill-title");
    expect(failed).not.toContain("bill-title");
    expect(failed).toContain("text-row font-semibold");
    expect(empty).not.toContain("text-row");
    expect(zero).not.toContain("text-row");
  });

  it("puts the empty library one heading step above zero matches", () => {
    expect(empty).toContain("text-bill-lg");
    expect(zero).toContain("text-bill-md");
    expect(zero).not.toContain("text-bill-lg");
  });

  it("paints no heading in an alarm colour — the words and the heading's voice do it", () => {
    for (const markup of [empty, zero, failed]) {
      expect(markup).not.toMatch(/<h2[^>]*text-(accent|danger)/);
    }
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

    // `.5` since Charcoal — handoff §6: *Dropped draws the poster at 50%, the name in
    // `dim`*.
    expect(abandoned).toContain("opacity-50");
    expect(abandoned).toMatch(/<p class="[^"]*text-dim[^"]*">Severance<\/p>/);

    // The domain word is *Dropped*, never the stored *abandoned*.
    expect(abandoned).not.toContain("Abandoned");

    // And leaves both alone otherwise — the poster is modified in exactly one place.
    expect(cell()).not.toContain("opacity-50");
  });

  /**
   * ── The state line came back with Charcoal ───────────────────────────────────────────
   *
   * Turn 9 took the state word off the card, and these assertions used to hold its
   * absence. Handoff §8.4 puts a line back under the name — *S1 E2 up next*, *Finished*,
   * *Watchlist*, *Dropped*, *Caught up* — and the owner chose the numbered form for the
   * watching line over the old *never numbered alone* rule (issue #402). They are rewritten
   * to hold the new line instead, deliberately.
   */
  const visible = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  it("prints where each title stands under its name, in the chips' own words", () => {
    expect(visible(cell({ state: "caught_up", upNext: null }))).toBe("Severance Caught up");
    expect(visible(cell({ state: "watchlist", upNext: null }))).toBe("Severance Watchlist");
    expect(visible(cell({ state: "abandoned", upNext: null }))).toBe("Severance Dropped");
    // A finished title's badge names itself to a screen reader; the line says it in words.
    expect(visible(cell({ state: "finished", upNext: null }))).toBe("Severance Finished");
  });

  it("says which episode is up next on a show being watched, by season and number", () => {
    expect(visible(cell())).toBe("Severance S1 E2 up next");
    // Unnamed by TMDB is the same line: the numbers are what it prints.
    expect(visible(cell({ upNext: { episodeName: null, seasonNo: 3, episodeNo: 10 } }))).toBe(
      "Severance S3 E10 up next",
    );
    // Watching with nothing next mirrored yet falls back to the state's word.
    expect(visible(cell({ upNext: null }))).toBe("Severance Watching");
  });

  it("prints no year and none of the old next-episode sentences", () => {
    const one = cell();

    expect(one).not.toContain("2022");
    expect(one).not.toContain("Next — Hands");
    expect(cell({ state: "caught_up", upNext: null })).not.toContain("Nothing to watch now");
    expect(cell({ state: "finished", upNext: null })).not.toContain("Nothing left to watch");
  });

  it("sets the line at the Label size in dim, under a 14px name at 500", () => {
    const one = cell();

    expect(one).toMatch(/<p class="[^"]*text-item[^"]*font-medium[^"]*">Severance<\/p>/);
    expect(one).toMatch(/<p class="[^"]*text-label text-dim[^"]*"[^>]*>S1 E2 up next<\/p>/);
  });

  it("badges a finished title with a filled tick in the poster's top-left corner", () => {
    const finished = cell({ state: "finished", upNext: null });

    expect(finished).toMatch(/aria-label="Finished" role="img" class="absolute top-1\.5 left-1\.5[^"]*bg-text text-ground/);
    expect(cell()).not.toContain('aria-label="Finished"');
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
/**
 * **No morph name on a library cell** — the UI overhaul. The title page commits its loading
 * screen first, so a cell and the hero never land in the same commit and no pair could form
 * (Next's `view-transitions.md`). The loading screen was kept; the name went. A name left
 * here would be a morph that sometimes runs — on a cached page — and usually does not.
 */
describe("the library entry cell carries no morph name", () => {
  it("names no view transition", () => {
    expect(cell()).not.toContain("view-transition-name");
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

    // Nothing else is allowed to differ between devices but the desktop gutter, the same
    // `lg:px-10` every other page sits on (UI overhaul; the page's own since #402) — so no other
    // breakpoint prefix may appear anywhere in the grid or its cells.
    expect(grid).toContain("px-gutter");
    expect(grid).toContain("lg:px-10");
    expect(grid).not.toMatch(/(sm|md|lg|xl|2xl):(?!grid-cols|px-10\b)/);
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
   * Each chip's label sits inside its face, a `<span>` within the `<button>` — the label is
   * not a button's direct text child. This walks each `<button>...</button>` block (they
   * don't nest, so stopping at the first `</button>` after each opening tag is exact) and
   * returns the one whose block contains the label.
   */
  const chipButton = (markup: string, label: string) =>
    [...markup.matchAll(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)]
      .map((match) => match[0])
      .find((button) => button.includes(`>${label}<`));

  it("renders exactly six, in the domain's words and the settled order", () => {
    const markup = chips();
    const labels = [...markup.matchAll(/<button[^>]*>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].map(
      (match) => match[1].replace(/<[^>]+>/g, ""),
    );

    expect(labels).toEqual([
      "All",
      "Watching",
      "Caught up",
      "Finished",
      "Watchlist",
      "Dropped",
    ]);
  });

  it("outlines the selected chip and sets its label in text at 600 — Charcoal, issue #397", () => {
    const markup = chips("finished");
    const finishedButton = chipButton(markup, "Finished");

    expect(finishedButton).toContain('aria-pressed="true"');
    expect(finishedButton).toContain("selected-line");
    expect(finishedButton).toContain("font-semibold text-text");
    // Outlined, not inverted: the solid `text` fill is the filled treatment's alone.
    expect(finishedButton).not.toContain("bg-text");
    expect(finishedButton).not.toContain("text-ground");
  });

  it("leaves every unselected chip unlined and dim — Watching included", () => {
    const markup = chips("all");

    for (const label of ["Watching", "Caught up", "Finished", "Watchlist", "Dropped"]) {
      const button = chipButton(markup, label);
      expect(button).toContain('aria-pressed="false"');
      expect(button).not.toContain("selected-line");
      expect(button).toContain("text-dim");
      expect(button).not.toContain("text-accent");
    }
  });

  it("draws a 36px pill inside a 44px target", () => {
    const button = chipButton(chips("all"), "Finished") ?? "";

    expect(button).toMatch(/^<button[^>]*class="[^"]*\bh-11\b/);
    expect(button).toMatch(/<span[^>]*class="[^"]*\bh-9\b/);
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
    // `bg-text` is the badge's fill and nothing else in a cell uses it — the title is
    // `text-text`, which this does not match.
    expect(plain).not.toContain("bg-text");
    expect(plain).not.toContain("outline-ink");
  });

  it("spends no accent at all — the bar is white over the artwork since Charcoal", () => {
    // Handoff §6: *a `3px` white bar along the poster's bottom edge*. The accent is the
    // text colour now, so the bar no longer spends it.
    expect(plain).not.toContain("accent");
    const withBar = cell({ progress: { watched: 2, released: 4 } });
    expect(withBar).toContain("bg-[var(--poster-ink,white)]");
    expect(withBar).not.toContain("accent");
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
