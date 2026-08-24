import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DRAG_THRESHOLD_PX,
  claimsDrag,
  releaseDrag,
  type Drag,
  type DragRules,
} from "@/app/gesture-rules";

/**
 * **Episode detail arrives over what you were looking at** — issue #254.
 *
 * Two kinds of assertion, and the split is the same one `tests/gesture-rules.test.ts`
 * already makes for the pager: the *rules* are arithmetic and are driven directly, and the
 * *bindings* are couplings between files that cannot be driven at all —
 * `vitest.config.mts` runs in `node`, there is no DOM, and there is no router.
 *
 * What is worth a source assertion is only ever the coupling whose failure is **silent**.
 * The whole feature is built out of those, more than anything else in this repository:
 *
 *  1. **`showModal()`, not `show()`.** One character, and the backdrop, the focus trap and
 *     Escape all go — the three things the ticket says come free, and none of which throws
 *     when they are simply absent. #254 asks for focus trapped while open and returned to
 *     the opener on close, and both of those are *this call* rather than any code.
 *  2. **One navigation, and it hangs off `close`.** Every exit ends at `dialog.close()`,
 *     and `onClose` is the only place `router.back()` appears. A `back()` on the close
 *     control as well would double-pop the history; a `back()` on unmount would fire on
 *     the reader's own Back and take them a page further than they asked.
 *  3. **No second threshold.** The acceptance criterion is explicit, and a `40` typed into
 *     the modal is a number that goes on agreeing with the pager right up until one of
 *     them is tuned.
 *  4. **`scroll={false}` on both origins.** The router scrolls to the top on navigation
 *     and does not know this one only opened a dialog. Without it the page behind the
 *     backdrop is already at the top before the reader presses Back, which is exactly the
 *     thing the parallel route was chosen to preserve — and it fails *invisibly*, because
 *     the modal itself looks perfect.
 *  5. **The check is outside the link.** `SPEC.md`'s rule for the season row, and #254's
 *     own criterion. Nesting the control inside the link is a one-line mistake that makes
 *     every mark a navigation.
 *  6. **No reduced-motion branch.** `MotionConfig` handles it globally
 *     (`app/motion-provider.tsx`), and a `useReducedMotion()` here would be a second
 *     answer — `tests/nav-transitions.test.ts` asserts the same property one surface over.
 */

