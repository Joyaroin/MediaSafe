import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { backOrigin, isCurrentRoute } from "@/app/nav-route";
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
  /** Issue #247, and the phone's fourth tab since #249 pointed it here and deleted the
   *  `/stats` line that used to sit above this one. #247's own note said wrapping the
   *  page before it was on the bar would leave that ticket changing one `href` rather
   *  than this file as well, and that is what happened. */
  "app/(signed-in)/you/page.tsx",
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
    // Lists tab and gave the desktop a sixth destination without taking Lists away. #249
    // repointed that sixth from Stats to You on both devices; the overlap is unchanged.
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

/**
 * ── The poster morph survives the navigation — issue #275 ────────────────────────────
 *
 * The tab slide above is not the only transition on the phone. Opening a title from an Up
 * next rail is a route navigation *and* a morph: the tile's poster travels into the page's
 * hero, so the navigation reads as opening the thing the reader touched.
 *
 * > **⚠️ This reverses what §8 and these files said until #275**, which was that the morph
 * > needed **two** name families — one for the desktop pane, one for the phone — because
 * > the phone's title sheet and the phone's route could be showing the same title at once.
 * > #268 deleted the sheet and both route interceptions, so the phone's tile now navigates
 * > to the same `/library/{id}` the desktop pane's contents already describe. There is one
 * > destination, so there is one family.
 *
 * Each of these fails silently. A destination left on the retired family renders a
 * `view-transition-name` with nothing to pair against, and the browser simply runs no
 * morph — no error, no warning, and a navigation that looks merely unanimated.
 */
const TILE = readFileSync("app/(signed-in)/up-next/up-next-tile.tsx", "utf8");
const DETAIL_VIEW = readFileSync(
  "app/(signed-in)/titles/[entryId]/title-detail-view.tsx",
  "utf8",
);
const PANE = readFileSync("app/(signed-in)/library/programme-note.tsx", "utf8");

