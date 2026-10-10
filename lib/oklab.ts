/**
 * sRGB ↔ OKLab ↔ OKLCH, pure — the conversions the poster colour needs (issue #361).
 *
 * Two callers, and they meet in this file rather than each carrying a copy:
 * `tmdb/poster-colour.ts` averages pixels in OKLab (an average in gamma-encoded sRGB
 * drifts toward muddy, an OKLab one does not) and hands back `#rrggbb`; `app/poster-tint.ts`
 * reads that hex back as OKLCH so it can move lightness and chroma and keep the hue.
 *
 * Björn Ottosson's matrices, the ones CSS Color 4 cites and `tests/contrast.test.ts`
 * transcribes.
 */

/** OKLab, with `l` on 0–1. */
export interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** OKLCH, with `l` on 0–1 and `h` in degrees on [0, 360). */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

/** Gamma-encoded sRGB, each channel 0–255, to OKLab. */
export function srgbToOklab(r: number, g: number, b: number): Oklab {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab to `#rrggbb`, clipped into sRGB channel by channel. */
export function oklabToHex({ l, a, b }: Oklab): string {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];

  return `#${linear
    .map((c) => Math.round(clamp01(toGamma(clamp01(c))) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** `#rrggbb` to OKLCH. Throws on anything else — the column's CHECK holds the same spelling. */
export function hexToOklch(hex: string): Oklch {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new Error(`Not a #rrggbb colour: ${JSON.stringify(hex)}`);
  }
  const { l, a, b } = srgbToOklab(
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  );
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}
