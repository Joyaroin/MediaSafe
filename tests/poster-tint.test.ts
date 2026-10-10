import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { posterTintStyle, WASH, washFor } from "@/app/poster-tint";
import { hexToOklch, oklabToHex } from "@/lib/oklab";

import {
  APCA_CONTENT_TEXT_FLOOR,
  apcaLc,
  gammaEncode,
  oklchToLinearSrgb,
  parseOklch,
  resolvedSrgb,
  wcagContrast,
} from "./support/contrast";

/**
 * Issue #361's clamp: a poster's colour, made safe to put text on, in both themes.
 *
 * The floor is `tests/contrast.test.ts`'s, computed by the same functions
 * (`tests/support/contrast.ts`) against the same declarations: WCAG 4.5:1 in light, APCA
 * Lc 60 in dark, for `--text` and `--dim` — the two registers the hero sets its title and
 * meta line in. A poster can be any colour, so the sweep is every hue at full and at low
 * chroma, and every lightness a poster's dominant colour could have.
 */

/** A poster colour at every hue, from the darkest to the lightest and the dullest to the most vivid. */
function posterColours(): string[] {
  const colours: string[] = [];
  for (let h = 0; h < 360; h += 3) {
    for (const l of [0.05, 0.35, 0.65, 0.95]) {
      for (const c of [0.005, 0.05, 0.15, 0.3]) {
        const rad = (h * Math.PI) / 180;
        colours.push(oklabToHex({ l, a: c * Math.cos(rad), b: c * Math.sin(rad) }));
      }
    }
  }
  return colours;
}

/** A wash declaration, resolved to the gamma-encoded sRGB a browser would paint. */
function painted(wash: string): [number, number, number] {
  const [L, C, H] = parseOklch(wash);
  return gammaEncode(oklchToLinearSrgb(L / 100, C, H));
}

describe("the text over the wash keeps the contrast floor", () => {
  const colours = posterColours();

  it.each(["text", "dim"] as const)("--%s clears 4.5:1 on every light wash", (token) => {
    const text = resolvedSrgb(token);
    const worst = Math.min(...colours.map((c) => wcagContrast(text, painted(washFor(c, "light")))));
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["text", "dim"] as const)(
    "--dark-%s clears the APCA content-text floor on every dark wash",
    (token) => {
      const text = resolvedSrgb(`dark-${token}`);
      const worst = Math.min(
        ...colours.map((c) => Math.abs(apcaLc(text, painted(washFor(c, "dark"))))),
      );
      expect(worst).toBeGreaterThanOrEqual(APCA_CONTENT_TEXT_FLOOR);
    },
  );
});

describe("washFor", () => {
  it("keeps the poster's hue and replaces its lightness, per theme", () => {
    const red = "#c0392b";
    const { h } = hexToOklch(red);

    for (const theme of ["light", "dark"] as const) {
      const [L, , H] = parseOklch(washFor(red, theme));
      expect(L).toBeCloseTo(WASH[theme].l * 100, 1);
      expect(H).toBeCloseTo(h, 0);
    }
  });

  it("caps a vivid poster's chroma, separately for each theme", () => {
    const vivid = "#00ff00";
    expect(parseOklch(washFor(vivid, "light"))[1]).toBe(WASH.light.maxChroma);
    expect(parseOklch(washFor(vivid, "dark"))[1]).toBe(WASH.dark.maxChroma);
  });

  it("leaves a dull poster dull rather than inventing colour for it", () => {
    const grey = "#808080";
    expect(parseOklch(washFor(grey, "light"))[1]).toBeLessThan(0.001);
    expect(parseOklch(washFor(grey, "dark"))[1]).toBeLessThan(0.001);
  });

  it("refuses a value that is not #rrggbb", () => {
    expect(() => washFor("red", "light")).toThrow();
  });
});

describe("posterTintStyle", () => {
  it("is nothing at all for a title with no colour", () => {
    expect(posterTintStyle(null)).toBeUndefined();
  });

  it("carries both themes' washes, for the stylesheet to choose between", () => {
    expect(posterTintStyle("#c0392b")).toEqual({
      "--tint-light": washFor("#c0392b", "light"),
      "--tint-dark": washFor("#c0392b", "dark"),
    });
  });
});

describe("the tint is its own token family", () => {
  /**
   * The accent rule is untouched by this — `tests/accent-sweep.test.ts` is what holds it,
   * and it must pass unchanged. What this adds is the converse: the tint never borrows an
   * accent token, so the two families cannot come to mean one another.
   */
  it("`--tint` is resolved from `--tint-light` and `--tint-dark` only", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const declarations = [...css.matchAll(/--tint:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(declarations.length).toBeGreaterThan(0);
    for (const value of declarations) {
      expect(["var(--tint-light)", "var(--tint-dark)"]).toContain(value);
    }
  });
});
