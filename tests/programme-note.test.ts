import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProgrammeNoteEpisodes } from "@/app/(signed-in)/library/programme-note-episodes";
import type { EpisodeDetail } from "@/db/access";

/**
 * The season/episode list (issue #58) — the row `DESIGN.md` calls out as carrying the
 * product's most important rule. What this checks is everything a render could get wrong
 * **silently**, the same standard `tests/library-surface.test.ts` holds the grid to:
 *
 *  1. **An episode is never a bare number.** `docs/design/v1-surfaces.md` §4's hard rule,
 *     with no degrading surface — this is the surface it would degrade on if it ever did.
 *  2. **Missing and empty stay distinct.** A show with nothing mirrored says so; it does
 *     not render an empty season.
 *  3. **A film has no episode section at all** — not an empty one.
 *
 * ── Why this file stops at the episode list ───────────────────────────────────────────
 *
 * `ProgrammeNoteContent` composes this with `LiveTitleFacts`, which imports
 * `title-detail-actions.ts`, which imports `tmdb/catalogue.ts` — marked `server-only`.
 * That sentinel throws on import outside Next's own build, which is why
 * `search-surface.tsx` and `catalogue-result.tsx` — the same shape, reached through
 * `search/actions.ts` — carry no render test either. `ProgrammeNoteEpisodes` has no such
 * import in its graph and is safe to render here; the rest of the page is exercised by
 * hand (`npm run dev`) rather than faked around this boundary.
 */

function episode(overrides: Partial<EpisodeDetail> = {}): EpisodeDetail {
  return {
    id: "episode-1",
    seasonNo: 1,
    episodeNo: 1,
    name: "Winter Is Coming",
    watched: false,
    undoable: false,
    upNext: false,
    ...overrides,
  };
}

const episodes = (list: EpisodeDetail[], kind: "film" | "show" = "show") =>
  renderToStaticMarkup(
    createElement(ProgrammeNoteEpisodes, {
      kind,
      episodes: list,
      libraryEntryId: "entry-1",
      titleName: "Game of Thrones",
    }),
  );

describe("the episode list", () => {
  it("never falls back to a bare number for an unnamed episode", () => {
    const markup = episodes([episode({ name: null })]);

    expect(markup).toContain("Not yet named");
    expect(markup).not.toMatch(/>\s*S\d+\s*E\d+\s*</);
  });

  it("strikes through a watched episode and says so", () => {
    const markup = episodes([episode({ watched: true })]);

    expect(markup).toContain("line-through");
    expect(markup).toContain("Watched");
  });

  it("marks exactly the up-next episode, inverted, and nothing else", () => {
    const markup = episodes([
      episode({ id: "e1", episodeNo: 1, watched: true }),
      episode({ id: "e2", episodeNo: 2, upNext: true }),
    ]);

    expect(markup).toContain("Up next");
    expect(markup).toContain("bg-signal");
  });

  it("groups specials under their own heading, not 'Season 0'", () => {
    const markup = episodes([episode({ seasonNo: 0, episodeNo: 1, name: "Making Of" })]);

    expect(markup).toContain("Specials");
    expect(markup).not.toContain("Season 0");
  });

  it("headings a numbered season", () => {
    const markup = episodes([episode({ seasonNo: 2, episodeNo: 1 })]);

    expect(markup).toContain("Season 2");
  });

  it("carries the recording control on an unwatched episode, and not on a watched one", () => {
    const markup = episodes([episode({ id: "e1", episodeNo: 1, watched: false })]);

    expect(markup).toContain("Strike it");

    const watchedMarkup = episodes([episode({ id: "e1", episodeNo: 1, watched: true })]);
    expect(watchedMarkup).not.toContain("Strike it");
  });

  it("offers a watched episode a rewatch control that is not the one that struck it", () => {
    const markup = episodes([episode({ watched: true, undoable: true })]);

    expect(markup).toContain("Rewatch");
    // The whole rule, at the only place it can be checked without a browser: the gesture
    // that records the first watch is not on a watched row at all, so repeating it cannot
    // produce a rewatch (issue #89).
    expect(markup).not.toContain("Strike it");
  });

  it("offers undo on a watched episode the application recorded", () => {
    const markup = episodes([episode({ watched: true, undoable: true })]);

    expect(markup).toContain("Undo");
  });

  it("offers no undo on an episode whose only watch is imported", () => {
    const markup = episodes([episode({ watched: true, undoable: false })]);

    // Struck and readable as watched, and there is no control that could remove it —
    // 19,391 imported watches are not editable from the application (issue #89).
    expect(markup).toContain("line-through");
    expect(markup).toContain("Watched");
    expect(markup).not.toContain("Undo");
  });

  it("offers neither control on an unwatched episode", () => {
    const markup = episodes([episode({ watched: false, undoable: false })]);

    expect(markup).not.toContain("Rewatch");
    expect(markup).not.toContain("Undo");
  });

  it("displays no rewatch count anywhere", () => {
    const markup = episodes([episode({ watched: true, undoable: true })]);

    /**
     * `CONTEXT.md`, *Rewatch*: a rewatch is *never a number kept on a title*. A weaker
     * assertion — no `×2`, no "watched twice" — only rules out the spellings somebody
     * thought of, so this pins the row's visible words exactly instead. A count added
     * anywhere on it fails this whether or not it looks like one.
     */
    const visible = markup
      .replace(/<[^>]+>/g, "\n")
      .split("\n")
      .filter((one) => one.length > 0);

    expect(visible).toEqual(["Season 1", "E1", "Winter Is Coming", "Rewatch", "Undo"]);
  });

  it("says a show has no episode data, rather than rendering an empty season", () => {
    const markup = episodes([]);

    expect(markup).toContain("No episode data yet.");
    expect(markup).not.toContain("Season");
  });

  it("renders nothing at all for a film — not even the no-episode-data line", () => {
    const markup = episodes([], "film");

    expect(markup).toBe("");
  });
});
