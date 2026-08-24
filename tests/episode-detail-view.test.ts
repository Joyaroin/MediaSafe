import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EpisodeDetailView } from "@/app/(signed-in)/library/[entryId]/episode/[episodeId]/episode-detail-view";
import { locateEpisode } from "@/app/(signed-in)/library/episode-run";
import type { EpisodeDetail } from "@/db/access";

/**
 * The episode page's body — issue #253's surface, and everything about it that a render
 * could get wrong **silently**, which is the standard `tests/programme-note.test.ts` holds
 * the season list to and the reason both files exist.
 *
 * ── What this stops short of, and why ────────────────────────────────────────────────
 *
 * The synopsis. It arrives as an already-rendered Server Component node from `page.tsx`,
 * and the component behind it (`live-title-facts.tsx`) cannot be imported under Vitest at
 * all — its graph reaches `tmdb/catalogue.ts`, which is `import "server-only"`.
 * `tests/episode-synopsis-states.test.ts` is where that half is held instead, on the two
 * sentences rather than on the markup. Here the node is a plain marker, which is enough to
 * assert the one thing this component decides about it: **where it goes**.
 *
 * The marks are rendered through their server snapshot — `watch-marks.ts` is a client
 * module with no store on the server, so `useWatchMark` and `useLiveEpisodes` hand back the
 * seed they were given. That is exactly the branch a reader sees on first paint, and it is
 * the branch worth asserting: what the page offers before anything has been pressed.
 */

function episode(overrides: Partial<EpisodeDetail> = {}): EpisodeDetail {
  return {
    id: "s1e1",
    seasonNo: 1,
    episodeNo: 1,
    name: "Winter Is Coming",
    stillPath: "/still.jpg",
    airDate: "2026-03-01",
    runtimeMins: 58,
    watched: false,
    upNext: false,
    ...overrides,
  };
}

/** A run in `getTitleDetail`'s order — specials first, as Postgres returns them. */
const RUN: EpisodeDetail[] = [
  episode({ id: "s0e1", seasonNo: 0, episodeNo: 1, name: "Making Of" }),
  episode({ id: "s1e1", seasonNo: 1, episodeNo: 1, name: "Winter Is Coming" }),
  episode({ id: "s1e2", seasonNo: 1, episodeNo: 2, name: "The Kingsroad" }),
  episode({ id: "s1e3", seasonNo: 1, episodeNo: 3, name: "Lord Snow" }),
];

/** The page body for one episode of `episodes`, as `page.tsx` assembles it. */
function view(episodeId: string, episodes: readonly EpisodeDetail[] = RUN): string {
  const located = locateEpisode(episodes, episodeId);
  if (located === null) throw new Error(`No ${episodeId} in this fixture.`);

  return renderToStaticMarkup(
    createElement(EpisodeDetailView, {
      libraryEntryId: "entry-1",
      titleName: "Game of Thrones",
      episodes,
      located,
      synopsis: createElement("p", null, "SYNOPSIS-NODE"),
    }),
  );
}

describe("what the page says about the episode", () => {
  it("names the series, the season and episode, and the episode itself", () => {
    const html = view("s1e2");

    expect(html).toContain("Game of Thrones");
    expect(html).toContain("Season 1");
    expect(html).toContain("Episode 2");
    expect(html).toContain("The Kingsroad");
  });

  /**
   * **The Named Episode Rule** (`DESIGN.md`, and `CONTEXT.md`'s *an episode is never
   * referred to by number alone*). This is the surface it would degrade on: the episode is
   * the page's whole subject, so a missing name is the one place a bare number would look
   * like a reasonable fallback.
   */
  it("says 'Not yet named' rather than printing the number a second time", () => {
    const unnamed = [episode({ id: "s1e1", name: null })];
    const html = view("s1e1", unnamed);

    expect(html).toContain("Not yet named");
    // The number is on its own line above the name, so it appears once and only there.
    expect(html.match(/Episode 1/g)).toHaveLength(1);
  });

  it("prints the season word for specials rather than 'Season 0'", () => {
    const html = view("s0e1");

    expect(html).toContain("Specials");
    expect(html).not.toContain("Season 0");
  });

  it("draws the date and the runtime", () => {
    expect(view("s1e1")).toContain("1 March 2026 · 58 min");
  });

  /**
   * A missing half is dropped rather than captioned — `episode-facts.ts`'s rule, seen
   * through the surface that renders it. No dash, no *unknown*, and **no empty `<p>`**
   * holding a real line's space, which is what `episodeMetaLine` returns `null` for.
   *
   * Asserted on the element rather than on its words. The first draft of this looked for
   * the absence of the substring `min` and failed against *Winter Is Co**min**g* — a test
   * that was reading the episode's name and calling it a runtime.
   */
  it("draws no meta line at all when TMDB has neither date nor runtime", () => {
    const bare = [episode({ id: "s1e1", airDate: null, runtimeMins: null })];
    const html = view("s1e1", bare);

    expect(html).not.toContain('class="mt-2 text-item text-dim"');
    expect(html).not.toContain("unknown");
    // And the same fixture with both fields present *does* draw it, so the assertion
    // above is about this episode's data rather than about a class that has been renamed.
    expect(view("s1e1")).toContain('class="mt-2 text-item text-dim"');
  });

  it("puts the synopsis node on the page", () => {
    expect(view("s1e1")).toContain("SYNOPSIS-NODE");
  });
});

