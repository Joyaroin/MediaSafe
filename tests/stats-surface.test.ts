import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyStats } from "@/app/(signed-in)/stats/empty-stats";
import {
  averageInWords,
  dayInWords,
  decadeInWords,
  minutesInWords,
  monthInWords,
  plural,
  undatedNote,
} from "@/app/(signed-in)/stats/stats-figures";
import { StatsSurface } from "@/app/(signed-in)/stats/stats-surface";
import type { AccountStats } from "@/db/access";

/**
 * The Stats page as the reader meets it — issue #227.
 *
 * Two halves, both rendered without a browser: the pure formatting module, and the surface
 * itself rendered to a static string, which is how this suite already checks the Library and
 * the Lists rail.
 *
 * ── What is worth asserting on a page of numbers ─────────────────────────────────────
 *
 * Not that a number appears. The failures worth catching here are the ones that make the
 * page *dishonest* while it still renders perfectly:
 *
 *  - a partial watch-time total presented without the count it is short by;
 *  - a time-based section that quietly omits how many watches have no date;
 *  - `null` — *there is nothing to average* — rendered as `0.0`, which is a claim;
 *  - a genre statistic, or space reserved for one, which the ticket forbids outright.
 *
 * Every one of those is invisible to a typecheck and to a database test, and every one of
 * them is a sentence the ticket asks for by name.
 */

function stats(overrides: Partial<AccountStats> = {}): AccountStats {
  return {
    titles: 12,
    filmsWatched: 4,
    showsWatched: 3,
    episodesWatched: 210,
    episodesRemaining: 64,
    states: [
      { state: "watching", titles: 2 },
      { state: "caught_up", titles: 1 },
      { state: "finished", titles: 6 },
      { state: "watchlist", titles: 2 },
      { state: "abandoned", titles: 1 },
    ],
    recentlyFinished: [
      {
        libraryEntryId: "entry-1",
        name: "The Wire",
        releaseYear: 2002,
        posterPath: "/poster.jpg",
        finishedOn: "2026-08-14",
      },
    ],
    watchTime: { filmMinutes: 620, televisionMinutes: 8_400, watchesWithoutRuntime: 0 },
    episodesPerWeek: 6.25,
    episodesPerMonth: 27.2,
    activity: [
      { month: "2026-07", watches: 18 },
      { month: "2026-08", watches: 31 },
    ],
    topDecades: [
      { decade: 2000, titles: 7 },
      { decade: 1990, titles: 3 },
    ],
    titlesWithoutReleaseYear: 0,
    streakDays: 9,
    undatedWatches: 0,
    ...overrides,
  };
}

const surface = (overrides: Partial<AccountStats> = {}) =>
  renderToStaticMarkup(createElement(StatsSurface, { stats: stats(overrides) }));

describe("the numbers the page reports", () => {
  it("names every figure the ticket asks for", () => {
    const markup = surface();

    for (const label of [
      "Films",
      "Shows",
      "Episodes",
      "Episodes remaining",
      "Where things stand",
      "Recently finished",
      "Watch time",
      "Episodes a week",
      "Episodes a month",
      "Activity",
      "Top decades",
      "Streak",
    ]) {
      expect(markup, `${label} is missing from the page`).toContain(label);
    }
  });

  it("reports all five derived states in the glossary's own words", () => {
    const markup = surface();

    for (const label of ["Watching", "Caught up", "Finished", "Watchlist", "Abandoned"]) {
      expect(markup).toContain(label);
    }
    // `caught_up` is a column value, not a label. A mechanical un-snake-casing would put
    // this on the page and would be wrong in the register `CONTEXT.md` cares about.
    expect(markup).not.toContain("caught_up");
  });

  it("splits watch time into film and television", () => {
    const markup = surface({
      watchTime: { filmMinutes: 620, televisionMinutes: 8_400, watchesWithoutRuntime: 0 },
    });

    expect(markup).toContain("Film");
    expect(markup).toContain("Television");
    expect(markup).toContain("10 hours, 20 minutes");
    expect(markup).toContain("5 days, 20 hours");
  });
});

