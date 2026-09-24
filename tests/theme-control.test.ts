import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ThemeControl } from "@/app/(signed-in)/settings/theme-control";
import {
  applyThemeChoice,
  isThemeOverride,
  readThemeChoice,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

/**
 * The theme control — the picker ban, reversed.
 *
 * What is asserted here is the handful of things whose failure would be **silent**. The
 * control working at all is obvious the moment anyone opens Settings; these are not.
 *
 *  1. **The cascade order.** `:root[data-theme="dark"]` and
 *     `:root:not([data-theme="light"])` have identical specificity, so whichever comes
 *     last in the file wins. Reorder them — a tidy-up, a merge, a formatter — and an
 *     explicit *Dark* silently stops working on a device set to light, with no error
 *     anywhere and nothing failing in any other test.
 *  2. **The pre-paint script agrees with the module.** The script is a string, so the
 *     compiler cannot check that it reads the key the control writes. If they drift, the
 *     theme simply stops surviving a reload.
 *  3. **`system` is stored as absence.** Writing the literal `"system"` would pin the
 *     palette to whatever the device said on the day the reader chose it.
 *  4. **Every dark hex is declared once.** The whole argument for the `--dark-*` set is
 *     that two selectors need the palette and a token has one declaration site.
 */

const GLOBALS = readFileSync("app/globals.css", "utf8");
const LAYOUT = readFileSync("app/layout.tsx", "utf8");

describe("the three theme states in CSS", () => {
  it("lets the system decide only when the reader has not answered light", () => {
    expect(GLOBALS).toContain('@media (prefers-color-scheme: dark)');
    expect(GLOBALS).toContain(':root:not([data-theme="light"])');
  });

  it("puts the explicit-dark rule AFTER the media query, which is what makes it win", () => {
    // Identical specificity, so source order is the whole mechanism. If this ever fails,
    // an explicit `Dark` has stopped overriding a light device.
    //
    // Matched as `selector {` rather than as a bare string: both selectors are also
    // *named in the prose* above their rules, and a plain `indexOf` found the comment
    // first and compared two sentences instead of two rules. That is the same
    // passing-on-prose failure `phone-groups-scroll.test.ts` carried for a whole
    // redesign, caught here by the assertion being wrong in the safe direction.
    const ruleAt = (selector: string) =>
      GLOBALS.search(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`));

    const media = ruleAt(':root:not([data-theme="light"])');
    const explicit = ruleAt(':root[data-theme="dark"]');

    expect(media).toBeGreaterThan(-1);
    expect(explicit).toBeGreaterThan(-1);
    expect(explicit).toBeGreaterThan(media);
  });

  it("pins color-scheme for both explicit choices, not just the colours", () => {
    // Without this the browser's own surfaces — form controls, scrollbars, the caret —
    // stay in the system's scheme around a page that is no longer in it.
    expect(GLOBALS).toMatch(/:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light/);
    expect(GLOBALS).toMatch(/:root\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark/);
  });

  it("declares each dark colour exactly once", () => {
    for (const token of [
      "--dark-ground",
      "--dark-raised",
      "--dark-hair",
      "--dark-text",
      "--dark-dim",
      "--dark-accent",
      "--dark-accent-ink",
      "--dark-ink",
    ]) {
      // One declaration (`--dark-x: oklch(…);`, since issue #327 — see
      // `tests/palette.test.ts`'s own `declaredOnce` for why), and then the two mappings
      // that read it.
      const declarations = GLOBALS.match(new RegExp(`${token}:\\s*oklch\\(`, "g")) ?? [];
      expect(declarations, `${token} is declared more than once`).toHaveLength(1);
    }
  });
});

describe("the pre-paint script", () => {
  it("is inline in the document head, not an effect", () => {
    // An effect runs after paint, which is exactly the flash this exists to prevent.
    expect(LAYOUT).toContain("dangerouslySetInnerHTML");
    expect(LAYOUT).toContain("THEME_SCRIPT");
  });

  it("reads the same key and attribute the module writes", () => {
    // The script is a string the compiler cannot check against `lib/theme.ts`. Built by
    // interpolating the constants, so this asserts the interpolation is still there
    // rather than a retyped literal that can drift.
    expect(LAYOUT).toContain("THEME_STORAGE_KEY");
    expect(LAYOUT).toContain("THEME_ATTRIBUTE");
    expect(THEME_STORAGE_KEY).toBe("mediasafe-theme");
    expect(THEME_ATTRIBUTE).toBe("data-theme");
  });

  it("only ever honours the two real overrides", () => {
    expect(isThemeOverride("light")).toBe(true);
    expect(isThemeOverride("dark")).toBe(true);
    expect(isThemeOverride("system")).toBe(false);
    expect(isThemeOverride(null)).toBe(false);
    expect(isThemeOverride("chartreuse")).toBe(false);
  });
});

describe("storing a choice", () => {
  /** A minimal `localStorage`, and a `documentElement` that records attribute moves. */
  function stubBrowser() {
    const store = new Map<string, string>();
    const attributes = new Map<string, string>();

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    vi.stubGlobal("document", {
      documentElement: {
        setAttribute: (k: string, v: string) => void attributes.set(k, v),
        removeAttribute: (k: string) => void attributes.delete(k),
      },
    });

    return { store, attributes };
  }

  it("writes an override and moves the attribute in the same call", () => {
    const { store, attributes } = stubBrowser();

    applyThemeChoice("dark");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(attributes.get(THEME_ATTRIBUTE)).toBe("dark");
    expect(readThemeChoice()).toBe("dark");

    vi.unstubAllGlobals();
  });

  it("stores `system` as the absence of a key, never as the word", () => {
    // The distinction is the whole reason `system` is a state rather than a default.
    // Writing "system" would pin the palette to whatever the device happened to say on
    // the day it was chosen, and it would stop following the device that evening.
    const { store, attributes } = stubBrowser();

    applyThemeChoice("dark");
    applyThemeChoice("system");

    expect(store.has(THEME_STORAGE_KEY)).toBe(false);
    expect(attributes.has(THEME_ATTRIBUTE)).toBe(false);
    expect(readThemeChoice()).toBe("system");

    vi.unstubAllGlobals();
  });

  it("falls back to the system palette when storage cannot be reached", () => {
    // Not `AGENTS.md`'s forbidden shape — `lib/theme.ts` argues this at length. `system`
    // is the correct complete answer here, not an empty one standing in for a real one.
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new Error("storage is unavailable");
        },
      },
    });

    expect(readThemeChoice()).toBe("system");
    vi.unstubAllGlobals();
  });
});

describe("the control", () => {
  const markup = renderToStaticMarkup(createElement(ThemeControl));

  it("offers three states, System first", () => {
    expect(markup).toContain("System");
    expect(markup).toContain("Light");
    expect(markup).toContain("Dark");
    expect(markup.indexOf("System")).toBeLessThan(markup.indexOf("Light"));
  });

  it("renders System pressed on the server, because a stored choice is unreadable there", () => {
    // The server has no `localStorage`; the control corrects itself after mount. Getting
    // this wrong is a hydration mismatch, not a cosmetic slip.
    const buttons = [...markup.matchAll(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)]
      .map((m) => m[0]);
    const pressed = buttons.filter((b) => b.includes('aria-pressed="true"'));

    expect(buttons).toHaveLength(3);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toContain("System");
  });

  it("says the choice is per-device, because that is the surprising half", () => {
    expect(markup).toContain("this device only");
  });
});
