import type { CSSProperties } from "react";

import { hexToOklch, inSrgbGamut } from "@/lib/oklab";

/**
 * A title's poster colour, in the two roles it plays — the glow (issue #363) and the band
 * (Charcoal, issue #398) — plus the scrims that keep text legible over artwork.
 *
 * `title.poster_colour` is the poster's dominant colour as it is, and as it is it can be
 * anything: a near-black, a neon green. So it is never painted as stored: each role keeps
 * its **hue** and replaces its lightness, and caps its chroma.
 *
 * ── The tint is not the accent ───────────────────────────────────────────────────────
 *
 * Never on a control and never on watch state. `app/accent-meaning.ts` is unchanged by
 * it: the accent says what a control does, and a poster's colour says only *this is that
 * title*.
 *
 * ── The wash is gone — Charcoal, issue #400 ───────────────────────────────────────────
 *
 * Issue #361's per-theme wash (`WASH`, `--tint-light`, `--tint-dark`, `--tint`) painted the
 * title hero and then Up next's featured card. The band replaced it on the hero (#398) and
 * Tonight's featured block replaced the card, so nothing read it, and it went with its
 * assertions, as #398 said it should once nothing did.
 */

/**
 * The hover glow's colour — issue #363 — the other role a poster's colour plays.
 *
 * A glow has no text on it, so the wash's contrast clamp does not apply, and the wash's
 * own values would be invisible here: a 96% glow around a poster on a 96.9% ground is no
 * glow at all. So it is a separate pair of numbers, at a mid lightness either theme can
 * see against its ground, with the chroma capped so a neon poster glows rather than
 * shouts. The hue is the poster's, as it is for the wash.
 *
 * **One value for both themes**, unlike the wash: a mid lightness sits as far from the
 * light ground as from the dark one, so there is nothing for the theme to choose.
 */
export const GLOW = { l: 0.62, maxChroma: 0.14 } as const;

/** The glow, as the `oklch()` a stylesheet reads. */
export function glowFor(colour: string): string {
  const { c, h } = hexToOklch(colour);
  const { l, maxChroma } = GLOW;
  return `oklch(${round(l * 100, 1)}% ${round(Math.min(c, maxChroma), 4)} ${round(h, 1)})`;
}

/**
 * The custom property a glowing poster carries, read by `.poster-glow` in
 * `app/globals.css` — or nothing for a title with no colour, which then has no glow at
 * all rather than a guessed one.
 */
export function posterGlowStyle(colour: string | null): CSSProperties | undefined {
  if (colour === null) return undefined;
  return { "--glow": glowFor(colour) } as CSSProperties;
}

/**
 * The band — Charcoal, issue #398 (handoff §10). The fill behind a title's hero artwork,
 * and what shows while the artwork loads or when there is none. The third role a poster's
 * colour plays, and the first one with white over it: the wash's numbers only ever had
 * `--text` and `--dim` on them, and the glow has no text at all.
 *
 * - **The stored hue**, as the wash and the glow keep it.
 * - **52% lightness**, where white on it clears 4.5:1 at every hue the sRGB gamut allows.
 * - **Chroma capped at 0.17**, then **reduced until the colour is inside sRGB**. At 52%
 *   lightness a vivid green or blue is far outside the gamut, and a browser handed one
 *   clips it channel by channel — which moves its lightness, and the contrast with it.
 *   So the gamut mapping happens here, along chroma alone, and the browser is only ever
 *   handed a colour it can paint as written.
 *
 * **One value for both themes**, like the glow: it sits under a scrim in the theme's own
 * `ground` (`TITLE_SCRIM` below), so it never has to clear a theme's text by itself.
 * A title with no stored colour gets no band at all — the area shows `raised`. Never on
 * a control, never on watch state.
 */
export const BAND = { l: 0.52, maxChroma: 0.17 } as const;

