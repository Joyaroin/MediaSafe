import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UpcomingNothing } from "@/app/(signed-in)/up-next/upcoming-nothing";
import { UpcomingSurface } from "@/app/(signed-in)/up-next/upcoming-surface";
import type { UpcomingEpisode } from "@/db/access";
import { ReadFailure } from "@/errors/read-failure";

/**
 * Upcoming, rendered — issue #251.
 *
 * `tests/upcoming-episodes.test.ts` covers what the database returns and
 * `tests/upcoming-grouping.test.ts` covers what day a row falls under. This covers the
 * render, and only the parts whose failure nothing else would announce:
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

function render(episodes: readonly UpcomingEpisode[], today = TODAY): string {
  return renderToStaticMarkup(createElement(UpcomingSurface, { episodes, today }));
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
});

describe("the page hands the pager both surfaces and one day", () => {
  const page = sourceAt(PAGE);

  it("draws Up next and Upcoming as the pager's two pages", () => {
    expect(page).toMatch(/<LandingPager/);
    expect(page).toMatch(/upNext=\{<UpNextPhoneRails rails=\{rails\} films=\{films\} \/>\}/);
    expect(page).toMatch(/upcoming=\{<UpcomingSurface episodes=\{upcoming\} today=\{today\} \/>\}/);
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
});
