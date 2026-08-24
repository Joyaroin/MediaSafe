import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UpNextRow } from "@/app/(signed-in)/library/up-next-row";
import type { EpisodeDetail } from "@/db/access";

/**
 * Issue #228: the up-next episode's own dedicated row, markable without picking a season
 * first. `programme-note.test.ts`'s own docblock is why this stops short of
 * `ProgrammeNoteContent` itself — that component's import graph reaches `server-only`
 * (`title-detail-actions.ts`), so the composed page is exercised by hand
 * (`npm run dev`) rather than faked around that boundary here. `UpNextRow` shares
 * `programme-note-episodes.tsx`'s render graph, which this suite's own sibling file
 * already renders safely.
 */

function episode(overrides: Partial<EpisodeDetail> = {}): EpisodeDetail {
  return {
    id: "episode-1",
    seasonNo: 2,
    episodeNo: 4,
    name: "The Long Night",
    // #253's three mirrored fields, null by default and overridable like everything else
    // here. `UpNextRow` reads none of them — it is the season list's row, not the episode
    // page — so a default of null is the row rendering exactly what it always did.
    stillPath: null,
    airDate: null,
    runtimeMins: null,
    watched: false,
    upNext: true,
    ...overrides,
  };
}

const row = (overrides: Partial<EpisodeDetail> = {}) =>
  renderToStaticMarkup(
    createElement(UpNextRow, {
      episode: episode(overrides),
      libraryEntryId: "entry-1",
      titleName: "Game of Thrones",
    }),
  );

describe("UpNextRow", () => {
  it("names the episode and heads the row 'Up next'", () => {
    const markup = row();

    expect(markup).toContain("Up next");
    expect(markup).toContain("The Long Night");
    expect(markup).toContain("bg-accent");
  });

  it("never falls back to a bare number for an unnamed episode", () => {
    const markup = row({ name: null });

    expect(markup).toContain("Not yet named");
    expect(markup).not.toMatch(/>\s*S\d+\s*E\d+\s*</);
  });

  it("offers the same recording control the episode list draws", () => {
    const markup = row();

    expect(markup).toContain("Mark Season 2, Episode 4 — The Long Night watched");
  });

  it("renders nothing once the episode is already watched and settled", () => {
    const markup = row({ watched: true });

    expect(markup).toBe("");
  });
});