/** The band, as the `oklch()` a stylesheet reads — always inside sRGB as written. */
export function bandFor(colour: string): string {
  const stored = hexToOklch(colour);
  const h = round(stored.h, 1);
  // The search runs on the hue as it will be written, so rounding the hue for the string
  // cannot carry a colour that was in gamut back out of it.
  let inside = 0;
  let outside = Math.min(stored.c, BAND.maxChroma);
  if (inSrgbGamut({ l: BAND.l, c: outside, h })) {
    inside = outside;
  } else {
    for (let step = 0; step < 32; step += 1) {
      const mid = (inside + outside) / 2;
      if (inSrgbGamut({ l: BAND.l, c: mid, h })) inside = mid;
      else outside = mid;
    }
  }
  // Down, not to nearest: rounding up could step back over the gamut's edge.
  const c = Math.floor(inside * 10_000) / 10_000;
  return `oklch(${round(BAND.l * 100, 1)}% ${c} ${h})`;
}

/**
 * The custom property a banded surface carries, or nothing for a title with no colour —
 * which then reads `var(--band, var(--color-raised))` as `raised`. Nothing is guessed.
 */
export function posterBandStyle(colour: string | null): CSSProperties | undefined {
  if (colour === null) return undefined;
  return { "--band": bandFor(colour) } as CSSProperties;
}

/**
 * The scrim on a title page — handoff §10's *text over artwork has a floor*. Artwork can
 * be anything, so the hero's text never sits on it bare: a `ground` scrim rises behind
 * it, **measured from the top of the text block** rather than from the artwork's box, so
 * a name that wraps to three lines pushes the block down into more scrim, never less.
 *
 * `stops` are px from the text block's top (negative is above it) and the alpha of
 * `ground` there; the scrim is clear above the first and solid at the band's foot.
 * `tests/poster-tint.test.ts` composites these exact numbers over pure white and pure
 * black artwork, in both themes, against the floors:
 *
 * - **Large text** (the name, 24px and up, in `text`): 3:1 at the text's weakest edge —
 *   its top, so the scrim's alpha at offset `0`.
 * - **Small text** (meta, progress, in `text` or `dim`): 4.5:1. Nothing small sits higher
 *   than `smallTextFrom` below the block's top except the state tag — the tag's own height
 *   or the name's always comes first — and `tests/e2e/title-tint.spec.ts` measures that.
 * - **The state tag**, which does sit at the top: its own `ground` backing at
 *   `stateTagBacking`, over the scrim, together reaching 90%.
 */
export const TITLE_SCRIM = {
  stops: [
    { at: -75, alpha: 0.1 },
    { at: -20, alpha: 0.72 },
    { at: 20, alpha: 0.9 },
  ],
  smallTextFrom: 20,
  stateTagBacking: 0.85,
} as const;

/** The scrim's alpha at a px offset from the text block's top, as the gradient paints it. */
export function titleScrimAlpha(offset: number): number {
  const { stops } = TITLE_SCRIM;
  if (offset <= stops[0].at) return offset < stops[0].at ? 0 : stops[0].alpha;
  for (let i = 1; i < stops.length; i += 1) {
    const [from, to] = [stops[i - 1], stops[i]];
    if (offset <= to.at) {
      return from.alpha + ((to.alpha - from.alpha) * (offset - from.at)) / (to.at - from.at);
    }
  }
  return stops[stops.length - 1].alpha;
}

/**
 * The scrim as a CSS gradient, for a box whose text block starts `textTop` from its top
 * (a `calc()`-able length). Clear at the box's top, the stops above, solid at its foot.
 * The box's foot is the text block's foot — the band ends where the text does — so
 * *solid by the foot of the band* holds however long the name runs.
 */
export function titleScrimGradient(textTop: string): string {
  const stops = TITLE_SCRIM.stops.map(
    ({ at, alpha }) =>
      `color-mix(in oklab, var(--color-ground) ${round(alpha * 100, 1)}%, transparent) calc(${textTop} ${at < 0 ? "-" : "+"} ${Math.abs(at)}px)`,
  );
  return `linear-gradient(to bottom, transparent 0, ${stops.join(", ")}, var(--color-ground) 100%)`;
}

