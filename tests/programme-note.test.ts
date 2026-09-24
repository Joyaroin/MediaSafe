import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProgrammeNoteEpisodes } from "@/app/(signed-in)/library/programme-note-episodes";
import type { EpisodeDetail } from "@/db/access";

/**
 * The season/episode list (issue #58) — the row that carries the
 * product's most important rule. What this checks is everything a render could get wrong
 * **silently**, the same standard `tests/library-surface.test.ts` holds the grid to:
 *
 *  1. **An episode is never a bare number.** A hard rule,
 *     with no degrading surface — this is the surface it would degrade on if it ever did.
 *  2. **Missing and empty stay distinct.** A show with nothing mirrored says so; it does
 *     not render an empty season.
 *  3. **A film has no episode section at all** — not an empty one, not a season heading,
 *     and no control. Issue #90 gave that slot to the film recording control; the control
 *     has since moved to the hero card, and `tests/film-watch-row.test.ts` owns it there.
 *     What is left here is a component that renders nothing at all for a film, which is
 *     what `programme-note-content.tsx` relies on when it declines to draw the card.
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
    // #253's three mirrored fields. Null by default, and the season list reads none of
    // them: the episode page is where a still, a date and a runtime are printed, and this
    // file's subject is the row that links to it.
    stillPath: null,
    airDate: null,
    runtimeMins: null,
    watched: false,
    watches: 0,
    upNext: false,
    ...overrides,
  };
}

const episodes = (list: EpisodeDetail[], kind: "film" | "show" = "show") =>
  renderToStaticMarkup(
    createElement(ProgrammeNoteEpisodes, {
      kind,
      episodes: list,
      // Complete, which is every case in this file: the pending region is #272's and is
      // asserted in `tests/library-pending.test.ts` beside the treatment it draws.
      episodesPending: false,
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

  it("dims a watched episode's name, and lets the dimming be what says so", () => {
    const markup = episodes([episode({ watched: true })]);

    // The dimmed name is the statement (the Episode Line, as issue #139 redraws
    // it) — the strike-through this used to draw is retired with the world it came from.
    // A *Watched* code line stood in the trailing slot wherever there was no unwatch to
    // offer, which #145 makes unreachable; the control test below owns the other half, so
    // this one asserts only what it is about.
    // Scoped to the name's own element, not just "text-dim" appearing anywhere on the row
    // (the trailing Unwatch control and an unselected episode number are dim too) — and
    // tolerant of the class list's own order, unlike pinning the literal attribute string.
    expect(markup).toMatch(/class="[^"]*\btext-dim\b[^"]*">Winter Is Coming</);
    expect(markup).not.toContain("line-through");
    expect(markup).not.toContain(">Watched<");
  });

  it("marks exactly the up-next episode, inverted, and nothing else", () => {
    const markup = episodes([
      episode({ id: "e1", episodeNo: 1, watched: true }),
      episode({ id: "e2", episodeNo: 2, upNext: true }),
    ]);

    /**
     * **The words *Up next* are gone from the row, and the inverted chip is the whole
     * signal.** They used to open the trailing slot, saying in the accent what
     * `EPISODE_NUMBER_UP_NEXT` was already saying in the accent two cells to the left on
     * the same row — and being the only thing in that slot that carried text, they were
     * the only reason it had to be wide enough for prose. `TRAILING`'s own docblock has
     * the arithmetic.
     *
     * So this asserts the chip rather than the label: the inverted number is present, and
     * the redundant sentence is not.
     */
    expect(markup).toContain("bg-accent");
    expect(markup).not.toContain("Up next");
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

    // The control is a checkmark, not a word (issue #217) — an unwatched row's own
    // accessible label is the only reliable text left to look for.
    expect(markup).toContain("Mark Season 1, Episode 1 — Winter Is Coming watched");

    const watchedMarkup = episodes([episode({ id: "e1", episodeNo: 1, watched: true })]);
    expect(watchedMarkup).not.toContain("Mark Season 1, Episode 1 — Winter Is Coming watched");
  });

  it("offers a watched episode no way to record a second watch", () => {
    const markup = episodes([episode({ watched: true })]);

    /**
     * **Rewatch is deleted**, and this is the assertion that used to require it. Issue
     * #89's rule — *the gesture that records the first watch is not on a watched row at
     * all* — is still held by the second expectation; what is gone is the control that
     * offered a deliberate second watch beside it.
     *
     * The concept is untouched where it actually lives. There are 1,156
     * genuine rewatches already in the imported library, so the `watch` table, its
     * `UNIQUE (user_id, source, source_key)` identity rule and the dedupe in `db/access.ts`
     * all stay exactly as they were — `watch-mark-motion.tsx`'s `SETTLED_GLYPH` holds that
     * argument. What no longer exists is a button that mints one.
     */
    expect(markup).not.toContain("Rewatch");
    expect(markup).not.toContain("Mark Season 1, Episode 1 — Winter Is Coming watched");
  });

  it("offers unwatch on every watched episode, whatever recorded the watch", () => {
    const markup = episodes([episode({ watched: true })]);

    /**
     * The inversion of #89's rule, at the surface — issue #145. This assertion used to
     * have a twin that rendered `unwatchable: false` and asserted the control was
     * **absent**, because an episode whose only watch was imported offered none. There is
     * no such input any more: `EpisodeDetail` carries nothing derived from a watch's
     * source, so there is no watched row this component can be handed that would render
     * without an unwatch. All 19,558 of the library's watches are imported,
     *  and a control that skipped them rendered on essentially nothing its
     * only reader owns.
     */
    /**
     * **Unwatch is not on the row any more, and this is what replaced the assertion.**
     *
     * It was an inline control — first a text pill, then briefly the settled mark itself,
     * which is a glyph that reads as a *state* removing every watch of the episode on one
     * tap. It lives behind the row's hold now (`watch-menu.tsx`), so what this can check
     * without a browser is that the row **offers the gesture**: `HOLDABLE` is applied to a
     * watched row and to no other, and it is the class that suppresses the phone's own
     * text-selection callout so the app's hold can have the press.
     *
     * The settled mark is `aria-hidden` and is not a `<button>`, which is the other half:
     * there is no inline control left for a stray tap to find.
     */
    expect(markup).not.toContain("Unwatch Season 1, Episode 1 — Winter Is Coming");
    expect(markup).toContain("[-webkit-touch-callout:none]");
  });

  it("offers no way back on an unwatched episode", () => {
    const markup = episodes([episode({ watched: false })]);

    expect(markup).not.toContain("Rewatch");
    expect(markup).not.toContain("Unwatch Season 1, Episode 1 — Winter Is Coming");
  });

  it("displays no rewatch count anywhere", () => {
    const markup = episodes([episode({ watched: true })]);

    /**
     * *Rewatch*: a rewatch is *never a number kept on a title*. A weaker
     * assertion — no `×2`, no "watched twice" — only rules out the spellings somebody
     * thought of, so this pins the row's visible words exactly instead. A count added
     * anywhere on it fails this whether or not it looks like one.
     */
    const visible = markup
      .replace(/<[^>]+>/g, "\n")
      .split("\n")
      .filter((one) => one.length > 0);

    // "Season 1" twice: once as the sole season chip (issue #224), once as the heading
    // over the rows it selects.
    /**
     * **Four words, down from six.** *Rewatch* and *Unwatch* are gone from the row's
     * visible text entirely — a watched row carries `SETTLED_GLYPH`, which is a checkmark
     * in a circle with an `aria-label` and no text node of its own. That makes this
     * assertion strictly stronger than it was: there is now nothing at all in the trailing
     * slot for a count to hide among.
     */
    expect(visible).toEqual(["Season 1", "Season 1", "E1", "Winter Is Coming"]);
  });

  it("says a show has no episode data, rather than rendering an empty season", () => {
    const markup = episodes([]);

    expect(markup).toContain("No episode data yet.");
    expect(markup).not.toContain("Season");
  });

  it("renders nothing at all for a film", () => {
    /**
     * The whole assertion, and deliberately only this one.
     *
     * It used to be five `not.toContain`s — no episode list, no *No episode data yet.*, no
     * season heading, no *Specials*, no season selector — beside a render that still drew
     * the film's own recording row. That row has moved to the hero
     * (`app/(signed-in)/library/film-watch-row.tsx`), so this component now returns `null`
     * for a film and every one of those five would pass against an empty string without
     * checking anything.
     *
     * `toBe("")` is the honest form of the same rule, and it is stronger: it fails on
     * *anything* this component might start drawing for a film, rather than on the five
     * things somebody thought of. `tests/unowned-title-surface.test.ts` asserts the
     * unowned episode list the same way for the same reason.
     *
     * It is also what `programme-note-content.tsx` depends on: that file declines to draw
     * the card for a film, and a component that quietly grew a fragment here would put an
     * empty card back on the page.
     */
    expect(episodes([], "film")).toBe("");
  });
});

