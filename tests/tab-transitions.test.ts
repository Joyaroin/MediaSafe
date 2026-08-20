import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Moving between the four phone tabs.
 *
 * These assert the handful of couplings whose failure is **silent** — the transition
 * simply stops happening, or happens where it should not, and nothing throws:
 *
 *  1. **Direction comes from the bar's geometry, not from history.** A history-based
 *     direction would call *Lists → Up next* "forward", which is the opposite of what the
 *     row in front of the reader shows.
 *  2. **The wrapper is in the pages, never the layout.** A layout persists across
 *     navigations in its group, so enter and exit would never fire from there. Next's own
 *     guide is explicit about this and it is the easiest thing to "tidy up" wrongly.
 *  3. **`default: "none"` is on both.** Without it these four pages animate during the
 *     poster morph and every Suspense reveal, which is two animations fighting for the
 *     same pixels.
 *  4. **The chrome is anchored.** If the masthead and tab bar lose their names they slide
 *     with the content, the whole viewport appears to move, and the direction stops
 *     meaning anything.
 *  5. **It stays phone-only.** The desktop sidebar must not start sliding.
 */

const GLOBALS = readFileSync("app/globals.css", "utf8");
const TAB_BAR = readFileSync("app/tab-bar.tsx", "utf8");
const MASTHEAD = readFileSync("app/masthead.tsx", "utf8");
const WRAPPER = readFileSync("app/(signed-in)/tab-transition.tsx", "utf8");
const LAYOUT = readFileSync("app/(signed-in)/layout.tsx", "utf8");

const TAB_PAGES = [
  "app/(signed-in)/up-next/page.tsx",
  "app/(signed-in)/search/page.tsx",
  "app/(signed-in)/library/page.tsx",
  "app/(signed-in)/lists/page.tsx",
];

describe("which way the content moves", () => {
  it("derives direction from position in the bar, not from history", () => {
    // `findIndex` over `TABS` on both sides is the mechanism. A `router`/history check
    // here would be the bug this guards.
    expect(TAB_BAR).toContain("tabTransitionTypes");
    expect(TAB_BAR).toMatch(/TABS\.findIndex/);
    expect(TAB_BAR).toContain('to > from ? ["tab-forward"] : ["tab-back"]');
  });

  it("claims no direction for a tap on the current tab, or from off the bar", () => {
    // Both return `[]` — no type, so `default: "none"` applies and nothing animates.
    // A screen sliding out and back to arrive where it already was is motion that means
    // nothing; `-1` is a route under none of the four and has no position to compare.
    expect(TAB_BAR).toContain("if (from === -1 || from === to) return [];");
  });

  it("attaches the types to the links themselves", () => {
    expect(TAB_BAR).toContain("transitionTypes={tabTransitionTypes(pathname, href)}");
  });
});

describe("where the wrapper lives", () => {
  it("is in every one of the four pages", () => {
    for (const page of TAB_PAGES) {
      const source = readFileSync(page, "utf8");
      expect(source, `${page} is not wrapped`).toContain("<TabTransition>");
    }
  });

  it("is NOT in the signed-in layout, where enter and exit could never fire", () => {
    // A layout persists across navigations within its group. This is the single easiest
    // way to "simplify" this feature into doing nothing at all.
    expect(LAYOUT).not.toContain("TabTransition");
    expect(LAYOUT).not.toContain("ViewTransition");
  });

  it("maps both directions and defaults both halves to none", () => {
    expect(WRAPPER).toContain('"tab-forward": "tab-forward"');
    expect(WRAPPER).toContain('"tab-back": "tab-back"');
    // On the mapping, and again on the component — the guide's own shape. Without these
    // the four pages animate during the poster morph and every Suspense reveal.
    expect(WRAPPER).toMatch(/default:\s*"none"/);
    expect(WRAPPER).toMatch(/default="none"/);
    expect(WRAPPER).toContain("enter={TAB_DIRECTIONS}");
    expect(WRAPPER).toContain("exit={TAB_DIRECTIONS}");
  });
});

describe("the chrome stays still", () => {
  it("names both pieces so they leave the root snapshot", () => {
    expect(TAB_BAR).toContain('viewTransitionName: "phone-tab-bar"');
    expect(MASTHEAD).toContain('viewTransitionName: "phone-masthead"');
  });

  it("holds those groups still and hides the outgoing copy", () => {
    // Without `display: none` on the old snapshot both copies of the bar paint for the
    // length of the transition, which reads as a flicker on the one element that is
    // meant to be the still point.
    expect(GLOBALS).toMatch(
      /::view-transition-group\(phone-masthead\),\s*::view-transition-group\(phone-tab-bar\)\s*\{[^}]*animation:\s*none/,
    );
    expect(GLOBALS).toMatch(
      /::view-transition-old\(phone-masthead\),\s*::view-transition-old\(phone-tab-bar\)\s*\{[^}]*display:\s*none/,
    );
  });

  it("keeps the page tappable while a transition runs", () => {
    // The overlay swallows pointer events for the whole duration otherwise, so a reader
    // moving quickly through tabs loses their second tap and the animation reads as lag.
    expect(GLOBALS).toMatch(/::view-transition\s*\{\s*pointer-events:\s*none/);
  });
});

describe("both directions are drawn, and only on the phone", () => {
  it("defines a forward and a back pair that mirror each other", () => {
    for (const cls of ["tab-forward", "tab-back"]) {
      expect(GLOBALS).toContain(`::view-transition-old(.${cls})`);
      expect(GLOBALS).toContain(`::view-transition-new(.${cls})`);
    }
    // Mirrored: the old side leaves the way the new side arrives from.
    expect(GLOBALS).toMatch(/::view-transition-old\(\.tab-forward\)\s*\{\s*--tab-slide:\s*-60px/);
    expect(GLOBALS).toMatch(/::view-transition-new\(\.tab-forward\)\s*\{\s*--tab-slide:\s*60px/);
    expect(GLOBALS).toMatch(/::view-transition-old\(\.tab-back\)\s*\{\s*--tab-slide:\s*60px/);
    expect(GLOBALS).toMatch(/::view-transition-new\(\.tab-back\)\s*\{\s*--tab-slide:\s*-60px/);
  });

  it("leaves quickly and arrives slowly, off this file's own motion tokens", () => {
    // `DESIGN.md`/`globals.css`: exits run at `--dur-fast` against entrances at
    // `--dur-base` or slower. No hardcoded milliseconds.
    const forwardOut = GLOBALS.match(/::view-transition-old\(\.tab-forward\)\s*\{[^}]*\}/)![0];
    const forwardIn = GLOBALS.match(/::view-transition-new\(\.tab-forward\)\s*\{[^}]*\}/)![0];
    expect(forwardOut).toContain("var(--dur-fast)");
    expect(forwardIn).toContain("var(--dur-base)");
    expect(forwardOut).not.toMatch(/\d+ms/);
    expect(forwardIn).not.toMatch(/\d+ms/);
  });

  it("never reaches the desktop, because only the phone bar tags a navigation", () => {
    // `sidebar-nav.tsx` is the desktop's navigation. If it ever attaches a type, the
    // desktop starts sliding too and this stops being a phone change.
    const sidebar = readFileSync("app/sidebar-nav.tsx", "utf8");
    expect(sidebar).not.toContain("transitionTypes");
    // And the bar that does attach them is phone-only.
    expect(TAB_BAR).toContain("lg:hidden");
  });
});
