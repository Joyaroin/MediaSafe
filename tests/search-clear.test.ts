import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The search field's ✕ — the UI overhaul. Read off the source, the way
 * `search-results-motion.test.ts` reads this file: `search-surface.tsx` reaches a server
 * action and does not render under Vitest.
 */
const SURFACE = readFileSync("app/(signed-in)/search/search-surface.tsx", "utf8");
const code = SURFACE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the search field clears in one press", () => {
  it("draws a labelled clear button, and only once there is something to clear", () => {
    expect(code).toContain('aria-label="Clear search"');
    expect(code).toMatch(/\{value === "" \? null : \(\s*<button/);
  });

  it("clears through the same change as backspacing to nothing, and keeps the focus", () => {
    expect(code).toMatch(/function clear\(\) \{\s*onChange\(""\);\s*input\.current\?\.focus\(\);/);
  });

  it("clears on Escape too, and hides the browser's own clear glyph", () => {
    expect(code).toContain('event.key === "Escape"');
    expect(code).toContain('type="search"');
    expect(code).toContain("[&::-webkit-search-cancel-button]:appearance-none");
  });

  /**
   * Issue #465. `arrive` is for a region arriving whole — the recommendation rails fading
   * back up when the field empties (this same file's `idle` branch) — and this button is a
   * control that already carries its own press, not a region. Pinned to the button's own
   * `className`, not merely absent from the file, because `arrive` legitimately appears
   * elsewhere on this screen (the rails, the empty state) and a bare `not.toContain` would
   * pass by accident the day either of those loses it.
   */
  it("keeps the press the clear button already had, and drops the region entrance", () => {
    const match = code.match(/aria-label="Clear search"[\s\S]*?className="([^"]*)"/);
    expect(match, "the clear button must still be findable by its label").not.toBeNull();
    const classes = match![1].split(/\s+/);

    expect(classes).toContain("pressable");
    expect(classes).toContain("[--press-register:1]");
    expect(classes).not.toContain("arrive");
  });

  /**
   * No second `transition-*` utility beside `pressable` — the tab bar's own trap
   * (`app/globals.css`'s `pressable` docblock): two `transition` shorthands in the same
   * cascade layer are resolved by emission order, and the clear button carried
   * `transition-colors` beside the press until this ticket.
   */
  it("wears no second transition-* utility beside the press", () => {
    const match = code.match(/aria-label="Clear search"[\s\S]*?className="([^"]*)"/);
    expect(match, "the clear button must still be findable by its label").not.toBeNull();
    const classes = match![1].split(/\s+/);

    expect(classes.filter((token) => /^transition(-|$)/.test(token))).toEqual([]);
  });
});
