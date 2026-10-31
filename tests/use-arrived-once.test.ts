import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARRIVAL_STAGGER_MS, createArrivalWatch } from "@/app/use-arrived-once";

/**
 * Issue #430 — the stagger plays once per arrival of a screen, not once per render of
 * whatever rows currently fill a `stagger-rise` container.
 *
 * `useArrivedOnce()` itself is a thin `"use client"` binding over `createArrivalWatch`
 * (`app/use-arrived-once.ts`'s own doc explains the split, the same one
 * `app/gesture-rules.ts` and `app/restoration.ts` already make): `vitest.config.mts` runs
 * in `node`, with no DOM and no React renderer, so there is nothing here that can mount
 * the hook. What is driven directly is the pure watch the hook wraps — one timer, armed
 * once, that flips from `false` to `true` and never back — and the stylesheet rule the
 * hook's answer is read by.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the 9-row stagger's own length", () => {
  it("is 380ms — the same arithmetic tests/stagger-on-the-ramp.test.ts holds the stylesheet to", () => {
    expect(ARRIVAL_STAGGER_MS).toBe(380);
  });
});

describe("createArrivalWatch — the false → true transition useArrivedOnce binds to a mount", () => {
  it("starts false, before start() is ever called", () => {
    expect(createArrivalWatch().arrived).toBe(false);
  });

  it("stays false right up to one millisecond short of the full length", () => {
    const watch = createArrivalWatch();
    watch.start();
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS - 1);
    expect(watch.arrived).toBe(false);
  });

  it("flips to true the instant the full length has passed, and notifies a subscriber", () => {
    const watch = createArrivalWatch();
    const onChange = vi.fn();
    watch.subscribe(onChange);

    watch.start();
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS);

    expect(watch.arrived).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("never flips back, no matter how much more time passes", () => {
    const watch = createArrivalWatch();
    watch.start();
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS);
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS * 100);
    expect(watch.arrived).toBe(true);
  });

  it("does not rearm, or notify a second time, if start() is called again once arrived", () => {
    const watch = createArrivalWatch();
    const onChange = vi.fn();
    watch.subscribe(onChange);

    watch.start();
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS);
    watch.start();
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("cancelling before the full length has passed leaves it false for ever", () => {
    const watch = createArrivalWatch();
    const cancel = watch.start();
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS - 1);
    cancel();
    vi.advanceTimersByTime(ARRIVAL_STAGGER_MS * 100);
    expect(watch.arrived).toBe(false);
  });

  it("honours a custom length, for a caller whose own wait differs from the default", () => {
    const watch = createArrivalWatch(100);
    watch.start();
    vi.advanceTimersByTime(99);
    expect(watch.arrived).toBe(false);
    vi.advanceTimersByTime(1);
    expect(watch.arrived).toBe(true);
  });
});

describe("the stylesheet rule the hook's answer is read by", () => {
  const CSS = readFileSync("app/globals.css", "utf8");
  const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));

  it("stops rise-in for the children of an arrived stagger-rise container", () => {
    const match = CSS_CODE.match(
      /\.stagger-rise\[data-arrived="true"\]\s*>\s*\*\s*\{\s*animation:\s*none;\s*\}/,
    );
    expect(match, "globals.css must stop rise-in once a container has arrived").not.toBeNull();
  });

  it("is unlayered, like the hold-to-select attribute rules it sits beside", () => {
    // Not inside an `@utility` block — `@utility stagger-rise` is in the `utilities`
    // cascade layer, and only a rule outside every layer can out-rank it regardless of
    // specificity, the same reason `.pressable[data-holding="true"]` is written this way.
    const utilityBlock = CSS_CODE.match(/@utility stagger-rise \{[\s\S]*?\n\}/)![0];
    expect(utilityBlock).not.toMatch(/data-arrived/);
  });

  it("explains, beside the rule, that the stagger is an arrival motion", () => {
    const commentBeforeRule = CSS.slice(
      0,
      CSS.indexOf('.stagger-rise[data-arrived="true"]'),
    ).slice(-2000);
    expect(commentBeforeRule).toMatch(/arrival/i);
    expect(commentBeforeRule).toMatch(/#430/);
  });
});