/**
 * *Watched up to here* on the row — issue #196.
 *
 * What is asserted here is only what a **render** can answer: whether the control is on a
 * given row, and what it tells a screen reader it does. Which episodes one press would
 * write is `tests/mark-up-to.test.ts`, and what the write actually does to the table is
 * `tests/mark-watched-up-to.test.ts`; a rendered row shows a control rather than the
 * eleven episodes behind it, so asserting the set from here would be asserting it through
 * the wrong window.
 *
 * The control is found by its accessible label rather than by a class or a glyph. The
 * label is the only text it has (`mark-up-to.ts`), so it is also the only thing a test
 * could look for that a reader would notice going missing.
 */
const MARK_THROUGH = "Mark everything up to and including";

describe("the watched-up-to-here control", () => {
  it("appears on a row with an earlier unwatched episode", () => {
    const markup = episodes([
      episode({ id: "e1", episodeNo: 1, name: "Winter Is Coming" }),
      episode({ id: "e2", episodeNo: 2, name: "The Kingsroad" }),
    ]);

    expect(markup).toContain(
      "Mark everything up to and including Season 1, Episode 2 — The Kingsroad watched",
    );
  });

  it("is absent on a row with nothing unwatched before it", () => {
    const markup = episodes([
      episode({ id: "e1", episodeNo: 1, watched: true }),
      episode({ id: "e2", episodeNo: 2, name: "The Kingsroad" }),
    ]);

    // Issue #194's own words: a show already recorded is not covered in dead controls,
    // and one press of the checkmark already does the whole of what this would.
    expect(markup).not.toContain(MARK_THROUGH);
  });

  it("is absent on the first episode of a show", () => {
    const markup = episodes([episode({ id: "e1", episodeNo: 1 })]);

    expect(markup).not.toContain(MARK_THROUGH);
  });

  it("appears on a watched row with a gap behind it", () => {
    const markup = episodes([
      episode({ id: "e1", episodeNo: 1, name: "Winter Is Coming" }),
      episode({ id: "e2", episodeNo: 2, name: "The Kingsroad", watched: true }),
    ]);

    // Progress is a high-water mark (`db/views.ts`), so a skipped episode sits behind a
    // watched one — and closing that gap is the second thing this control is for.
    expect(markup).toContain(
      "Mark everything up to and including Season 1, Episode 2 — The Kingsroad watched",
    );
    // Beside the row's own controls, not instead of them — and *watched up to here* is
    // the one that stayed inline when unwatch went to the row's menu, because it records
    // a watch rather than removing one.
    expect(markup).toContain(
      "Mark everything up to and including Season 1, Episode 2 — The Kingsroad watched",
    );
  });

  it("never appears on a special itself", () => {
    const markup = episodes([
      episode({ id: "s1", seasonNo: 0, episodeNo: 1, name: "Making Of" }),
      episode({ id: "s2", seasonNo: 0, episodeNo: 2, name: "Blooper Reel" }),
    ]);

    // A watch of a special changes no derived state, so it is not what a press would
    // write and not a reason to offer one. The companion claim this test used to make in
    // the same render — that an unwatched special sitting before a real episode does not
    // arm the control on that later row either — is `mark-up-to.test.ts`'s own "never
    // counts a special, in the set or in what makes the control appear": issue #224
    // mounts one season at a time, so a special and a later real-season row are never
    // both in one render here for this file to check together any more.
    expect(markup).not.toContain(MARK_THROUGH);
  });

  it("carries no text of its own, so the episode name keeps the room it had", () => {
    const markup = episodes([
      episode({ id: "e1", episodeNo: 1, name: "Winter Is Coming" }),
      episode({ id: "e2", episodeNo: 2, name: "The Kingsroad" }),
    ]);

    /**
     * The row's trailing slot is a fixed measure and its contents were already close to
     * it (`programme-note-episodes.tsx`'s `TRAILING`, which records the browser
     * measurements). Words on this control would come out of the episode name, which is
     * the one thing on the row that must not shrink — so what the control renders is
     * asserted to be a glyph and an attribute, and nothing a reader would see as text.
     *
     * Since issue #217 the row's *other* control is icon-only too — `MarkWatchedButton`
     * no longer renders *Strike it* — so E2's row carries two glyphs and E1's carries one,
     * and neither adds a word to this list. That is this test's own subject widening by
     * one control rather than a change to what it asserts: no visible text on the row
     * comes from anything but the episode's own name.
     */
    const visible = markup
      .replace(/<[^>]+>/g, "\n")
      .split("\n")
      .filter((one) => one.length > 0);

    // "Season 1" twice, the same as the sole-season case above — the chip and the heading.
    expect(visible).toEqual([
      "Season 1",
      "Season 1",
      "E1",
      "Winter Is Coming",
      "E2",
      "The Kingsroad",
    ]);
  });

  it("reaches all three surfaces from one placement", () => {
    /**
     * The control is on the programme note's content, so the desktop pane, the phone
     * title sheet and the title-detail route all get it without any of them being wired
     * up separately — issue #196's *one placement serves three surfaces*.
     *
     * Read from source rather than rendered, because two of the three cannot be rendered
     * in this harness at all: they reach `LiveTitleFacts` → `tmdb/catalogue.ts`, which is
     * `server-only` and throws on import here (this file's own top docblock). The
     * property is about which component each surface draws, and the import is where that
     * is decided — so this fails for exactly the reason it names: one of the three grew
     * its own episode list.
     */
    /**
     * Two surfaces since #250, which deleted the phone's title sheet along with the five
     * vertical groups that were its only callers. The property is unchanged and is if
     * anything easier to hold with one fewer: every surface that shows a title's note draws
     * the shared component rather than growing an episode list of its own.
     */
    const surfaces = [
      "app/(signed-in)/library/programme-note.tsx",
      "app/(signed-in)/titles/[entryId]/title-detail-view.tsx",
    ];

    for (const surface of surfaces) {
      const source = readFileSync(join(process.cwd(), surface), "utf8");
      expect(source, `${surface} no longer renders the shared programme note`).toContain(
        "<ProgrammeNoteContent",
      );
    }
  });

  it("writes no confirmation into the page until a row is pressed", () => {
    const markup = episodes([
      episode({ id: "e1", episodeNo: 1 }),
      episode({ id: "e2", episodeNo: 2 }),
    ]);

    // One dialog for the list, mounted only while there is a press to confirm — not one
    // per row, which on a long-running show would be sixty-two of them in the document
    // to have at most one open.
    expect(markup).not.toContain("<dialog");
    expect(markup).not.toContain("Watched up to here?");
  });
});

