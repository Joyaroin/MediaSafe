import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UnownedEpisodes } from "@/app/(signed-in)/titles/[kind]/[tmdbId]/unowned-episodes";
import type { UnownedEpisodeDetail } from "@/db/access";

/**
 * The page for a title you do not own, as a surface — issue #148.
 *
 * `tests/unowned-title-detail.test.ts` holds what the read answers. This file holds the
 * two things about the glass that would fail **silently** rather than on sight, which is
 * the line `SPEC.md` §6 draws around what earns a test:
 *
 *  1. **The episode list carries no progress and no control.** It is the one component on
 *     this page that renders per-episode rows, and it is therefore the one that would
 *     start drawing a mark, a rewatch or an *Up next* chip if it were ever pointed back at
 *     the owned component. The rendered markup is checked for the absence, not the
 *     component's props — a reader of this page sees markup.
 *  2. **The route imports none of the owned controls.** *No rating, no abandon, no remove,
 *     no unwatch* is a fact about the repository rather than about any one render, so it is
 *     checked as one — the shape `tests/remove-from-library-control.test.ts` established
 *     for *the remove control is on title detail and nowhere else*.
 *
 * `UnownedEpisodes` imports two pure modules and nothing else — no action, no
 * `server-only` — which is what makes it renderable here at all. `tests/programme-note.test.ts`
 * explains that boundary, and it is why the page itself is exercised by hand rather than
 * faked around `tmdb/catalogue.ts`.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");
const ROUTE = "app/(signed-in)/titles";

function episode(overrides: Partial<UnownedEpisodeDetail> = {}): UnownedEpisodeDetail {
  return {
    id: "episode-1",
    seasonNo: 1,
    episodeNo: 1,
    name: "Winter Is Coming",
    ...overrides,
  };
}

const render = (episodes: UnownedEpisodeDetail[], kind: "film" | "show" = "show") =>
  renderToStaticMarkup(createElement(UnownedEpisodes, { kind, episodes }));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Comments are stripped before any of the assertions below read a file. This route's
 * docblocks are largely *about* the owned controls and the owned read — why each one is
 * absent, and why `getTitleDetail` is left exactly as it is — so a check that scanned raw
 * text would be a check that could only pass by leaving the reasoning out.
 *
 * A line comment is matched only at the start of a line or after whitespace, so a `//` in
 * a URL survives.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function routeSources(): { file: string; source: string }[] {
  return sourceFiles(path.join(REPOSITORY_ROOT, ROUTE)).map((file) => ({
    file: path.relative(REPOSITORY_ROOT, file),
    source: withoutComments(readFileSync(file, "utf8")),
  }));
}

describe("the unowned episode list", () => {
  it("names every episode, and never falls back to a bare number", () => {
    const markup = render([episode({ name: null })]);

    expect(markup).toContain("Not yet named");
    expect(markup).not.toMatch(/>\s*S\d+\s*E\d+\s*</);
  });

  it("groups seasons under the same headings the owned list uses", () => {
    const markup = render([
      episode({ id: "s0", seasonNo: 0, episodeNo: 1, name: "A Christmas one" }),
      episode({ id: "s1", seasonNo: 1, episodeNo: 1, name: "Pilot" }),
    ]);

    // Season 0 is *Specials* on both surfaces — one word with one meaning
    // (`season-grouping.ts`).
    expect(markup).toContain("Specials");
    expect(markup).toContain("Season 1");
    expect(markup).not.toContain("Season 0");
  });

  it("says a show has no episode data rather than rendering an empty season", () => {
    const markup = render([]);

    expect(markup).toContain("No episode data yet.");
    expect(markup).not.toContain("Season");
  });

  it("renders nothing at all for a film", () => {
    // The owned page gives this slot to the film recording control (issue #90). Recording
    // a watch is something you do to a title you have.
    expect(render([], "film")).toBe("");
  });

  it("offers no control, and states no progress", () => {
    const markup = render([
      episode({ id: "one", episodeNo: 1 }),
      episode({ id: "two", episodeNo: 2 }),
    ]);

    // Every word the owned row can put in its trailing slot, and the element that would
    // carry any of them. Nothing here should tell a reader anything about a show they have
    // never watched — including that they have not watched it. The recording control
    // itself is icon-only since issue #217 and has no word to check for; the `<button>`
    // assertion below is what rules it (and any control) out structurally instead.
    expect(markup).not.toMatch(/<button|<form|<input/);
    expect(markup).not.toMatch(/Rewatch|Unwatch|Watched|Up next/);
    // The accent means a watch was recorded (`app/globals.css`, issue #134); the up-next
    // chip is the only thing that draws it on an episode row, and there is no up next here.
    expect(markup).not.toMatch(/accent|signal/);
  });
});

describe("what the unowned route does not import", () => {
  /**
   * Every control that answers a question about *you*. The ticket names them: progress,
   * state, up-next marking, the rating control, abandon, remove, unwatch. A refactor that
   * reached for the owned components to save a file would look entirely ordinary in a
   * diff, and would put a rating scale on a title nobody has rated.
   */
  const OWNED = [
    "rating-control",
    "abandon-control",
    "remove-control",
    "programme-note-content",
    "programme-note-episodes",
    "use-watch-mark",
    "watch-action",
    "watch-marks",
    "library-state",
  ];

  it.each(OWNED)("imports nothing from %s", (owned) => {
    const importers = routeSources()
      .filter(({ source }) => new RegExp(`from "[^"]*${owned}"`).test(source))
      .map(({ file }) => file);

    expect(importers).toEqual([]);
  });

  it("reads title detail through the unowned path, never through getTitleDetail", () => {
    const owned = routeSources().filter(({ source }) => /getTitleDetail/.test(source));

    // `getTitleDetail` is scoped by library entry and throws when there is no row. This
    // ticket leaves that alone; the way it leaves it alone is by not calling it from a
    // page whose whole premise is that there is no row.
    expect(owned.map(({ file }) => file)).toEqual([]);
    // `cachedUnownedTitleDetail` since issue #225, and `cachedFindUnownedTitleDetail`
    // since this screen started serving titles that are not mirrored at all — the same
    // read, answering `null` for an absent row instead of throwing, so that a missing
    // title stays distinguishable from a database that did not answer. What this asserts
    // is unchanged: one read of the borrowed half, on the unowned path.
    expect(
      routeSources().filter(({ source }) => /cachedFindUnownedTitleDetail/.test(source)).length,
    ).toBe(1);
  });
});

