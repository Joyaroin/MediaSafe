import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UpcomingNothing } from "@/app/(signed-in)/up-next/upcoming-nothing";
import { UpcomingSurface } from "@/app/(signed-in)/up-next/upcoming-surface";
import type { UpcomingEpisode, UpcomingFilm } from "@/db/access";
import { ReadFailure } from "@/errors/read-failure";

/**
 * Upcoming, rendered — issues #251 and #252.
 *
 * `tests/upcoming-episodes.test.ts` and `tests/upcoming-films.test.ts` cover what the
 * database returns and `tests/upcoming-grouping.test.ts` covers what day a row falls under
 * and how many days away a film is. This covers the render, and only the parts whose
 * failure nothing else would announce:
 *
 *  1. **No row shows a time of day, and no row says the time is unknown.** The handoff
 *     draws both and the catalogue can support neither, so this is the one place in #245
 *     where the built screen deliberately diverges from the drawing — and a later edit
 *     "restoring" it would look like a fix.
 *  2. **Nothing upcoming is a sentence, and a failed read is not that sentence.** The bug
 *     this whole application is shaped around, on its second page.
 *  3. **An episode with no still keeps the row's measure.** A collapsed row is a layout
 *     fault that reads as a missing episode.
 *  4. **An unnamed episode is not numbered twice.** `CONTEXT.md`'s Named Episode Rule.
 *
 * #252 adds the films under them, and three more of the same kind:
 *
 *  5. **No release-type chip and no region.** Both are drawn in the handoff and neither is
 *     built, for a cost reason rather than a policy one — so an edit adding them back
 *     would look like completing the screen rather than putting a catalogue request behind
 *     every card.
 *  6. **The sentence answers the whole page.** Each half is absent when it has nothing, and
 *     *no release dates yet* is drawn only when **both** are — a reader with a dated film
 *     and no dated episode must not be told there is nothing coming.
 *  7. **A film with no poster gets the missing-artwork treatment**, not a collapsed card.
 *
 * ── Why this renders where `tests/up-next-phone-rails.test.ts` reads source ──────────
 *
 * Because it can. Everything below is a server component over plain props — no store, no
 * router, no `useSyncExternalStore` — so `renderToStaticMarkup` gives the real markup, the
 * way `tests/library-surface.test.ts` and `tests/stats-surface.test.ts` already do. The
 * pager is the exception and is source-read at the foot of this file: it is a client
 * component over `ResizeObserver` and Motion, and what is worth asserting about it is
 * structural rather than visual.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const PAGER = "app/(signed-in)/up-next/landing-pager.tsx";
const PAGE = "app/(signed-in)/up-next/page.tsx";

/** Today, for every case below. The rows are dated against it by hand so nothing here
 *  depends on when the suite runs. */
const TODAY = "2026-08-24";

let counter = 0;

function episodeOn(airDate: string, over: Partial<UpcomingEpisode> = {}): UpcomingEpisode {
  counter += 1;
  return {
    episodeId: `episode-${counter}`,
    libraryEntryId: `entry-${counter}`,
    titleName: "Severance",
    seasonNo: 2,
    episodeNo: 4,
    episodeName: "Woe's Hollow",
    stillPath: "/still.jpg",
    airDate,
    ...over,
  };
}

function filmOn(releaseDate: string, over: Partial<UpcomingFilm> = {}): UpcomingFilm {
  counter += 1;
  return {
    libraryEntryId: `film-entry-${counter}`,
    titleName: "One Battle After Another",
    posterPath: "/poster.jpg",
    releaseDate,
    ...over,
  };
}

function render(
  episodes: readonly UpcomingEpisode[],
  films: readonly UpcomingFilm[] = [],
  today = TODAY,
): string {
  return renderToStaticMarkup(createElement(UpcomingSurface, { episodes, films, today }));
}

/** The films half alone, for the cases that are only about it. */
function renderFilms(films: readonly UpcomingFilm[], today = TODAY): string {
  return render([], films, today);
}

describe("no row shows a time of day", () => {
  /**
   * The prototype's row reads `21:00 · in 4 hours`, or `Time unknown` where it has no
   * time. TMDB publishes an air date and no air time, so *time unknown* would be the only
   * state that line ever reached — #245 calls this the one place the handoff cannot be
   * built as drawn, and says no amendment changes it.
   */
  it("prints neither a clock time nor a *time unknown*", () => {
    const markup = render([
      episodeOn(TODAY),
      episodeOn("2026-08-25"),
      episodeOn("2026-08-27"),
      episodeOn("2026-12-01"),
    ]);

    expect(markup).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(markup.toLowerCase()).not.toContain("time unknown");
    expect(markup.toLowerCase()).not.toContain("unknown");
  });

  /** What it prints instead: the date, in `episode-facts.ts`'s long register. */
  it("prints the date", () => {
    expect(render([episodeOn("2026-08-27")])).toContain("27 August 2026");
  });
});

