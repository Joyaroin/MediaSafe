import { describe, expect, it } from "vitest";

import { airDateShort } from "@/app/(signed-in)/library/episode-facts";
import { titlePageMetaLine } from "@/app/(signed-in)/library/title-meta-line";

/** An unaired episode's date in the row's trailing slot (Charcoal §8.6, issue #403). */
describe("airDateShort", () => {
  it("drops the year when the episode airs this year", () => {
    expect(airDateShort("2026-11-12", "2026-10-11")).toBe("12 Nov");
  });

  it("keeps the year when it does not", () => {
    expect(airDateShort("2027-03-03", "2026-10-11")).toBe("3 Mar 2027");
  });

  /**
   * **The zone bug this is built to avoid**, asserted rather than commented. An air date
   * has no zone in it, so the string must equal the column wherever this runs; the first
   * of the month is where a slip shows.
   */
  it("is the catalogue's day, not the server's", () => {
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
