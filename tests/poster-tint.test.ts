import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BAND,
  bandFor,
  GLOW,
  glowFor,
  posterBandStyle,
  posterGlowStyle,
  posterTintStyle,
  TITLE_SCRIM,
  titleScrimAlpha,
  titleScrimGradient,
  WASH,
  washFor,
} from "@/app/poster-tint";
import { hexToOklch, inSrgbGamut, oklabToHex } from "@/lib/oklab";

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

describe("the hover glow (issue #363)", () => {
  it("keeps the poster's hue at a lightness both grounds can see", () => {
    const blue = "#1e3cdc";
    const [L, C, H] = parseOklch(glowFor(blue));
    expect(L).toBeCloseTo(GLOW.l * 100, 1);
    expect(C).toBe(GLOW.maxChroma);
    expect(H).toBeCloseTo(hexToOklch(blue).h, 0);
  });

  it("is nothing at all for a title with no colour", () => {
    expect(posterGlowStyle(null)).toBeUndefined();
    expect(posterGlowStyle("#1e3cdc")).toEqual({ "--glow": glowFor("#1e3cdc") });
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

describe("the band (Charcoal, issue #398) — white on it clears 4.5:1 at every hue", () => {
  /**
   * Handoff §10: the stored hue, 52% lightness, chroma capped at 0.17 and then reduced
   * until the colour is inside sRGB. The sweep is the wash's: every hue, from the darkest
   * poster to the palest and the dullest to the most vivid.
   */
  const colours = posterColours();
  const WHITE: [number, number, number] = [1, 1, 1];

  it("is inside sRGB as written, so no browser ever clips it", () => {
    for (const colour of colours) {
      const [L, C, H] = parseOklch(bandFor(colour));
      expect(inSrgbGamut({ l: L / 100, c: C, h: H }), `${colour} → ${bandFor(colour)}`).toBe(true);
    }
  });

  it("is always at 52% lightness, with chroma at most 0.17", () => {
    for (const colour of colours) {
      const [L, C] = parseOklch(bandFor(colour));
      expect(L).toBeCloseTo(BAND.l * 100, 5);
      expect(C).toBeLessThanOrEqual(BAND.maxChroma);
    }
  });

  it("puts white at 4.5:1 or better on every band — and at the 5.1:1 the handoff measured", () => {
    const worst = Math.min(...colours.map((c) => wcagContrast(WHITE, painted(bandFor(c)))));
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(worst).toBeGreaterThanOrEqual(5.1);
  });

  it("keeps the stored hue, and takes the cap only when the gamut allows it", () => {
    const red = "#e01b24";
    const [, C, H] = parseOklch(bandFor(red));
    expect(H).toBeCloseTo(hexToOklch(red).h, 0);
    expect(C).toBe(BAND.maxChroma);
  });

  it("reduces chroma rather than clipping where 0.17 is outside sRGB", () => {
    // Yellow at 52% cannot hold 0.17; handoff §10's table gives #f2c200 a muddy gold.
    const [, C] = parseOklch(bandFor("#f2c200"));
    expect(C).toBeLessThan(BAND.maxChroma);
    expect(C).toBeGreaterThan(0.1);
  });

  it("leaves a grey poster grey", () => {
    expect(parseOklch(bandFor("#8a8a8a"))[1]).toBeLessThan(0.001);
  });

  it("is one value for both themes, and nothing at all for a title with no colour", () => {
    expect(posterBandStyle("#e01b24")).toEqual({ "--band": bandFor("#e01b24") });
    expect(posterBandStyle(null)).toBeUndefined();
  });
});

describe("text over a title's artwork keeps §10's floors (Charcoal, issue #398)", () => {
  /**
   * The hero's scrim, composited the way a browser composites a translucent layer — in
   * gamma-encoded sRGB — over the worst artwork there is: pure white and pure black. In
   * both themes, at each kind of text's weakest edge.
   */
  const ARTWORK: Record<string, [number, number, number]> = {
    white: [1, 1, 1],
    black: [0, 0, 0],
  };
  const THEMES = [
    { theme: "light", ground: "ground", text: "text", dim: "dim" },
    { theme: "dark", ground: "dark-ground", text: "dark-text", dim: "dark-dim" },
  ] as const;

  function over(
    top: [number, number, number],
    alpha: number,
    under: [number, number, number],
  ): [number, number, number] {
    return top.map((c, i) => alpha * c + (1 - alpha) * under[i]) as [number, number, number];
  }

  const cases = THEMES.flatMap((t) =>
    Object.entries(ARTWORK).map(([artwork, rgb]) => ({ ...t, artwork, rgb })),
  );

  it.each(cases)("large text: --$text on the scrim over $artwork artwork, $theme, is 3:1 or better", (c) => {
    const backdrop = over(resolvedSrgb(c.ground), titleScrimAlpha(0), c.rgb);
    expect(wcagContrast(resolvedSrgb(c.text), backdrop)).toBeGreaterThanOrEqual(3);
  });

  it.each(cases)("small text: --$text and --$dim over $artwork artwork, $theme, are 4.5:1 or better", (c) => {
    const backdrop = over(resolvedSrgb(c.ground), titleScrimAlpha(TITLE_SCRIM.smallTextFrom), c.rgb);
    expect(wcagContrast(resolvedSrgb(c.text), backdrop)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(resolvedSrgb(c.dim), backdrop)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(cases)("the state tag: its backing over the scrim over $artwork artwork, $theme, is 4.5:1 or better", (c) => {
    const ground = resolvedSrgb(c.ground);
    const scrimmed = over(ground, titleScrimAlpha(0), c.rgb);
    const backdrop = over(ground, TITLE_SCRIM.stateTagBacking, scrimmed);
    expect(wcagContrast(resolvedSrgb(c.text), backdrop)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(resolvedSrgb(c.dim), backdrop)).toBeGreaterThanOrEqual(4.5);
  });

  it("meets §10's minimum scrims: 60% at large text, 90% at small, tag and scrim together 90%", () => {
    expect(titleScrimAlpha(0)).toBeGreaterThanOrEqual(0.6);
    expect(titleScrimAlpha(TITLE_SCRIM.smallTextFrom)).toBeGreaterThanOrEqual(0.9);
    const tagged = 1 - (1 - TITLE_SCRIM.stateTagBacking) * (1 - titleScrimAlpha(0));
    expect(tagged).toBeGreaterThanOrEqual(0.9);
  });

  it("only rises downward, so text pushed lower by a wrapped name sits on more scrim, not less", () => {
    let previous = 0;
    for (let offset = -120; offset <= 200; offset += 1) {
      const alpha = titleScrimAlpha(offset);
      expect(alpha).toBeGreaterThanOrEqual(previous);
      previous = alpha;
    }
  });

  it("paints the same stops it is tested with", () => {
    const gradient = titleScrimGradient("var(--hero-text-top)");
    for (const { at, alpha } of TITLE_SCRIM.stops) {
      expect(gradient).toContain(
        `var(--color-ground) ${alpha * 100}%, transparent) calc(var(--hero-text-top) ${at < 0 ? "-" : "+"} ${Math.abs(at)}px)`,
      );
    }
    expect(gradient).toMatch(/var\(--color-ground\) 100%\)$/);
  });
});
