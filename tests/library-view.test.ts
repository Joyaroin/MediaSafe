import { describe, expect, it } from "vitest";

import { DEFAULT_LIBRARY_VIEW, LIBRARY_VIEWS, libraryViewFrom } from "@/app/(signed-in)/library/library-view";

/**
 * Issue #357 — Library's three tabs, Shows, Films and Lists. A deep link names one
 * (`/library?view=lists`, which is where a list's back control leads); anything else in
 * that parameter is not a tab and must not become one.
 */
describe("the Library tab a link names", () => {
  it("reads each of the three tabs", () => {
    expect(libraryViewFrom("show")).toBe("show");
    expect(libraryViewFrom("film")).toBe("film");
    expect(libraryViewFrom("lists")).toBe("lists");
  });

  it("reads nothing from a missing, repeated or unknown value", () => {
    expect(libraryViewFrom(undefined)).toBeNull();
    expect(libraryViewFrom(["lists", "show"])).toBeNull();
    expect(libraryViewFrom("episodes")).toBeNull();
  });

  it("draws the tabs as Shows, Films, Lists, opening on Shows", () => {
    expect(LIBRARY_VIEWS.map((one) => one.label)).toEqual(["Shows", "Films", "Lists"]);
    expect(DEFAULT_LIBRARY_VIEW).toBe("show");
  });
});
