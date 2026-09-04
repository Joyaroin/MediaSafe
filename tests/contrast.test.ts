import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The regression this whole spec (#326) exists to fix, made mechanical: **every text
 * token clears its contrast floor on both grounds, in both schemes.**
 *
 * Issue #328. `tests/palette.test.ts` already sweeps the palette for internal
 * agreement — one declaration site, the design document, the handoff — and carries a
 * WCAG 2.2 check as a side effect of proving `--dim` moved. This file is the ticket
 * that check was standing in for: it asserts the floor itself, on the harder of the
 * two grounds a register is actually drawn on (`--raised`, not just `--ground`), and it
 * asserts dark against the standard that actually describes dark.
 *
 * **Two floors, because the two schemes need different standards.** Light is asserted
 * against WCAG 2.2's 4.5:1 (the `Understanding Contrast (Minimum)` document). Dark is
 * asserted against the APCA perceptual content-text floor, **Lc 60** — the Myndex
 * `apca-w3` table's "minimum level recommended for content text that is not body,
 * column, or block text" — because WCAG 2 has nothing useful to say near black: it
 * passes the *shipped* dark `--dim` (5.87:1) while that value sits at Lc −40, under
 * even the Lc 45 headline floor. That gap is exactly how the dark regression hid, per
 * the parent spec and `docs/design/visual-refinement-research.md` §2.3.
 *
 * No DOM, no browser, no snapshot — a contrast figure is a pure function of two colour
 * values, and this file reads the stylesheet as text the same way `palette.test.ts`
 * does, so it cannot drift into a copy of the palette that agrees with itself.
 */

const ROOT = join(__dirname, "..");
const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

/** Comments blanked to spaces (same length), so a declaration inside prose is not read as one. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));

/**
 * Reads a declaration out of the stylesheet **and proves there is only one of it**.
 * Mirrors `palette.test.ts`'s `declaredOnce` — reading `oklch()` only is itself part of
 * what makes this test fail if the shipped pre-refit `--dim` (a bare hex) ever came
 * back: a hex declaration matches nothing here, so `all` is empty rather than one.
 */
function declaredOnce(name: string): string {
  const all = [...CSS_CODE.matchAll(new RegExp(`^\\s*--${name}:\\s*(oklch\\([^;]+?\\));`, "gim"))];
  expect(all, `--${name} must have exactly one declaration site`).toHaveLength(1);
  return all[0][1].trim();
}

/** Parses one `oklch(L% C H)` declaration into its three numbers (L as a 0–100 percentage). */
function parseOklch(declaration: string): [number, number, number] {
  const match = declaration.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/);
  expect(match, `not a plain oklch() declaration: ${declaration}`).not.toBeNull();
  const [, l, c, h] = match!;
  return [Number(l), Number(c), Number(h)];
}

/**
 * OKLCH → linear sRGB, Björn Ottosson's closed form (the one the CSS Color 4 spec
 * itself cites). `L` is 0–1 here, not the declared percentage — both contrast models
 * below want sRGB, one gamma-encoded and one not, so this stops one step short of
 * either and each caller finishes the conversion it needs.
 */
