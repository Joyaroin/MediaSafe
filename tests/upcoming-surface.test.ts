import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { nextPerTitle } from "@/app/(signed-in)/up-next/upcoming-grouping";
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
 *  4. **An unnamed episode is not numbered twice.** The Named Episode Rule.
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
 * way `tests/library-surface.test.ts` and `tests/you-surface.test.ts` already do. The
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
    // The show's poster, which is what an upcoming row draws — an unaired episode has no
    // still of its own, which is why these rows were drawing an empty box.
    posterPath: "/severance.jpg",
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

  /** What it prints instead: how far away the episode is, from the reader's today. */
  it("prints how many days away it is", () => {
    expect(render([episodeOn("2026-08-27")])).toContain("In 3 days");
    expect(render([episodeOn("2026-08-25")])).toContain("Tomorrow");
  });
});

describe("one list, in air-date order", () => {
  /** The day headings are gone: each row says how far away it is, so a heading saying the
   *  same thing again was noise, and *Later* said nothing at all. */
  it("orders the rows by air date, each carrying its own distance", () => {
    const markup = render([
      episodeOn(TODAY),
      episodeOn("2026-08-25"),
      episodeOn("2026-12-01"),
    ]);

    const at = (label: string) => markup.indexOf(label);

    expect(at("Today")).toBeGreaterThan(-1);
    expect(at("Tomorrow")).toBeGreaterThan(at("Today"));
    expect(at("In 99 days")).toBeGreaterThan(at("Tomorrow"));
    expect(markup).not.toContain(">Later<");
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
   *  These read differently and must not share copy. */
  it("does not borrow the landing screen's or the desktop's empty sentence", () => {
    const markup = render([]);

    expect(markup).not.toContain("Nothing queued for tonight");
    expect(markup).not.toContain("caught up");
  });
});

describe("a row that is missing something", () => {
  /**
   * The row draws the **show's poster**, not the episode's still.
   *
   * Every episode here is unaired and TMDB nearly always has no still for one — so the
   * old row drew an empty frame on every row of the list, which is what #245's user story
   * 48 was protecting the *measure* of. The measure still holds; there is now a picture
   * inside it.
   */
  it("draws the show's poster rather than the episode's still", () => {
    const markup = render([episodeOn(TODAY)]);

    expect(markup).toContain("/severance.jpg");
    // The still's own frame is gone from this row entirely — it never had anything in it.
    expect(markup).not.toContain('class="still');
    expect(markup).toContain('class="poster w-14 shrink-0 [--poster-radius:var(--radius-4)]"');
  });

  /**
   * And a show TMDB has no poster for keeps the frame and shows its initials, rather than
   * the empty rectangle every row of this list used to be — `app/poster.tsx`'s fallback,
   * which is exactly the case it was built for.
   */
  it("falls back to the show's initials when there is no poster", () => {
    const markup = render([episodeOn(TODAY, { posterPath: null })]);

    expect(markup).not.toContain("<img");
    expect(markup).toContain('class="poster w-14 shrink-0 [--poster-radius:var(--radius-4)]"');
    // `Severance` — one word, one initial.
    expect(markup).toContain(">S<");
  });

  /** An episode announced without a name prints its code and stops. The number is not
   *  repeated in the name's place — *never referred to by number alone*,
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
  /** The episode's own page — its own route since #289, carrying the episode's id and no
   *  entry beside it. The same destination a season row reaches, so an episode behaves the
   *  same way everywhere. */
  it("links to the episode's own route", () => {
    const one = episodeOn(TODAY);
    const markup = render([one]);

    /* The title, not the episode: `/episodes/[episodeId]` is deleted, and what an
       upcoming row can lead to is the show it announces. */
    expect(markup).toContain(`href="/titles/${one.libraryEntryId}"`);
    expect(markup).not.toContain(`/library/${one.libraryEntryId}/episode/`);
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

  /** A card navigates to the film's own page — `/titles/{entryId}` since #290, like every
   *  other film card in the build. */
  it("links to the film at the address a held title has", () => {
    const film = filmOn("2026-09-05");

    expect(renderFilms([film])).toContain(`href="/titles/${film.libraryEntryId}"`);
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

  /**
   * **The accent, and only on the countdown.** The accent is rationed, and narrowed
   * for exactly this line; the amendment's second condition is that the date it
   * counts to is *not* accented, so the two lines must not drift into matching. Nothing
   * else about the card is chromatic — no chip, no badge, no check.
   */
  it("accents the countdown and leaves the date dim", () => {
    const markup = renderFilms([filmOn("2026-09-05")]);

    expect(markup).toMatch(/text-accent[^>]*>In 12 days</);
    expect(markup).toMatch(/text-dim[^>]*>5 Sept 2026</);
    expect(markup).not.toMatch(/text-accent[^>]*>5 Sept 2026</);
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

  /** And each half is absent rather than empty-headed, per section. */
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
   *
   * **The spelling changed and the property did not.** This read `motion/react` and
   * `<motion.div>` until the runtime was put behind `LazyMotion`: every call site now
   * imports the *mini* components from `motion/react-m`, so the animation engine is a
   * chunk fetched alongside the page rather than part of every route's first load — which
   * it was, on every route, including the several that animate nothing. The two elements
   * here are still Motion's, `MotionConfig` still sits above them, and the setting still
   * reaches them, which is the whole of what this case is about. `strict` on the provider
   * is what makes the old spelling throw rather than quietly re-bundle the runtime.
   */
  it("animates through Motion, so the root's reduced-motion setting reaches it", () => {
    expect(pager).toContain('from "motion/react-m"');
    expect(pager).toContain("<m.div");
    expect(pager).toContain("<m.span");
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

  /**
   * A drag that began on a row's `Link` must not also navigate on release — a gesture is
   * never two things at once.
   *
   * **Issue #277 moved the decision into the rules module and this case with it.** It read
   * `toContain("dragged")` — the name of a boolean ref this file kept — which passed for
   * any use of that word anywhere in the file, including the one in a comment. The rule is
   * now `deliversClick`, asserted against its three answers in
   * `tests/gesture-rules.test.ts`, and what is left here is that the binding *asks* it.
   */
  it("swallows the click a claimed gesture would otherwise deliver to a child", () => {
    expect(pager).toContain("onClickCapture");
    expect(pager).toContain("deliversClick");
    expect(pager).toMatch(/if \(deliversClick\(claimed\)\) return;/);
    expect(pager).toContain("event.preventDefault()");
    expect(pager).toContain("event.stopPropagation()");
  });

  /**
   * ── The pointer audit — issue #277 ──────────────────────────────────────────────────
   *
   * The Android report behind #277 is second-hand and **unreproduced**, and the ticket
   * ships two hardenings on that basis rather than claiming a fix. This is the pager's
   * half: *a gesture the pager has claimed cannot also be delivered to a child.*
   *
   * What the audit found, and what these three cases pin, is that the binding never asked
   * **whose** pointer an event was. Every handler read `event.clientX` and acted on it, so
   * a second finger arriving mid-drag re-seated the origin the first one was measured
   * from, and a release from any pointer at all ended the gesture. On a phone that is not
   * an exotic input: it is a thumb and the hand holding the device.
   *
   * All three would fail silently. Nothing throws, the pager still pages, and the only
   * symptom is a page that jumps or a press that lands somewhere nobody asked for — which
   * is precisely the report.
   */
  it("drives the gesture from the pointer it began with and no other", () => {
    expect(pager).toContain("ownsPointer");
    expect(pager).toContain("pointerId: event.pointerId");

    // Every handler that reads a delta or ends a gesture asks first.
    const asks = pager.match(/ownsPointer\(from, event\.pointerId\)/g) ?? [];
    expect(asks.length).toBe(3);
  });

  /**
   * A second finger is not a second gesture, and must not re-seat the first one's origin.
   * `isPrimary` is the platform's own answer for touch; the second guard covers a pen or a
   * mouse arriving over a live one, since either is always primary for its own type.
   *
   * **And it is keyed to `claimed`, not to a bare `!== null`.** A claimed gesture has been
   * captured, so its release is guaranteed to come back here and refusing cannot strand
   * the pager; an unclaimed one is replaced instead, which is the only recovery there is
   * from a `pointerdown` whose release never arrived. A pager left permanently inert by
   * one lost event would be a worse bug than the one #277 is guessing at, and it is the
   * bug the obvious spelling of this guard has.
   */
  it("refuses a second pointer rather than letting it take over", () => {
    expect(pager).toContain("event.isPrimary");
    expect(pager).toMatch(/if \(gesture\.current\?\.claimed === true\) return;/);
  });

  /** A cancelled pointer generates no click, so nothing may be left armed to swallow one.
   *  The next press a reader makes is not the drag the browser took away. */
  it("arms no click swallow for a gesture the browser cancelled", () => {
    const cancel = pager.slice(pager.indexOf("const onPointerCancel"));
    expect(cancel).toMatch(/released\.current = null/);
  });
});

describe("the page hands the pager both surfaces and one day", () => {
  const page = sourceAt(PAGE);

  it("draws Watching and Coming up as the pager's two pages", () => {
    expect(page).toMatch(/<LandingPager upNext=\{watching\} upcoming=\{comingUp\} \/>/);
    expect(page).toMatch(/<UpNextWatching rails=\{rails\} films=\{films\} \/>/);
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
   *  `new Date()` anywhere in this file would be a second answer to *what day is it*. */
  it("reads the reader's day once, from their own timezone", () => {
    expect(page).toContain("requireTimezone()");
    expect(page).toContain("readerDay(zone, new Date())");
    expect(page.match(/new Date\(\)/g)).toHaveLength(1);
  });

  /** One structure on every screen size: the desktop stacks the same two halves the
   *  phone pages between, rather than a desktop-only arrangement of its own. */
  it("gives the desktop the same two halves, stacked", () => {
    expect(page).toMatch(/className="hidden [^"]*lg:block"[\s\S]*\{watching\}[\s\S]*\{comingUp\}/);
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

/** How many episode rows the surface drew — one `<li>` each, counted by the link inside
 *  it, which no other part of this screen renders.
 *
 *  It counted `/episodes/` links until that route was deleted; an upcoming row leads to the
 *  title now, like every other press in the application. */
function rowCount(markup: string): number {
  return (markup.match(/href="\/titles\//g) ?? []).length;
}

describe("one row per show, not one per episode", () => {
  /**
   * **The bug this suite exists for.**
   *
   * `listUpcomingEpisodes` returns every future-dated episode of every show you are
   * watching. The surface drew a row for each, so a show with a season already scheduled
   * — an anime dropping weekly for three months — filled the whole screen with itself:
   * nine rows of the same name, the same poster, differing only in a number and a date.
   *
   * It is the kind of thing that reads as *working* on a library of four titles and only
   * shows up on a real one, which is why it is asserted rather than looked at.
   */
  it("draws a show once however many episodes it has announced", () => {
    const markup = render([
      episodeOn(TODAY, { titleName: "JoJo's Bizarre Adventure", libraryEntryId: "jojo" }),
      episodeOn("2026-08-31", { titleName: "JoJo's Bizarre Adventure", libraryEntryId: "jojo" }),
      episodeOn("2026-09-07", { titleName: "JoJo's Bizarre Adventure", libraryEntryId: "jojo" }),
    ]);

    // Rows, not name occurrences: the title appears in the `aria-label` as well as the
    // visible line, so counting the name counts each row twice.
    expect(rowCount(markup)).toBe(1);
  });

  /** Two shows are two rows — the collapse is per show and not a cap on the list. */
  it("still draws every show", () => {
    const markup = render([
      episodeOn(TODAY, { titleName: "Severance", libraryEntryId: "sev" }),
      episodeOn(TODAY, { titleName: "The Bear", libraryEntryId: "bear" }),
    ]);

    expect(markup).toContain("Severance");
    expect(markup).toContain("The Bear");
  });

  /**
   * The row keeps the **soonest** episode and counts the rest. The query orders by air
   * date, so the first row seen for a show is its soonest — this asserts the collapse
   * preserves that rather than keeping whichever it happened to see last.
   */
  it("keeps the soonest episode and counts what is behind it", () => {
    const collapsed = nextPerTitle([
      episodeOn(TODAY, { libraryEntryId: "jojo", episodeNo: 2 }),
      episodeOn("2026-08-31", { libraryEntryId: "jojo", episodeNo: 3 }),
      episodeOn("2026-09-07", { libraryEntryId: "jojo", episodeNo: 4 }),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.episodeNo).toBe(2);
    expect(collapsed[0]?.more).toBe(2);
  });

  /** A show with one episode dated says nothing about a remainder that does not exist. */
  it("says nothing about a remainder when there is none", () => {
    const markup = render([episodeOn(TODAY, { libraryEntryId: "one" })]);

    expect(markup).not.toContain("remaining");
  });

  it("says how many are behind it when there are", () => {
    const markup = render([
      episodeOn(TODAY, { libraryEntryId: "jojo", episodeNo: 2 }),
      episodeOn("2026-08-31", { libraryEntryId: "jojo", episodeNo: 3 }),
    ]);

    expect(markup).toContain("+1 remaining");
  });

  /**
   * Collapsing has to happen **before** the day grouping, or a show still appears once per
   * day it airs — which is the bug, arrived at by a different route. This is the ordering
   * assertion: three episodes on three different days, one row.
   */
  it("collapses across days, not within them", () => {
    const markup = render([
      episodeOn(TODAY, { titleName: "Severance", libraryEntryId: "sev" }),
      episodeOn("2026-08-25", { titleName: "Severance", libraryEntryId: "sev" }),
      episodeOn("2026-09-20", { titleName: "Severance", libraryEntryId: "sev" }),
    ]);

    expect(rowCount(markup)).toBe(1);
  });
});