/**
 * The season chips — issue #224. What a static render can prove: every season is a chip
 * in specials-last order, the default selection lands on the season holding *up next* (or
 * falls back to the first season), the pressed chip's own state, and that only the
 * selected season's rows are in the document at all. Choosing a *different* chip is not
 * testable here — this file's own top docblock says why: there
 * is no DOM environment in this suite and no click to simulate one with.
 */
describe("the season selector", () => {
  function ariaPressed(markup: string, label: string): string | null {
    const labelIndex = markup.indexOf(`>${label}<`);
    const buttonStart = markup.lastIndexOf("<button", labelIndex);
    const buttonTag = markup.slice(buttonStart, markup.indexOf(">", buttonStart) + 1);
    return buttonTag.match(/aria-pressed="(true|false)"/)?.[1] ?? null;
  }

  it("renders every season as a chip, in specials-last order", () => {
    const markup = episodes([
      episode({ id: "s1", seasonNo: 0, episodeNo: 1, name: "Making Of" }),
      episode({ id: "e1", seasonNo: 1, episodeNo: 1 }),
      episode({ id: "e2", seasonNo: 2, episodeNo: 1, upNext: true, name: "New Beginnings" }),
    ]);

    expect(markup).toMatch(/role="group" aria-label="Choose a season"/);

    const positions = ["Season 1", "Season 2", "Specials"].map((label) =>
      markup.indexOf(`>${label}<`),
    );
    expect(positions.every((index) => index !== -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("selects the season holding up next by default, pressed and correctly named", () => {
    const markup = episodes([
      episode({ id: "e1", seasonNo: 1, episodeNo: 1, watched: true }),
      episode({ id: "e2", seasonNo: 2, episodeNo: 1, upNext: true, name: "New Beginnings" }),
    ]);

    expect(ariaPressed(markup, "Season 2")).toBe("true");
    expect(ariaPressed(markup, "Season 1")).toBe("false");
  });

  it("falls back to the first season when nothing is up next", () => {
    const markup = episodes([
      episode({ id: "s1", seasonNo: 0, episodeNo: 1, name: "Making Of" }),
      episode({ id: "e1", seasonNo: 1, episodeNo: 1 }),
      episode({ id: "e2", seasonNo: 2, episodeNo: 1, name: "New Beginnings" }),
    ]);

    expect(ariaPressed(markup, "Season 1")).toBe("true");
    expect(ariaPressed(markup, "Season 2")).toBe("false");
    expect(ariaPressed(markup, "Specials")).toBe("false");
  });

  it("mounts only the selected season's episode rows", () => {
    const markup = episodes([
      episode({ id: "e1", seasonNo: 1, episodeNo: 1, name: "Winter Is Coming" }),
      episode({ id: "e2", seasonNo: 2, episodeNo: 1, upNext: true, name: "New Beginnings" }),
    ]);

    // Season 2 is selected (it holds up next), so its own episode is on the page and
    // Season 1's is not — even though Season 1 still gets a chip.
    expect(markup).toContain("New Beginnings");
    expect(markup).not.toContain("Winter Is Coming");
    expect(markup).toMatch(/>Season 1</);
  });
});