/**
 * A file with its comments taken out.
 *
 * Every file in this repository argues for itself at length, and several of the assertions
 * below are about a name appearing **nowhere** — `router.back()` exactly once,
 * `cachedTitleDetail` not at all. Against the raw text those are assertions about the prose,
 * and they fail the moment a docblock explains the very thing being checked, which is a
 * docblock this codebase always has. So the negatives read the code and the positives read
 * the file: a name that must be absent is absent from what runs, and a name that must be
 * present is enough to find anywhere.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MODAL = readFileSync("app/(signed-in)/route-modal.tsx", "utf8");
const SLOT_DEFAULT = readFileSync("app/(signed-in)/@episode/default.tsx", "utf8");
const SLOT_LAYOUT = readFileSync(
  "app/(signed-in)/@episode/(.)library/[entryId]/episode/[episodeId]/layout.tsx",
  "utf8",
);
const SLOT_PAGE = readFileSync(
  "app/(signed-in)/@episode/(.)library/[entryId]/episode/[episodeId]/page.tsx",
  "utf8",
);
const SIGNED_IN_LAYOUT = readFileSync("app/(signed-in)/layout.tsx", "utf8");
const RAIL_CARD = readFileSync("app/(signed-in)/up-next/up-next-episode-card.tsx", "utf8");
const FILM_RAIL = readFileSync("app/(signed-in)/up-next/up-next-film-rail.tsx", "utf8");
const SEASON_ROWS = readFileSync(
  "app/(signed-in)/library/programme-note-episodes.tsx",
  "utf8",
);
const FULL_PAGE = readFileSync(
  "app/(signed-in)/library/[entryId]/episode/[episodeId]/page.tsx",
  "utf8",
);
const SLOT_NOT_FOUND = readFileSync(
  "app/(signed-in)/@episode/(.)library/[entryId]/episode/[episodeId]/not-found.tsx",
  "utf8",
);
const DETAIL_VIEW = readFileSync(
  "app/(signed-in)/library/[entryId]/episode/[episodeId]/episode-detail-view.tsx",
  "utf8",
);
const BODY = readFileSync(
  "app/(signed-in)/library/[entryId]/episode/[episodeId]/episode-detail-body.tsx",
  "utf8",
);

describe("the dialog, and the three things it is chosen for", () => {
  /**
   * `showModal()` is the whole of the backdrop, the focus trap and Escape, and it is also
   * the whole of *focus returns to the opener* — the platform restores focus to whatever
   * was focused when the dialog opened, which is the card or the row that was pressed.
   * `show()` compiles, opens something that looks similar, and has none of it.
   */
  it("opens modally, which is where the trap and Escape come from", () => {
    expect(MODAL).toMatch(/\.showModal\(\)/);
    expect(codeOf(MODAL)).not.toMatch(/\.show\(\)/);
  });

  /** And it is a real `<dialog>` rather than a div dressed as one, which is what makes
   *  the sentence above true at all. */
  it("is the native dialog element", () => {
    expect(MODAL).toMatch(/<dialog\b/);
    expect(MODAL).toMatch(/HTMLDialogElement/);
  });

  /**
   * **One navigation.** `router.back()` appears once, on `onClose`, so Escape, the close
   * control and a committed swipe are one exit with three doors into it — and the reader's
   * own Back, which unmounts this component without firing `close`, produces none.
   */
  it("navigates from the close event and from nowhere else", () => {
    expect(codeOf(MODAL).match(/router\.back\(\)/g)).toHaveLength(1);
    expect(MODAL).toMatch(/onClose=\{\(\) => router\.back\(\)\}/);
  });

  /** Nothing pushes. A push would leave the modal's own URL in the history, so Back would
   *  reopen it rather than returning the reader to where they were. */
  it("never pushes or replaces its way out", () => {
    expect(codeOf(MODAL)).not.toMatch(/router\.(push|replace)\(/);
  });

  /** A close control as well as the gesture — #245's story 53. */
  it("offers a close control", () => {
    expect(MODAL).toMatch(/onClick=\{dismiss\}/);
  });
});

describe("the swipe is the shared gesture rules and nothing else", () => {
  /**
   * The acceptance criterion, read literally: *the swipe uses the shared gesture-rules
   * module; no second threshold is implemented.*
   */
  it("imports the rules rather than reimplementing them", () => {
    expect(MODAL).toMatch(/from "@\/app\/gesture-rules"/);
    for (const rule of ["claimsDrag", "dragOffset", "releaseDrag", "DRAG_THRESHOLD_PX"]) {
      expect(MODAL).toContain(rule);
    }
  });

  /**
   * **No number.** The threshold is the imported constant, and the only way that stops
   * being true is somebody typing one — which reads as a tidy-up and is a second rule.
   */
  it("states no threshold of its own", () => {
    expect(MODAL).toMatch(/threshold:\s*DRAG_THRESHOLD_PX/);
    expect(codeOf(MODAL)).not.toMatch(/threshold:\s*\d/);
  });

  /** Downwards, on the vertical axis. `commits: [1]` is what makes a drag *up* cancel
   *  rather than throwing the sheet at the ceiling. */
  it("accepts a downward drag and no other", () => {
    expect(MODAL).toMatch(/axis:\s*"vertical"/);
    expect(MODAL).toMatch(/commits:\s*\[1\]/);
  });

  /** The latch, which is the pager's own correction: the claim is decided once per gesture
   *  and passed back in, never re-derived on the frame being drawn. */
  it("latches the claim rather than re-asking every frame", () => {
    expect(MODAL).toMatch(/claimed:\s*boolean \| null/);
    expect(MODAL).toMatch(/from\.claimed = claimsDrag/);
  });
});

/**
 * The rules the modal binds, driven directly — the arithmetic half, with no source string
 * in sight. `tests/gesture-rules.test.ts` covers the module in general; these three are
 * the modal's own acceptance criteria stated in the module's terms, so that *a drag short
 * of the threshold springs back* is a passing assertion rather than a sentence.
 */
