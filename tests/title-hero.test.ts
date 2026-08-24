import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { watchProgress } from "@/app/(signed-in)/library/progress-remaining";
import type { EpisodeDetail } from "@/db/access";

/**
 * The restructured title detail, and the parts of it that would go wrong **quietly**.
 *
 * Most of this change is visible the moment the screen loads. These are not: a progress
 * bar that disagrees with the sentence beside it, a control that starts writing a derived
 * state instead of causing one, and a section that drifts out of the order the screen was
 * argued into.
 *
 * ── Source text, not a render ────────────────────────────────────────────────────────
 *
 * `title-hero.tsx` imports React's `ViewTransition`, which the installed React does not
 * export — Next supplies it at build time — so this component cannot be rendered under
 * Vitest and never could be. `code()` below strips comments first, so every assertion is
 * about what the file *does* rather than about what its docblocks happen to say.
 */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const HERO = code("app/(signed-in)/library/title-hero.tsx");
const CONTENT = code("app/(signed-in)/library/programme-note-content.tsx");

function episode(overrides: Partial<EpisodeDetail> = {}): EpisodeDetail {
  return {
    id: "e1",
    seasonNo: 1,
    episodeNo: 1,
    name: "Pilot",
    stillPath: null,
    airDate: null,
    runtimeMins: null,
    watched: false,
    upNext: false,
    ...overrides,
  };
}

describe("how far through, counted", () => {
  /**
   * The bar and *"Remaining — N episodes"* sit on the same screen about the same show.
   * `remainingCount` excludes specials; a bar that counted them would sit short of full on
   * a show you have finished, which is the one thing a progress bar must never do.
   */
  it("leaves specials out, like the remaining count does", () => {
    const progress = watchProgress([
      episode({ id: "s0", seasonNo: 0, episodeNo: 1, watched: false }),
      episode({ id: "a", seasonNo: 1, episodeNo: 1, watched: true }),
      episode({ id: "b", seasonNo: 1, episodeNo: 2, watched: false }),
    ]);

    expect(progress).toEqual({ watched: 1, total: 2 });
  });

  it("reads full when every regular episode is watched", () => {
    const progress = watchProgress([
      episode({ id: "s0", seasonNo: 0, episodeNo: 1, watched: false }),
      episode({ id: "a", seasonNo: 1, episodeNo: 1, watched: true }),
    ]);

    expect(progress.watched).toBe(progress.total);
  });

  it("counts nothing when there is nothing to count", () => {
    expect(watchProgress([])).toEqual({ watched: 0, total: 0 });
  });
});

describe("the hero", () => {
  /**
   * A film has two positions and the word already says which. A show with no mirrored
   * episodes is TMDB not having them yet, and a bar at zero would report that as *nothing
   * watched* — failure wearing emptiness' clothes, which `SPEC.md` §3 exists to stop.
   */
  it("draws the bar only for a show that has episodes", () => {
    expect(HERO).toMatch(/detail\.kind === "show" && detail\.episodes\.length > 0/);
  });

  /**
   * `DESIGN.md` §0 allows one accent per screen. `STATE_LABELS` draws *Watching* in the
   * accent, so an accented bar and an accented state word would be two inside one block.
   * The bar keeps it; the eyebrow is `--dim`.
   */
  it("spends the accent on the bar and not on the state word", () => {
    expect(HERO).toContain("bg-accent");
    expect(HERO).toMatch(/label-line text-dim/);
    // The state's own `className` from STATE_LABELS carries `text-accent` for Watching —
    // rendering it here would put the accent back on the word.
    expect(HERO).not.toMatch(/\{state\.className\}/);
  });

  /**
   * The bar is decoration *of* the sentence beneath it, which states the same fact in
   * words. A `progressbar` role would announce it a second time as a percentage nobody
   * wrote.
   */
  it("hides the bar from assistive technology and lets the sentence carry it", () => {
    expect(HERO).toMatch(/aria-hidden="true"[\s\S]{0,120}bg-hair/);
    expect(HERO).toMatch(/episodes watched/);
    expect(HERO).not.toContain('role="progressbar"');
  });
});

describe("the states, and what the hero may do with them", () => {
  /**
   * The most important property on this screen, and it has survived the hero being rebuilt
   * three times. `CONTEXT.md`: four of the five states are derived from your watches, and
   * only *abandoned* was ever set by hand.
   *
   * **Nothing sets it by hand any more.** `AbandonControl` is retired — no control here, no
   * *Abandon* on the library's selection bar — so *abandoned* is a state nothing new can
   * enter. The rows already in it are untouched: `abandoned_at`, the view's first branch
   * and the `abandoned` member of `LibraryState` all stay, which is why the hero still has
   * to be able to print the word.
   */
  it("no longer carries the control that set a state by hand", () => {
    expect(HERO).not.toContain("AbandonControl");
    expect(HERO).not.toContain("abandonAction");
    expect(HERO).not.toContain("unabandonAction");
  });

  /**
   * The hero reads the state to *print* it and never to set it — `STATE_LABELS` keyed by
   * `detail.state`, which is what the view computed in SQL.
   *
   * The one write in this component's subtree is a film's watched mark, and it reports the
   * one state a film's watch can land on. `film-watch-row.tsx` carries why that literal is
   * a certainty rather than a guess, and `tests/film-watch-row.test.ts` owns the row; what
   * matters here is that the hero itself hands the row a callback rather than a state.
   */
  it("reads the state to print it", () => {
    expect(HERO).toMatch(/STATE_LABELS\[detail\.state\]/);
    expect(HERO).not.toMatch(/state=\{"(watching|caught_up|finished|watchlist|abandoned)"\}/);
  });

  /**
   * *Abandoned* has to stay printable, and the label table is what makes it so. A table
   * that lost the key would not fail loudly — `STATE_LABELS` is a `Record<LibraryState, …>`
   * so TypeScript catches a missing key, but this asserts the intent rather than relying on
   * the compiler to be the only thing standing between an existing row and a blank line.
   */
  it("keeps a word for the state nothing can enter any more", () => {
    const labels = code("app/(signed-in)/library/library-state.ts");
    const chips = code("app/(signed-in)/library/library-filter-bar.tsx");

    expect(labels).toContain('abandoned: { label: "Abandoned"');
    expect(chips).toContain('abandoned: "Abandoned"');
  });
});

