import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  NO_ACTION_TOAST,
  dismissAction,
  raiseAction,
  type ActionToastState,
} from "@/app/(signed-in)/library/action-toast";
import { actionToasts } from "@/app/(signed-in)/library/action-toast-store";
import { ActionToasts } from "@/app/(signed-in)/library/action-toast-toasts";

/**
 * The action toast's lifecycle rule, driven directly — issue #307's *a pure module holds
 * the toast's lifecycle rule and is tested in node with no DOM and no clock*.
 *
 * `vitest.config.mts` runs in `node`, so there is no timer here and there is not meant to
 * be. `errors/write-failure.ts`'s docblock is the reason: a rule that reads a clock is a
 * rule a fake-timer test can get right for the wrong reason. Everything below asserts the
 * one property a clock cannot stand in for — that a dismissal only ever speaks for the
 * offer it names — which is exactly what makes the real store's `setTimeout` safe to leave
 * untested: the guard it depends on lives here, in plain values.
 */

const UNDO_SEVERANCE = () => {};
const UNDO_FARGO = () => {};

describe("raising an offer", () => {
  it("shows the offer that was raised", () => {
    const state = raiseAction("a1", { title: "Severance", undo: UNDO_SEVERANCE });
    expect(state.offer?.title).toBe("Severance");
    expect(state.offer?.id).toBe("a1");
  });

  it("carries the episode when there is one", () => {
    const state = raiseAction("a1", {
      title: "Severance",
      episode: "Season 2, Episode 4 — Woe's Hollow",
      undo: UNDO_SEVERANCE,
    });
    expect(state.offer?.episode).toBe("Season 2, Episode 4 — Woe's Hollow");
  });

  /** A film's watch names no episode — `LostWrite.episode`'s own optionality, restated
   *  here rather than defaulted to an empty string a toast would have to hide. */
  it("leaves the episode out for a film", () => {
    const state = raiseAction("a1", { title: "The Worst Person in the World", undo: UNDO_SEVERANCE });
    expect(state.offer?.episode).toBeUndefined();
  });

  it("hands back the undo it was given, unchanged", () => {
    const state = raiseAction("a1", { title: "Severance", undo: UNDO_SEVERANCE });
    expect(state.offer?.undo).toBe(UNDO_SEVERANCE);
  });
});

describe("a dismissal only ever speaks for the offer it names", () => {
  it("clears the offer it names", () => {
    const raised = raiseAction("a1", { title: "Severance", undo: UNDO_SEVERANCE });
    expect(dismissAction(raised, "a1")).toEqual(NO_ACTION_TOAST);
  });

  /**
   * The property a clock cannot stand in for. `action-toast-store.ts` schedules a real
   * `setTimeout` per raise and never cancels the previous one by hand — it cannot, once a
   * second mark has replaced the first — so the first offer's timer is still going to fire
   * `dismissAction` with the *first* id, after the state it names is long gone. This is
   * that timer arriving late, without a clock in sight: a second offer, raised straight
   * from a state a first offer never touches, and a dismissal that still carries the
   * first's id.
   */
  it("leaves a newer offer standing against an older offer's id", () => {
    const first = raiseAction("a1", { title: "Severance", undo: UNDO_SEVERANCE });
    const second = raiseAction("a2", { title: "Fargo", undo: UNDO_FARGO });

    const afterStaleDismissal = dismissAction(second, first.offer!.id);

    expect(afterStaleDismissal).toBe(second);
    expect(afterStaleDismissal.offer?.title).toBe("Fargo");
  });

  it("ignores a dismissal once nothing is showing", () => {
    expect(dismissAction(NO_ACTION_TOAST, "a1")).toBe(NO_ACTION_TOAST);
  });
});

describe("the resting state", () => {
  it("shows nothing", () => {
    const state: ActionToastState = NO_ACTION_TOAST;
    expect(state.offer).toBeNull();
  });
});

