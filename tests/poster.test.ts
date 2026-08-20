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