describe("the order of the screen", () => {
  /**
   * Cast last, below the watch providers — which is why the streamed facts arrive as three
   * nodes rather than one. A single `liveFacts` node could only place them together, and
   * the failure mode is silent: a section simply reappears in the middle.
   *
   * Three rather than the two this was written against, because the synopsis moved into
   * the hero's card and the providers did not.
   */
  it("places the three streamed sections in the order the screen was argued into", () => {
    const synopsis = CONTENT.indexOf("synopsis={synopsis}");
    const providers = CONTENT.indexOf("{watchProviders}");
    const cast = CONTENT.indexOf("{cast}");

    expect(synopsis).toBeGreaterThan(-1);
    expect(providers).toBeGreaterThan(-1);
    expect(cast).toBeGreaterThan(providers);
  });

  /**
   * The synopsis goes to the **hero**, not to the page, and it goes there as a node.
   *
   * The whole point of moving it was that it belongs in the card with the poster it is a
   * description of. A change that put it back on the page would still render a synopsis
   * somewhere, in the right order, saying the right thing — which is exactly the kind of
   * silent regression this file exists for.
   */
  it("hands the synopsis to the hero rather than drawing it on the page", () => {
    expect(HERO).toContain("{synopsis}");
    expect(CONTENT).toContain("synopsis={synopsis}");
    // Not also loose on the page: the node can only be placed once, and two placements
    // would be a React key nobody wrote and a section rendered twice.
    expect(CONTENT).not.toMatch(/^\s*\{synopsis\}/m);
  });

  /**
   * A film gets no episode card, and the guard is on the **card** rather than only inside
   * the component it wraps.
   *
   * `ProgrammeNoteEpisodes` returns `null` for a film — `tests/programme-note.test.ts`
   * asserts that directly — but a `null` inside a `<section className={…CARD…}>` is an
   * empty card, not an absent one. The two guards are belt and braces and both are load
   * bearing.
   */
  it("draws no episode card for a film", () => {
    expect(CONTENT).toMatch(/detail\.kind === "film" \? null : \(/);
  });

  /**
   * A film's watched mark is in the hero, and a show's is not.
   *
   * The row moved out of the episode list, where it had been the film branch of a
   * component about episodes. `tests/film-watch-row.test.ts` owns what the row draws; this
   * is the placement, which is the half a render of the row cannot see.
   */
  it("puts a film's watched mark in the hero, behind a kind check", () => {
    expect(HERO).toContain("<FilmWatchRow");
    expect(HERO).toMatch(/detail\.kind === "film" \? \(/);
  });

  /**
   * *Remove from library* sits directly under the hero, above everything borrowed.
   *
   * It shared that card with the rating until the rating was retired, and it keeps the
   * position rather than moving: the card is where a reader has learned to find it, and
   * folding removal into the hero would put a destructive action in a group of additive
   * ones.
   */
  it("keeps Remove under the hero, above the episodes and the borrowed sections", () => {
    const remove = CONTENT.indexOf("<RemoveControl");
    const episodes = CONTENT.indexOf("<ProgrammeNoteEpisodes");
    const providers = CONTENT.indexOf("{watchProviders}");

    expect(remove).toBeGreaterThan(-1);
    expect(remove).toBeLessThan(episodes);
    expect(remove).toBeLessThan(providers);
  });

  /**
   * There is no rating anywhere on this screen, for either kind.
   *
   * The control and its action are deleted, and this is the guard against either coming
   * back by way of a half-finished revert. The **column** is untouched and deliberately so
   * — `db/access.ts`'s `rateTitle`, the delete-account figure and the remove page's *Your
   * rating* all still describe data this account really has — so the assertion is about
   * the two surfaces, not about the word.
   */
  it("offers no way to rate a title", () => {
    expect(CONTENT).not.toContain("RatingControl");
    expect(CONTENT).not.toContain("onRated");
    expect(HERO).not.toContain("RatingControl");
  });

  /**
   * Remove lost its scroll and keeps the guard that was always the real one.
   *
   * The control writes nothing: it is a `Link` to `/library/[entryId]/remove`, a whole
   * confirmation route with its own form. The distance down the page was a second line of
   * defence in front of that, and moving the control up costs a scroll rather than the
   * confirmation — which is why this asserts on the destination and not on the position.
   */
  it("still leads to the confirmation route rather than writing anything", () => {
    const remove = code("app/(signed-in)/library/remove-control.tsx");

    expect(remove).toContain("/remove`");
    expect(remove).not.toMatch(/removeTitleAction|onClick=/);
  });
});
