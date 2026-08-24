import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { watchProgress } from "@/app/(signed-in)/library/progress-remaining";
import type { EpisodeDetail } from "@/db/access";

/**
 * The restructured title detail, and the parts of it that would go wrong **quietly**.
 *
 * Most of this change is visible the moment the screen loads. These are not: a progress
 * bar that disagrees with the sentence beside it, a status menu that starts writing a
 * state instead of causing one, and a bulk mark that covers a different set of episodes
 * from the control it was modelled on.
 */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const HERO = code("app/(signed-in)/library/title-hero.tsx");
const MENU = code("app/(signed-in)/library/state-actions-dialog.tsx");
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

describe("the status menu causes states rather than setting them", () => {
  /**
   * The single most important property in this change. `CONTEXT.md`: four of the five
   * states are derived from watches and only *abandoned* is set by hand. A menu that
   * wrote a state would let the library claim you finished a show you have no watches
   * for, and every figure derived from watches would disagree with it.
   */
  it("writes watches and the abandon flag, and never a state", () => {
    expect(MENU).toContain("watchMarks.markUpTo");
    expect(MENU).toContain("onAbandon");

    // No state is assigned, and none of the four derived ones is even named as a value.
    for (const derived of ['"watching"', '"caught_up"', '"finished"', '"watchlist"']) {
      expect(MENU).not.toContain(derived);
    }
  });

  /**
   * *Mark everything watched* is *watched up to here* aimed at the end of the show, and it
   * reuses that function rather than re-deriving the filter. Two definitions of which
   * episodes a bulk mark covers would be free to disagree about specials or about an
   * episode already watched — and the disagreement would surface as a count that does not
   * match what lands.
   */
  it("reuses coveredUpTo rather than writing a second coverage rule", () => {
    expect(MENU).toContain("coveredUpTo");
    expect(MENU).not.toMatch(/episodes\.filter\([^)]*!one\.watched/);
  });

  /** Two entries. The round trip back to Watchlist needs a bulk unwatch that does not
   *  exist, and inventing one here would destroy watches irrecoverably with no
   *  confirmation of its own. */
  it("offers no third entry", () => {
    expect(MENU).not.toContain("Unwatch everything");
  });
});

describe("the order of the screen", () => {
  /**
   * Cast last, after the rating — which is why the streamed facts arrive as two nodes
   * rather than one. A single `liveFacts` node could only place all three together, and
   * the failure mode is silent: cast simply reappears in the middle.
   */
  it("places cast after the rating, in its own slot", () => {
    const rating = CONTENT.indexOf("<RatingControl");
    const cast = CONTENT.indexOf("{cast}");
    const facts = CONTENT.indexOf("{liveFacts}");

    expect(facts).toBeGreaterThan(-1);
    expect(rating).toBeGreaterThan(facts);
    expect(cast).toBeGreaterThan(rating);
  });

  /**
   * Remove is last and is deliberately **not** in a card. It destroys watches and ratings
   * irrecoverably; giving it the same treatment as the rating would file it as one more
   * setting, and the screen this restructure follows puts it a thumb's width from *Mark
   * watched*.
   */
  it("leaves Remove at the foot and out of a card", () => {
    const remove = CONTENT.indexOf("<RemoveControl");
    expect(remove).toBeGreaterThan(CONTENT.indexOf("{cast}"));
    expect(CONTENT.slice(remove - 220, remove)).not.toContain("PROGRAMME_NOTE_CARD");
  });
});