describe("what a swipe on this sheet does", () => {
  const SWIPE_DOWN: DragRules = {
    axis: "vertical",
    threshold: DRAG_THRESHOLD_PX,
    commits: [1],
  };
  const release = (drag: Drag) => releaseDrag(drag, SWIPE_DOWN, claimsDrag(drag, SWIPE_DOWN));

  it("dismisses on a drag that reaches the threshold", () => {
    expect(release({ dx: 0, dy: DRAG_THRESHOLD_PX })).toEqual({
      kind: "commit",
      direction: 1,
    });
  });

  it("springs back from a drag one pixel short of it", () => {
    expect(release({ dx: 0, dy: DRAG_THRESHOLD_PX - 1 })).toEqual({ kind: "cancel" });
  });

  it("springs back from a drag upwards, however far", () => {
    expect(release({ dx: 0, dy: -DRAG_THRESHOLD_PX * 4 })).toEqual({ kind: "cancel" });
  });

  /** A sideways drag inside the sheet is not the sheet's — it belongs to whatever the
   *  thumb is on. The modal sits over a screen of horizontal rails. */
  it("does not claim a sideways drag", () => {
    expect(claimsDrag({ dx: 80, dy: 10 }, SWIPE_DOWN)).toBe(false);
  });
});

describe("reduced motion is the provider's, not this file's", () => {
  /**
   * `MotionConfig reducedMotion="user"` at the root drops transform animation, and both
   * animated moments here — the present and the dismiss — are transforms. A branch in this
   * file would be a second answer that can disagree with the first.
   */
  it("branches on nothing", () => {
    expect(codeOf(MODAL)).not.toMatch(/useReducedMotion/);
    expect(codeOf(MODAL)).not.toMatch(/prefers-reduced-motion/);
  });

  /**
   * And the dismiss is driven by the animation finishing rather than by a timer — which is
   * what makes reduced motion *work*: the transform is dropped, so the callback fires at
   * once and the dialog closes immediately instead of after a wait nobody can see the
   * reason for. A `setTimeout` here would be a duration the setting cannot reach.
   */
  it("closes when the exit finishes, not after a timer", () => {
    expect(MODAL).toMatch(/onAnimationComplete/);
    expect(codeOf(MODAL)).not.toMatch(/setTimeout/);
  });
});

describe("the slot", () => {
  /** The layout has to render it, or the slot is compiled and never mounted — a modal
   *  that exists in the build and appears nowhere. */
  it("is rendered by the signed-in layout", () => {
    expect(SIGNED_IN_LAYOUT).toMatch(/episode:\s*React\.ReactNode/);
    expect(SIGNED_IN_LAYOUT).toMatch(/\{episode\}/);
  });

  /**
   * The title sheet is rendered **before** the episode sheet, and this is the assertion
   * that keeps it that way.
   *
   * Both are `showModal()` dialogs, so both are in the browser's top layer and no
   * `z-index` decides which is in front. The top layer is ordered by the order
   * `showModal()` was called in, which follows render order — so swapping these two lines
   * would put a title sheet in front of the episode sheet opened from inside it, with
   * nothing else in the codebase changing and nothing else failing.
   */
  it("renders the title slot before the episode slot", () => {
    const title = SIGNED_IN_LAYOUT.indexOf("{title}");
    const episode = SIGNED_IN_LAYOUT.indexOf("{episode}");

    expect(title).toBeGreaterThan(-1);
    expect(episode).toBeGreaterThan(-1);
    expect(title).toBeLessThan(episode);
  });

  /** `null`, not `notFound()`: *no modal* is the honest content of this slot on every
   *  route but one, and a 404 would be a lie about pages that are fine. */
  it("renders nothing when there is no modal", () => {
    expect(SLOT_DEFAULT).toMatch(/return null;/);
    expect(codeOf(SLOT_DEFAULT)).not.toMatch(/notFound/);
  });

  /**
   * **The dialog is the segment's layout.** Next wraps a segment's page, its `loading` and
   * its `error` in that segment's layout, so this is what puts the frame around all three.
   * In `page.tsx` instead, a read still in flight would show nothing at all and a read that
   * failed would drop a bare failure into the page's flow with no way out of it.
   */
  it("wraps every one of the segment's three renders in the dialog", () => {
    expect(SLOT_LAYOUT).toMatch(/<RouteModal label="Episode detail">\{children\}<\/RouteModal>/);
    expect(codeOf(SLOT_PAGE)).not.toMatch(/RouteModal/);
  });

  /**
   * **One read, two surfaces.** Both renders of the route go through the same component,
   * so the modal and the page cannot come to disagree about an episode — which is what
   * #253's *one cache entry* bought and what a second copy of the read would spend.
   */
  it("shows the same episode component the full page does", () => {
    expect(SLOT_PAGE).toMatch(/EpisodeDetailBody/);
    expect(FULL_PAGE).toMatch(/EpisodeDetailBody/);
    // And neither of the two reads anything itself.
    expect(codeOf(SLOT_PAGE)).not.toMatch(/cachedTitleDetail/);
    expect(codeOf(FULL_PAGE)).not.toMatch(/cachedTitleDetail/);
  });
});

