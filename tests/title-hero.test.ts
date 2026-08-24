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
const ABANDON = code("app/(signed-in)/library/abandon-control.tsx");
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

describe("the one state anybody sets by hand", () => {
  /**
   * The most important property on this screen, and it survived the hero being rebuilt
   * twice. `CONTEXT.md`: four of the five states are derived from your watches and only
   * *abandoned* is set by hand. Nothing here may write a state.
   *
   * There was briefly a *Where this stands* menu in the hero offering *Mark everything
   * watched* alongside *Give up on this*. It went — the label read as a settings control
   * and it put the write anybody reaches for behind two presses — and `AbandonControl`
   * took its place, which is what was there before the restructure.
   */
  it("writes the abandon flag and never a derived state", () => {
    expect(HERO).toContain("<AbandonControl");
    expect(ABANDON).toMatch(/abandonAction|unabandonAction/);

    for (const derived of ['"watching"', '"caught_up"', '"finished"', '"watchlist"']) {
      expect(ABANDON).not.toContain(derived);
      expect(HERO).not.toContain(`state={"${derived}"}`);
    }
  });

  /**
   * The hero reads the state to *print* it and never to set it — `STATE_LABELS` keyed by
   * `detail.state`, which is what the view computed in SQL.
   */
  it("reads the state to print it", () => {
    expect(HERO).toMatch(/STATE_LABELS\[detail\.state\]/);
  });
});

describe("the order of the screen", () => {
  /**
   * Cast last, after the rating — which is why the streamed facts arrive as two nodes
   * rather than one. A single `liveFacts` node could only place all three together, and
   * the failure mode is silent: cast simply reappears in the middle.
   */
  it("places cast last, after the streamed facts", () => {
    const cast = CONTENT.indexOf("{cast}");
    const facts = CONTENT.indexOf("{liveFacts}");

    expect(facts).toBeGreaterThan(-1);
    expect(cast).toBeGreaterThan(facts);
  });

  /**
   * Your rating and *Remove from library* sit directly under the hero, above everything
   * borrowed. They were at the foot, below the episode list; burying the rating under
   * sixty episode rows made the one fact MediaSafe actually **owns** about a title the
   * hardest thing on the page to reach.
   */
  it("puts the owned things above the borrowed ones", () => {
    const rating = CONTENT.indexOf("<RatingControl");
    const remove = CONTENT.indexOf("<RemoveControl");
    const facts = CONTENT.indexOf("{liveFacts}");
    const episodes = CONTENT.indexOf("<ProgrammeNoteEpisodes");

    expect(rating).toBeGreaterThan(-1);
    expect(rating).toBeLessThan(facts);
    expect(remove).toBeLessThan(facts);
    expect(remove).toBeLessThan(episodes);
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