function oklchToLinearSrgb(L: number, C: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

/**
 * Linear sRGB → gamma-encoded sRGB, 0–1 per channel, quantised to the 8-bit byte a
 * screen is actually sent. `oklchToLinearSrgb` is continuous; a real browser paints an
 * 8-bit-per-channel pixel, and both contrast models below are sensitive enough near
 * their floor that skipping this step reads as a few tenths of an `Lc` point of extra
 * contrast that no reader's screen would show — which is exactly the gap that turned
 * `--dark-dim` on `--dark-raised` from clearing Lc 60 into missing it by 0.09 while this
 * file was being built.
 */
function gammaEncode([r, g, b]: [number, number, number]): [number, number, number] {
  const toSrgbByte = (c: number) => {
    const v = clamp01(c);
    const gamma = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(clamp01(gamma) * 255) / 255;
  };
  return [toSrgbByte(r), toSrgbByte(g), toSrgbByte(b)];
}

/** A token's declared value, resolved to the gamma-encoded sRGB a browser would paint. */
function resolvedSrgb(name: string): [number, number, number] {
  const [L, C, H] = parseOklch(declaredOnce(name));
  return gammaEncode(oklchToLinearSrgb(L / 100, C, H));
}

/** A literal `#rrggbb` to gamma-encoded sRGB, 0–1 per channel. */
function hexToSrgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/**
 * WCAG 2.x relative luminance and contrast ratio, over gamma-encoded sRGB — the
 * "Relative Luminance" definition from the WCAG 2.2 spec itself.
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [r, g, b].map(linearize);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function wcagContrast(fg: [number, number, number], bg: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * APCA (`apca-w3` 0.1.9) contrast, `Lc`. Constants and structure transcribed from the
 * reference implementation the research note cites
 * (https://raw.githubusercontent.com/Myndex/apca-w3/master/src/apca-w3.js), verified
 * against `docs/design/visual-refinement-research.md` §2.3's own worked figures — e.g.
 * light `--dim` on `--raised`/`--ground` computes to Lc 66/71 here as it does there, and
 * dark `--dim` on `--ground`/`--raised` computes to Lc −61/−60.
 *
 * Sign carries polarity (dark text on light ground is positive, the reverse negative);
 * every caller below compares the magnitude against the floor, which is what "clears
 * Lc 60" means regardless of which way the polarity runs.
 */
function apcaY([r, g, b]: [number, number, number]): number {
  // APCA's own luminance: a plain power curve on gamma-encoded sRGB, not the WCAG
  // piecewise linearization — this is one of the two structural differences from WCAG
  // 2 that make APCA read dark colours differently (§2.3).
  return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
}

function apcaLc(fg: [number, number, number], bg: [number, number, number]): number {
  const normBG = 0.56;
  const normTXT = 0.57;
  const revTXT = 0.62;
  const revBG = 0.65;
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const scale = 1.14;
  const loClip = 0.1;
  const loOffset = 0.027;
  const deltaYmin = 0.0005;

  const softBlackClamp = (Y: number) => (Y > blkThrs ? Y : Y + Math.abs(blkThrs - Y) ** blkClmp);

  const textY = softBlackClamp(apcaY(fg));
  const bgY = softBlackClamp(apcaY(bg));

  if (Math.abs(bgY - textY) < deltaYmin) return 0;

  let sapc: number;
  let output: number;
  if (bgY > textY) {
    // Normal polarity: dark(er) text on a light(er) ground.
    sapc = (bgY ** normBG - textY ** normTXT) * scale;
    output = sapc < loClip ? 0 : sapc - loOffset;
  } else {
    // Reverse polarity: light(er) text on a dark(er) ground.
    sapc = (bgY ** revBG - textY ** revTXT) * scale;
    output = sapc > -loClip ? 0 : sapc + loOffset;
  }

  return output * 100;
}

/** APCA's own recommended floor for content text that is not body/column/block text. */
const APCA_CONTENT_TEXT_FLOOR = 60;

/** The three neutral registers actually used to set text — not the accent pair. */
const TEXT_TOKENS = ["text", "ink", "dim"] as const;
const GROUNDS = ["ground", "raised"] as const;

describe("every text token clears its contrast floor on both grounds", () => {
  describe.each(TEXT_TOKENS)("--%s", (token) => {
    it.each(GROUNDS)("clears 4.5:1 in light, on --%s", (ground) => {
      expect(wcagContrast(resolvedSrgb(token), resolvedSrgb(ground))).toBeGreaterThanOrEqual(4.5);
    });

    it.each(GROUNDS)("clears the APCA content-text floor in dark, on --dark-%s", (ground) => {
      const lc = apcaLc(resolvedSrgb(`dark-${token}`), resolvedSrgb(`dark-${ground}`));
      expect(Math.abs(lc)).toBeGreaterThanOrEqual(APCA_CONTENT_TEXT_FLOOR);
    });
  });
});

describe("the gap between the two standards is real, not asserted past", () => {
  /**
   * The shipped pre-refit dark `--dim` is the worked example the parent spec names:
   * 5.87:1 by WCAG 2 (comfortably over 4.5:1) while sitting at Lc −40 (under even the
   * Lc 45 headline floor, let alone the Lc 60 content-text floor above). If APCA and
   * WCAG never disagreed on this palette, the dark assertion above would be redundant
   * with a WCAG check and this suite would not be the fix the regression needed.
   *
   * This does not read `--dim` itself — the shipped value is gone — it recomputes the
   * historical figure from the committed pre-refit hex values themselves (`bf57dfa`,
   * "The neutral palette, in both themes (#134)": `--dark-dim: #8c8c8a` on
   * `--dark-ground: #0a0a0b`), the same way `palette.test.ts` keeps the handoff's hex as
   * a literal to diff the live palette against rather than trusting a description of the
   * regression.
   */
  it("the pre-refit dark --dim passed WCAG while failing Lc 60 on --dark-ground", () => {
    const shippedDarkDim = hexToSrgb("#8c8c8a");
    const shippedDarkGround = hexToSrgb("#0a0a0b");

    expect(wcagContrast(shippedDarkDim, shippedDarkGround)).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(apcaLc(shippedDarkDim, shippedDarkGround))).toBeLessThan(APCA_CONTENT_TEXT_FLOOR);
  });
});

describe("both --dim values sit 20 L from --text — the rule, not just the numbers", () => {
  /**
   * Derived independently from two different standards (WCAG 2 in light, the APCA
   * content-text floor in dark) and landing on the same figure is the relationship the
   * next re-tint has to preserve rather than re-derive — asserted here rather than left
   * as two values that happen to agree today.
   */
  const lightnessOf = (name: string) => parseOklch(declaredOnce(name))[0];
  const withinOneL = (delta: number) => Math.abs(delta - 20) <= 1;

  it("light: --dim is 20 L above --text, toward the light ground", () => {
    expect(withinOneL(lightnessOf("dim") - lightnessOf("text"))).toBe(true);
  });

  it("dark: --dark-dim is 20 L below --dark-text, toward the dark ground", () => {
    expect(withinOneL(lightnessOf("dark-text") - lightnessOf("dark-dim"))).toBe(true);
  });
});