describe("the one control the page carries", () => {
  /**
   * *It carries one **Add to library*** is the ticket's only criterion about something
   * being present rather than absent, and it is checked at the source rather than in a
   * render for the boundary `tests/programme-note.test.ts` names: the control imports
   * `titles/actions.ts`, which imports `tmdb/catalogue.ts`, which is `server-only` and
   * throws on import outside Next's own build. `catalogue-result.tsx` — the same shape on
   * the search screen — carries no render test either.
   *
   * **One**, not *at least one*: the count is the assertion. A second add offered
   * somewhere further down the page would be two ways into a library from a page whose
   * whole premise is that there is one.
   */
  /**
   * The screen's content, which is no longer `page.tsx`.
   *
   * It moved to `unowned-title-body.tsx` when the dialog that intercepts this route
   * arrived: there are two renders of this URL and there is one screen, so the screen is
   * written once and both render it — the same split `title-detail-body.tsx` and
   * `episode-detail-body.tsx` already use. `page.tsx` is now the route wrapper and
   * nothing else, so a check pointed at it would be checking an empty file and passing.
   */
  const pageSource = () =>
    routeSources().find(({ file }) => file.endsWith("unowned-title-body.tsx"));

  it("renders exactly one AddToLibraryControl, in the shared body", () => {
    const page = pageSource();
    expect(page).toBeDefined();

    const rendered = page?.source.match(/<AddToLibraryControl\b/g) ?? [];
    expect(rendered).toHaveLength(1);

    // And nothing else in the route renders one — the control lives on the page, not
    // inside the episode list or the live facts.
    const everywhere = routeSources().flatMap(
      ({ source }) => source.match(/<AddToLibraryControl\b/g) ?? [],
    );
    expect(everywhere).toHaveLength(1);
  });

  it("hands it the title, so the lost-write toast can name what was lost", () => {
    // `AGENTS.md`: the toast composes its own sentences from a title and takes no message,
    // precisely so there is no parameter an exception could arrive in.
    expect(pageSource()?.source).toMatch(/titleName=\{detail\.name\}/);
  });

  it("labels it in full, and says so to a screen reader too", () => {
    const control = routeSources().find(({ file }) =>
      file.endsWith("add-to-library-control.tsx"),
    );

    expect(control?.source).toContain("Add to library");
    // Search's row can afford the one-word *Add* because the row is the context. A page
    // about one title has no row, so the visible label carries it.
    expect(control?.source).not.toMatch(/>\s*Add\s*</);
  });
});

describe("where a list row goes", () => {
  it("links an unowned row to the unowned page and an owned one to the library entry", () => {
    const row = readFileSync(
      path.join(REPOSITORY_ROOT, "app/(signed-in)/lists/[listId]/list-title-row.tsx"),
      "utf8",
    );

    // The one line issue #147 said would change when this ticket shipped. A list is not a
    // wall of dead posters any more: every row is a link.
    expect(row).toContain("`/titles/${title.kind}/${title.tmdbId}`");
    expect(row).toContain("`/library/${title.libraryEntryId}`");
  });
});
