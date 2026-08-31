import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Poster } from "@/app/poster";

/**
 * `app/plate.tsx` had no test of its own — its behaviour was implicit in the surfaces
 * that used it. `app/poster.tsx` (#135) picks up two contracts none of those surfaces
 * exercise directly, and both would fail silently if broken:
 *
 *  1. **No artwork renders no `<img>` and no placeholder.** A tile with `posterPath: null`
 *     should be a quiet rectangle, not an apology glyph.
 *  2. **The CDN size requested is the smallest TMDB bucket that covers the rendered
 *     width, never smaller.** The acceptance criterion this ticket is shaped around —
 *     get this wrong and every surface either upscales past its source or fetches
 *     `original` for a `42px` deck row.
 */
const render = (props: Parameters<typeof Poster>[0]) =>
  renderToStaticMarkup(createElement(Poster, props));

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

/** Every `.ts`/`.tsx` under a directory — `tests/up-next-phone-rails.test.ts`'s walker, for
 *  the same job: proving a deleted thing is gone from the whole tree rather than from the
 *  files the author happened to remember. */
function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("the poster", () => {
  it("renders no image and no placeholder when TMDB has no artwork", () => {
    const markup = render({ posterPath: null, width: 154, className: "" });

    expect(markup).not.toContain("<img");
    expect(markup).toContain("poster");
  });

  it("full colour, at the real 2/3 ratio — no filter, no blend mode", () => {
    const markup = render({ posterPath: "/x.jpg", width: 154, className: "" });

    expect(markup).not.toMatch(/filter|mix-blend-mode|grayscale/);
  });

  it("requests the smallest TMDB bucket that covers the rendered width", () => {
    expect(render({ posterPath: "/x.jpg", width: 42, className: "" })).toContain(
      "https://image.tmdb.org/t/p/w92/x.jpg",
    );
    expect(render({ posterPath: "/x.jpg", width: 78, className: "" })).toContain(
      "https://image.tmdb.org/t/p/w92/x.jpg",
    );
    expect(render({ posterPath: "/x.jpg", width: 200, className: "" })).toContain(
      "https://image.tmdb.org/t/p/w342/x.jpg",
    );
    expect(render({ posterPath: "/x.jpg", width: 430, className: "" })).toContain(
      "https://image.tmdb.org/t/p/w500/x.jpg",
    );
  });

  it("never upscales — a width past every bucket falls back to the original", () => {
    expect(render({ posterPath: "/x.jpg", width: 1200, className: "" })).toContain(
      "https://image.tmdb.org/t/p/original/x.jpg",
    );
  });

  it("names no title of its own — alt is empty and the image is hidden from the a11y tree", () => {
    const markup = render({ posterPath: "/x.jpg", width: 154, className: "" });

    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("defaults to lazy, so an existing call site that never passes aboveFold is unchanged", () => {
    const markup = render({ posterPath: "/x.jpg", width: 154, className: "" });

    expect(markup).toContain('loading="lazy"');
    expect(markup).not.toContain("fetchPriority");
  });

  it("an above-the-fold poster loads eagerly at high priority; a below-the-fold one stays lazy", () => {
    const eager = render({ posterPath: "/x.jpg", width: 154, className: "", aboveFold: true });
    const lazy = render({ posterPath: "/x.jpg", width: 154, className: "", aboveFold: false });

    expect(eager).toContain('loading="eager"');
    expect(eager).toContain('fetchPriority="high"');
    expect(lazy).toContain('loading="lazy"');
    expect(lazy).not.toContain("fetchPriority");
    expect(eager).not.toBe(lazy);
  });
});

/**
 * ── One transition-name family — issue #275 ──────────────────────────────────────────
 *
 * The morph (#141) pairs a rail tile's poster with the poster on the surface that opens by
 * giving both the same `view-transition-name`. Until #275 there were **two** families and
 * two minting functions, because the phone raised a sheet over `/up-next` while the phone
 * route was a second, separate destination. #268 deleted the sheet and the interceptions:
 * the phone's tile now navigates to `/library/{id}`, so there is one destination and one
 * family.
 *
 * These live beside the poster's own contracts because the name is a property *of the
 * poster's identity across a navigation*, and both failures here are silent: a second
 * family that nothing mints runs no morph and throws nothing, and a caller left on the
 * dead family pairs against an element that never appears.
 */
describe("the poster morph's transition-name family", () => {
  it("mints from exactly one family, so a source and its destination can only agree", async () => {
    const families = Object.entries(
      await import("@/app/(signed-in)/library/poster-transition-name"),
    ).filter(([, value]) => typeof value === "function");

    expect(families.map(([name]) => name)).toEqual(["railPosterTransitionName"]);
  });

  it("names one element per entry, and a different one per entry", async () => {
    const { railPosterTransitionName } = await import(
      "@/app/(signed-in)/library/poster-transition-name"
    );

    expect(railPosterTransitionName("abc")).toBe("rail-poster-abc");
    expect(railPosterTransitionName("abc")).toBe(railPosterTransitionName("abc"));
    expect(railPosterTransitionName("abc")).not.toBe(railPosterTransitionName("def"));
  });

  it("leaves no caller and no hand-spelled copy of the retired family", () => {
    // The minting helper is gone; so is anywhere that used to write the template literal
    // out by hand. A survivor here is a `view-transition-name` with nothing to pair
    // against — inert, silent, and indistinguishable from a morph that simply did not run.
    const retired = /\bgroupPosterTransitionName\b|group-poster-\$\{/;

    for (const file of sourceFilesUnder(path.join(REPOSITORY_ROOT, "app"))) {
      const relative = path.relative(REPOSITORY_ROOT, file);
      const cites = retired.test(readFileSync(file, "utf8"));
      expect({ file: relative, cites }).toEqual({ file: relative, cites: false });
    }
  });
});