describe("the two origins, and the one that is not", () => {
  const HREF = /\/library\/\$\{[^}]+\}\/episode\/\$\{[^}]+\}/;

  it("sends a rail card to the episode route without scrolling the page", () => {
    expect(RAIL_CARD).toMatch(HREF);
    expect(RAIL_CARD).toMatch(/scroll=\{false\}/);
  });

  it("sends a season row to the same route, also without scrolling", () => {
    expect(SEASON_ROWS).toMatch(HREF);
    expect(SEASON_ROWS).toMatch(/scroll=\{false\}/);
  });

  /**
   * **A film card is a destination.** #245's story 65, and #254's last criterion. A film
   * has no episodes at all, so there is no episode route it could reach and nothing for
   * the interception to match — this asserts that stays true rather than a film quietly
   * acquiring an episode href the day somebody generalises the two rails.
   */
  it("sends a film card to the title page, which no slot intercepts", () => {
    expect(FILM_RAIL).toMatch(/href=\{`\/library\/\$\{film\.libraryEntryId\}`\}/);
    expect(codeOf(FILM_RAIL)).not.toMatch(/\/episode\//);
  });
});

describe("the season row's check stays its own target", () => {
  /**
   * `SPEC.md`'s rule and #254's criterion: *marking never becomes an accidental
   * navigation.* The structural property is that the link **closes** before the trailing
   * slot opens — the check, *Watched up to here*, *Rewatch* and *Unwatch* are all siblings
   * of the link rather than children of it.
   *
   * Asserted on the order of three markers in the file rather than by parsing JSX, which
   * is the same instinct `tests/nav-transitions.test.ts` applies to the CSS: the failure
   * being guarded is a control moving *inside* the link, and that moves it across one of
   * these boundaries.
   */
  it("closes the link before the trailing slot opens", () => {
    const opens = SEASON_ROWS.indexOf("<Link");
    const closes = SEASON_ROWS.indexOf("</Link>");
    const trailing = SEASON_ROWS.indexOf("<span className={TRAILING}>");

    expect(opens).toBeGreaterThan(-1);
    expect(closes).toBeGreaterThan(opens);
    expect(trailing).toBeGreaterThan(closes);
  });

  /** And the `44px` box the criterion names is untouched — it is the recording control's
   *  own, shared with the rail card and the up-next row (`watch-mark-motion.tsx`). */
  it("keeps the recording control's own 44px hit box", () => {
    expect(SEASON_ROWS).toMatch(/RECORDING_HIT_BOX/);
    const control = readFileSync("app/(signed-in)/library/watch-mark-motion.tsx", "utf8");
    expect(control).toMatch(/RECORDING_HIT_BOX[\s\S]{0,400}?h-11/);
  });

  /**
   * The link is the full height of the row rather than the height of one line of text.
   * `EPISODE_ROW`'s `min-h-11` is the `44px`; `self-stretch` is what hands it to the link.
   */
  it("reaches the row's own padding for its height rather than stopping at the text", () => {
    // The measurement itself is in DESIGN.md §6 ("the fifth time"), taken in Chromium
    // against the compiled CSS: the link's box came back `44.00px`. What this guards is
    // the pair of utilities that buys it — `self-stretch` alone stops at the row's
    // `28px` content box, and the negative margin is the half that is easy to drop.
    expect(SEASON_ROWS).toMatch(/self-stretch/);
    expect(SEASON_ROWS).toMatch(/-my-2/);
  });
});