describe("the still", () => {
  it("renders TMDB's frame when there is one", () => {
    expect(view("s1e1")).toContain("image.tmdb.org/t/p/w780/still.jpg");
  });

  /**
   * **An episode with no still renders the placeholder** — #253's criterion, and #245's
   * user story 48: *so that a missing still does not collapse the row*.
   *
   * The placeholder is the framed well itself, holding its `16 / 9` measure over the
   * `raised` ground. So the assertion is that the frame is still drawn and that nothing
   * apologises inside it — `app/poster.tsx` refuses a "no image" glyph on the grounds that
   * it *would be the only apology in a world that has none*, and this follows it.
   */
  it("keeps the frame, and puts nothing in it, when TMDB has no still", () => {
    const html = view("s1e1", [episode({ id: "s1e1", stillPath: null })]);

    expect(html).toContain("still");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("No image");
  });
});

describe("marking, from the episode's own page", () => {
  it("offers the mark on an unwatched episode", () => {
    const html = view("s1e1");

    expect(html).toContain("Mark watched");
    expect(html).not.toContain("Unwatch");
  });

  /**
   * A watched episode offers *Rewatch* and *Unwatch* and no mark — the season row's rule
   * (issue #145: *a watched row offers an unwatch, that is the whole rule*), on the page.
   */
  it("offers rewatch and unwatch on a watched episode, and no mark", () => {
    const html = view("s1e1", [episode({ id: "s1e1", watched: true })]);

    expect(html).toContain("Rewatch");
    expect(html).toContain("Unwatch");
    expect(html).not.toContain("Mark watched");
  });

  /**
   * *Watched up to here* is offered exactly where something **earlier** is unwatched —
   * `mark-up-to.ts`'s rule, unchanged and reused rather than restated here.
   */
  it("offers 'watched up to here' when earlier episodes are unwatched", () => {
    expect(view("s1e3")).toContain("Watched up to here");
  });

  /**
   * And is not drawn at all on the first episode of a run, where there is nothing earlier
   * to record. A control offered over work it will not do is the dead control issue #194
   * asks for the opposite of.
   */
  it("does not draw it where there is nothing earlier to record", () => {
    expect(view("s1e1")).not.toContain("Watched up to here");
  });

  /**
   * Nor on a special, whatever sits before it: a watch of a special changes no derived
   * state, so the press would record nothing. `coveredUpTo` returns `null` above season
   * zero only, and this is that rule arriving on the page.
   */
  it("does not draw it on a special", () => {
    expect(view("s0e1")).not.toContain("Watched up to here");
  });

  /** The spoken label names the episode in full, because the visible words do not say
   *  which episode the control acts through. `markUpToLabel` is the one writing it. */
  it("names the episode in full in the control's label", () => {
    expect(view("s1e3")).toContain("Season 1, Episode 3 — Lord Snow");
  });
});

describe("moving through the run", () => {
  it("links to the previous and next episode by their own routes", () => {
    const html = view("s1e2");

    expect(html).toContain('href="/library/entry-1/episode/s1e1"');
    expect(html).toContain('href="/library/entry-1/episode/s1e3"');
  });

  /**
   * **The first and last episode of a run render without a broken control.** Nothing is
   * drawn where there is nowhere to go — not a disabled target a thumb will find and a
   * screen reader will announce, which is the other way to satisfy the criterion and the
   * one `EpisodeRunControls` argues against.
   */
  it("draws no previous at the front of the run", () => {
    const html = view("s1e1");

    expect(html).not.toContain("‹ Previous");
    expect(html).toContain("Next ›");
  });

  it("draws no next at the back of the run", () => {
    // Specials sort last on screen (#216), so the run ends on one — which is also why
    // this is `s0e1` and not `s1e3`.
    const html = view("s0e1");

    expect(html).toContain("‹ Previous");
    expect(html).not.toContain("Next ›");
  });

  it("draws neither on a show with a single episode", () => {
    const html = view("s1e1", [episode({ id: "s1e1" })]);

    expect(html).not.toContain("‹ Previous");
    expect(html).not.toContain("Next ›");
  });

  /** The neighbour is named in full to a screen reader, for `CONTEXT.md`'s reason: a link
   *  to an episode is still a reference to one. */
  it("names the destination episode in the link's label", () => {
    expect(view("s1e2")).toContain("Next episode: Season 1, Episode 3 — Lord Snow");
  });
});
