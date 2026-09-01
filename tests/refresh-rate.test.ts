import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The two costs that scale with the display's refresh rate.
 *
 * Nothing in this app is pinned to 60fps and nothing needs to opt into 120: the browser
 * drives animation at whatever rate the screen runs, every keyframe here animates
 * `opacity` or `transform`, and the springs in `app/motion.ts` are described by a duration
 * and a bounce rather than a step count, so they interpolate correctly at any rate. There
 * is no frame budget written down anywhere and no `requestAnimationFrame` loop to get
 * wrong.
 *
 * What *does* scale with refresh rate is per-frame work, and two places were doing it.
 * Both fail **silently** — the app keeps working, it just spends twice the main thread on
 * a 120Hz screen as on the 60Hz one it was written on, and nothing on screen says so:
 *
 *  1. **The rail re-rendered on every scroll event.** `reachOf` mints a fresh object, so
 *     handing it straight to `setReach` re-rendered twelve tiles and two arrows for two
 *     booleans that only change at the two ends of the track. Scroll events arrive about
 *     once per displayed frame, so the waste is proportional to the refresh rate — during
 *     the one interaction where the main thread can least spare it.
 *  2. **The phone sheet's scrim animated its own `backdrop-filter`.** `DESIGN.md` §5: a
 *     backdrop filter repaints everything behind it, on every frame it is composited over
 *     moving content. A full-viewport blur whose opacity is animating is the worst case
 *     for that rule, and §5 draws the line it was on the wrong side of — *glass is chrome
 *     only*, and a scrim is not chrome.
 *
 * Neither is caught by anything else. A later diff undoing either leaves every test green
 * and the app visibly identical.
 *
 * ── Why this reads source ─────────────────────────────────────────────────────────────
 *
 * The same constraint `tests/phone-groups-scroll.test.ts` documents — these components
 * import React's `ViewTransition`, which the installed React 19.2.8 does not export — plus
 * a second one that would apply anyway: "did not re-render" is not a thing to assert on
 * rendered markup without testing implementation, which this repository's tests decline to
 * do.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const EPISODE_CARD = "app/(signed-in)/up-next/up-next-episode-card.tsx";
const GLOBALS = "app/globals.css";

/**
 * **The rail is gone, and so is the work this block guarded.**
 *
 * Cause 1 below was `up-next-rail.tsx`'s scroll handler, and Up next's rails are vertical
 * lists now (`up-next-group.tsx`). A list has no reach to measure, no arrows to re-render
 * and no `ResizeObserver`: the page scrolls it, and the browser does that work whether
 * this application is watching or not. There is nothing left to hold to a guard, which is
 * a stronger outcome than the guard was — the per-frame work was not made cheaper, it was
 * deleted.
 *
 * The cause is left written up above rather than struck out, because it is the reason the
 * *other* two blocks in this file exist and the shape it describes is the one a future
 * scroll handler would reintroduce. `RailSection`'s surviving callers — Upcoming, and the
 * library's lists rail — never had a reach measurement; they scroll freely and draw no
 * arrows.
 */

describe("nothing animates a backdrop filter", () => {
  /**
   * **The case moved with the surface.** It used to name `title-sheet.tsx`'s scrim, whose
   * opacity animated across the whole viewport; #250 deleted that file along with the five
   * vertical groups that were its only callers.
   *
   * The episode card is where the rule now bites. `watch-sweep` animates `opacity` and
   * `transform` over the card it marks (`globals.css`), so a frosted card would be a
   * backdrop filter repainted at every step of that animation — the identical cost on a
   * smaller box, and one that repeats per card on a rail.
   */
  it("keeps the episode card, which the sweep animates over, unfrosted", () => {
    expect(sourceAt(EPISODE_CARD)).not.toMatch(/backdrop-blur/);
  });

  /**
   * **There is deliberately no assertion here that the chrome keeps its frosting.**
   *
   * There was one, for a day, and it was wrong: it pinned `masthead.tsx` and
   * `tab-bar.tsx` to `backdrop-blur-[2px]` as a way of saying *this ticket is about
   * animated blur, not about deleting §5's blur radius*. Turn 9 then reframed both pieces
   * of chrome onto the `frosted` utility at a different value, and the assertion failed —
   * not because anything regressed, but because a test about **per-frame cost** had
   * quietly taken a position on **what the chrome looks like**, which belongs to whoever
   * is drawing the chrome.
   *
   * The invariant this file owns is narrower and is the one above: nothing whose own
   * opacity is animating may carry a backdrop filter. What static chrome is frosted, and
   * how heavily, is §5's business and not this file's.
   */
});

describe("every animation stays on the compositor", () => {
  const css = sourceAt(GLOBALS);

  it("animates nothing that forces layout", () => {
    // A keyframe touching width, height, top, left or margin cannot be composited, so it
    // misses frames at any refresh rate and misses twice as many at 120Hz.
    const keyframeBodies = css.match(/@keyframes[^}]*\{[\s\S]*?\n\}/g) ?? [];
    expect(keyframeBodies.length).toBeGreaterThan(0);
    for (const body of keyframeBodies) {
      expect(body).not.toMatch(/^\s*(width|height|top|left|right|bottom|margin)\s*:/m);
    }
  });

  it("declares its durations in time, not in frames", () => {
    // Time-based durations interpolate correctly at any refresh rate. A step count would
    // run at half speed on a 120Hz screen.
    expect(css).toMatch(/--dur-fast:\s*\d+ms/);
    expect(css).toMatch(/--dur-base:\s*\d+ms/);
    expect(css).toMatch(/--dur-slow:\s*\d+ms/);
    expect(css).not.toMatch(/steps\(/);
  });
});
