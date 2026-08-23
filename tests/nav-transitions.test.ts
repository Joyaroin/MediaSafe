import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PHONE_BAR } from "@/app/phone-bar";

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
const WRAPPER = readFileSync("app/(signed-in)/nav-transition.tsx", "utf8");
const LAYOUT = readFileSync("app/(signed-in)/layout.tsx", "utf8");

/** The `::view-transition-{old,new}(.nav-{forward,back})` rule body, isolated so the
 * tests below assert on its declarations rather than re-deriving the same extraction. */
const blockFor = (side: "old" | "new", cls: "nav-forward" | "nav-back") =>
  GLOBALS.match(new RegExp(`::view-transition-${side}\\(\\.${cls}\\)\\s*\\{[^}]*\\}`))![0];

/**
 * Every screen that participates — the four tabs, and Settings, which is a push out of
 * them rather than a move along them. A screen that navigates but is not wrapped is a
 * screen that arrives with nothing while everything around it slides, and that reads as
 * the animation being broken rather than absent.
 */
const NAV_PAGES = [
  "app/(signed-in)/up-next/page.tsx",
  "app/(signed-in)/search/page.tsx",
  "app/(signed-in)/library/page.tsx",
  "app/(signed-in)/lists/page.tsx",
  "app/(signed-in)/stats/page.tsx",
  "app/(signed-in)/settings/page.tsx",
];

describe("which way the content moves", () => {
  it("derives direction from position in the bar, not from history", () => {
    // `findIndex` over `TABS` on both sides is the mechanism. A `router`/history check
    // here would be the bug this guards.
    expect(TAB_BAR).toContain("navTransitionTypes");
    expect(TAB_BAR).toMatch(/TABS\.findIndex/);
    expect(TAB_BAR).toContain('to > from ? ["nav-forward"] : ["nav-back"]');
  });

  it("claims no direction for a tap on the tab you are already on", () => {
    // No type, so `default: "none"` applies and nothing animates. A screen sliding out
    // and back to arrive where it already was is motion that means nothing.
    expect(TAB_BAR).toContain("if (from === to) return [];");
  });

  it("treats a tab tapped from off the bar as coming back out", () => {
    // `-1` is a screen pushed outside the four — Settings, `/import`, `/welcome`. This
    // used to return `[]`, which made Settings the one screen you slid *into* and then
    // left with nothing. It is the mirror of the `nav-forward` the masthead attaches.
    expect(TAB_BAR).toContain('if (from === -1) return ["nav-back"];');
    // Order matters: the same-tab check has to come first, or a same-tab tap from `-1`
    // would be impossible to express. Assert `from === to` is tested before `from === -1`.
    expect(TAB_BAR.indexOf("if (from === to)")).toBeLessThan(
      TAB_BAR.indexOf("if (from === -1)"),
    );
  });

  it("sends the reader into Settings forwards, from the one phone entrance", () => {
    // Without this Settings was the single screen that arrived with no motion while every
    // tab around it slid — which is what makes an animation read as broken rather than
    // absent.
    expect(MASTHEAD).toContain('transitionTypes={["nav-forward"]}');
    expect(MASTHEAD).toContain('href="/settings"');
  });

  it("attaches the types to the links themselves", () => {
    expect(TAB_BAR).toContain("transitionTypes={navTransitionTypes(pathname, href)}");
  });
});

