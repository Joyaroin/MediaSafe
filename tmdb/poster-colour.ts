import { oklabToHex, srgbToOklab, type Oklab } from "@/lib/oklab";

/**
 * A poster's dominant colour, from its pixels — issue #361. Pure, and tested
 * (`tests/poster-colour.test.ts`); `tmdb/poster-image.ts` is the half that fetches the
 * image and decodes it with `sharp`.
 *
 * ── Dominant, not average ────────────────────────────────────────────────────────────
 *
 * The mean of a poster is nearly always a brown-grey: a red title card on a blue sky
 * averages to neither. So the pixels vote by **hue**, in twenty-four 15° buckets, and
 * each vote is weighted by its chroma — a saturated pixel says more about what colour a
 * poster *is* than a washed-out one. The winning bucket's pixels are then averaged in
 * OKLab, which keeps the hue the vote chose.
 *
 * Near-black and near-white pixels do not vote. They are the billing block, the
 * letterbox and the sky, and they would otherwise win on a dark poster by sheer area.
 *
 * **A poster with no colour in it still has a colour.** A black-and-white poster has no
 * chromatic pixel, and its answer is the OKLab mean of every pixel — a grey, which
 * `app/poster-tint.ts` then paints as a neutral wash. That is the truth about that poster,
 * not a fallback standing in for a failure: no pixels at all is the only input with no
 * answer, and it throws.
 */
export function dominantColour(pixels: Uint8Array, channels: 3 | 4): string {
  const count = Math.floor(pixels.length / channels);
  if (count === 0) {
    throw new Error("A poster with no pixels has no colour to extract.");
  }

  const buckets: { weight: number; sum: MutableOklab; n: number }[] = Array.from(
    { length: HUE_BUCKETS },
    () => ({ weight: 0, sum: { l: 0, a: 0, b: 0 }, n: 0 }),
  );
  const all: MutableOklab = { l: 0, a: 0, b: 0 };
  let opaque = 0;

  for (let i = 0; i < count; i++) {
    const at = i * channels;
    // A transparent pixel is not part of the picture. TMDB posters are JPEG and have no
    // alpha, so this is for the decoder handing back four channels regardless.
    if (channels === 4 && pixels[at + 3] < 128) continue;

    const lab = srgbToOklab(pixels[at], pixels[at + 1], pixels[at + 2]);
    add(all, lab, 1);
    opaque += 1;

    const chroma = Math.hypot(lab.a, lab.b);
    if (lab.l < MIN_L || lab.l > MAX_L || chroma < MIN_CHROMA) continue;

    const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
    const bucket = buckets[Math.floor(((hue + 360) % 360) / (360 / HUE_BUCKETS))];
    bucket.weight += chroma;
    bucket.n += 1;
    add(bucket.sum, lab, 1);
  }

  const winner = buckets.reduce((best, one) => (one.weight > best.weight ? one : best));
  if (winner.n > 0) return oklabToHex(mean(winner.sum, winner.n));
  if (opaque === 0) {
    throw new Error("A poster with no opaque pixels has no colour to extract.");
  }
  return oklabToHex(mean(all, opaque));
}

/** 15° each — fine enough to split red from orange, coarse enough that a gradient votes once. */
const HUE_BUCKETS = 24;
/** Under this OKLab lightness a pixel is the letterbox, not the picture. */
const MIN_L = 0.2;
/** Over this, the sky or the billing block. */
const MAX_L = 0.95;
/** Under this chroma a pixel is a grey, and greys do not vote on a hue. */
const MIN_CHROMA = 0.03;

interface MutableOklab {
  l: number;
  a: number;
  b: number;
}

function add(into: MutableOklab, lab: Oklab, weight: number): void {
  into.l += lab.l * weight;
  into.a += lab.a * weight;
  into.b += lab.b * weight;
}

function mean(sum: MutableOklab, n: number): Oklab {
  return { l: sum.l / n, a: sum.a / n, b: sum.b / n };
}
