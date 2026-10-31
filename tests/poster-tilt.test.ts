import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The desktop poster tilt — the UI overhaul's CSS depth. Read off the source: the hook is
 * a document listener and the effect is CSS, and what is worth pinning is *where it may
 * never happen* rather than the angle.
 */
const GLOBALS = readFileSync("app/globals.css", "utf8");
const HOOK = readFileSync("app/poster-tilt.ts", "utf8");

describe("posters tilt on a desktop and nowhere else", () => {
  it("only listens where there is a fine pointer that can hover", () => {
    expect(HOOK).toContain('"(hover: hover) and (pointer: fine)"');
    expect(HOOK).toMatch(/if \(!window\.matchMedia\(FINE_HOVER\)\.matches\) return;/);
    expect(HOOK).toContain('event.pointerType !== "mouse"');
  });

  it("draws the tilt only inside the same hover media query", () => {
    const tilt = GLOBALS.match(
      /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.poster\[data-tilting\] \{[\s\S]*?\}/,
    );
    expect(tilt).not.toBeNull();
    expect(tilt![0]).toContain("perspective(");
  });

  it("stands still for a reader who asked for reduced motion", () => {
    expect(GLOBALS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.poster\[data-tilting\] \{\s*transform: none;/,
    );
  });

  it("is mounted once, at the root, beside the press", () => {
    const provider = readFileSync("app/motion-provider.tsx", "utf8");
    expect(provider).toMatch(/usePressMarks\(\);\s*usePosterTilt\(\);/);
  });

  /**
   * Issue #436: the settle-back, when the mouse leaves and the tilt lets go, used to run
   * on `--dur-slow` (380ms) — the same rest-state transition the hover brighten's `filter`
   * shares a `transition` list with. Moving across a grid of posters should not leave a
   * trail of slow returns, so it now reads `--dur-base`, no hand-typed figure left behind.
   */
  it("lets go of the tilt on --dur-base, not --dur-slow", () => {
    const restState = GLOBALS.match(
      /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.poster \{[\s\S]*?\n {2}\}/,
    );
    expect(restState).not.toBeNull();
    expect(restState![0]).toContain("transform var(--dur-base)");
    expect(restState![0]).not.toContain("--dur-slow");
    expect(restState![0]).not.toMatch(/\b\d+(?:\.\d+)?m?s\b/);
  });
});
