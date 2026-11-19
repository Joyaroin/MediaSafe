import { describe, expect, it } from "vitest";

import {
  FILM_SECTION_SLUGS,
  LIBRARY_SECTIONS,
  librarySectionFrom,
  SECTION_ORDER_LABELS,
  sectionHeading,
  sectionHref,
  sectionSortFrom,
  sectionsHref,
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

/**
 * Issue #552 — what the surface adds to the parse: the words, the sort inside a section, and
 * the links in and out of a section's grid.
 */
describe("the surface's words and links for a section", () => {
  it("has a heading and an order label for every slug of both kinds", () => {
    for (const slug of SHOW_SECTION_SLUGS) {
      expect(sectionHeading({ kind: "show", slug })).toMatch(/\S/);
      expect(SECTION_ORDER_LABELS[slug]).toMatch(/\S/);
    }
    for (const slug of FILM_SECTION_SLUGS) {
      expect(sectionHeading({ kind: "film", slug })).toMatch(/\S/);
      expect(SECTION_ORDER_LABELS[slug]).toMatch(/\S/);
    }
  });

  it("names the spec's headings", () => {
    expect(SHOW_SECTION_SLUGS.map((slug) => sectionHeading({ kind: "show", slug }))).toEqual([
      "Watching",
      "Not started",
      "Waiting for new episodes",
      "Finished",
      "Dropped",
    ]);
    expect(FILM_SECTION_SLUGS.map((slug) => sectionHeading({ kind: "film", slug }))).toEqual([
      "To watch",
      "Coming soon",
      "Watched",
      "Dropped",
    ]);
  });

  it("reads ?sort= inside a section as the section's own order unless it names a sort", () => {
    expect(sectionSortFrom(undefined)).toBeNull();
    expect(sectionSortFrom("nonsense")).toBeNull();
    expect(sectionSortFrom(["title", "title"])).toBeNull();
    expect(sectionSortFrom("title")).toBe("title");
    expect(sectionSortFrom("recently-added")).toBe("recently-added");
  });

  it("links to a section with its kind always written, and a sort only when chosen", () => {
    expect(sectionHref({ kind: "show", slug: "not-started" })).toBe(
      "/library?view=show&section=not-started",
    );
    expect(sectionHref({ kind: "film", slug: "dropped" }, "title")).toBe(
      "/library?view=film&section=dropped&sort=title",
    );
  });

  it("goes back to the sections on the same kind's tab, and the link parses to no section", () => {
    expect(sectionsHref("film")).toBe("/library?view=film");
    expect(librarySectionFrom("film", undefined)).toBeNull();
  });

  it("writes links that parse back to the section they name", () => {
    for (const section of LIBRARY_SECTIONS) {
      const query = new URL(sectionHref(section), "http://x").searchParams;
      expect(librarySectionFrom(query.get("view") ?? undefined, query.get("section") ?? undefined)).toEqual(
        section,
      );
    }
  });
});