describe("the four headings", () => {
  it("names Today, Tomorrow, a weekday and Later, in date order", () => {
    const markup = render([
      episodeOn(TODAY),
      episodeOn("2026-08-25"),
      episodeOn("2026-08-27"),
      episodeOn("2026-12-01"),
    ]);

    const at = (label: string) => markup.indexOf(`>${label}<`);

    expect(at("Today")).toBeGreaterThan(-1);
    expect(at("Tomorrow")).toBeGreaterThan(at("Today"));
    expect(at("Thursday")).toBeGreaterThan(at("Tomorrow"));
    expect(at("Later")).toBeGreaterThan(at("Thursday"));
  });

  /** A day with nothing on it has no heading — `SPEC.md` §8's rule for a rail, applied to
   *  a group. Nothing reserves space for a bucket that is empty. */
  it("draws no heading for a day with nothing on it", () => {
    const markup = render([episodeOn("2026-12-01")]);

    expect(markup).toContain(">Later<");
    expect(markup).not.toContain(">Today<");
    expect(markup).not.toContain(">Tomorrow<");
  });
});

describe("nothing upcoming, and a read that failed", () => {
  /** The handoff's own sentence, not a blank page and not one of the other two empty
   *  states on this route. */
  it("renders the handoff's sentence when there is nothing coming", () => {
    const markup = render([]);

    expect(markup).toContain("No release dates yet");
    expect(markup).toContain("Nothing you keep has a date announced.");
  });

  /**
   * The one this application is shaped around. *No release dates yet* is exactly as
   * plausible a lie as *you're caught up* was, so the two treatments must not be able to
   * be mistaken for each other: the empty state is centred and has no rule, the failure is
   * left-aligned, accented and carries a reference id.
   */
  it("looks nothing like the read-failure treatment", () => {
    const empty = renderToStaticMarkup(createElement(UpcomingNothing));
    const failed = renderToStaticMarkup(
      createElement(ReadFailure, { reference: "abc123", retry: () => {} }),
    );

    expect(empty).toContain("text-center");
    expect(failed).not.toContain("text-center");
    expect(failed).toContain("abc123");
    expect(empty).not.toContain("abc123");
    expect(empty).not.toContain("No release dates yet".toLowerCase());
  });

  /** And it borrows neither of the two sentences already on this route.
   *  `docs/design/v1-surfaces.md` §6: these read differently and must not share copy. */
  it("does not borrow the landing screen's or the desktop's empty sentence", () => {
    const markup = render([]);

    expect(markup).not.toContain("Nothing queued for tonight");
    expect(markup).not.toContain("caught up");
  });
});

describe("a row that is missing something", () => {
  /**
   * `EpisodeStill` holds the 16:9 ratio through the `still` utility, so an episode TMDB
   * has no frame for keeps the row's measure and shows the `raised` ground — #245's user
   * story 48. What must not happen is the frame disappearing and the text sliding left.
   */
  it("keeps the still's frame when there is no still", () => {
    const withStill = render([episodeOn(TODAY)]);
    const without = render([episodeOn(TODAY, { stillPath: null })]);

    expect(withStill).toContain("<img");
    expect(without).not.toContain("<img");
    // The frame itself, at the same measure, in both.
    expect(without).toContain('class="still w-[84px] shrink-0"');
    expect(withStill).toContain('class="still w-[84px] shrink-0"');
  });

  /** An episode announced without a name prints its code and stops. The number is not
   *  repeated in the name's place — `CONTEXT.md`'s *never referred to by number alone*,
   *  which the code has already satisfied once. */
  it("does not number an unnamed episode twice", () => {
    const markup = render([episodeOn(TODAY, { episodeName: null })]);

    // The visible line is the code and nothing after it — no `S02 · E04 · Episode 4`, and
    // no bare `4` standing in for a name TMDB has not published.
    expect(markup).toContain(">S02 · E04</p>");
    // And what a screen reader hears stops in the same place.
    expect(markup).toContain('aria-label="Severance — S02 · E04"');
  });

  it("names the episode beside its code when there is a name", () => {
    expect(render([episodeOn(TODAY)])).toContain("S02 · E04 · Woe&#x27;s Hollow");
  });
});

