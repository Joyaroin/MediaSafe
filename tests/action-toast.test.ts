import { describe, expect, it } from "vitest";

import {
  NO_ACTION_TOAST,
  dismissAction,
  raiseAction,
  type ActionToastState,
} from "@/app/(signed-in)/library/action-toast";

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
