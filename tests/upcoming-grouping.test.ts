import { describe, expect, it } from "vitest";

import {
  daysUntilInWords,
  awaitedFilms,
  groupUpcoming,
  readerDay,
} from "@/app/(signed-in)/up-next/upcoming-grouping";

/**
 * The Upcoming grouping, driven directly — issue #251, and the half of it the ticket asks
 * for Opus over.
 *
 * *Today* has to mean the reader's today, and a grouping that is wrong by one timezone is
 * wrong forever and looks entirely correct. So the cases below are not *does it bucket* —
 * that would pass on a broken module — they are **a real day boundary in a non-UTC zone,
 * crossed in both directions**. `tests/server-day.test.ts` is the prior art: a day is a
 * claim about a zone, so it is asserted against one.
 *
 * No clock is read here because none is read there: `readerDay` takes the instant and
 * `groupUpcoming` takes the day, which is exactly what makes 23:30 in Auckland a case a
 * test can state.
 */

/** A row of the shape the read returns, reduced to the one field grouping reads. */
function on(airDate: string, name = airDate) {
  return { airDate, name };
}

describe("the reader's today is the reader's, not the server's", () => {
  /**
   * The case the ticket is about. At 13:30 UTC on the 24th it is already 01:30 on the
   * 25th in Auckland (UTC+12 in August — the southern winter, so no daylight saving) and
   * still mid-morning on the 24th in Honolulu (UTC-10). One instant, three answers to
   * *what day is it*, and the reader's is the only one that may reach a heading.
   */
  const instant = new Date("2026-08-24T13:30:00Z");

  it("is tomorrow's date east of the line", () => {
    expect(readerDay("Pacific/Auckland", instant)).toBe("2026-08-25");
  });

  it("is the same date in UTC", () => {
    expect(readerDay("UTC", instant)).toBe("2026-08-24");
  });

  it("is still the previous date far enough west", () => {
    expect(readerDay("Pacific/Honolulu", instant)).toBe("2026-08-24");
  });

  /** Just before midnight in Honolulu is already tomorrow in UTC — the other side of the
   *  same boundary, which is where a naive `toISOString().slice(0, 10)` gets it wrong. */
  it("is the day before UTC's when the reader is west of it late at night", () => {
    const late = new Date("2026-08-25T05:30:00Z");
    expect(readerDay("Pacific/Honolulu", late)).toBe("2026-08-24");
    expect(readerDay("UTC", late)).toBe("2026-08-25");
  });

  /** Zero-padded, because it is a key as much as a label and `2026-8-4` compares
   *  differently from `2026-08-04`. */
  it("pads a single-digit month and day", () => {
    expect(readerDay("UTC", new Date("2026-01-04T12:00:00Z"))).toBe("2026-01-04");
  });
});

describe("the same episode is grouped differently for two readers", () => {
  /**
   * One row and one instant; two zones. In Auckland it is already the 25th, so an episode
   * dated the 25th is **Today**; in UTC it is still the 24th, so the same episode is
   * **Tomorrow**. Both are right, and a module that read a clock could assert neither.
   */
  const instant = new Date("2026-08-24T13:30:00Z");
  const episodes = [on("2026-08-25")];

  it("is today for the reader whose day has already turned", () => {
    const groups = groupUpcoming(episodes, readerDay("Pacific/Auckland", instant));
    expect(groups.map((group) => group.label)).toEqual(["Today"]);
  });

  it("is tomorrow for the reader whose day has not", () => {
    const groups = groupUpcoming(episodes, readerDay("UTC", instant));
    expect(groups.map((group) => group.label)).toEqual(["Tomorrow"]);
  });
});