/**
 * The four sentences the ticket asks for by name. Each is asserted in both directions —
 * present when there is something to disclose, **absent** when there is not — because a
 * disclaimer that is always on screen is one a reader learns to skip.
 */
describe("what the page says it cannot count", () => {
  it("names the undated watches on every time-based section", () => {
    const markup = surface({ undatedWatches: 1_156 });

    expect(markup).toContain("1,156 watches carry no date and are not counted here.");
    // Streak, How often, Activity, Recently finished — four sections, four copies.
    expect(markup.split("carry no date and are not counted here.")).toHaveLength(5);
  });

  it("says nothing about dates when every watch has one", () => {
    expect(surface({ undatedWatches: 0 })).not.toContain("carry no date");
  });

  it("says how many watches carried no runtime, rather than presenting a partial sum as exact", () => {
    const markup = surface({
      watchTime: { filmMinutes: 620, televisionMinutes: 8_400, watchesWithoutRuntime: 37 },
    });

    expect(markup).toContain("37 watches carried no runtime");
    expect(markup).toContain("a floor rather than an exact figure");
  });

  it("makes no claim about runtimes when every watch carried one", () => {
    expect(surface()).not.toContain("carried no runtime");
  });

  it("says how many titles have no release year to place in a decade", () => {
    const markup = surface({ titlesWithoutReleaseYear: 4 });

    expect(markup).toContain("4 titles in your library have no release year on file");
  });
});

/**
 * The distinction the whole ticket turns on, at the surface. `null` reaches this component
 * from `db/access.ts` for an account with no dated watch, and it must not become a number.
 */
describe("no average is not an average of zero", () => {
  it("says there is not enough to say, rather than printing a figure", () => {
    const markup = surface({ episodesPerWeek: null, episodesPerMonth: null });

    expect(markup).toContain("not enough dated watches to say");
    expect(markup).not.toContain("0.0");
  });

  it("prints the average to one decimal when there is one", () => {
    const markup = surface({ episodesPerWeek: 6.25, episodesPerMonth: 27.2 });

    expect(markup).toContain("6.3 a week");
    expect(markup).toContain("27.2 a month");
  });
});

/**
 * `SPEC.md`'s parent: genre distribution ships nothing, *because there is no genre column,
 * no genre in the mirror, and nothing that has ever read one*. Asserted on the rendered page
 * and on the source of every file in the route, because *no space is reserved for one* is a
 * claim about markup that renders to nothing as much as about markup that renders.
 */
describe("there is no genre statistic, and no space held for one", () => {
  it("says nothing about genre on the page", () => {
    expect(surface().toLowerCase()).not.toContain("genre");
  });

  /**
   * *No space is reserved for one* is a claim about the read as much as about the markup:
   * a page cannot render a genre section it has no field for, and a field added in
   * anticipation is exactly the reservation the ticket forbids. Asserted on the shape the
   * surface is handed rather than on the files, because the files say the word — in the
   * docblocks explaining why there is nothing to say.
   */
  it("is handed no genre field to render one from", () => {
    expect(Object.keys(stats()).filter((key) => /genre/i.test(key))).toEqual([]);
  });

  it("holds no empty section open where one would go", () => {
    // A reserved space is a heading with nothing under it. Every `<h2>` on the page is a
    // section that reports something, and the count is asserted so that a tenth appearing
    // with no figures behind it fails here.
    expect(surface().match(/<h2/g)).toHaveLength(8);
  });
});

/**
 * The empty library. It is its own component and its own branch on `page.tsx`, so what is
 * asserted here is that it is a **sentence** rather than the surface with zeroes in it —
 * which is the acceptance criterion, and which a component that merely rendered
 * `StatsSurface` with a zeroed object would satisfy on every other check in this file.
 */
