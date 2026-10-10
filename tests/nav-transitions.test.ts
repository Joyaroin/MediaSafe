import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { smooth } from "@/app/motion";
import { backOrigin, isCurrentRoute, isTabRepress } from "@/app/nav-route";

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
 *  4. **The chrome is anchored.** If the tab bar loses its name it slides
 *     with the content, the whole viewport appears to move, and the direction stops
 *     meaning anything.
 *  5. **It stays phone-only.** The desktop sidebar must not start sliding.
 */

const GLOBALS = readFileSync("app/globals.css", "utf8");
const TAB_BAR = readFileSync("app/tab-bar.tsx", "utf8");
const WRAPPER = readFileSync("app/(signed-in)/nav-transition.tsx", "utf8");
const LAYOUT = readFileSync("app/(signed-in)/layout.tsx", "utf8");

/** The root pair's rule body. There is one motion now and it is drawn on `root`, so this
 * takes no class: the four `nav-*` classes it used to select are gone, and with them the
 * question of which navigation gets which. */
const rootBlock = (side: "old" | "new") =>
  GLOBALS.match(new RegExp(`::view-transition-${side}\\(root\\)\\s*\\{[^}]*\\}`))![0];

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
  /** `lists/page.tsx` left this list in the UI overhaul: it is a redirect, and draws no
   *  page for a transition to carry. */
  /** Issue #247, and the phone's fourth tab since #249 pointed it here and deleted the
   *  `/stats` line that used to sit above this one. #247's own note said wrapping the
   *  page before it was on the bar would leave that ticket changing one `href` rather
   *  than this file as well, and that is what happened. */
  "app/(signed-in)/you/page.tsx",
  "app/(signed-in)/settings/page.tsx",
];

describe("one motion, and nothing that has to choose between motions", () => {
  it("attaches no transition type anywhere, so nothing can attach the wrong one", () => {
    // Three vocabularies were removed rather than retuned — the
    // reversal is recorded and `globals.css` carries the reasoning beside the animation. What guards
    // the collapse is that no surface spells a type at all: one stray `transitionTypes`
    // is how a single screen quietly starts moving differently from every other.
    for (const dir of ["app"]) {
      for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
        if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
        const full = path.join(dir, file);
        expect(readFileSync(full, "utf8"), `${full} still attaches a type`).not.toMatch(
          /transitionTypes[=:]/,
        );
      }
    }
  });

  it("derives no direction, because there is no direction to get wrong", () => {
    // The lateral pair read the bar's geometry to decide forward from back. With one
    // motion there is nothing to derive, so the derivation is gone rather than left
    // computing a value nothing reads.
    expect(TAB_BAR).not.toContain("navTransitionTypes");
    // The names are deliberately NOT forbidden as strings: both files carry a docblock
    // explaining what was removed and why, and a reversal a reader cannot read about is
    // how the same decision gets made a fourth time. What must not survive is a name in
    // *code* — the attachment sweep above is what holds that.
    expect(TAB_BAR).not.toMatch(/TABS\.findIndex\([^)]*isCurrentRoute/);
    expect(TAB_BAR).not.toMatch(/return \["nav-/);
  });

  it("draws no per-class rule, so a leftover class would animate nothing", () => {
    for (const cls of ["nav-forward", "nav-back", "nav-deeper", "nav-upward"]) {
      expect(GLOBALS, `${cls} still drawn`).not.toContain(`::view-transition-old(.${cls})`);
      expect(GLOBALS, `${cls} still drawn`).not.toContain(`::view-transition-new(.${cls})`);
    }
  });

  it("maps nothing but the default, on the mapping and on the component", () => {
    expect(WRAPPER).toMatch(/default:\s*"none"/);
    expect(WRAPPER).toMatch(/default="none"/);
    expect(WRAPPER).not.toMatch(/"nav-(forward|back|deeper|upward)"/);
  });

  it("fades the leaving screen and rises the arriving one into place", () => {
    expect(rootBlock("new")).toMatch(/nav-fade/);
    expect(rootBlock("new")).toMatch(/nav-rise/);
    expect(rootBlock("old")).toMatch(/nav-fade/);
    // Nothing travels on the way out: a screen that is leaving has nowhere to arrive.
    expect(rootBlock("old")).not.toMatch(/nav-rise/);
  });

  it("leaves quickly and arrives slowly, off this file's own motion tokens", () => {
    // The asymmetry this file has always held — arriving is where the character lives,
    // leaving is where impatience does — now stated once instead of three times.
    expect(rootBlock("old")).toContain("var(--dur-fast)");
    expect(rootBlock("new")).toContain("var(--dur-quick)");
    expect(rootBlock("new")).not.toContain("var(--dur-fast)");

    // And the whole thing settles sooner than the slide it replaced, which ran at base.
    const quick = Number(GLOBALS.match(/--dur-quick:\s*(\d+)ms/)![1]);
    const base = Number(GLOBALS.match(/--dur-base:\s*(\d+)ms/)![1]);
    expect(quick).toBeLessThan(base);
  });

  it("rises a short distance, because an arrival is not a journey", () => {
    const rise = GLOBALS.match(/@keyframes nav-rise\s*\{[\s\S]*?\n\}/)![0];
    const px = Number(rise.match(/translate:\s*0\s+(\d+)px/)![1]);
    expect(px).toBeGreaterThan(0);
    // The lateral slide travelled 60px, which is far enough that the eye follows it.
    expect(px).toBeLessThanOrEqual(16);
  });

  it("moves nothing the compositor cannot", () => {
    const rise = GLOBALS.match(/@keyframes nav-rise\s*\{[\s\S]*?\n\}/)![0];
    expect(rise).toMatch(/translate:/);
    expect(rise).not.toMatch(/\b(filter|width|height|margin|padding|top|left|box-shadow)\s*:/);
  });

  it("puts the poster morph on the same clock as the page it lands on", () => {
    // The morph ran `--dur-slow` against a `--dur-base` page and was already the last
    // thing settling. Against a `--dur-quick` page that gap widens rather than closes, so
    // the morph came down to meet it. Unaffected by #338: only the curve's shape moved.
    const group = GLOBALS.match(/::view-transition-group\(\*\.poster\)\s*\{[^}]*\}/)![0];
    expect(group).toContain("var(--dur-quick)");
    expect(group).not.toContain("var(--dur-slow)");
  });

  it("stops moving for a reader who asked for reduced motion", () => {
    // §6's rule: the navigation still happens, it just stops travelling. With one motion
    // there is one pair to neutralise instead of four.
    const reduced = GLOBALS.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g,
    )!.join("\n");
    expect(reduced).toMatch(/view-transition/);
  });
});