describe("the four buckets", () => {
  const today = "2026-08-24"; // a Monday

  const groups = groupUpcoming(
    [
      on("2026-08-24", "today"),
      on("2026-08-25", "tomorrow"),
      on("2026-08-26", "wednesday"),
      on("2026-08-30", "sunday"),
      on("2026-08-31", "later — the seventh day"),
      on("2026-12-01", "later — months out"),
    ],
    today,
  );

  it("names them Today, Tomorrow, a weekday and Later, in date order", () => {
    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Tomorrow",
      "Wednesday",
      "Sunday",
      "Later",
    ]);
  });

  /** The horizon: the sixth day ahead still gets its own name, the seventh is Later. A
   *  weekday name a week out would read as three days out. */
  it("collapses everything past the sixth day into one Later", () => {
    const later = groups.find((group) => group.label === "Later");
    expect(later?.episodes.map((episode) => episode.name)).toEqual([
      "later — the seventh day",
      "later — months out",
    ]);
  });

  it("keeps several episodes of one day together in the order they were read", () => {
    const sameDay = groupUpcoming(
      [on("2026-08-24", "first"), on("2026-08-24", "second"), on("2026-08-25", "next")],
      today,
    );
    expect(sameDay).toHaveLength(2);
    expect(sameDay[0].episodes.map((episode) => episode.name)).toEqual(["first", "second"]);
  });

  /** Discovered from the rows, never laid out in advance — a day with nothing on it has
   *  no heading, which is the rule for a rail applied to a group. */
  it("emits no group for a day with nothing on it", () => {
    expect(groupUpcoming([on("2026-12-01")], today).map((group) => group.label)).toEqual([
      "Later",
    ]);
  });

  it("returns nothing at all for no episodes", () => {
    expect(groupUpcoming([], today)).toEqual([]);
  });
});

describe("the weekday is read off the air date and not off a zone", () => {
  /**
   * An air date is a `date` column with no instant in it — the same day for every reader
   * on earth (`episode-facts.ts`). So the weekday it prints must not move with anybody's
   * zone, and the failure this guards is the classic one: build the instant in UTC, format
   * it in the server's, and every date west of UTC comes back a day early.
   */
  it("names the same weekday whoever is reading", () => {
    const wednesday = groupUpcoming([on("2026-08-26")], "2026-08-24");
    expect(wednesday[0].label).toBe("Wednesday");
  });

  /** A date on the first of a month, which is where an off-by-one shows up as a different
   *  month rather than a different day. */
  it("does not slip a day at a month boundary", () => {
    const groups = groupUpcoming([on("2026-09-01")], "2026-08-30");
    expect(groups[0].label).toBe("Tuesday");
  });
});

describe("what is already past is dropped", () => {
  /**
   * The read is deliberately a day wider than the server's own day, because no zone is
   * more than a day from UTC. Narrowing it to the reader's actual today is this module's
   * job, and a row that fell out of the window must not become a heading of its own — an
   * episode that has aired belongs to the next-episodes rail, not to *upcoming*.
   */
  it("drops yesterday's rows rather than bucketing them", () => {
    const groups = groupUpcoming(
      [on("2026-08-23", "yesterday"), on("2026-08-24", "today")],
      "2026-08-24",
    );
    expect(groups.map((group) => group.label)).toEqual(["Today"]);
    expect(groups[0].episodes.map((episode) => episode.name)).toEqual(["today"]);
  });

  it("returns nothing when everything read has already aired", () => {
    expect(groupUpcoming([on("2026-08-23")], "2026-08-24")).toEqual([]);
  });
});

describe("the keys", () => {
  it("are stable names rather than the visible words", () => {
    const groups = groupUpcoming(
      [on("2026-08-24"), on("2026-08-25"), on("2026-08-26"), on("2026-12-01")],
      "2026-08-24",
    );
    expect(groups.map((group) => group.key)).toEqual([
      "today",
      "tomorrow",
      "weekday-2026-08-26",
      "later",
    ]);
  });
});

/**
 * The countdown under a film — issue #252, and the same module for the same reason.
 *
 * A countdown is *Today* and *Tomorrow* by another route: the words turn over at the
 * reader's midnight exactly as the headings above them do, so they are computed against
 * the same handed-in day and asserted the same way — never from a clock.
 */

/** A film of the shape the read returns, reduced to the one field the countdown reads. */
function out(releaseDate: string, name = releaseDate) {
  return { releaseDate, name };
}

const words = (films: readonly { releaseDate: string }[], today: string) =>
  awaitedFilms(films, today).map((one) => one.countdown);

