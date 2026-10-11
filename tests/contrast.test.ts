import { describe, expect, it } from "vitest";

import {
  APCA_CONTENT_TEXT_FLOOR,
  apcaLc,
  hexToSrgb,
  resolvedSrgb,
  wcagContrast,
} from "./support/contrast";

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
 * the parent spec's own research note.
 *
 * No DOM, no browser, no snapshot — a contrast figure is a pure function of two colour
 * values, and this file reads the stylesheet as text the same way `palette.test.ts`
 * does, so it cannot drift into a copy of the palette that agrees with itself.
 */

/** The three neutral registers actually used to set text — not the accent pair. */
const TEXT_TOKENS = ["text", "dim"] as const;
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

/*
 * There was a third block here: "both --dim values sit 20 L from --text". On the linen
 * palette (#327) the two `--dim` values, derived independently from WCAG 2 in light and
 * from the APCA content-text floor in dark, both landed 20 L from `--text`, and that step
 * was asserted as the rule the next re-tint should carry forward.
 *
 * Charcoal (#395) is that re-tint, and the step cannot hold on it. Its dark ground is
 * lighter than the linen one, so the darkest `--dark-dim` that clears Lc 60 on
 * `--dark-raised` is 18 L from `--dark-text`; light `--dim` is 25 L from `--text`. The
 * 20 L was a coincidence of one palette, not a property of the floors — the floors above
 * are the rule, and they still hold in both schemes.
 */