describe("a second action — issue #357", () => {
  /**
   * Marking one episode with unwatched episodes before it offers to mark those too, on the
   * same toast, instead of a separate *mark up to* control on every row.
   */
  it("hands back the second action it was given, unchanged", () => {
    const run = () => {};
    const state = raiseAction("a", {
      title: "Severance",
      episode: "Season 2, Episode 4",
      undo: () => {},
      also: { label: "Also mark 3 earlier", run },
    });

    expect(state.offer?.also).toEqual({ label: "Also mark 3 earlier", run });
  });

  it("draws the second action beside Undo, and only when there is one", () => {
    actionToasts.raise({
      title: "Severance",
      undo: () => {},
      also: { label: "Also mark 3 earlier", run: () => {} },
    });
    const withAlso = renderToStaticMarkup(createElement(ActionToasts));

    expect(withAlso).toContain(">Undo<");
    expect(withAlso).toContain(">Also mark 3 earlier<");

    actionToasts.raise({ title: "Severance", undo: () => {} });
    const without = renderToStaticMarkup(createElement(ActionToasts));

    expect(without).toContain(">Undo<");
    expect(without).not.toContain("Also mark");
  });
});

describe("what the toast says — issue #357", () => {
  it("says Watched unless the write says something else", () => {
    actionToasts.raise({ title: "Severance", undo: () => {} });
    expect(renderToStaticMarkup(createElement(ActionToasts))).toContain(">Watched.<");

    actionToasts.raise({ title: "Severance", message: "Taken off Comfort shows.", undo: () => {} });
    const markup = renderToStaticMarkup(createElement(ActionToasts));
    expect(markup).toContain(">Taken off Comfort shows.<");
    expect(markup).not.toContain("Watched.");
  });
});

/**
 * ── It arrives and leaves instead of blinking — issue #438 ──────────────────────────────
 *
 * The toast reuses `errors/write-failure-toast.tsx`'s own mechanism rather than a new one:
 * `action-toast-transition` (`app/globals.css`) mirrors `write-failure-toast-transition` —
 * an entrance via `@starting-style` and a held `data-leaving="true"` state for the exit —
 * sharing its two existing durations and two existing easing curves rather than declaring
 * either from scratch. The browser half of this — the transform and opacity actually
 * changing on arrival and again on the way out — is `tests/e2e/action-toast-motion.spec.ts`;
 * this is the static half: that the rule computes to the values the ticket names, and that
 * the component wires the class and the attribute `write-failure-toast.tsx` does.
 */

const GLOBALS = readFileSync("app/globals.css", "utf8");
const GLOBALS_CODE = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
const ACTION_TOAST_TOASTS_SOURCE = readFileSync(
  "app/(signed-in)/library/action-toast-toasts.tsx",
  "utf8",
);

/** The body of `@utility name { … }` or of a plain rule, up to its closing brace — the
 *  same brace-balanced read `tests/motion-moments.test.ts` uses, since a bare
 *  `match(/\{[^}]*\}/)` cannot survive a rule with a nested `@starting-style` inside it. */
function cssBlock(selector: string): string {
  const start = GLOBALS_CODE.indexOf(selector);
  expect(start, `${selector} is declared`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = GLOBALS_CODE.indexOf("{", start); index < GLOBALS_CODE.length; index += 1) {
    if (GLOBALS_CODE[index] === "{") depth += 1;
    if (GLOBALS_CODE[index] === "}") depth -= 1;
    if (depth === 0) return GLOBALS_CODE.slice(start, index + 1);
  }
  throw new Error(`${selector} never closes`);
}