describe("where a row goes", () => {
  /** The episode's own page beneath its owning library entry — the same destination the
   *  rail's card and a season row reach, so an episode behaves the same way everywhere. */
  it("links to the episode under its library entry", () => {
    const one = episodeOn(TODAY);
    const markup = render([one]);

    expect(markup).toContain(
      `href="/library/${one.libraryEntryId}/episode/${one.episodeId}"`,
    );
  });
});

describe("the films you are waiting for", () => {
  /** The section, its head, the date and the countdown — the whole of what #252 draws. */
  it("draws a dated film with its date and its countdown", () => {
    const markup = renderFilms([filmOn("2026-09-05")]);

    expect(markup).toContain("Upcoming movies");
    expect(markup).toContain("One Battle After Another");
    expect(markup).toContain("5 Sept 2026");
    expect(markup).toContain("In 12 days");
  });

  /**
   * The three the acceptance criteria name — one day, several days, and the day of
   * release. Zero is the one an `In ${days} days` alone gets wrong, and it is the day a
   * reader has been waiting for.
   */
  it("reads correctly at one day, several days and the day of release", () => {
    expect(renderFilms([filmOn(TODAY)])).toContain(">Today<");
    expect(renderFilms([filmOn("2026-08-25")])).toContain(">Tomorrow<");
    expect(renderFilms([filmOn("2026-09-27")])).toContain("In 34 days");
  });

  /** *In 0 days* and *In 1 day* are the two the words above exist to prevent. */
  it("never counts down in zeroes or in a singular day", () => {
    const markup = renderFilms([filmOn(TODAY), filmOn("2026-08-25"), filmOn("2026-09-05")]);

    expect(markup).not.toContain("In 0 days");
    expect(markup).not.toContain("In 1 day");
  });

  /**
   * A film released yesterday is not something you are waiting for — it is on the films
   * rail one page over, which is where a reader goes to watch it. The read deliberately
   * returns a day wider than the reader's own so no evening is missing from it, and this
   * is where that extra day is spent.
   */
  it("drops a film whose release date has passed", () => {
    const markup = renderFilms([
      filmOn("2026-08-23", { titleName: "Already Out" }),
      filmOn("2026-09-05", { titleName: "Still Coming" }),
    ]);

    expect(markup).toContain("Still Coming");
    expect(markup).not.toContain("Already Out");
  });

  /**
   * The countdown is the reader's, not the server's. The same list at the same instant
   * reads *Today* for a reader whose day it already is and *Tomorrow* for one whose day it
   * is not — which is the whole reason `today` is an argument to this component rather
   * than a `new Date()` inside it.
   */
  it("counts down against the day it is handed rather than any clock", () => {
    const film = filmOn("2026-08-25");

    expect(render([], [film], "2026-08-25")).toContain(">Today<");
    expect(render([], [film], "2026-08-24")).toContain(">Tomorrow<");
  });

  /**
   * `Poster` holds the `2/3` measure through the `poster` utility, so a film TMDB has no
   * artwork for keeps the card's measure and shows the ground — no glyph, no apology, and
   * no card that has quietly shrunk to the height of its own text.
   */
  it("keeps the poster's frame when there is no poster", () => {
    const withArt = renderFilms([filmOn("2026-09-05")]);
    const without = renderFilms([filmOn("2026-09-05", { posterPath: null })]);

    expect(withArt).toContain("<img");
    expect(without).not.toContain("<img");
    expect(without).toContain('class="poster ');
    // And it still says everything it knows about the film.
    expect(without).toContain("In 12 days");
  });

  /** A card navigates to the film's own page under its library entry, like every other
   *  film card in the build. */
  it("links to the film under its library entry", () => {
    const film = filmOn("2026-09-05");

    expect(renderFilms([film])).toContain(`href="/library/${film.libraryEntryId}"`);
  });

  /**
   * **The subtraction, asserted.** The handoff draws `Theatrical` and `· Canada`; both are
   * a catalogue request per film on a list surface and both go stale, so #252 leaves them
   * out. Without this, an edit restoring them would read as completing the screen.
   */
  it("shows no release-type chip and no region", () => {
    const markup = renderFilms([
      filmOn(TODAY),
      filmOn("2026-09-05"),
      filmOn("2026-12-12"),
    ]);

    for (const word of ["Theatrical", "Digital", "Physical", "Limited", "Premiere"]) {
      expect(markup).not.toContain(word);
    }
    // The date stands alone on its line: no `· Canada` and no region code after it.
    expect(markup).toContain(">5 Sept 2026<");
    expect(markup).not.toMatch(/\d{4}\s*·/);
  });

  /** Soonest first, which is the read's order and is passed through rather than re-sorted
   *  here — the countdown under the first card is the smallest number on the rail. */
  it("keeps the read's order", () => {
    const markup = renderFilms([
      filmOn("2026-09-05", { titleName: "Nearest" }),
      filmOn("2026-12-12", { titleName: "Furthest" }),
    ]);

    expect(markup.indexOf("Nearest")).toBeLessThan(markup.indexOf("Furthest"));
  });
});