/**
 * ── The four findings the two-axis review turned up, each with its own guard ─────────
 *
 * Every one of these was a silent failure in the first draft of this ticket: the code
 * looked right, the build was green, and the suite above already passed. They are grouped
 * together rather than filed under the sections they belong to, so that the next person to
 * change this surface can see in one place what it has already got wrong once.
 */
describe("the four things the first draft got wrong", () => {
  /**
   * **A swipe was also a press.**
   *
   * A drag that starts on a control and travels still fires a click on release. On this
   * surface the controls under the thumb include *Previous*, *Next*, the mark control and
   * *Watched up to here* — so a thumb throwing the sheet away could also navigate, or
   * **record a watch**: a write nobody asked for, which is `SPEC.md` §3.3's territory
   * rather than a cosmetic slip. `landing-pager.tsx` already had this guard for
   * navigation alone; the modal is the surface that can lose a write to it.
   */
  it("swallows the click a committed drag would otherwise fire", () => {
    expect(MODAL).toMatch(/onClickCapture=\{onClickCapture\}/);
    expect(MODAL).toMatch(/dragged\.current = true/);
    expect(MODAL).toMatch(/event\.preventDefault\(\)/);
    // Keyed to the latch, so an ordinary tap is untouched — a guard that swallowed every
    // click would make the dialog's own controls inert, which is the opposite failure.
    expect(MODAL).toMatch(/if \(!dragged\.current\) return;/);
  });

  /**
   * **Back did not return focus.**
   *
   * The platform restores focus as a step of *close the dialog*, and Back runs none of it:
   * it changes the URL, the slot stops matching, and the component unmounts with the dialog
   * still open. Focus is left on `<body>`. #254 asks for focus to return to the opener, and
   * Back is one of the four dismissals it names, so three-quarters was not the criterion.
   */
  it("puts focus back on the opener when Back unmounts it mid-open", () => {
    expect(MODAL).toMatch(/const opener = document\.activeElement/);
    expect(MODAL).toMatch(/if \(dialog\?\.open && opener instanceof HTMLElement\) opener\.focus\(\)/);

    // Captured *before* `showModal()`, which moves focus into the dialog — after it, the
    // opener recorded would be the dialog's own first focusable and the restore would be
    // a no-op that looks like it works.
    const captured = MODAL.indexOf("const opener = document.activeElement");
    const opened = MODAL.indexOf("dialog?.showModal()");
    expect(captured).toBeGreaterThan(-1);
    expect(opened).toBeGreaterThan(captured);
  });

  /**
   * **`notFound()` in a slot took the whole application with it.**
   *
   * `episode-detail-body.tsx` answers a stale or hand-edited episode id with `notFound()`,
   * which is right — a read that succeeded and found nothing. But a slot with no
   * `not-found.tsx` sends that to the application's own not-found page, so pressing a row
   * with a stale id would **replace the library the reader was standing on** with a 404.
   * The boundary lives inside the segment's layout, so the dialog, its backdrop and its
   * four ways out are all still there around the miss.
   */
  it("draws a missing episode inside the dialog rather than over the application", () => {
    expect(SLOT_NOT_FOUND).toMatch(/export default function/);
    // Not the failure treatment: nothing went wrong, so there is no reference id and
    // nothing to retry. `AGENTS.md`'s first rule, from the other side.
    expect(codeOf(SLOT_NOT_FOUND)).not.toMatch(/ReadFailure/);
    expect(codeOf(SLOT_NOT_FOUND)).not.toMatch(/referenceFor/);
  });

  /**
   * **Previous and Next broke two criteria at once.**
   *
   * They are soft navigations to this same route, so they are intercepted like any other —
   * and left as plain links they would scroll the page behind the backdrop to the top
   * (losing *scroll position intact on return*) and push a history entry per episode
   * (after which Back steps backwards through a run instead of dismissing, so it stops
   * being one of the four exits).
   *
   * Both are conditional on `overlaid`, because both are *wrong* on the full page: there,
   * `scroll={false}` would leave a reader who pressed Next at the foot of a different
   * episode, and `replace` would make Back skip everything they had read.
   */
  it("steps the run without moving the page behind or stacking history", () => {
    expect(DETAIL_VIEW).toMatch(/scroll=\{!overlaid\}/);
    expect(DETAIL_VIEW).toMatch(/replace=\{overlaid\}/);
    // Both links, not one — the pair is symmetrical and half a fix is the easy mistake.
    expect(DETAIL_VIEW.match(/scroll=\{!overlaid\}/g)).toHaveLength(2);
    expect(DETAIL_VIEW.match(/replace=\{overlaid\}/g)).toHaveLength(2);
  });

  /**
   * And the flag is passed rather than detected, so which surface is which is visible at
   * both call sites. The page says nothing and gets the default; the slot says `overlaid`.
   */
  it("tells the shared body which surface it is on, at the call site", () => {
    expect(SLOT_PAGE).toMatch(/overlaid/);
    expect(codeOf(FULL_PAGE)).not.toMatch(/overlaid/);
    expect(BODY).toMatch(/overlaid = false/);
  });
});

