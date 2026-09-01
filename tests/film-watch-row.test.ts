import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilmWatchRow } from "@/app/(signed-in)/library/film-watch-row";
import type { LibraryState } from "@/db/access";

/**
 * The film's watched mark — issue #90's row, in the hero card it moved to.
 *
 * ── Why this file exists rather than three tests in `tests/programme-note.test.ts` ────
 *
 * The row was the film branch of `ProgrammeNoteEpisodes`, so its coverage lived in that
 * component's file. It is its own component now (`film-watch-row.tsx`), rendered by
 * `TitleHero`, and the three cases below came here with it rather than being deleted: what
 * they check is a property of the row, and the row has moved, not gone.
 *
 * Every one of them is a real `renderToStaticMarkup`, exactly as they were. This component
 * imports `EPISODE_ROW`, `MarkWatchedButton`, `useWatchMark` and the sweep, and none of
 * those reaches `server-only` or React's `ViewTransition` — the two things
 * `tests/programme-note.test.ts`'s own docblock names as what keeps most of title detail
 * out of a render test. `TitleHero` itself is on the wrong side of that line (it imports
 * `ViewTransition`), which is why `tests/title-hero.test.ts` reads source text and this
 * file does not have to.
 *
 * ── What a render can and cannot answer here ─────────────────────────────────────────
 *
 * It answers what the row draws on arrival: which control is offered, what it tells a
 * screen reader, and how a title already watched is set. It cannot answer what a press
 * does — `useWatchMark` writes through a Server Action, and `tests/watch-marks.test.ts`
 * drives that store directly for the same reason `tests/bulk-selection.test.ts` drives its
 * own.
 */

const row = (state: LibraryState) =>
  renderToStaticMarkup(
    createElement(FilmWatchRow, {
      libraryEntryId: "entry-1",
      titleName: "Arrival",
      state,
      onStateChange: () => {},
    }),
  );

describe("the film's watched mark", () => {
  it("offers the mark on an unwatched film, and the way back on a watched one", () => {
    expect(row("watchlist")).toContain("Mark Arrival watched");

    /**
     * **A watched film is a control now, not a word.** This assertion used to read
     * `toContain("Watched")` — the dim `<span>` that was the whole of what a finished
     * film's row carried, and which `film-watch-row.tsx`'s own docblock recorded as a
     * deliberate gap: *"No unwatch, and it is a scope statement rather than a rule …
     * what is missing is the decision and the design, not the write."*
     *
     * Both arrived with the episode row's redraw, and the write is the one that was
     * always there: `unwatch` takes a null `episodeId` and is tested for a film.
     */
    const finished = row("finished");
    expect(finished).not.toContain("Mark Arrival watched");
    expect(finished).toContain("Unwatch Arrival");
  });

  it("dims a finished film's own name and says so, the same as a watched episode", () => {
    // Scoped to the title's own element rather than matching `text-dim` anywhere: the
    // trailing *Watched* code line is dim too, and an unscoped match would pass on that
    // alone. `tests/programme-note.test.ts` scopes the episode row's version identically.
    expect(row("finished")).toMatch(/class="[^"]*\btext-dim\b[^"]*">Arrival</);
    expect(row("finished")).not.toContain("line-through");
  });

  it("offers the mark on an abandoned, never-watched film too", () => {
    /**
     * The case that outlives the control it was written beside.
     *
     * *Abandoned* is a state nothing can enter any more — the control that set it is
     * retired — but rows already in it are untouched, and `CONTEXT.md`'s *watching it
     * again clears it* is now the **only** way out of it. So this row is that exit, and a
     * film sitting in the state has to be offered the mark exactly as a watchlist film is.
     *
     * `recordWatch` clears `abandoned_at` in the same transaction, which is what makes the
     * row's `onRecorded` patch to the literal `"finished"` correct rather than a guess.
     */
    expect(row("abandoned")).toContain("Mark Arrival watched");
  });

  it("carries no episode chip and no up-next label, which a film has no source for", () => {
    const markup = row("watchlist");

    expect(markup).not.toMatch(/>\s*E\d+\s*</);
    expect(markup).not.toContain("Up next");
  });
});
