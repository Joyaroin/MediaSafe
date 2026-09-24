import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { DARK_THEME_COLOR, LIGHT_THEME_COLOR, THEME_COLOR_SCHEME } from "@/app/theme-color";

/**
 * Issue #308 — the phone scene launches without browser chrome.
 *
 * Not named in #300's "Modules under test" list, which enumerates the other six
 * changes in that spec. `manifest.ts` and `theme-color.ts` are still exactly the shape
 * that list already establishes elsewhere — a plain function/plain values over no DOM and
 * no clock — so they are tested the same way as `gesture-rules` and `restoration`: direct
 * import, called in node, asserted on the return value.
 *
 * The acceptance criterion is explicit that this must exist: "A test asserts the
 * manifest's display mode, theme colour and icon set, so a later edit cannot drop them
 * silently."
 */

const ROOT = join(__dirname, "..");
const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

/** Reads a token's single declaration site — the palette test's own `declaredOnce`,
 *  reused here so the expected colours come from the stylesheet rather than from a
 *  second typed copy of the value this file would then have to keep in sync by hand.
 *  Reads `oklch()` since issue #327, not hex — see `tests/palette.test.ts`'s own
 *  `declaredOnce` for why. */
function declaredOnce(name: string): string {
  const all = [...CSS.matchAll(new RegExp(`^\\s*--${name}:\\s*(oklch\\([^;]+?\\));`, "gim"))];
  expect(all, `--${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].trim();
}

describe("the web app manifest", () => {
  const result = manifest();

  it("declares standalone display", () => {
    expect(result.display).toBe("standalone");
  });

  it("names the application", () => {
    expect(result.name).toBe("MediaSafe");
  });

  /**
   * Static fields — `manifest.json` has no `prefers-color-scheme` to read, the same
   * limitation `app/icon.svg`'s own docblock names for the favicon. So this fixes to the
   * dark palette's ground, exactly as the icon already does, rather than inventing a
   * second static answer to the same question.
   */
  it("declares a theme colour fixed to the dark palette's ground, the icon's own choice", () => {
    expect(result.theme_color).toBe(declaredOnce("dark-ground"));
    expect(result.background_color).toBe(declaredOnce("dark-ground"));
  });

  it("declares an icon set built from the icon already in the tree", () => {
    expect(result.icons?.length).toBeGreaterThan(0);
    expect(result.icons?.map((icon) => icon.src)).toContain("/icon.svg");

    const svgIcon = result.icons?.find((icon) => icon.src === "/icon.svg");
    expect(svgIcon?.type).toBe("image/svg+xml");
  });
});

describe("the status bar's colour, in both schemes", () => {
  /**
   * This is the reactive half — `<meta name="theme-color" media="...">` — that the
   * manifest's own static field cannot be, because a manifest is fetched once and a
   * media query inside it has nowhere to attach. `app/layout.tsx`'s `viewport` export
   * reads this constant rather than declaring the pairs inline, so this file can assert
   * the values without importing `app/layout.tsx` itself — which pulls in `next/font`
   * and fails outside a Next build (verified: `Archivo is not a function` under vitest).
   */
  it("matches the light ground and the dark ground, not a new literal", () => {
    expect(LIGHT_THEME_COLOR).toBe(declaredOnce("ground"));
    expect(DARK_THEME_COLOR).toBe(declaredOnce("dark-ground"));
  });

  it("carries both schemes as the pair Next's viewport API expects", () => {
    expect(THEME_COLOR_SCHEME).toEqual([
      { media: "(prefers-color-scheme: light)", color: LIGHT_THEME_COLOR },
      { media: "(prefers-color-scheme: dark)", color: DARK_THEME_COLOR },
    ]);
  });
});

describe("the apple touch icon", () => {
  const SOURCE = readFileSync(join(ROOT, "app/apple-icon.tsx"), "utf8");

  /**
   * The acceptance criterion in its literal form: "The accent remains a hard-coded
   * literal only in the places already documented as literals; no new literal is
   * introduced." `app/icon.svg`'s own comment already names itself as one of two places
   * the accent is allowed to live as a literal — so this file must read that value
   * rather than retype it.
   */
  it("does not retype the accent as a literal", () => {
    expect(SOURCE.toLowerCase()).not.toContain("ffb020");
  });

  it("derives its drawing from the icon already in the tree", () => {
    expect(SOURCE).toContain("icon.svg");
  });

  it("renders a real PNG, not a blank frame", async () => {
    const AppleIcon = (await import("@/app/apple-icon")).default;
    const response = AppleIcon();
    const bytes = new Uint8Array(await response.arrayBuffer());

    // The PNG signature — proves this is a decodable image and not an empty response.
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // A blank 180×180 PNG (the `<img src="data:image/svg+xml...">` attempt that does not
    // render satori's/resvg's own drawing) compiled to 228 bytes in the same setup; the
    // four flat rectangles this file actually draws compile to something bigger than that.
    expect(bytes.length).toBeGreaterThan(400);
  });
});