describe("the close control wears the register the other two dialogs wear", () => {
  /**
   * `delete-list-dialog.tsx` and `mark-up-to-dialog.tsx` both give their quiet control
   * `GHOST_RECOVERY` — since #195 took the underline off all fourteen of the application's
   * text affordances. This is the third dialog and it follows them.
   *
   * `GHOST_RECOVERY_COMPACT` is the **episode row's** measure, chosen in #203 to fit
   * `TRAILING`'s fixed slot. There is no fixed slot here, and the first draft of this file
   * used it anyway — with a comment claiming, wrongly, that the other two dialogs did.
   */
  it("is GHOST_RECOVERY, not the episode row's compact measure", () => {
    expect(MODAL).toMatch(/GHOST_RECOVERY\b/);
    expect(codeOf(MODAL)).not.toMatch(/GHOST_RECOVERY_COMPACT/);
  });

  /**
   * And it clears the `44px` floor, which `GHOST_RECOVERY` on its own does not — a
   * `code-line` inside `py-2` is about `34px`. It is the one non-gesture way out of a modal
   * on a phone, so the height is added beside the register rather than by minting a third
   * button treatment. `selection-action-bar.tsx` is the precedent.
   */
  it("is at least 44px tall", () => {
    expect(MODAL).toMatch(/min-h-11/);
  });
});

describe("the swipe on a touch screen", () => {
  /**
   * **The pager's *set no `touch-action`* does not transfer, and this is why.**
   *
   * That file's argument holds because its axis is horizontal and nothing on its page pans
   * that way. Here the drag axis *is* the browser's own scroll axis, and the sheet's body
   * is `overflow-y-auto` — so a downward touch can be taken as a scroll gesture before the
   * pointer handlers see it and arrive as `pointercancel`, which springs back. `touch-none`
   * on the header strip takes the browser out of that decision for the part of a sheet a
   * reader actually reaches for, which is what the grabber is drawn to advertise.
   *
   * On the sheet itself it would be wrong — it would take the body's native scrolling with
   * it, which is the trap `landing-pager.tsx` records hitting with `pan-y`.
   */
  it("guarantees the gesture on the header without disabling the body's scroll", () => {
    expect(MODAL).toMatch(/touch-none/);

    // Read off the `className` strings themselves rather than the file, so the prose above
    // — which necessarily names both — cannot satisfy or break this. No single element may
    // carry both: the one that scrolls must not be the one that takes the browser out of
    // scrolling.
    const classNames = [...codeOf(MODAL).matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    expect(classNames.some((one) => one.includes("touch-none"))).toBe(true);
    expect(classNames.some((one) => one.includes("overflow-y-auto"))).toBe(true);
    expect(
      classNames.filter(
        (one) => one.includes("touch-none") && one.includes("overflow-y-auto"),
      ),
    ).toEqual([]);
  });
});