describe("where the wrapper lives", () => {
  it("is in every page that participates, Settings included", () => {
    for (const page of NAV_PAGES) {
      const source = readFileSync(page, "utf8");
      expect(source, `${page} is not wrapped`).toContain("<NavTransition>");
    }
  });

  it("is NOT in the signed-in layout, where enter and exit could never fire", () => {
    // A layout persists across navigations within its group. This is the single easiest
    // way to "simplify" this feature into doing nothing at all.
    expect(LAYOUT).not.toContain("NavTransition");
    expect(LAYOUT).not.toContain("ViewTransition");
  });

  it("maps both directions and defaults both halves to none", () => {
    expect(WRAPPER).toContain('"nav-forward": "nav-forward"');
    expect(WRAPPER).toContain('"nav-back": "nav-back"');
    // On the mapping, and again on the component — the guide's own shape. Without these
    // the four pages animate during the poster morph and every Suspense reveal.
    expect(WRAPPER).toMatch(/default:\s*"none"/);
    expect(WRAPPER).toMatch(/default="none"/);
    expect(WRAPPER).toContain("enter={NAV_DIRECTIONS}");
    expect(WRAPPER).toContain("exit={NAV_DIRECTIONS}");
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
    for (const cls of ["nav-forward", "nav-back"] as const) {
      expect(GLOBALS).toContain(`::view-transition-old(.${cls})`);
      expect(GLOBALS).toContain(`::view-transition-new(.${cls})`);
    }
    // Mirrored: the old side leaves the way the new side arrives from. #221 leaves this
    // untouched — the direction still has to survive the duration/delay change.
    expect(blockFor("old", "nav-forward")).toContain("--nav-slide: -60px");
    expect(blockFor("new", "nav-forward")).toContain("--nav-slide: 60px");
    expect(blockFor("old", "nav-back")).toContain("--nav-slide: 60px");
    expect(blockFor("new", "nav-back")).toContain("--nav-slide: -60px");
    // And the translate itself is still there to carry that direction.
    expect(GLOBALS).toMatch(/@keyframes nav-slide\s*\{\s*from\s*\{\s*translate:\s*var\(--nav-slide\)/);
  });

  it("leaves quickly and arrives slowly, off this file's own motion tokens", () => {
    // `DESIGN.md`/`globals.css`: exits run at `--dur-fast` against entrances at
    // `--dur-base` or slower. No hardcoded milliseconds.
    const forwardOut = blockFor("old", "nav-forward");
    const forwardIn = blockFor("new", "nav-forward");
    expect(forwardOut).toContain("var(--dur-fast)");
    expect(forwardIn).toContain("var(--dur-base)");
    expect(forwardOut).not.toMatch(/\d+ms/);
    expect(forwardIn).not.toMatch(/\d+ms/);

    // #221: the slide no longer reaches for the slow token on either side — see the two
    // tests below for what it uses instead.
    for (const cls of ["nav-forward", "nav-back"] as const) {
      expect(blockFor("old", cls)).not.toContain("--dur-slow");
      expect(blockFor("new", cls)).not.toContain("--dur-slow");
    }
  });

  it("carries no delay on the entrance's fade — #221", () => {
    // The previous shape delayed the entrance's fade by `--dur-fast`, so for that whole
    // span the outgoing screen's title was still on screen — still fading, still mid-
    // slide — before the incoming one had begun to appear at all. `nav-fade` on the
    // `-new` selectors must run straight from the shorthand's duration into `both`, with
    // no third `var(--dur-*)` delay token sitting in between.
    for (const cls of ["nav-forward", "nav-back"] as const) {
      expect(blockFor("new", cls)).toMatch(
        /var\(--dur-base\)\s+var\(--ease-out-quart\)\s+both\s+nav-fade/,
      );
    }
  });

  it("runs the slide at the base duration rather than the slow one, both sides", () => {
    // The slide used to keep running at `--dur-slow` regardless of either fade, so the
    // transition did not visually settle until well after the fades themselves were
    // done. It now settles with the fade instead.
    for (const cls of ["nav-forward", "nav-back"] as const) {
      expect(blockFor("old", cls)).toMatch(
        /var\(--dur-base\)\s+var\(--ease-in-out-soft\)\s+both\s+nav-slide/,
      );
      expect(blockFor("new", cls)).toMatch(
        /var\(--dur-base\)\s+var\(--ease-in-out-soft\)\s+both\s+nav-slide/,
      );
    }
  });

  it("never reaches the desktop, because only phone chrome tags a navigation", () => {
    // `sidebar-nav.tsx` carries five primary destinations *and* its own Settings link —
    // an overlapping set rather than the same one since #227, which retired the phone's
    // Lists tab and gave the desktop Stats without taking Lists away.
    // If it ever attaches a type the desktop starts sliding too, and this stops being a
    // phone change.
    const sidebar = readFileSync("app/sidebar-nav.tsx", "utf8");
    expect(sidebar).not.toContain("transitionTypes");
    // Both surfaces that do attach them are phone-only. The masthead still says so in its
    // own markup; the tab bar's `lg:hidden` moved into `PHONE_BAR` when issue #197 gave
    // the Library's selection bar the same recipe, so that half is checked through the
    // constant rather than by searching a file for a literal no longer written in it.
    expect(TAB_BAR).toContain("PHONE_BAR");
    expect(PHONE_BAR).toContain("lg:hidden");
    expect(MASTHEAD).toContain("lg:hidden");
  });
});