/**
 * Tonight's two scrims — Charcoal, issue #400 (handoff §8.1, §10). The featured episode's
 * text sits over its artwork, so it gets the title page's treatment at Tonight's own
 * measures, and the white *Tonight* over the top of the artwork gets a scrim of its own.
 *
 * - **The `ground` scrim** is measured from the top of the *Up next* label — the first
 *   line of the text block, which is anchored to the artwork's foot and grows downward.
 *   It is `atLabel` there, clear `fadeAbove` px above, and solid `solidBelow` px below.
 *   Every line under the label sits on more of it, so a title that wraps to two lines
 *   only ever moves text into more scrim.
 * - **The black scrim** is measured from the screen title: `top` at the artwork's top
 *   edge, `atTitleBottom` at the title's foot, gone `goneBelow` px further down. White
 *   is large text here, so its floor is 3:1.
 *
 * `phone` is everything below `xl:`; `desktop` is the two-column card from `xl:`. The
 * `ground` scrim never reaches up under the white title — `tests/e2e/up-next-featured.spec.ts`
 * measures that — because in the light theme `ground` is pale and white on it would fail.
 */
export const TONIGHT_SCRIM = {
  ground: {
    atLabel: 0.9,
    phone: { fadeAbove: 60, solidBelow: 110 },
    desktop: { fadeAbove: 215, solidBelow: 150 },
  },
  black: {
    top: 0.5,
    atTitleBottom: 0.45,
    phone: { goneBelow: 40 },
    desktop: { goneBelow: 75 },
  },
} as const;

export type TonightLayout = "phone" | "desktop";

/** The `ground` scrim's alpha at a px offset from the *Up next* label's top. */
export function tonightScrimAlpha(offset: number, layout: TonightLayout): number {
  const { atLabel } = TONIGHT_SCRIM.ground;
  const { fadeAbove, solidBelow } = TONIGHT_SCRIM.ground[layout];
  if (offset <= -fadeAbove) return 0;
  if (offset <= 0) return (atLabel * (offset + fadeAbove)) / fadeAbove;
  if (offset >= solidBelow) return 1;
  return atLabel + ((1 - atLabel) * offset) / solidBelow;
}

/**
 * The measures both scrims are drawn at, as custom properties for each layout. The
 * featured block carries these inline, and picks one layout's set per breakpoint with
 * `TONIGHT_SCRIM_LAYOUT` — so the px in the stylesheet are these numbers, not a copy.
 */
export function tonightScrimVars(): CSSProperties {
  const vars: Record<string, string> = {};
  for (const layout of ["phone", "desktop"] as const) {
    const { fadeAbove, solidBelow } = TONIGHT_SCRIM.ground[layout];
    vars[`--tonight-fade-${layout}`] = `${fadeAbove}px`;
    vars[`--tonight-solid-${layout}`] = `${fadeAbove + solidBelow}px`;
    vars[`--tonight-gone-${layout}`] = `${TONIGHT_SCRIM.black[layout].goneBelow}px`;
  }
  return vars as CSSProperties;
}

/** The phone set below `xl:`, the desktop set from it — the switch `tonightScrimVars` feeds. */
export const TONIGHT_SCRIM_LAYOUT =
  "[--tonight-fade:var(--tonight-fade-phone)] [--tonight-solid:var(--tonight-solid-phone)] [--tonight-gone:var(--tonight-gone-phone)] xl:[--tonight-fade:var(--tonight-fade-desktop)] xl:[--tonight-solid:var(--tonight-solid-desktop)] xl:[--tonight-gone:var(--tonight-gone-desktop)]";

/**
 * The `ground` scrim as the background of the text block's own wrapper, whose top padding
 * is `--tonight-fade`: clear at the wrapper's top, `atLabel` where the label starts, solid
 * at `--tonight-solid` — so it is measured from the text however tall the block is.
 */
export function tonightScrimGradient(): string {
  const { atLabel } = TONIGHT_SCRIM.ground;
  return `linear-gradient(to bottom, transparent 0, color-mix(in oklab, var(--color-ground) ${round(atLabel * 100, 1)}%, transparent) var(--tonight-fade), var(--color-ground) var(--tonight-solid))`;
}

/**
 * The black scrim as the background of the screen title's own wrapper, whose bottom
 * padding is `--tonight-gone`: `top` at the wrapper's top (the artwork's top edge),
 * `atTitleBottom` where the title ends, clear at the wrapper's foot.
 */
export function tonightTitleScrimGradient(): string {
  const { top, atTitleBottom } = TONIGHT_SCRIM.black;
  return `linear-gradient(to bottom, rgb(0 0 0 / ${round(top * 100, 1)}%) 0, rgb(0 0 0 / ${round(atTitleBottom * 100, 1)}%) calc(100% - var(--tonight-gone)), transparent 100%)`;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
