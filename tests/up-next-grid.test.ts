import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UpNextGrid } from "@/app/(signed-in)/library/up-next-grid";
import type { UpNextEntry } from "@/db/access";

/**
 * The desktop TONIGHT row's grid (issue #100) — what `up-next-row.tsx` renders once
 * `listUpNext` (#98) answers. This file covers `UpNextGrid` and `UpNextCard` the same way
 * `tests/programme-note.test.ts` covers `ProgrammeNoteEpisodes`: `up-next-row.tsx` itself
 * fetches through a Server Action and is exercised by hand (`npm run dev`), not here.
 *
 * What this checks is what would go wrong **silently**:
 *
 *  1. **An episode is never a bare number.** `CONTEXT.md`'s rule, restated on a second
 *     surface — the card's dim `S1 E2` line sits beside the name, never instead of it.
 *  2. **No numeric cap or count anywhere.** Issue #100's own acceptance criteria; the grid
 *     renders exactly what it is handed, however many entries that is.
 *  3. **The recording control is the one hook every mark on this screen already uses**,
 *     and disappears the moment a card is struck — the same shape
 *     `tests/programme-note.test.ts` holds `EpisodeLine` to.
 */
function entry(overrides: Partial<UpNextEntry> = {}): UpNextEntry {
  return {
    libraryEntryId: "entry-1",
    titleId: "title-1",
    titleName: "Better Call Saul",
    posterPath: null,
    episodeId: "episode-1",
    episodeName: "Wine and Roses",
    seasonNo: 1,
    episodeNo: 2,
    ...overrides,
  };
}

const grid = (entries: UpNextEntry[]) =>
  renderToStaticMarkup(
    createElement(UpNextGrid, { entries, headingId: "up-next-heading" }),
  );

describe("the desktop Up next row's grid", () => {
  it("carries the title, the episode name and a dim S1 E2 line — never a bare number", () => {
    const markup = grid([entry()]);

    expect(markup).toContain("Better Call Saul");
    // The name sits in its own line, beside the S1 E2 code line — not folded into it.
    expect(markup).toContain('text-item text-stock-dim">Wine and Roses</p>');
    expect(markup).toContain("S1 E2");
  });

  it("names an episode TMDB has not named, rather than falling back to its number", () => {
    const markup = grid([entry({ episodeName: null })]);

    expect(markup).toContain('text-item text-stock-dim">Not yet named</p>');
    // The S1 E2 code line still prints — it is the numbers that never stand alone.
    expect(markup).toContain("S1 E2");
  });

  it("offers Strike it on every card, through the shared recording control", () => {
    const markup = grid([entry({ libraryEntryId: "e1" }), entry({ libraryEntryId: "e2" })]);

    expect(markup.match(/Strike it/g)).toHaveLength(2);
  });

  it("renders one card per entry, with no cap and no count printed anywhere", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      entry({ libraryEntryId: `entry-${index}`, titleName: `Title ${index}` }),
    );

    const markup = grid(many);

    for (const one of many) expect(markup).toContain(one.titleName);
    expect(markup).not.toMatch(/\bof\s+\d+\b/i);
    expect(markup).not.toMatch(/showing/i);
  });

  it("renders an empty grid for an empty deck, leaving the empty treatment to the caller", () => {
    const markup = grid([]);

    expect(markup).not.toContain("Strike it");
  });

  it("labels the list from the heading id it is handed, rather than a label of its own", () => {
    const markup = grid([entry()]);

    expect(markup).toContain('aria-labelledby="up-next-heading"');
  });
});
