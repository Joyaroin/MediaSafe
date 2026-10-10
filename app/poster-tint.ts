import type { CSSProperties } from "react";

import { hexToOklch } from "@/lib/oklab";

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

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