describe("the poster morph, on one transition-name family", () => {
  it("gives the rail tile and the page it opens the same name", () => {
    // Same minting function, same argument shape: the tile's entry id and the page's.
    expect(TILE).toContain("railPosterTransitionName(entry.libraryEntryId)");
    expect(DETAIL_VIEW).toContain(
      "posterTransitionName={railPosterTransitionName(current.libraryEntryId)}",
    );
  });

  it("keeps every half minting from the shared module rather than spelling the name", () => {
    for (const [label, source] of [
      ["up-next-tile.tsx", TILE],
      ["title-detail-view.tsx", DETAIL_VIEW],
      ["programme-note.tsx", PANE],
    ] as const) {
      expect(source, `${label} imports the minting function`).toMatch(
        /import \{ railPosterTransitionName \} from "[^"]*poster-transition-name"/,
      );
      // A hand-written template literal is how the two families drifted apart in the first
      // place — a rename would touch the module and leave the copy behind.
      expect(source, `${label} spells a name by hand`).not.toMatch(
        /`[a-z]+-poster-\$\{/,
      );
    }
  });

  it("drops the tile's name once its destination holds it", () => {
    // A name can only mark one on-screen element at a time. The tile carries it in exactly
    // one branch — the unselected one — so the moment the desktop pane is showing that
    // poster the tile has already let go, and the browser never sees the name twice.
    expect(TILE.match(/<ViewTransition/g)).toHaveLength(1);
    expect(TILE.indexOf("selected ? (")).toBeGreaterThan(-1);
    expect(TILE.indexOf("selected ? (")).toBeLessThan(TILE.indexOf("<ViewTransition"));
  });

  it("still hands the desktop programme note pane the morph, in both its frames", () => {
    // `loading` is the first half of the morph (§9's radius 3), not a placeholder that
    // happens to show a poster; `loaded` is the same name one phase on.
    expect(PANE).toContain("transitionName={railPosterTransitionName(selectedEntryId)}");
    expect(PANE).toContain(
      "posterTransitionName={railPosterTransitionName(phase.detail.libraryEntryId)}",
    );
  });

  it("leaves the fixed chrome out of the root snapshot, exactly as before", () => {
    // The morph collapsing to one family must not disturb what is held still under it.
    expect(TAB_BAR).toContain('viewTransitionName: "phone-tab-bar"');
    expect(MASTHEAD).toContain('viewTransitionName: "phone-masthead"');
    expect(GLOBALS).toMatch(
      /::view-transition-group\(phone-masthead\),\s*::view-transition-group\(phone-tab-bar\)\s*\{[^}]*animation:\s*none/,
    );
  });
});

/**
 * ── The way back names where the reader came from — issue #292 ───────────────────────
 *
 * A detail page's only on-screen exit used to be a hard `‹ Library` link, so a reader who
 * opened a show from Up next was moved into a grid they never asked for. `backOrigin`
 * (`app/nav-route.ts`) is the rule that replaces it: **previous pathname in, label and
 * destination out**, and nothing else — no DOM, no component state, no history object.
 * It sits beside `isCurrentRoute` because the two answer the same question about a path,
 * and this suite is where they end up asserted together.
 *
 * All three properties below fail silently in the browser. A bar labelled from the wrong
 * origin is a working link to the wrong place; a bar with no fallback is either absent on
 * a reloaded page or points at nothing. Neither throws.
 */
const ORIGIN_SAMPLES = [
  "/up-next",
  "/library",
  "/search",
  "/you",
  "/lists",
  "/lists/list-1",
  "/titles/entry-1",
  "/episodes/episode-1",
  "/catalogue/show/42",
  "/settings",
  "/import",
  "/welcome",
  "/librarian",
  "/",
  "",
] as const;

describe("where the back bar says the reader came from", () => {
  it("names each origin surface it can have arrived from", () => {
    expect(backOrigin("/up-next")).toEqual({ label: "Up next", destination: "/up-next" });
    expect(backOrigin("/library")).toEqual({ label: "Library", destination: "/library" });
    expect(backOrigin("/search")).toEqual({ label: "Search", destination: "/search" });
  });

  it("reads an origin through anything pushed under it", () => {
    // The same `startsWith` rule `isCurrentRoute` already applies for the tab bar: a
    // reader inside a section arrived from that section.
    expect(backOrigin("/up-next/anything")).toEqual({
      label: "Up next",
      destination: "/up-next",
    });
    // And not by bare prefix — `/librarian` is not the library.
    expect(backOrigin("/librarian").destination).toBe("/up-next");
  });

  it("falls back to Up next when there is no previous pathname", () => {
    // The reloaded detail page: the previous pathname is tracked as the app renders, so a
    // cold load has none. The home tab is an answer that works, against a bar that lies
    // or a bar that is absent.
    expect(backOrigin(null)).toEqual({ label: "Up next", destination: "/up-next" });
    expect(backOrigin("")).toEqual({ label: "Up next", destination: "/up-next" });
  });

  it("falls back to Up next for a previous pathname that is not an origin", () => {
    for (const previous of ["/you", "/settings", "/titles/entry-1", "/episodes/episode-1"]) {
      expect(backOrigin(previous), previous).toEqual({
        label: "Up next",
        destination: "/up-next",
      });
    }
  });

  it("never names a destination the reader was not on", () => {
    // The whole complaint this rule answers: `‹ Library` on a page reached from Up next.
    // Every answer is either the stated fallback or a surface the previous pathname was
    // itself on — there is no third case, and no destination computed from the id in the
    // address.
    for (const previous of ORIGIN_SAMPLES) {
      const { destination } = backOrigin(previous);

      if (destination === "/up-next") continue;
      expect(isCurrentRoute(previous, destination), previous).toBe(true);
    }
  });

  it("answers with a label for every destination it can name", () => {
    for (const previous of [...ORIGIN_SAMPLES, null]) {
      const { label, destination } = backOrigin(previous);

      expect(label, `${previous}`).not.toBe("");
      expect(destination.startsWith("/"), `${previous}`).toBe(true);
    }
  });
});

/**
 * The bar itself: one component for both detail routes, in every render each of them has.
 * A pending or failed render that lost its bar is a screen a reader cannot leave, and it
 * is the render nobody looks at until the day it matters.
 */
const BACK_BAR = readFileSync("app/(signed-in)/back-bar.tsx", "utf8");

describe("both detail routes leave by that bar", () => {
  for (const file of [
    "app/(signed-in)/titles/[entryId]/title-detail-body.tsx",
    "app/(signed-in)/titles/[entryId]/loading.tsx",
    "app/(signed-in)/titles/[entryId]/error.tsx",
    // The episode route draws its bar once, in the layout that wraps its page and both
    // of its boundaries.
    "app/(signed-in)/episodes/[episodeId]/layout.tsx",
  ]) {
    it(`${file} renders the shared bar`, () => {
      expect(readFileSync(file, "utf8")).toContain("<BackBar />");
    });
  }

  it("walks history rather than following the link it draws", () => {
    // The link's `href` is what a reloaded page and a middle-click get. A reader who
    // arrived by navigating gets `history.back()` instead, so #276's restoration runs and
    // the rails they left come back where they were.
    expect(BACK_BAR).toContain("history.back()");
    expect(BACK_BAR).toContain("preventDefault()");
  });

  it("draws the label the rule gives it rather than one of its own", () => {
    // The chevron is the bar's; the word after it is the rule's. A hard-coded name here
    // is the whole of the complaint #292 answers, and it would read as a working link.
    expect(BACK_BAR).toContain("backOrigin(");
    expect(BACK_BAR).toContain("‹ {label}");
  });
});
