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
});
