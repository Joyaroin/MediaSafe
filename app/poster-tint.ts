import type { CSSProperties } from "react";

import { hexToOklch, inSrgbGamut } from "@/lib/oklab";

/**
 * A title's poster colour, made safe to put text on — issue #361.
 *
 * `title.poster_colour` is the poster's dominant colour as it is, and as it is it can be
 * anything: a near-black, a neon green. Painted straight behind a title it would fail the
 * contrast floor on half the library. So it is never painted as stored. This keeps its
 * **hue** and replaces its lightness, and caps its chroma, separately for each theme.
 *
 * ── The tint is not the accent ───────────────────────────────────────────────────────
 *
 * A separate token family (`--tint-light`, `--tint-dark`, and `--tint` resolved from
 * them in `app/globals.css`), and it is never on a control or on watch state.
 * `app/accent-meaning.ts` is unchanged by it: the accent says *this is live* or *this
 * is the way through*, and a tint says only *this is that title*.
 *
 * ── Where the two numbers come from ──────────────────────────────────────────────────
 *
 * Text over the wash is `--text` and `--dim`, and `--dim` is the one already sitting at
 * the floor — it is *the lightest value on the hue that clears 4.5:1 on `--raised`*
 * (`app/globals.css`). So the wash has to be at least as far from `--dim` as `--raised`
 * is, at every hue a poster can have. `tests/poster-tint.test.ts` sweeps every hue
 * against the floors `tests/contrast.test.ts` enforces: WCAG 4.5:1 in light, APCA Lc 60
 * in dark.
 *
 *  - **Light**: 96% lightness, chroma at most 0.04. Paler than it sounds — the ground is
 *    96.9% at 0.012 — and it is the most colour the light `--dim` leaves room for.
 *  - **Dark**: 18% lightness, chroma at most 0.06. Night has more room: the dark ground
 *    is 13.9% and the dark `--dim` is far above it.
 *
 * A poster less saturated than the cap keeps its own chroma, so a grey poster is a grey
 * wash rather than a colour invented for it.
 */
export const WASH = {
  light: { l: 0.96, maxChroma: 0.04 },
  dark: { l: 0.18, maxChroma: 0.06 },
} as const;

export type Theme = keyof typeof WASH;

/** The wash for one theme, as the `oklch()` a stylesheet reads. */
export function washFor(colour: string, theme: Theme): string {
  const { c, h } = hexToOklch(colour);
  const { l, maxChroma } = WASH[theme];
  return `oklch(${round(l * 100, 1)}% ${round(Math.min(c, maxChroma), 4)} ${round(h, 1)})`;
}

/**
 * The two custom properties a tinted surface carries, or nothing for a title with no
 * colour — which then draws exactly what it drew before the tint existed.
 *
 * Both themes travel together because the server does not know which one the reader is
 * in: the theme is the system's, or a `data-theme` the browser set before first paint
 * (`lib/theme.ts`). `app/globals.css` picks one of the two as `--tint` under the same
 * three selectors every other token resolves through.
 */
export function posterTintStyle(colour: string | null): CSSProperties | undefined {
  if (colour === null) return undefined;
  return {
    "--tint-light": washFor(colour, "light"),
    "--tint-dark": washFor(colour, "dark"),
  } as CSSProperties;
}

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

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