describe("the toast carries action-toast-transition (issue #438)", () => {
  it("wires the toast's own element to the class, with data-leaving held through its exit", () => {
    expect(ACTION_TOAST_TOASTS_SOURCE).toContain("action-toast-transition");
    expect(ACTION_TOAST_TOASTS_SOURCE).toMatch(/data-leaving=\{.*\?\s*"true"/);
  });

  it("does not reach for the arrival stagger or the region-entrance keyframe instead", () => {
    expect(ACTION_TOAST_TOASTS_SOURCE).not.toMatch(/\brise-in\b/);
    expect(ACTION_TOAST_TOASTS_SOURCE).not.toMatch(/\bstagger-rise\b/);
    expect(ACTION_TOAST_TOASTS_SOURCE).not.toMatch(/(^|[^-])\barrive(-panel)?\b/);
  });
});

describe("the entrance — 8px above, with a fade, via @starting-style (issue #438)", () => {
  it("rests at its landed position and opacity, transitioning in on --dur-slow and the arrival curve", () => {
    const body = cssBlock("@utility action-toast-transition");
    expect(body).toContain("opacity: 1;");
    expect(body).toContain("transform: none;");
    expect(body).toMatch(/opacity\s+var\(--dur-slow\)\s+var\(--ease-press\)/);
    expect(body).toMatch(/transform\s+var\(--dur-slow\)\s+var\(--ease-press\)/);
  });

  it("starts 8px above, faded out", () => {
    const starting = GLOBALS_CODE.match(
      /@starting-style\s*\{\s*\.action-toast-transition\s*\{([^}]*)\}/,
    );
    expect(starting, "a @starting-style block for .action-toast-transition").not.toBeNull();
    const body = starting![1];
    expect(body).toContain("opacity: 0;");
    expect(body).toMatch(/transform:\s*translateY\(-8px\);/);
  });

  it("declares no raw millisecond or second literal of its own", () => {
    const body = cssBlock("@utility action-toast-transition");
    expect(body.replace(/var\([^)]*\)/g, "")).not.toMatch(/\b\d+(\.\d+)?m?s\b/);
  });
});

describe("the exit — data-leaving, held through --dur-fast (issue #438)", () => {
  it("fades and moves back out on --dur-fast and the leave curve", () => {
    const body = cssBlock('.action-toast-transition[data-leaving="true"]');
    expect(body).toContain("opacity: 0;");
    expect(body).toMatch(/transform:\s*translateY\(-8px\);/);
    expect(body).toMatch(/opacity\s+var\(--dur-fast\)\s+var\(--ease-out-quart\)/);
    expect(body).toMatch(/transform\s+var\(--dur-fast\)\s+var\(--ease-out-quart\)/);
  });
});

/** The one `@media (prefers-reduced-motion: reduce)` block that already names
 *  `write-failure-toast-transition` — `globals.css` carries several of these scoped to the
 *  section above them, so a bare first-match would silently grab an unrelated one
 *  (`.poster-glow`'s, earlier in the file). The ticket's own instruction is to mirror the
 *  write-failure toast's rule, which means landing in *this* block, not a new one. */
function reducedMotionBlockContaining(needle: string): string {
  const needleIndex = GLOBALS_CODE.indexOf(needle);
  expect(needleIndex, `${needle} is declared`).toBeGreaterThanOrEqual(0);
  const mediaStart = GLOBALS_CODE.lastIndexOf(
    "@media (prefers-reduced-motion: reduce)",
    needleIndex,
  );
  expect(mediaStart, `an enclosing reduced-motion block for ${needle}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = GLOBALS_CODE.indexOf("{", mediaStart); index < GLOBALS_CODE.length; index += 1) {
    if (GLOBALS_CODE[index] === "{") depth += 1;
    if (GLOBALS_CODE[index] === "}") depth -= 1;
    if (depth === 0) return GLOBALS_CODE.slice(mediaStart, index + 1);
  }
  throw new Error(`${needle}'s reduced-motion block never closes`);
}

describe("reduced motion drops the movement, keeps the opacity change (issue #438)", () => {
  it("joins write-failure-toast-transition's own reduced-motion block rather than a new one", () => {
    const reducedMotion = reducedMotionBlockContaining(".write-failure-toast-transition,");
    expect(reducedMotion).toContain(".action-toast-transition,");
    expect(reducedMotion).toContain('.action-toast-transition[data-leaving="true"]');
    // Transform drops to none for both the resting and the leaving rule — opacity is left
    // untouched by this block, which is what keeps the fade while the travel goes.
    expect(reducedMotion).toMatch(/\.action-toast-transition,[\s\S]*?transform:\s*none;/);
  });

  it("keeps the opacity fade on the starting style under reduced motion too", () => {
    const reducedMotion = reducedMotionBlockContaining(".write-failure-toast-transition,");
    expect(reducedMotion).toMatch(
      /@starting-style\s*\{[\s\S]*?\.action-toast-transition\s*\{\s*transform:\s*none;/,
    );
  });
});
