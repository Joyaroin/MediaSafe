"use client";

import { useEffect, useState } from "react";

/**
 * Has this screen's one arrival stagger already played? — issue #430.
 *
 * `@utility stagger-rise` (`app/globals.css`) is an *arrival* motion: a list rising into
 * place the moment a screen is first painted. It was, until this ticket, replayed by
 * anything that made the container's children re-render — a Library filter chip, a sort,
 * one result set swapping for another — because the CSS rule has no memory of its own: it
 * reruns `rise-in` on every child every time, and a container does not know whether this
 * is the screen's first paint or its fortieth re-render.
 *
 * `useArrivedOnce()` is that memory. A `stagger-rise` container reads it and carries the
 * answer as `data-arrived="true"` once it is `true`; the stylesheet rule beside
 * `@utility stagger-rise` stops `rise-in` for an arrived container's children, so the
 * posters a reader is already looking at do not vanish and climb back in when the chip
 * they are filtered by changes.
 *
 * ── The pure half and the binding ────────────────────────────────────────────────────
 *
 * The clock this answers from — one timer, armed once, that flips from `false` to `true`
 * and never back — is `createArrivalWatch` below, and it knows nothing about React: the
 * same split `app/gesture-rules.ts` and `app/restoration.ts` already make, kept here for
 * the same reason they give. `vitest.config.mts` runs in `node` with no DOM and no React
 * renderer, so the watch is what `tests/use-arrived-once.test.ts` drives directly with
 * fake timers; the hook itself is the thin, untested-in-isolation wiring onto `useState`,
 * trusted through `tests/e2e/stagger-once.spec.ts` instead.
 */

/**
 * The 9-row stagger's own full length: eight steps of `--stagger-step` (20ms) before the
 * ninth and last running child's own `--dur-base` (220ms) run finishes —
 * `8 * 20ms + 220ms = 380ms`, the exact arithmetic `app/globals.css`'s `@utility
 * stagger-rise` comment carries and `tests/stagger-on-the-ramp.test.ts` holds the
 * stylesheet to (issue #429). Kept as this ticket's own literal rather than read out of
 * the stylesheet at runtime: one more CSS/JS bridge for a single constant is the second
 * spelling `app/motion.ts` warns against, not a fix for it. A container mounted with
 * fewer than nine rows still waits the same `ARRIVAL_STAGGER_MS` — correct, if a hair
 * conservative, and far simpler than counting children to find the actual last one.
 */
export const ARRIVAL_STAGGER_MS = 380;

/**
 * A one-shot watch: `arrived` is `false` until `afterMs` have passed since `start()` was
 * called, then `true` for the rest of this watch's life. Knows nothing about a screen, a
 * container or React — it is a clock with one alarm.
 *
 * `start()` arms the watch's timer. Calling it again while that timer is running, or once
 * `arrived` is already `true`, does nothing: there is only ever one arrival to watch for,
 * and rearming a finished one would be exactly the replayed stagger this ticket removes.
 * It returns the cancellation for an unmount before the wait is over, which clears the
 * timer without flipping `arrived` **and disarms the watch**, so a later `start()` arms it
 * afresh. React Strict Mode runs every effect, cleans it up and runs it again on mount;
 * a cancellation that left the watch armed would make that second `start()` a no-op, and
 * the screen would never count as arrived in development.
 */
export interface ArrivalWatch {
  readonly arrived: boolean;
  subscribe(onChange: () => void): () => void;
  start(): () => void;
}

export function createArrivalWatch(afterMs: number = ARRIVAL_STAGGER_MS): ArrivalWatch {
  let arrived = false;
  let started = false;
  const listeners = new Set<() => void>();

  return {
    get arrived() {
      return arrived;
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    start() {
      if (started || arrived) return () => {};
      started = true;
      const timer = setTimeout(() => {
        arrived = true;
        for (const listener of listeners) listener();
      }, afterMs);
      return () => {
        clearTimeout(timer);
        started = false;
      };
    },
  };
}

/**
 * `false` on this screen's first render, `true` once the arrival stagger has had time to
 * finish (`ARRIVAL_STAGGER_MS` after this mount), and `true` for the rest of that mount —
 * it never flips back. One watch per mount, via `useState`'s lazy initialiser: a component
 * that re-renders while its own watch is still waiting goes on sharing it, rather than
 * every render arming a fresh `ARRIVAL_STAGGER_MS` wait that `arrived` would never survive
 * long enough to end.
 */
export function useArrivedOnce(): boolean {
  const [watch] = useState(() => createArrivalWatch());
  const [arrived, setArrived] = useState(watch.arrived);

  useEffect(() => {
    const unsubscribe = watch.subscribe(() => setArrived(watch.arrived));
    const cancel = watch.start();
    return () => {
      unsubscribe();
      cancel();
    };
  }, [watch]);

  return arrived;
}