describe("an account with an empty library", () => {
  const empty = renderToStaticMarkup(createElement(EmptyStats));

  it("gets a sentence and a way out, not a grid of zeroes", () => {
    expect(empty).toContain("Nothing to count yet");
    expect(empty).toContain('href="/import"');
  });

  it("carries no figure at all", () => {
    expect(empty).not.toMatch(/>\s*0\s*</);
    for (const label of ["Watch time", "Streak", "Top decades", "Episodes remaining"]) {
      expect(empty).not.toContain(label);
    }
  });

  /**
   * The empty state and the read failure must not be mistakable for one another
   * (`DESIGN.md`, States). Three of the five differences that section names are checkable
   * from a static string, and these are those three: this one is **centred**, has **no
   * rule** over it, and carries **no reference id**. The failure is left-aligned under a
   * `2px` accent rule and always carries one.
   *
   * Not asserted: that the word `accent` is absent. It is present, on the recovery
   * button's ground — `empty-library.tsx` spends it the same way and shipped, because
   * `globals.css` reserves vermilion against *decoration*, and the one action on an empty
   * screen is not decoration. The heading, which is what a reader tells the two states
   * apart by, is `text` here and `accent` there.
   */
  it("looks nothing like the read failure", () => {
    expect(empty).toContain("text-center");
    expect(empty).toContain("text-bill-lg text-text");
    expect(empty).not.toContain("border-accent");
    expect(empty).not.toContain("text-bill-md text-accent");
    expect(empty).not.toContain("Reference");
  });
});

describe("turning a number into words", () => {
  it("gives the two largest units that are not zero, and never a third", () => {
    expect(minutesInWords(45)).toBe("45 minutes");
    expect(minutesInWords(60)).toBe("1 hour");
    expect(minutesInWords(95)).toBe("1 hour, 35 minutes");
    expect(minutesInWords(1_440)).toBe("1 day");
    expect(minutesInWords(1_535)).toBe("1 day, 1 hour");
    // The 35 minutes are dropped rather than rounded up into the hour above them.
    expect(minutesInWords(1_535)).not.toContain("minute");
  });

  it("calls no watch time none, rather than zero minutes", () => {
    expect(minutesInWords(0)).toBe("none");
  });

  it("pluralises, including the noun English does not pluralise regularly", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(2, "day")).toBe("2 days");
    expect(plural(1, "watch", "watches")).toBe("1 watch");
    expect(plural(2, "watch", "watches")).toBe("2 watches");
    expect(plural(1_156, "watch", "watches")).toBe("1,156 watches");
  });

  it("writes a month, a day and a decade the way a reader says them", () => {
    expect(monthInWords("2026-08")).toBe("August 2026");
    expect(dayInWords("2026-03-01")).toBe("1 March 2026");
    expect(decadeInWords(1990)).toBe("1990s");
  });

  /**
   * `finishedOn` has already been bucketed into the reader's own zone by the query
   * (`db/access.ts`). Re-interpreting it in the *server's* zone here would move the date by a
   * day for half the world, which is the same defect this ticket spent a SQL join avoiding —
   * so the formatter reads it as a plain calendar date and nothing else.
   */
  it("does not re-interpret a day that is already in the reader's zone", () => {
    expect(dayInWords("2026-01-01")).toBe("1 January 2026");
    expect(dayInWords("2026-12-31")).toBe("31 December 2026");
  });

  it("has no sentence to offer when nothing is undated", () => {
    expect(undatedNote(0)).toBeNull();
    expect(undatedNote(-1)).toBeNull();
  });

  it("agrees with itself about number when one watch is undated", () => {
    expect(undatedNote(1)).toBe("1 watch carries no date and is not counted here.");
    expect(undatedNote(2)).toBe("2 watches carry no date and are not counted here.");
  });

  it("says there is not enough to say, rather than naming a unit with no figure", () => {
    expect(averageInWords(null, "week")).toBe("not enough dated watches to say");
    expect(averageInWords(0, "week")).toBe("0.0 a week");
  });
});