describe("the two halves, and the one sentence", () => {
  /**
   * The sentence is the page's and belongs to neither half. A reader with a dated film and
   * no dated episode is not looking at an empty Upcoming, and telling them there is
   * nothing coming while a countdown sits under it would be the page contradicting itself.
   */
  it("does not claim the page is empty when only the films half has anything", () => {
    const markup = renderFilms([filmOn("2026-09-05")]);

    expect(markup).not.toContain("No release dates yet");
    expect(markup).toContain("In 12 days");
  });

  it("does not claim the page is empty when only the episodes half has anything", () => {
    const markup = render([episodeOn(TODAY)]);

    expect(markup).not.toContain("No release dates yet");
    expect(markup).toContain("Severance");
  });

  /** And each half is absent rather than empty-headed — `SPEC.md` §8, per section. */
  it("draws no head over a half that has nothing", () => {
    expect(renderFilms([filmOn("2026-09-05")])).not.toContain("Upcoming episodes");
    expect(render([episodeOn(TODAY)])).not.toContain("Upcoming movies");
  });

  /** Both empty is the one case the sentence is for. */
  it("draws the sentence only when both halves are empty", () => {
    const markup = render([], []);

    expect(markup).toContain("No release dates yet");
    expect(markup).not.toContain("Upcoming episodes");
    expect(markup).not.toContain("Upcoming movies");
  });

  /** Episodes above, films under them — the handoff's order. */
  it("draws the episodes above the films", () => {
    const markup = render([episodeOn(TODAY)], [filmOn("2026-09-05")]);

    expect(markup.indexOf("Upcoming episodes")).toBeLessThan(
      markup.indexOf("Upcoming movies"),
    );
  });
});

describe("the pager", () => {
  const pager = sourceAt(PAGER);

  /** Real tab controls, which is what makes the gesture not the only way in. A `div` with
   *  a click handler would pass every other assertion in this file. */
  it("is a real tab set", () => {
    expect(pager).toContain('role="tablist"');
    expect(pager).toContain('role="tab"');
    expect(pager).toContain('role="tabpanel"');
    expect(pager).toContain("aria-selected");
    expect(pager).toContain("aria-controls");
  });

  it("moves between the tabs with the arrow keys", () => {
    expect(pager).toContain("ArrowLeft");
    expect(pager).toContain("ArrowRight");
  });

  /**
   * The rules are the shared module's and not this file's. That is the ticket's own seam:
   * a threshold or an axis test written inline here would be a rule nothing without a
   * browser could assert, which is the whole reason `app/gesture-rules.ts` exists.
   */
  it("takes its drag rules from the shared module rather than writing its own", () => {
    expect(pager).toContain('from "@/app/gesture-rules"');
    expect(pager).toContain("releaseDrag");
    expect(pager).toContain("dragOffset");
    // No second threshold, typed at a call site.
    expect(pager).not.toMatch(/threshold:\s*\d/);
  });

  /**
   * Reduced motion is `MotionConfig`'s, at the root, and not a branch here — the app has
   * one answer to it (`app/motion-provider.tsx`) and a second would be a second answer.
   * What this asserts is that both moving parts go through Motion at all, since a raw CSS
   * transition would sail straight past the global setting.
   */
  it("animates through Motion, so the root's reduced-motion setting reaches it", () => {
    expect(pager).toContain('from "motion/react"');
    expect(pager).toContain("<motion.div");
    expect(pager).toContain("<motion.span");
    expect(pager).not.toContain("transition-transform");
  });

  /** Both pages are mounted, because a drag reveals the next one before it is selected. */
  it("mounts both pages rather than the selected one", () => {
    expect(pager).toContain("upNext: React.ReactNode");
    expect(pager).toContain("upcoming: React.ReactNode");
  });

  /**
   * **The rails inside page one keep their own swipes.** `up-next-phone-rail.tsx` scrolls
   * horizontally, and `touch-action` is intersected down the whole ancestor chain — so a
   * `touch-pan-y` on this track silently takes native horizontal scrolling away from both
   * rails, which is #245's *both rails leave the next card peeking … so that it is obvious
   * they scroll*, dead on touch. Nothing would throw and no other test would notice.
   *
   * Two halves, and each alone is insufficient: the track must not set `touch-action`, and
   * the binding must refuse a gesture that began inside a horizontal scroller.
   */
  it("leaves the rails inside it their own horizontal scrolling", () => {
    expect(pager).not.toContain("touch-pan-y");
    expect(pager).not.toContain("touch-none");
    expect(pager).toContain("overHorizontalScroller");
    expect(pager).toContain("overflowX");
  });

  /**
   * The claim is latched once per gesture, not re-derived per frame — a thumb on an arc
   * would otherwise snap the page back to nothing mid-drag. The rules module takes it as
   * an argument precisely so the latch is visible here.
   */
  it("latches whose gesture it is instead of re-asking every frame", () => {
    expect(pager).toContain("claimed: boolean | null");
    expect(pager).toContain("claimsDrag");
  });

  /** A pointer released off the track still has to reach `onPointerUp`, or the page parks
   *  mid-drag until the next press. */
  it("captures the pointer once the drag is real", () => {
    expect(pager).toContain("setPointerCapture");
  });

  /** A drag that began on a row's `Link` must not also navigate on release — a gesture is
   *  never two things at once. */
  it("swallows the click a drag would otherwise generate", () => {
    expect(pager).toContain("onClickCapture");
    expect(pager).toContain("dragged");
  });
});

