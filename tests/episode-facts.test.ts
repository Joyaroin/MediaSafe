import { describe, expect, it } from "vitest";

import {
  airDateInWords,
  airDateShort,
  episodeMetaLine,
} from "@/app/(signed-in)/library/episode-facts";
import { titlePageMetaLine } from "@/app/(signed-in)/library/title-meta-line";

/**
 * The episode page's one line of mirrored metadata — issue #253, over the two columns
 * issue #246 put on `episode`.
 *
 * What is worth asserting here is the pair of rules that would otherwise be lost the first
 * time somebody tidied the function: **a missing half is dropped rather than filled in**,
 * and **the date is the catalogue's day and not the server's**.
 */

describe("airDateInWords", () => {
  it("writes the day the way the rest of the application writes one", () => {
    expect(airDateInWords("2026-03-01")).toBe("1 March 2026");
  });

  /**
   * **The zone bug this is built to avoid**, asserted rather than commented.
   *
   * `new Date(2026, 0, 1)` is midnight in whatever zone the process is running in, and
   * formatting that anywhere west of it prints 31 December. An air date has no zone in it
   * at all — it is the day TMDB says the episode went out, the same day for every reader
   * — so the string must equal the column no matter where this runs. Constructing in UTC
   * and formatting in UTC is what holds that, and this is the case that would catch it
   * being changed to a local construction.
   */
  it("does not slip a day, whatever zone the process is in", () => {
    expect(airDateInWords("2026-01-01")).toBe("1 January 2026");
    expect(airDateInWords("2026-12-31")).toBe("31 December 2026");
  });
});

describe("episodeMetaLine", () => {
  it("joins the date and the runtime", () => {
    expect(episodeMetaLine({ airDate: "2026-03-01", runtimeMins: 58 })).toBe(
      "1 March 2026 · 58 min",
    );
  });

  /**
   * A missing half is **dropped, not captioned**. No *date unknown*, no *runtime unknown*,
   * no dash standing in — the page says what the catalogue told it and stays silent about
   * what it did not, so that a reader is never shown a placeholder that reads like a fact.
   */
  it("prints the runtime alone when TMDB has not dated the episode", () => {
    expect(episodeMetaLine({ airDate: null, runtimeMins: 58 })).toBe("58 min");
  });

  it("prints the date alone when TMDB has published no runtime", () => {
    expect(episodeMetaLine({ airDate: "2026-03-01", runtimeMins: null })).toBe("1 March 2026");
  });

  /**
   * `null` rather than an empty string, so the caller renders no `<p>` at all instead of
   * an empty one holding a real line's space. `titleMetaLine` makes the same promise for
   * the same reason.
   */
  it("is null when the mirror has neither, so no empty line is drawn", () => {
    expect(episodeMetaLine({ airDate: null, runtimeMins: null })).toBeNull();
  });
});

/** An unaired episode's date in the row's trailing slot (Charcoal §8.6, issue #403). */
describe("airDateShort", () => {
  it("drops the year when the episode airs this year", () => {
    expect(airDateShort("2026-11-12", "2026-10-11")).toBe("12 Nov");
  });

  it("keeps the year when it does not", () => {
    expect(airDateShort("2027-03-03", "2026-10-11")).toBe("3 Mar 2027");
  });

  it("is the catalogue's day, not the server's", () => {
    // The first of the month is where a zone slip shows, as `airDateInWords` records.
    expect(airDateShort("2026-03-01", "2026-01-01")).toBe("1 Mar");
  });
});

/** The title page's meta line leads with the kind (Charcoal §8.6, §8.7, issue #403). */
describe("titlePageMetaLine", () => {
  it("says Series for a show and Film for a film, before the rest", () => {
    expect(titlePageMetaLine({ kind: "show", releaseYear: 2022, runtimeMins: null })).toBe(
      "Series · 2022",
    );
    expect(titlePageMetaLine({ kind: "film", releaseYear: 2021, runtimeMins: 155 })).toBe(
      "Film · 2021 · 155 min",
    );
  });

  it("still names the kind when the mirror has nothing else", () => {
    expect(titlePageMetaLine({ kind: "film", releaseYear: null, runtimeMins: null })).toBe("Film");
  });
});
