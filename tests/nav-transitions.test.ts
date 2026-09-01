import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

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

/** The `::view-transition-{old,new}(.nav-{forward,back,deeper,upward})` rule body,
 * isolated so the tests below assert on its declarations rather than re-deriving the same
 * extraction. `nav-deeper` joined the union in #293 and `nav-upward` in #294 — every type
 * is read the same way as the two that were here first, because they are the same kind of
 * thing: a class the stylesheet draws, attached by the link that means it. */
const blockFor = (
  side: "old" | "new",
  cls: "nav-forward" | "nav-back" | "nav-deeper" | "nav-upward",
) =>
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
    // used to return `[]`, which made those the screens you arrived at and then left with
    // nothing at all. It is the lateral default #294 leaves Import, delete-account and
    // every nested settings page on; Settings' own round trip is drawn by the upward
    // type's own pair instead.
    expect(TAB_BAR).toContain('if (from === -1) return ["nav-back"];');
    // Order matters: the same-tab check has to come first, or a same-tab tap from `-1`
    // would be impossible to express. Assert `from === to` is tested before `from === -1`.
    expect(TAB_BAR.indexOf("if (from === to)")).toBeLessThan(
      TAB_BAR.indexOf("if (from === -1)"),
    );
  });

  it("sends the reader into Settings out of the bar, not along it", () => {
    // Issue #294. Settings used to borrow the lateral `nav-forward`, which made stepping
    // *out of* the four tabs look exactly like stepping *along* them. It is the one
    // masthead push, and it now says so: the upward type, on the one phone entrance.
    expect(MASTHEAD).toContain('transitionTypes={["nav-upward"]}');
    expect(MASTHEAD).toContain('href="/settings"');
    // And it no longer claims a lateral direction it never meant.
    expect(MASTHEAD).not.toContain("nav-forward");
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

  it("maps the third type — depth — in the same vocabulary as the other two", () => {
    // Issue #293. Depth is a transition *type*, not a second mechanism: it joins the two
    // lateral directions in the one mapping both halves of every wrapped page read, so a
    // page that already slides sideways is the same page that already scales deeper.
    // Adding it as a parallel `ViewTransition` would be two wrappers fighting for the
    // same snapshot.
    expect(WRAPPER).toContain('"nav-deeper": "nav-deeper"');
    // And the default is untouched by the addition: anything unclassified — a desktop
    // navigation, a Suspense reveal, the poster morph — still lands on `none`.
    expect(WRAPPER).toMatch(/default:\s*"none"/);
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
    // The *slide*, that is. #293's depth type is on the links rather than on the chrome
    // and does reach the desktop on purpose — see `nav-transition.tsx`. What must stay
    // true is that no desktop *navigation bar* claims a direction.
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
 * ── Going deeper — issue #293 ────────────────────────────────────────────────────────
 *
 * Opening a title or an episode is the third kind of move this application makes, and
 * until #293 it was the one with no motion of its own: a card's link passed no transition
 * type, the mapping's `default: "none"` applied, and the poster morphed over a page that
 * had already cut. The missing half is what read as wrong.
 *
 * Each of these fails silently in the same way the two above do — the class stops
 * matching, or the reverse stops being a reverse, and a drill-in is just an abrupt swap
 * again with nothing thrown.
 */
/**
 * Every place a reader can open a title or an episode from, and the file that owns the
 * navigation. The point of the list is that it is a **list**: depth reads the same
 * wherever the reader was, and the failure this guards is one surface being added or
 * rewritten without it — a single rail whose cards cut while every other rail's scale in,
 * which reads as a bug in the animation rather than an omission at one call site.
 *
 * `back-to-library-bar.tsx` and `back-to-title-bar.tsx` are deliberately not here: they
 * are the way *out* of a detail page, and a way out that played the going-in motion would
 * be the mirror pointing the wrong way.
 */
const DEPTH_SURFACES = [
  // Up next — the rails, the pager's Upcoming page, and the card that names an episode.
  "app/(signed-in)/up-next/up-next-tile.tsx",
  "app/(signed-in)/up-next/up-next-pending-card.tsx",
  "app/(signed-in)/up-next/up-next-episode-card.tsx",
  "app/(signed-in)/up-next/up-next-film-rail.tsx",
  "app/(signed-in)/up-next/upcoming-row.tsx",
  "app/(signed-in)/up-next/upcoming-films.tsx",
  // Library — the grid's cell, and the desktop programme note's episode rows.
  "app/(signed-in)/library/selectable-entry.tsx",
  "app/(signed-in)/library/programme-note-episodes.tsx",
  // Search — both of its title destinations are catalogue pages, because nothing on that
  // screen is yours yet. A title you do not hold is still a title, and opening one is
  // still a move into something.
  "app/(signed-in)/search/catalogue-result.tsx",
  "app/(signed-in)/search/recommendation-rail.tsx",
  // A list's own screen, whose rows open either side.
  "app/(signed-in)/lists/[listId]/list-title-row.tsx",
  // The you surface.
  "app/(signed-in)/you/you-title-tile.tsx",
];

/**
 * The pages a depth navigation *lands* on. A type attached to a link with nothing wrapped
 * at the other end animates nothing at all: the arriving content is part of the `root`
 * snapshot, `root` carries no class, and the reader gets the abrupt cut #293 exists to
 * remove — silently, because attaching the type still "worked".
 */
const DEPTH_DESTINATIONS = [
  "app/(signed-in)/titles/[entryId]/page.tsx",
  "app/(signed-in)/episodes/[episodeId]/page.tsx",
  "app/(signed-in)/catalogue/[kind]/[tmdbId]/page.tsx",
];

describe("opening a title or an episode moves deeper", () => {
  it("draws a depth pair, so the class the links attach has something to act on", () => {
    expect(GLOBALS).toContain("::view-transition-old(.nav-deeper)");
    expect(GLOBALS).toContain("::view-transition-new(.nav-deeper)");
  });

  it("carries the depth type on the links themselves, from every surface that has one", () => {
    for (const surface of DEPTH_SURFACES) {
      const source = readFileSync(surface, "utf8");
      expect(source, `${surface} imports the shared type`).toMatch(
        /import \{ NAV_DEEPER \} from "[^"]*nav-deeper"/,
      );
      expect(source, `${surface} attaches it to its own navigation`).toMatch(
        /transitionTypes[=:] ?\{?NAV_DEEPER\}?/,
      );
    }
  });

  it("spells the type in one place, so twelve surfaces cannot drift apart", () => {
    // A hand-written `["nav-deeper"]` at a call site is how a rename leaves one rail
    // behind — the exact failure `poster-transition-name.ts` exists to prevent for the
    // morph's names.
    for (const surface of DEPTH_SURFACES) {
      expect(readFileSync(surface, "utf8"), `${surface} spells the type by hand`).not.toContain(
        '"nav-deeper"',
      );
    }
  });

  it("wraps what a depth navigation arrives on, or the type animates nothing", () => {
    for (const page of DEPTH_DESTINATIONS) {
      expect(readFileSync(page, "utf8"), `${page} is not wrapped`).toContain(
        "<NavTransition>",
      );
    }
  });

  it("scales the arriving page up and fades it in", () => {
    // The whole screen arrives together: the page grows from just under full size while
    // it fades, so the poster morphing above it lands on ground that is arriving with it
    // rather than on ground that has already cut.
    const arriving = blockFor("new", "nav-deeper");
    expect(arriving).toContain("nav-depth");
    expect(arriving).toContain("nav-fade");
    expect(arriving).not.toContain("reverse");
    // The scale is the depth cue and it is authored here, not left to the browser.
    expect(GLOBALS).toMatch(
      /@keyframes nav-depth\s*\{\s*from\s*\{\s*scale:\s*var\(--nav-depth\)/,
    );
    expect(blockFor("new", "nav-deeper")).toMatch(/--nav-depth:\s*0?\.\d+/);
  });

  it("plays that same motion reversed on the way out, so the round trip mirrors", () => {
    // Not a second pair of keyframes running the other way — the *same* two animations
    // with `reverse`, which is what makes a mirror a mirror rather than two curves that
    // happen to look alike today and drift apart at the next tuning.
    const leaving = blockFor("old", "nav-deeper");
    expect(leaving).toMatch(/both nav-fade reverse/);
    expect(leaving).toMatch(/both nav-depth reverse/);
  });

  it("leaves quickly and arrives slowly, off this file's own motion tokens", () => {
    // The same asymmetry the lateral pair carries, and for the same reason: arriving is
    // where the character lives, leaving is where impatience does. No hardcoded
    // milliseconds — `DESIGN.md`'s motion scale or nothing.
    const leaving = blockFor("old", "nav-deeper");
    const arriving = blockFor("new", "nav-deeper");
    expect(leaving).toContain("var(--dur-fast)");
    expect(arriving).toContain("var(--dur-base)");
    expect(leaving).not.toMatch(/\d+ms/);
    expect(arriving).not.toMatch(/\d+ms/);
  });

  it("costs no scrolling smoothness, because it moves nothing the compositor cannot", () => {
    // `opacity` and `scale` on a view-transition snapshot are already a texture on the
    // compositor, so the depth motion is the same work as the slide and never touches
    // layout. A `filter`, a `width`, a `height` or a `margin` in here is a main-thread
    // animation running over whatever the reader is scrolling — the one thing #293 was
    // explicitly not allowed to cost.
    const keyframes = GLOBALS.match(/@keyframes nav-depth\s*\{[\s\S]*?\n\}/)![0];
    expect(keyframes).toMatch(/scale:/);
    expect(keyframes).not.toMatch(/\b(filter|width|height|margin|padding|top|left|box-shadow)\s*:/);
    for (const side of ["old", "new"] as const) {
      expect(blockFor(side, "nav-deeper")).not.toMatch(
        /\b(filter|backdrop-filter|box-shadow)\s*:/,
      );
    }
  });

  it("stops moving for a reader who asked for reduced motion, all three types at once", () => {
    // One rule over `*` rather than one per class: the depth type inherits the reduced-
    // motion path the moment it exists, so there is no call site to forget. The
    // navigation still happens — the duration is zeroed, the transition is not removed.
    const reduced = GLOBALS.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*::view-transition-group\(\*\)[\s\S]*?\n\s*\}\n\}/,
    )![0];
    expect(reduced).toContain("::view-transition-old(*)");
    expect(reduced).toContain("::view-transition-new(*)");
    expect(reduced).toMatch(/animation-duration:\s*0s\s*!important/);
  });
});

/**
 * ── Settings arrives from below and leaves downward — issue #294 ─────────────────────
 *
 * The third kind of move, and the last one this vocabulary needed. Tapping a tab moves
 * the reader *along* a row of four; opening a title moves them *into* something; opening
 * Settings pushes them *out of* the four altogether. Until this, the push borrowed the
 * lateral `nav-forward`, so stepping out of the tabs looked exactly like stepping along
 * them — three kinds of move wearing two motions, and the one that was borrowed was the
 * one that meant the least.
 *
 * **Upward has exactly one caller and that is a known cost.** The masthead's Settings
 * link is the only push out of the bar this application has. A transition type for a
 * single call site is a real price, paid deliberately: the alternative was Settings
 * keeping a lateral motion that says the wrong thing about where the reader just went.
 * The cost is written down where the next reader of the vocabulary will meet it — in the
 * mapping every wrapped page reads, and in the stylesheet block that draws it — so that a
 * second caller arriving later reads as vindication rather than coincidence.
 *
 * These fail silently in the browser exactly as the other two families do: the class
 * stops matching, the reverse stops being a reverse, and Settings simply cuts.
 */

/**
 * The surfaces that reach Settings' neighbours — Import, delete-account, and the way back
 * out of delete-account. `DESIGN.md`'s rule for them is that they get *no motion of their
 * own*: they are ordinary pages behind ordinary links, they attach no type, and the
 * mapping's `default: "none"` is what they land on. Giving any of them the upward push
 * would say they too are a step out of the tabs, which they are not — they are already
 * outside.
 */
const LATERAL_DEFAULT_SURFACES = [
  // Settings' own body: the Import entrance and the delete-account entrance both live here.
  "app/(signed-in)/settings/page.tsx",
  // And the way back out of delete-account, which is a nested settings page.
  "app/(signed-in)/settings/delete-account/delete-account-frame.tsx",
  // The two empty states that offer Import as a recovery.
  "app/(signed-in)/library/empty-library.tsx",
  "app/(signed-in)/you/empty-you.tsx",
];

/** Every `.ts`/`.tsx` under `app/`, so "and by nothing else" can be asserted against the
 *  whole tree rather than against the two files this change happened to touch. */
function appSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return appSources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("opening Settings pushes it up out of the tabs", () => {
  it("maps the fourth type — upward — in the same vocabulary as the other three", () => {
    // One mapping, read by both halves of every wrapped page. A parallel `ViewTransition`
    // for Settings would be two snapshots of the same pixels and the browser pairing
    // whichever it found first.
    expect(WRAPPER).toContain('"nav-upward": "nav-upward"');
    // And the default is untouched by the addition: anything unclassified — a desktop
    // navigation, Import, a nested settings page, the poster morph — still lands on
    // `none`.
    expect(WRAPPER).toMatch(/default:\s*"none"/);
    expect(WRAPPER).toMatch(/default="none"/);
  });

  it("records the single-caller cost where the vocabulary is read", () => {
    // The cost is the whole reason this type is worth arguing about, and a cost nobody
    // can find is a cost that gets re-discovered as a surprise. Both places a reader
    // meets the vocabulary say it.
    expect(WRAPPER).toContain("#294");
    expect(WRAPPER).toMatch(/one caller|single caller/i);
    expect(GLOBALS).toMatch(/one caller|single caller/i);
  });

  it("carries the upward type on the masthead's Settings link and nothing else", () => {
    expect(MASTHEAD).toContain('transitionTypes={["nav-upward"]}');

    for (const file of appSources("app")) {
      if (file === path.join("app", "masthead.tsx")) continue;
      // The mapping has to name every type it maps; that is not a second caller.
      if (file === path.join("app", "(signed-in)", "nav-transition.tsx")) continue;
      expect(readFileSync(file, "utf8"), `${file} claims the upward push`).not.toContain(
        "nav-upward",
      );
    }
  });

  it("leaves Import, delete-account and nested settings on the lateral default", () => {
    for (const surface of LATERAL_DEFAULT_SURFACES) {
      expect(
        readFileSync(surface, "utf8"),
        `${surface} claims a motion of its own`,
      ).not.toContain("transitionTypes");
    }
  });

  it("draws an upward pair, so the class the link attaches has something to act on", () => {
    expect(GLOBALS).toContain("::view-transition-old(.nav-upward)");
    expect(GLOBALS).toContain("::view-transition-new(.nav-upward)");
  });

  it("pushes the arriving page up from below", () => {
    const arriving = blockFor("new", "nav-upward");
    expect(arriving).toContain("nav-rise");
    expect(arriving).toContain("nav-fade");
    expect(arriving).not.toContain("reverse");
    // From below: a positive vertical offset on the `y` axis, travelling to nothing. The
    // offset is authored here rather than left to the browser, exactly as the lateral
    // slide's `--nav-slide` is.
    expect(arriving).toMatch(/--nav-rise:\s*\d+px/);
    expect(GLOBALS).toMatch(
      /@keyframes nav-rise\s*\{\s*from\s*\{\s*translate:\s*0 var\(--nav-rise\)/,
    );
  });

  it("plays that same motion reversed on the way out, so the round trip mirrors", () => {
    // Not a second pair of keyframes running the other way — the *same* two animations
    // with `reverse`, which is what makes leaving downward the mirror of arriving from
    // below rather than a curve that merely looks like one today.
    const leaving = blockFor("old", "nav-upward");
    expect(leaving).toMatch(/both nav-fade reverse/);
    expect(leaving).toMatch(/both nav-rise reverse/);
    // Same offset on both sides, or the mirror is lopsided.
    expect(leaving).toMatch(/--nav-rise:\s*\d+px/);
    expect(leaving.match(/--nav-rise:\s*(\d+px)/)![1]).toBe(
      blockFor("new", "nav-upward").match(/--nav-rise:\s*(\d+px)/)![1],
    );
  });

  it("leaves quickly and arrives slowly, off this file's own motion tokens", () => {
    // The asymmetry both other families carry, for the same reason: arriving is where the
    // character lives, leaving is where impatience does. No hardcoded milliseconds.
    const leaving = blockFor("old", "nav-upward");
    const arriving = blockFor("new", "nav-upward");
    expect(leaving).toContain("var(--dur-fast)");
    expect(arriving).toContain("var(--dur-base)");
    expect(leaving).not.toMatch(/\d+ms/);
    expect(arriving).not.toMatch(/\d+ms/);
  });

  it("moves nothing the compositor cannot", () => {
    // `translate` and `opacity` on a view-transition snapshot are the same work the
    // lateral slide already does. A `filter`, a `height` or a `margin` in here would be a
    // main-thread animation running over whatever the reader is scrolling.
    const keyframes = GLOBALS.match(/@keyframes nav-rise\s*\{[\s\S]*?\n\}/)![0];
    expect(keyframes).toMatch(/translate:/);
    expect(keyframes).not.toMatch(
      /\b(filter|width|height|margin|padding|top|left|box-shadow)\s*:/,
    );
    for (const side of ["old", "new"] as const) {
      expect(blockFor(side, "nav-upward")).not.toMatch(
        /\b(filter|backdrop-filter|box-shadow)\s*:/,
      );
    }
  });

  it("stops moving for a reader who asked for reduced motion, all three motions at once", () => {
    // Lateral, depth and upward: one rule over `*` rather than one per class, so a type
    // added later inherits the reduced-motion path the moment it exists and there is no
    // call site to forget. The navigation still happens — the duration is zeroed, the
    // transition is not removed.
    const reduced = GLOBALS.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*::view-transition-group\(\*\)[\s\S]*?\n\s*\}\n\}/,
    )![0];
    expect(reduced).toContain("::view-transition-old(*)");
    expect(reduced).toContain("::view-transition-new(*)");
    expect(reduced).toMatch(/animation-duration:\s*0s\s*!important/);
    for (const cls of ["nav-forward", "nav-back", "nav-deeper", "nav-upward"] as const) {
      expect(reduced, `${cls} is exempted from the wildcard`).not.toContain(cls);
    }
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
