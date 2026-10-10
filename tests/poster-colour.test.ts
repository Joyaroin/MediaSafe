import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hexToOklch } from "@/lib/oklab";
import { dominantColour } from "@/tmdb/poster-colour";
import { extractPosterColour } from "@/tmdb/poster-image";

/**
 * Issue #361's extraction: a poster's dominant colour, from its pixels.
 *
 * The pure half (`dominantColour`) against hand-built pixel runs, and the I/O half
 * (`extractPosterColour`) end to end through a real `sharp` decode, with `fetch` stubbed
 * so nothing here touches TMDB.
 */

type Rgb = readonly [number, number, number];

/** `n` pixels of each colour, as the flat RGB run `sharp`'s `raw()` hands back. */
function pixels(...runs: readonly [Rgb, number][]): Uint8Array {
  const out: number[] = [];
  for (const [rgb, n] of runs) for (let i = 0; i < n; i++) out.push(...rgb);
  return Uint8Array.from(out);
}

function hueOf(hex: string): number {
  return hexToOklch(hex).h;
}

const BLACK: Rgb = [5, 5, 5];
const WHITE: Rgb = [250, 250, 250];
const RED: Rgb = [200, 30, 30];
const DULL_BLUE: Rgb = [90, 100, 130];
const BLUE: Rgb = [30, 60, 220];

describe("dominantColour", () => {
  it("is the poster's colour, not its letterbox", () => {
    // Mostly black, as a dark poster is — the black does not get a vote.
    const colour = dominantColour(pixels([BLACK, 700], [RED, 100]), 3);
    expect(Math.abs(hueOf(colour) - hueOf("#c81e1e"))).toBeLessThan(10);
  });

  it("lets a vivid colour outvote a larger dull one", () => {
    const colour = dominantColour(pixels([DULL_BLUE, 300], [RED, 150]), 3);
    expect(Math.abs(hueOf(colour) - hueOf("#c81e1e"))).toBeLessThan(10);
  });

  it("follows the larger area when the two are as vivid as each other", () => {
    const colour = dominantColour(pixels([RED, 100], [BLUE, 300]), 3);
    expect(Math.abs(hueOf(colour) - hueOf("#1e3cdc"))).toBeLessThan(10);
  });

  it("gives a black-and-white poster a grey, rather than no answer", () => {
    const colour = dominantColour(pixels([BLACK, 100], [WHITE, 100], [[128, 128, 128], 100]), 3);
    expect(hexToOklch(colour).c).toBeLessThan(0.01);
  });

  it("ignores transparent pixels when the decoder hands back four channels", () => {
    const rgba = Uint8Array.from([
      ...[0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0], // three transparent greens
      ...[200, 30, 30, 255], // one opaque red
    ]);
    expect(Math.abs(hueOf(dominantColour(rgba, 4)) - hueOf("#c81e1e"))).toBeLessThan(10);
  });

  it("always answers in the one spelling the column accepts", () => {
    expect(dominantColour(pixels([RED, 10]), 3)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("throws for no pixels — the one input with no colour", () => {
    expect(() => dominantColour(new Uint8Array(), 3)).toThrow();
  });
});

describe("extractPosterColour", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A JPEG of `rgb` with a black band across its foot, as a poster's billing block would be. */
  async function jpegOf(rgb: Rgb): Promise<Buffer> {
    const band = await sharp({
      create: { width: 92, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    return sharp({
      create: { width: 92, height: 138, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
    })
      .composite([{ input: band, top: 98, left: 0 }])
      .jpeg()
      .toBuffer();
  }

  it("decodes the smallest TMDB poster and answers its colour", async () => {
    const image = await jpegOf(BLUE);
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      return new Response(new Uint8Array(image), { status: 200 });
    });

    const colour = await extractPosterColour("/abc.jpg");

    expect(fetched).toEqual(["https://image.tmdb.org/t/p/w92/abc.jpg"]);
    expect(Math.abs(hueOf(colour) - hueOf("#1e3cdc"))).toBeLessThan(10);
  });

  it("throws for a poster the CDN will not serve, rather than inventing a colour", async () => {
    vi.stubGlobal("fetch", async () => new Response("gone", { status: 404 }));
    await expect(extractPosterColour("/gone.jpg")).rejects.toThrow(/404/);
  });

  it("throws for bytes that are not an image", async () => {
    vi.stubGlobal("fetch", async () => new Response("not a jpeg", { status: 200 }));
    await expect(extractPosterColour("/broken.jpg")).rejects.toThrow();
  });
});
