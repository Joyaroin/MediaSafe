import { describe, expect, it } from "vitest";

import {
  FILM_SECTION_SLUGS,
  librarySectionFrom,
  SHOW_SECTION_SLUGS,
} from "@/app/(signed-in)/library/library-section";

/**
 * Issue #541 — which Library section a link names. `?view=` is often absent (the tab is
 * remembered per device, which the server cannot see), so the slug has to carry the kind
 * when it can; `/library?section=not-started` is Tonight's link and carries no view.
 */
describe("the Library section a link names", () => {
  it("reads each show slug with view=show, and with no view", () => {
    for (const slug of SHOW_SECTION_SLUGS) {
      expect(librarySectionFrom("show", slug)).toEqual({ kind: "show", slug });
      expect(librarySectionFrom(undefined, slug)).toEqual({ kind: "show", slug });
    }
  });

  it("reads each film slug with view=film, and with no view when the slug is the films' own", () => {
    for (const slug of FILM_SECTION_SLUGS) {
      expect(librarySectionFrom("film", slug)).toEqual({ kind: "film", slug });
    }
    for (const slug of ["to-watch", "coming-soon", "watched"]) {
      expect(librarySectionFrom(undefined, slug)).toEqual({ kind: "film", slug });
    }
  });

  it("reads dropped on its own as shows, and as films only when view=film says so", () => {
    expect(librarySectionFrom(undefined, "dropped")).toEqual({ kind: "show", slug: "dropped" });
    expect(librarySectionFrom("show", "dropped")).toEqual({ kind: "show", slug: "dropped" });
    expect(librarySectionFrom("film", "dropped")).toEqual({ kind: "film", slug: "dropped" });
  });

  it("reads no section from the other kind's slug under an explicit view", () => {
    expect(librarySectionFrom("show", "to-watch")).toBeNull();
    expect(librarySectionFrom("show", "watched")).toBeNull();
    expect(librarySectionFrom("film", "watching")).toBeNull();
    expect(librarySectionFrom("film", "not-started")).toBeNull();
  });

  it("reads no section under view=lists, for any slug", () => {
    for (const slug of [...SHOW_SECTION_SLUGS, ...FILM_SECTION_SLUGS]) {
      expect(librarySectionFrom("lists", slug)).toBeNull();
    }
  });

  it("reads no section from a missing, repeated or unknown slug", () => {
    expect(librarySectionFrom("show", undefined)).toBeNull();
    expect(librarySectionFrom(undefined, undefined)).toBeNull();
    expect(librarySectionFrom("show", ["watching", "finished"])).toBeNull();
    expect(librarySectionFrom("show", "binge")).toBeNull();
    expect(librarySectionFrom(undefined, "binge")).toBeNull();
    expect(librarySectionFrom(undefined, "")).toBeNull();
  });

  it("treats an unknown or repeated view as no view", () => {
    expect(librarySectionFrom("episodes", "not-started")).toEqual({
      kind: "show",
      slug: "not-started",
    });
    expect(librarySectionFrom(["film", "show"], "coming-soon")).toEqual({
      kind: "film",
      slug: "coming-soon",
    });
  });
});