describe("how far away a film is, in words", () => {
  /** The three the ticket names — the day of release, one day, and several. */
  it("says Today on the day of release", () => {
    expect(words([out("2026-08-24")], "2026-08-24")).toEqual(["Today"]);
  });

  it("says Tomorrow the day before", () => {
    expect(words([out("2026-08-25")], "2026-08-24")).toEqual(["Tomorrow"]);
  });

  it("counts the days out past that", () => {
    expect(words([out("2026-08-26")], "2026-08-24")).toEqual(["In 2 days"]);
    expect(words([out("2026-09-05")], "2026-08-24")).toEqual(["In 12 days"]);
    expect(words([out("2026-12-12")], "2026-08-24")).toEqual(["In 110 days"]);
  });

  /**
   * The two an `In ${days} days` alone would produce, and the reason this is words rather
   * than a template. *In 0 days* lands on the day a reader has been waiting for, which is
   * the single worst day for this line to read as a stub.
   */
  it("never says *In 0 days* or *In 1 day*", () => {
    const both = words([out("2026-08-24"), out("2026-08-25")], "2026-08-24");

    expect(both).not.toContain("In 0 days");
    expect(both).not.toContain("In 1 day");
  });

  /**
   * Counted over calendar days rather than elapsed time, so a daylight-saving transition
   * inside the span cannot round the subtraction to the wrong integer. The UK's clocks go
   * forward on 29 March 2026 and back on 25 October; both spans below cross one, and both
   * are the plain difference between two dates.
   */
  it("counts calendar days across a daylight-saving transition", () => {
    expect(words([out("2026-03-30")], "2026-03-28")).toEqual(["In 2 days"]);
    expect(words([out("2026-10-26")], "2026-10-24")).toEqual(["In 2 days"]);
  });

  /** A year boundary is not a special case either — it is the same subtraction. */
  it("counts across the end of a year", () => {
    expect(words([out("2027-01-02")], "2026-12-31")).toEqual(["In 2 days"]);
  });
});

describe("a film that is already out is not a film you are waiting for", () => {
  /**
   * `listUpcomingFilms` reads a day wider than the server's own day so that no reader's
   * evening is missing from it. Spending that extra day is this function's job, in the
   * reader's zone — a film released yesterday stays on the watchlist and stays on the
   * films rail one page over, which is where a reader goes to watch it.
   */
  it("drops a release date that has passed", () => {
    const waiting = awaitedFilms(
      [out("2026-08-23", "already out"), out("2026-08-24", "out today")],
      "2026-08-24",
    );

    expect(waiting.map((one) => one.film.name)).toEqual(["out today"]);
  });

  it("returns nothing when everything read is already out", () => {
    expect(awaitedFilms([out("2026-08-23")], "2026-08-24")).toEqual([]);
  });

  /**
   * The same list at the same instant reads differently either side of the line, which is
   * the property the whole module exists for: at 13:30 UTC a film released on the 25th is
   * out *today* in Auckland and still *tomorrow* in Honolulu, and neither reader is shown
   * the other's answer.
   */
  it("answers in the reader's day rather than the server's", () => {
    const instant = new Date("2026-08-24T13:30:00Z");
    const film = [out("2026-08-25")];

    expect(words(film, readerDay("Pacific/Auckland", instant))).toEqual(["Today"]);
    expect(words(film, readerDay("Pacific/Honolulu", instant))).toEqual(["Tomorrow"]);
  });
});

describe("the films come back in the order they were read", () => {
  /** Nothing is re-sorted here: the read has the tie-breakers, and an ordering decided
   *  twice is an ordering that comes to disagree with itself. */
  it("keeps the read's order and does not touch the rows", () => {
    const nearest = out("2026-09-05", "nearest");
    const furthest = out("2026-12-12", "furthest");

    const waiting = awaitedFilms([nearest, furthest], "2026-08-24");

    expect(waiting.map((one) => one.film.name)).toEqual(["nearest", "furthest"]);
    // The read's own object, beside the words rather than carrying them.
    expect(waiting[0].film).toBe(nearest);
    expect(waiting[0].film).not.toHaveProperty("countdown");
  });
});

describe("how far away an episode is, in words", () => {
  /**
   * A coming-up row says how long you have to wait, not which date it is — the question a
   * reader brings to the list is *how soon*, and a date makes them do the sum.
   */
  it("counts the days from the reader's today", () => {
    expect(daysUntilInWords("2026-09-23", "2026-09-23")).toBe("Today");
    expect(daysUntilInWords("2026-09-24", "2026-09-23")).toBe("Tomorrow");
    expect(daysUntilInWords("2026-09-28", "2026-09-23")).toBe("In 5 days");
  });

  it("counts across a month end", () => {
    expect(daysUntilInWords("2026-10-02", "2026-09-29")).toBe("In 3 days");
  });
});
