import { describe, expect, it } from "vitest";

import {
  BAND,
  bandFor,
  GLOW,
  glowFor,
  posterBandStyle,
  posterGlowStyle,
  TITLE_SCRIM,
  titleScrimAlpha,
  titleScrimGradient,
  TONIGHT_SCRIM,
  tonightScrimAlpha,
  tonightScrimGradient,
  tonightScrimVars,
  tonightTitleScrimGradient,
} from "@/app/poster-tint";
import { hexToOklch, inSrgbGamut, oklabToHex } from "@/lib/oklab";

import {
  gammaEncode,
  oklchToLinearSrgb,
  parseOklch,
  resolvedSrgb,
  wcagContrast,
} from "./support/contrast";

/**
 * A poster's colour in the roles it plays — the glow, the band — and the scrims that keep
 * text legible over artwork (handoff §10). Contrast is computed by `tests/contrast.test.ts`'s
 * own functions (`tests/support/contrast.ts`) against the same declarations. A poster can be
 * any colour, so each sweep is every hue at full and at low chroma, and every lightness a
 * poster's dominant colour could have.
 *
 * Issue #361's wash and its assertions went with it (Charcoal, issue #400): the band and
 * Tonight's featured block replaced the only two surfaces that painted it.
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

describe("Tonight's two scrims keep §10's floors (Charcoal, issue #400)", () => {
  /**
   * The featured episode's text over its artwork, on the phone (everything below `xl:`) and
   * the desktop card, composited over pure white and pure black artwork in both themes.
   * The `ground` scrim is measured from the *Up next* label's top; every line of the block
   * sits at or below it, so a title wrapping to two lines only moves the lines under it
   * further into the scrim — which is what the two layouts below check, line by line.
   */
  const ARTWORK: Record<string, [number, number, number]> = {
    white: [1, 1, 1],
    black: [0, 0, 0],
  };
  const THEMES = [
    { theme: "light", ground: "ground", text: "text", dim: "dim" },
    { theme: "dark", ground: "dark-ground", text: "dark-text", dim: "dark-dim" },
  ] as const;
  const LAYOUTS = ["phone", "desktop"] as const;

  function over(
    top: [number, number, number],
    alpha: number,
    under: [number, number, number],
  ): [number, number, number] {
    return top.map((c, i) => alpha * c + (1 - alpha) * under[i]) as [number, number, number];
  }

  /**
   * Where each line of the text block starts, in px from the label's top, for a title of
   * one line and of two — the Display size's line box (`80px` at `0.9` on a phone, `128px`
   * from `xl:`), the block's own gaps, and `kind` for which floor applies. The label is
   * small text at the very top; the title is large; the episode line and the count are
   * small, under the title.
   */
  function linesOf(layout: (typeof LAYOUTS)[number], titleLines: 1 | 2) {
    const display = layout === "phone" ? 80 * 0.9 : 128 * 0.9;
    const title = 16 + 6;
    const episode = title + display * titleLines + 8;
    return [
      { name: "the Up next label", at: 0, kind: "small" },
      { name: "the title", at: title, kind: "large" },
      { name: "the episode line and count", at: episode, kind: "small" },
    ] as const;
  }

  const cases = LAYOUTS.flatMap((layout) =>
    THEMES.flatMap((t) =>
      Object.entries(ARTWORK).flatMap(([artwork, rgb]) =>
        ([1, 2] as const).map((titleLines) => ({ layout, ...t, artwork, rgb, titleLines })),
      ),
    ),
  );

  it.each(cases)(
    "$layout, $theme, over $artwork artwork, a $titleLines-line title: every line clears its floor",
    (c) => {
      const ground = resolvedSrgb(c.ground);
      for (const line of linesOf(c.layout, c.titleLines)) {
        const backdrop = over(ground, tonightScrimAlpha(line.at, c.layout), c.rgb);
        const floor = line.kind === "large" ? 3 : 4.5;
        expect(wcagContrast(resolvedSrgb(c.text), backdrop), `${line.name}, text`).toBeGreaterThanOrEqual(floor);
        if (line.kind === "small") {
          expect(wcagContrast(resolvedSrgb(c.dim), backdrop), `${line.name}, dim`).toBeGreaterThanOrEqual(floor);
        }
      }
    },
  );

  it.each(LAYOUTS)("%s: the white screen title clears 3:1 on its black scrim over white artwork", (layout) => {
    // The title's weakest edge is its foot, where the scrim is lightest; white artwork is
    // the worst case under white text. The theme does not enter: the scrim is black.
    const backdrop = over([0, 0, 0], TONIGHT_SCRIM.black.atTitleBottom, ARTWORK.white);
    expect(wcagContrast([1, 1, 1], backdrop)).toBeGreaterThanOrEqual(3);
    expect(TONIGHT_SCRIM.black[layout].goneBelow).toBeGreaterThan(0);
  });

  it.each(LAYOUTS)("%s: the ground scrim is 90%% at the label and only rises below it", (layout) => {
    expect(tonightScrimAlpha(0, layout)).toBeCloseTo(0.9, 10);
    let previous = 0;
    for (let offset = -300; offset <= 400; offset += 1) {
      const alpha = tonightScrimAlpha(offset, layout);
      expect(alpha).toBeGreaterThanOrEqual(previous);
      previous = alpha;
    }
    expect(tonightScrimAlpha(TONIGHT_SCRIM.ground[layout].solidBelow, layout)).toBe(1);
    expect(tonightScrimAlpha(-TONIGHT_SCRIM.ground[layout].fadeAbove, layout)).toBe(0);
  });

  it("paints the measures it is tested with, for both layouts", () => {
    const vars = tonightScrimVars() as Record<string, string>;
    for (const layout of LAYOUTS) {
      const { fadeAbove, solidBelow } = TONIGHT_SCRIM.ground[layout];
      expect(vars[`--tonight-fade-${layout}`]).toBe(`${fadeAbove}px`);
      expect(vars[`--tonight-solid-${layout}`]).toBe(`${fadeAbove + solidBelow}px`);
      expect(vars[`--tonight-gone-${layout}`]).toBe(`${TONIGHT_SCRIM.black[layout].goneBelow}px`);
    }
    expect(tonightScrimGradient()).toContain("var(--color-ground) 90%, transparent) var(--tonight-fade)");
    expect(tonightScrimGradient()).toContain("var(--color-ground) var(--tonight-solid)");
    expect(tonightTitleScrimGradient()).toContain("rgb(0 0 0 / 50%) 0");
    expect(tonightTitleScrimGradient()).toContain("rgb(0 0 0 / 45%) calc(100% - var(--tonight-gone))");
  });
});