describe("the page hands the pager both surfaces and one day", () => {
  const page = sourceAt(PAGE);

  it("draws Up next and Upcoming as the pager's two pages", () => {
    expect(page).toMatch(/<LandingPager/);
    expect(page).toMatch(/upNext=\{<UpNextPhoneRails rails=\{rails\} films=\{films\} \/>\}/);
    expect(page).toMatch(
      /<UpcomingSurface\s+episodes=\{upcoming\}\s+films=\{upcomingFilms\}\s+today=\{today\}\s*\/>/,
    );
  });

  /** Both of Upcoming's reads go through the cache under the pager's own tag, so a write
   *  on page one cannot leave page two describing a watchlist that has moved. */
  it("reads both halves of Upcoming through the cache", () => {
    expect(page).toContain("cachedUpcomingEpisodes(userId)");
    expect(page).toContain("cachedUpcomingFilms(userId)");
  });

  /** The one clock on this route, read once, against the reader's own zone. A second
   *  `new Date()` anywhere under `up-next/` would be a second answer to *what day is it*. */
  it("reads the reader's day once, from their own timezone", () => {
    expect(page).toContain("requireTimezone()");
    expect(page).toContain("readerDay(zone, new Date())");
    expect(page.match(/new Date\(\)/g)).toHaveLength(1);
  });

  /** The pager is the phone's. `SPEC.md`'s *Specced, but later* still carries *desktop
   *  rails other than Up next's three (Upcoming)*, and #245 asked for a phone pager. */
  it("leaves the desktop's three rails alone", () => {
    expect(page).toMatch(/className="hidden lg:block"[\s\S]*<UpNextRailsSurface/);
  });

  /**
   * **A failed read is never an empty page** — #251's *a failed read renders the inline
   * read-failure treatment with a reference id*, which is this route's `error.tsx` and is
   * only reached because nothing on the way to it catches.
   *
   * `cachedUpcomingEpisodes` throws through `unstable_cache`, `Promise.all` rejects on the
   * first rejection, and there is no `try` here — so *no release dates yet* is reachable
   * only from a read that succeeded. A `catch` returning `[]` anywhere on this path would
   * turn a database that is down into a reader with nothing coming, which is the exact
   * failure `AGENTS.md` opens on and the one `tvtracker` shipped for its whole life.
   */
  it("lets a failed read throw to the boundary rather than reading as nothing coming", () => {
    // The statement forms, not the word: this page's docblock says *there is no `try`
    // here* in prose, and an assertion that banned the word would ban saying so.
    expect(page).not.toMatch(/\btry\s*\{/);
    expect(page).not.toMatch(/\bcatch\s*[({]/);

    const boundary = sourceAt("app/(signed-in)/up-next/error.tsx");
    expect(boundary).toContain("<ReadFailure");
    expect(boundary).toContain("referenceForBoundary");
  });
});