/**
 * ── The poster morph's spring, scoped rather than universal — issue #338 ─────────────
 *
 * `::view-transition-group(*)` used to mean *every* named group — the poster, `root`,
 * `phone-masthead`, `phone-tab-bar` — and the chrome pair only escaped the curve because a
 * later, more specific rule zeroed their `animation` back out. That is the failure this
 * ticket names outright: a rule that reaches every group and is corrected after the fact
 * for two of them, rather than a rule that only ever reached the one it was meant for.
 *
 * `*.poster` fixes the scope by reading `view-transition-class`, which the five poster call
 * sites set and nothing else does. The easing itself is `app/motion.ts`'s `smooth` — the
 * module's one non-bouncing spring — sampled into `linear()` the same way `--spring-press`
 * (#270) sampled `snappy`, recomputed here from the source cited rather than copied, so the
 * CSS curve and a Motion-driven `smooth` cannot drift into two curves that merely resemble
 * each other.
 */
describe("the poster morph's spring is scoped to posters, not to every group", () => {
  /** The body of a `::view-transition-group(...)` rule, keyed by its selector text. */
  function groupRule(selector: string): string {
    const match = GLOBALS.match(
      new RegExp(`::view-transition-group\\(${selector}\\)\\s*\\{[^}]*\\}`),
    );
    expect(match, `::view-transition-group(${selector}) not found`).not.toBeNull();
    return match![0];
  }

  it("scopes the spring to a view-transition class rather than to every group", () => {
    // The universal selector must not carry the spring at all — only the classed one may.
    expect(GLOBALS).not.toMatch(/::view-transition-group\(\*\)\s*\{[^}]*var\(--spring-poster\)/);
    expect(groupRule("\\*\\.poster")).toContain("var(--spring-poster)");
  });

  it("leaves the tab-bar group out of the poster rule's scope", () => {
    // The chrome group does not carry the `poster` class, and the selector that reaches them
    // is a name, not `*` — so the scoped rule above cannot address them at all, rather
    // than addressing them and being overridden afterwards.
    const posterRule = groupRule("\\*\\.poster");
    expect(posterRule).not.toContain("phone-tab-bar");

    // And the existing override — `animation: none` on the named chrome group — is
    // still the rule that keeps them still, unaffected by where the spring now lives.
    expect(GLOBALS).toMatch(
      /::view-transition-group\(phone-tab-bar\)\s*\{[^}]*animation:\s*none/,
    );
  });

  it("every poster call site sets the `poster` view-transition class", () => {
    // The five halves of the morph named in `app/globals.css`'s own note beside the rule —
    // a call site that mints a name without the class is a poster the scoped rule cannot
    // reach, and the morph silently reverts to the browser's stock curve for it alone.
    const POSTER_CALL_SITES = [
      "app/(signed-in)/library/title-hero.tsx",
      "app/(signed-in)/library/selectable-entry.tsx",
      "app/(signed-in)/titles/[entryId]/pending-poster.tsx",
      "app/(signed-in)/up-next/up-next-episode-row.tsx",
    ];

    for (const file of POSTER_CALL_SITES) {
      const source = readFileSync(file, "utf8");
      // The raw-style call sites spell the CSS property in camelCase; the two using
      // React's `<ViewTransition>` spell the class through its `default` prop instead —
      // both are read for, rather than assuming one mechanism.
      expect(source, file).toMatch(/viewTransitionClass:\s*"poster"|default="poster"/);
    }
  });

  it("carries smooth's own step response, sample for sample", () => {
    // `smooth` is `app/motion.ts`'s non-bouncing spring: `duration: 0.3, bounce: 0`, which
    // is `dampingFraction` 1 — critically damped, so the closed form used for `snappy`
    // (`tests/press-spring.test.ts`) collapses at its own limit rather than applying as
    // written: `ω_d = ωₙ√(1 − ζ²)` is zero at `ζ = 1`, and the formula that divides by it
    // is undefined there. The step response at critical damping is the limit of that
    // formula as `ζ → 1`, taken analytically rather than by perturbing `ζ` numerically:
    //
    //   x(t) = 1 − e^(−ωₙt)·(1 + ωₙt)
    expect(smooth.bounce).toBe(0);
    const response = smooth.duration as number;
    const damping = 1 - (smooth.bounce as number);
    expect(damping).toBe(1);

    const naturalFrequency = (2 * Math.PI) / response;
    const SETTLED = 0.001;

    function travelled(t: number): number {
      return 1 - Math.exp(-naturalFrequency * t) * (1 + naturalFrequency * t);
    }

    // Where `e^(−ωₙt)·(1 + ωₙt)` falls under one part in a thousand, found the way
    // `press-spring.test.ts`'s closed form is found for the underdamped case — except
    // there is no closed form here, so it is bisected instead of solved.
    let lo = 0;
    let hi = 5;
    for (let i = 0; i < 100; i += 1) {
      const mid = (lo + hi) / 2;
      const excess = Math.exp(-naturalFrequency * mid) * (1 + naturalFrequency * mid);
      if (excess > SETTLED) lo = mid;
      else hi = mid;
    }
    const settleMs = Math.ceil(((lo + hi) / 2) * 1000);

    const STOPS = 33;
    const stops = GLOBALS.match(/--spring-poster:\s*linear\(([^)]*)\)/)![1]
      .split(",")
      .map((stop) => Number(stop.trim()));

    expect(stops).toHaveLength(STOPS);
    stops.forEach((stop, index) => {
      const expected =
        index === STOPS - 1 ? 1 : travelled((index / (STOPS - 1)) * (settleMs / 1000));
      expect(
        Math.abs(stop - expected),
        `stop ${index} is ${stop}, and smooth is at ${expected.toFixed(4)} there`,
      ).toBeLessThanOrEqual(5e-4);
    });

    // Monotonic and never overshoots — the property `bounce: 0` names.
    for (let i = 1; i < stops.length; i += 1) expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]);
    expect(Math.max(...stops)).toBe(1);
    expect(stops[0]).toBe(0);
    expect(stops[STOPS - 1]).toBe(1);
  });

  it("keeps the spring out of app/motion.ts, spelled once in the stylesheet", () => {
    // The same rule `tests/press-spring.test.ts` holds for `snappy`: a copy of a sampled
    // curve in TypeScript is the drift this file exists to prevent, arriving from the
    // other direction. `app/motion.ts`'s prose is allowed to say `linear()` — it is
    // describing what CSS does with `smooth` — so comments are blanked before the check.
    const motionCode = readFileSync("app/motion.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(motionCode).not.toMatch(/linear\(|cubic-bezier/);

    // And `smooth` itself is untouched — no spring value in the motion module changes.
    expect(smooth).toEqual({ type: "spring", duration: 0.3, bounce: 0 });
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

});

describe("the chrome stays still", () => {
  it("names the tab bar so it leaves the root snapshot (there is no phone masthead)", () => {
    expect(TAB_BAR).toContain('viewTransitionName: "phone-tab-bar"');
  });

  it("holds those groups still and hides the outgoing copy", () => {
    // Without `display: none` on the old snapshot both copies of the bar paint for the
    // length of the transition, which reads as a flicker on the one element that is
    // meant to be the still point.
    expect(GLOBALS).toMatch(
      /::view-transition-group\(phone-tab-bar\)\s*\{[^}]*animation:\s*none/,
    );
    expect(GLOBALS).toMatch(
      /::view-transition-old\(phone-tab-bar\)\s*\{[^}]*display:\s*none/,
    );
  });

  it("keeps the page tappable while a transition runs", () => {
    // The overlay swallows pointer events for the whole duration otherwise, so a reader
    // moving quickly through tabs loses their second tap and the animation reads as lag.
    expect(GLOBALS).toMatch(/::view-transition\s*\{\s*pointer-events:\s*none/);
  });
});


const ROW = readFileSync("app/(signed-in)/up-next/up-next-episode-row.tsx", "utf8");
const DETAIL_VIEW = readFileSync(
  "app/(signed-in)/titles/[entryId]/title-detail-view.tsx",
  "utf8",
);

describe("the poster morph, on one transition-name family", () => {
  it("gives the Up next row and the page it opens the same name", () => {
    // Same minting function, same argument shape: the row's entry id and the page's.
    expect(ROW).toContain("railPosterTransitionName(entry.libraryEntryId)");
    expect(DETAIL_VIEW).toContain(
      "posterTransitionName={railPosterTransitionName(current.libraryEntryId)}",
    );
  });

  it("keeps every half minting from the shared module rather than spelling the name", () => {
    for (const [label, source] of [
      ["up-next-episode-row.tsx", ROW],
      ["title-detail-view.tsx", DETAIL_VIEW],
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

  it("wraps the row's poster in exactly one view transition", () => {
    // There is no side pane any more to hold the same name, so the row always names its
    // poster — one `<ViewTransition>`, no early unwrapped return.
    expect(ROW.match(/<ViewTransition/g)).toHaveLength(1);
    expect(ROW).not.toMatch(/return frame;/);
  });

  /**
   * **Issue #303 reverses this suite's own prior assertion of the opposite.** Until this
   * ticket the condition above read `if (press !== "select" || selected) return frame;`,
   * and this test asserted exactly that string — the phone's `press="episode"` rows were
   * deliberately unwrapped, on the reasoning quoted in `up-next-episode-row.tsx`'s own
   * docblock: *"the phone's row navigates to a different page and has nothing to share."*
   * The phone title route's pending frame carries a poster now
   * (`app/poster-handoff-memory.ts`), so that premise no longer holds, and the row wraps
   * on both presses. `selected` is unaffected: it still answers true only for the pane's
   * own selection, which a `press="episode"` row never writes to.
   */
  it("wraps the phone's episode-press rows too, now that their destination has a poster", () => {
    expect(ROW).not.toMatch(/press !== "select"/);
    expect(ROW).toContain(
      'onClick={() => carryPoster(entry.libraryEntryId, entry.posterPath)}',
    );
  });

  it("leaves the fixed chrome out of the root snapshot, exactly as before", () => {
    // The morph collapsing to one family must not disturb what is held still under it.
    expect(TAB_BAR).toContain('viewTransitionName: "phone-tab-bar"');
    expect(GLOBALS).toMatch(
      /::view-transition-group\(phone-tab-bar\)\s*\{[^}]*animation:\s*none/,
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

/**
 * ── Is a press a re-press? — issue #323 ───────────────────────────────────────────────
 *
 * `isTabRepress` is the pure decision `use-up-next-repress.ts` binds to a click: whether
 * the reader pressing `href` is already standing on it. It is built on `isCurrentRoute`
 * rather than a second copy of its rule, so the two properties below are really one — a
 * re-press is exactly `isCurrentRoute`'s own "current" — asserted here in the tab's own
 * words rather than through the routing rule's.
 */
/**
 * ── The six surfaces that mount and may unmount fast — issue #333 ────────────────────
 *
 * `app/motion.ts`'s dividing line: what a finger can interrupt gets a transition, what it
 * cannot gets a keyframe. These six can all be cut short mid-arrival by the reader's own
 * press (Escape, the backdrop, Cancel, Dismiss, Done), so they get `@starting-style` with
 * `transition-behavior: allow-discrete` in `app/globals.css` instead of `rise-in`, the
 * keyframe every other surface keeps.
 */
const MARK_UP_TO_DIALOG = readFileSync(
  "app/(signed-in)/library/mark-up-to-dialog.tsx",
  "utf8",
);
const DELETE_LIST_DIALOG = readFileSync("app/(signed-in)/lists/delete-list-dialog.tsx", "utf8");
const WATCH_MENU = readFileSync("app/(signed-in)/library/watch-menu.tsx", "utf8");
const OFFLINE_BANNER = readFileSync("errors/offline-banner.tsx", "utf8");
const WRITE_FAILURE_TOAST = readFileSync("errors/write-failure-toast.tsx", "utf8");
const WRITE_FAILURE_STORE = readFileSync("errors/write-failure.ts", "utf8");
const SELECTION_ACTION_BAR = readFileSync(
  "app/(signed-in)/library/selection-action-bar.tsx",
  "utf8",
);

const SIX_SURFACES = [
  ["mark-up-to-dialog.tsx", MARK_UP_TO_DIALOG, "dialog-transition"],
  ["delete-list-dialog.tsx", DELETE_LIST_DIALOG, "dialog-transition"],
  ["watch-menu.tsx", WATCH_MENU, "dialog-transition"],
  ["offline-banner.tsx", OFFLINE_BANNER, "offline-banner-transition"],
  ["write-failure-toast.tsx", WRITE_FAILURE_TOAST, "write-failure-toast-transition"],
  ["selection-action-bar.tsx", SELECTION_ACTION_BAR, "selection-action-bar-transition"],
] as const;

const TRANSITION_UTILITIES = [
  "dialog-transition",
  "offline-banner-transition",
  "selection-action-bar-transition",
  "write-failure-toast-transition",
] as const;

describe("the six fast-mounting surfaces get a transition, not the arrival keyframe", () => {
  it("wires each surface to its own transition utility", () => {
    for (const [label, source, utility] of SIX_SURFACES) {
      expect(source, label).toContain(utility);
    }
  });

  it("draws none of the six with rise-in, stagger-rise or the arrive keyframe utilities", () => {
    for (const [label, source] of SIX_SURFACES) {
      expect(source, label).not.toMatch(/\brise-in\b/);
      expect(source, label).not.toMatch(/\bstagger-rise\b/);
      expect(source, label).not.toMatch(/(^|[^-])\barrive(-panel)?\b/);
    }
  });

  it("declares every transition utility in app/globals.css, off the timing ramp", () => {
    for (const utility of TRANSITION_UTILITIES) {
      const declaration = GLOBALS.match(new RegExp(`@utility ${utility} \\{[\\s\\S]*?\\n\\}`));
      expect(declaration, `@utility ${utility} not found`).not.toBeNull();
      const body = declaration![0];
      expect(body, utility).toContain("var(--dur-");
      // Every raw millisecond/second value inside the utility's own block, once every
      // `var(...)` reference is stripped out — the same check `duration-on-the-ramp.mjs`
      // makes for class names and style objects, applied here to the one place this
      // ticket writes CSS by hand instead of a class name.
      expect(body.replace(/var\([^)]*\)/g, ""), utility).not.toMatch(/\b\d+(\.\d+)?m?s\b/);
    }
  });

  it("gives each surface a starting style to transition in from", () => {
    for (const utility of TRANSITION_UTILITIES) {
      expect(GLOBALS, utility).toMatch(
        new RegExp(`@starting-style\\s*\\{[\\s\\S]*?\\.${utility}`),
      );
    }
  });

  it("defers the discrete display and overlay swap with allow-discrete", () => {
    // The dialogs and the banner/action-bar toggle `display` (natively via `open`, or via
    // `data-open`) rather than being unmounted in place, so both need the property in the
    // transition list with `allow-discrete` or the browser drops to `none` in one frame.
    expect(GLOBALS).toMatch(/overlay var\(--dur-\w+\) var\(--ease-[\w-]+\) allow-discrete/);
    expect(GLOBALS).toMatch(
      /display var\(--dur-fast\) var\(--ease-out-quart\) allow-discrete/,
    );
    expect(GLOBALS).toMatch(/display var\(--dur-slow\) var\(--ease-press\) allow-discrete/);
  });

  it("leaves the write-failure toast with no timer anywhere near it", () => {
    expect(WRITE_FAILURE_TOAST).not.toMatch(/setTimeout/);
    expect(WRITE_FAILURE_STORE).not.toMatch(/setTimeout/);
  });

  it("keeps raise/resolve/dismiss/standing exactly as they were", () => {
    expect(WRITE_FAILURE_STORE).toMatch(/raise\(lost\)/);
    expect(WRITE_FAILURE_STORE).toContain("dismiss: remove,");
    expect(WRITE_FAILURE_STORE).toContain("standing: () => raised.some(");
  });

  it("still shows and hides the offline banner and the action bar off existing state", () => {
    // Neither component gained a new prop, state or handler for this — `data-open` reads
    // off the same booleans (`connectivity`'s state, `selecting`) each already computed.
    expect(OFFLINE_BANNER).toContain('data-open={state === "online" ? undefined : "true"}');
    expect(SELECTION_ACTION_BAR).toContain('data-open={selecting ? "true" : undefined}');
  });

  it("drops travel under reduced motion but keeps every one of the six eventful", () => {
    const reducedBlocks = GLOBALS.match(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}\n/g,
    )!.join("\n");
    for (const utility of TRANSITION_UTILITIES) {
      expect(reducedBlocks, utility).toContain(utility);
    }
    expect(reducedBlocks).toMatch(/transform:\s*none/);
  });

  it("leaves the grid stagger a keyframe, untouched", () => {
    expect(GLOBALS).toContain("@utility stagger-rise");
    expect(GLOBALS).toMatch(/@utility stagger-rise \{[\s\S]*?animation: rise-in/);
  });
});

describe("whether a press is a re-press of the tab already showing", () => {
  it("is a re-press when the reader is already exactly there", () => {
    expect(isTabRepress("/up-next", "/up-next")).toBe(true);
  });

  it("is a re-press from anything pushed under the destination too", () => {
    // The same prefix rule `isCurrentRoute` already applies for "current" styling — a
    // second, disagreeing rule here would be the drift its own docblock warns about.
    expect(isTabRepress("/up-next/anything", "/up-next")).toBe(true);
  });

  it("is not a re-press of a tab the reader is not on", () => {
    expect(isTabRepress("/library", "/up-next")).toBe(false);
  });

  it("is not a re-press by bare prefix — a section is not every address near it", () => {
    expect(isTabRepress("/up-nextish", "/up-next")).toBe(false);
  });

  it("agrees with isCurrentRoute for every sample the routing suite already covers", () => {
    for (const previous of ORIGIN_SAMPLES) {
      for (const destination of ["/up-next", "/library", "/search"]) {
        expect(isTabRepress(previous, destination)).toBe(isCurrentRoute(previous, destination));
      }
    }
  });
});

/**
 * ── Both progress bars follow the mark — issue #335 ──────────────────────────────────
 *
 * The state already updates at the sweep's settle (`WatchProgress` recomputes on the
 * watched count), so the only thing missing was a transition on the fill's `width`. Width,
 * never a transform: the fill is the only child of a clipped, rounded track, and a scale
 * would flatten that rounded end instead of sliding it.
 */
const POSTER_PROGRESS_BAR = readFileSync("app/poster-progress-bar.tsx", "utf8");
const TITLE_HERO = readFileSync("app/(signed-in)/library/title-hero.tsx", "utf8");

describe("both progress bars follow the mark instead of jumping after it", () => {
  it("declares a width transition off the duration ramp, not a raw literal", () => {
    for (const [label, source] of [
      ["poster-progress-bar.tsx", POSTER_PROGRESS_BAR],
      ["title-hero.tsx", TITLE_HERO],
    ] as const) {
      expect(source, `${label} has no width transition`).toMatch(/transition-\[width\]/);
      expect(source, `${label} times it off a raw literal instead of the ramp`).toMatch(
        /duration-\[var\(--dur-[a-z]+\)\]/,
      );
    }
  });

  it("transitions width, never a transform, so the fill's rounded end is never scaled", () => {
    for (const [label, source] of [
      ["poster-progress-bar.tsx", POSTER_PROGRESS_BAR],
      ["title-hero.tsx", TITLE_HERO],
    ] as const) {
      expect(source, `${label} scales the fill instead of widening it`).not.toMatch(
        /transition-\[(transform|scale)\]/,
      );
    }
  });

  it("still reaches its new value under reduced motion, because the mark must survive", () => {
    // The established shape for this preference (`.watch-sweep`'s own reduced-motion
    // rule, above) is to collapse the duration rather than remove the property: the width
    // still lands on its new value, it just does not travel to get there.
    const reduced = GLOBALS.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g,
    )!.join("\n");
    expect(reduced).toMatch(/\.progress-fill\s*\{[^}]*transition-duration:\s*1ms/);

    for (const [label, source] of [
      ["poster-progress-bar.tsx", POSTER_PROGRESS_BAR],
      ["title-hero.tsx", TITLE_HERO],
    ] as const) {
      expect(source, `${label} never wears the class the reduced-motion rule targets`).toMatch(
        /progress-fill/,
      );
    }
  });
});

/**
 * ── The rows displaced during a reorder get a spring — issue #337 ────────────────────
 *
 * `reorderable-title-list.tsx` used to close the gap a drag opens with a hand-written CSS
 * transition (`transform var(--dur-fast) ease`), which restarts from a standstill whenever
 * the drag reverses mid-gesture — the one surface in the app that moved under a finger on
 * anything but a spring. The fix is `app/motion.ts`'s own interruptible spring: the
 * displaced rows are `m.li` from `motion/react-m`, animated by Motion's `animate` prop
 * rather than by a CSS transition, so a target that changes mid-flight carries velocity
 * into the new one instead of restarting from rest. The dragged row's own tracking is
 * untouched — it still writes `transform` directly, the one value `shiftFor` never moves
 * for the row it belongs to, so it never competes with Motion for the same property.
 */
const REORDERABLE_TITLE_LIST = readFileSync(
  "app/(signed-in)/lists/[listId]/reorderable-title-list.tsx",
  "utf8",
);
const LIST_TITLE_ROW = readFileSync("app/(signed-in)/lists/[listId]/list-title-row.tsx", "utf8");

/** Block comments stripped, so a docblock's prose about the literal this ticket removed
 *  (quoted for the reader in backticks) cannot be mistaken for the literal surviving in
 *  code. */
function withoutComments(source: string): string {
  return source.replace(/\/\*\*[\s\S]*?\*\//g, "");
}

describe("the rows making way for a dragged row get a spring", () => {
  it("carries the row through Motion's mini component, not a bare <li>", () => {
    expect(LIST_TITLE_ROW).toContain('from "motion/react-m"');
    expect(LIST_TITLE_ROW).toMatch(/<m\.li\b/);
    expect(withoutComments(LIST_TITLE_ROW)).not.toMatch(/<li\b/);
  });

  it("animates the displaced rows on the motion module's own spring", () => {
    expect(LIST_TITLE_ROW).toMatch(/import \{ smooth \} from "@\/app\/motion"/);
    expect(LIST_TITLE_ROW).toMatch(/animate=\{[^}]*shift[^}]*\}/);
    expect(LIST_TITLE_ROW).toMatch(/transition=\{smooth\}/);
  });

  it("leaves no hand-written duration or easing literal in the reorder list", () => {
    for (const [label, source] of [
      ["reorderable-title-list.tsx", REORDERABLE_TITLE_LIST],
      ["list-title-row.tsx", LIST_TITLE_ROW],
    ] as const) {
      const code = withoutComments(source);
      expect(code, label).not.toMatch(/transition:\s*["'`]transform/);
      expect(code, label).not.toMatch(/\bease\b/);
    }
  });

  it("keeps the dragged row's own tracking a direct pointer read, unchanged", () => {
    expect(REORDERABLE_TITLE_LIST).toContain(
      "transform: `translateY(${dragState.translateY}px)`",
    );
  });

  it("reports no duration-ramp lint violation in either file", async () => {
    const eslint = new ESLint();
    const results = await eslint.lintFiles([
      "app/(signed-in)/lists/[listId]/reorderable-title-list.tsx",
      "app/(signed-in)/lists/[listId]/list-title-row.tsx",
    ]);
    const ruleIds = results.flatMap((result) => result.messages.map((message) => message.ruleId));
    expect(ruleIds).not.toContain("mediasafe/duration-on-the-ramp");
  });

  it("adds no reduced-motion branch of its own — MotionConfig's is the only one", () => {
    expect(REORDERABLE_TITLE_LIST).not.toMatch(/prefers-reduced-motion|useReducedMotion/);
    expect(LIST_TITLE_ROW).not.toMatch(/prefers-reduced-motion|useReducedMotion/);
  });
});

/**
 * ── The selection swap, and the guarantee that moves onto `inert` — issue #334 ───────
 *
 * Until this ticket `:root[data-selecting] .phone-tab-bar` was a single `display: none`,
 * an instant cut against the action bar's own transition. The tab bar now fades and rises
 * the way the six surfaces above do, and `display: none` lands at the *end* of that fade
 * instead of *being* the whole of it — so the accessibility guarantee that used to ride on
 * `display` alone moves to `tab-bar.tsx`, off the same `data-selecting` attribute the CSS
 * reacts to.
 */
describe("the tab bar crosses with the action bar instead of cutting, and inert carries the guarantee", () => {
  const restingBlock = GLOBALS.match(/\n\.phone-tab-bar \{[\s\S]*?\n\}/)![0];
  const selectingBlock = GLOBALS.match(
    /:root\[data-selecting\] \.phone-tab-bar \{[\s\S]*?\n\}/,
  )![0];

  it("still hides at rest behind data-selecting", () => {
    expect(selectingBlock).toMatch(/display:\s*none;/);
  });

  it("transitions opacity, transform and display off the timing ramp, not a raw literal", () => {
    for (const block of [restingBlock, selectingBlock]) {
      expect(block).toContain("var(--dur-");
      expect(block.replace(/var\([^)]*\)/g, "")).not.toMatch(/\b\d+(\.\d+)?m?s\b/);
    }
  });

  it("defers display with allow-discrete on both halves of the swap", () => {
    // Arriving back is the slow, confident half — shared with the six surfaces' own
    // arrival — and leaving is the fast, impatient half shared with their own close.
    expect(restingBlock).toMatch(
      /display var\(--dur-slow\) var\(--ease-press\) allow-discrete/,
    );
    expect(selectingBlock).toMatch(
      /display var\(--dur-fast\) var\(--ease-out-quart\) allow-discrete/,
    );
  });

  it("gives the tab bar a starting style to rise back in from", () => {
    expect(GLOBALS).toMatch(/@starting-style\s*\{\s*\.phone-tab-bar\s*\{/);
  });

  it("drops travel under reduced motion but keeps the swap eventful", () => {
    const reducedBlocks = GLOBALS.match(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}\n/g,
    )!.join("\n");
    expect(reducedBlocks).toContain(".phone-tab-bar");
    // `display: none` and the fade itself are untouched — only travel drops, never the
    // event, the same contract the six surfaces above and the width transitions keep.
    expect(reducedBlocks).toMatch(/\.phone-tab-bar[^{]*\{[^}]*transform:\s*none/);
  });

  it("carries the accessibility guarantee itself, off the same attribute the CSS reacts to", () => {
    expect(TAB_BAR).toMatch(
      /import \{[^}]*SELECTING_ATTRIBUTE[^}]*\} from "\.\/phone-bar"/,
    );
    expect(TAB_BAR).toContain("MutationObserver");
    expect(TAB_BAR).toMatch(/\.inert\s*=\s*document\.documentElement\.hasAttribute\(\s*SELECTING_ATTRIBUTE\s*\)/);
  });

  it("shares the attribute name with the action bar rather than a second string literal", () => {
    expect(SELECTION_ACTION_BAR).toMatch(
      /import \{[^}]*SELECTING_ATTRIBUTE[^}]*\} from "@\/app\/phone-bar"/,
    );
    expect(SELECTION_ACTION_BAR).not.toContain('"data-selecting"');
  });
});

/**
 * Settings is inside You — the UI overhaul. It is reached from You alone, so a reader in
 * it keeps You marked on the bar, and its back bar names You rather than Up next.
 */
describe("Settings belongs to You", () => {
  it("marks You current anywhere in Settings", () => {
    expect(isCurrentRoute("/settings", "/you")).toBe(true);
    expect(isCurrentRoute("/settings/delete-account", "/you")).toBe(true);
    expect(isCurrentRoute("/settings", "/library")).toBe(false);
    // Not by bare prefix, here either.
    expect(isCurrentRoute("/settingsx", "/you")).toBe(false);
  });

  it("leaves Settings by a bar that names You", () => {
    const settings = readFileSync("app/(signed-in)/settings/page.tsx", "utf8");
    expect(settings).toContain("<BackBar origin={YOU} />");
    expect(readFileSync("app/(signed-in)/settings/settings-heading.tsx", "utf8")).toContain(
      'export const YOU = { label: "You", destination: "/you" } as const;',
    );
  });
});
