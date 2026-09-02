"use client";

import {
  NO_ACTION_TOAST,
  dismissAction,
  raiseAction,
  type ActionOffer,
  type ActionToastState,
} from "./action-toast";

/**
 * The action toast's own timer, and its one singleton — `action-toast.ts`'s docblock has
 * the rule this is built from.
 *
 * `"use client"` for the reason `errors/write-failure.ts` states for itself: this is one
 * module-level object, and module state on the server is shared by every request and so by
 * every account. `watch-marks.ts` — already a client module, already the one place a watch
 * is recorded — is this store's one caller.
 */

/**
 * How long the offer stands before it dismisses itself. Long enough to read a title and an
 * episode and decide, short enough that a reader who meant the press does not go on looking
 * at a notice about it. Not a token in the duration ramp `DESIGN.md` §9 names for the
 * route-pending delay: that ramp is for motion timed against a repaint, and this is a
 * reading window, the same kind of number `errors/connectivity.ts` and other plain
 * `setTimeout` durations in this codebase already carry as a literal.
 */
export const ACTION_TOAST_DURATION_MS = 6000;

export interface ActionToastStore {
  raise(offer: ActionOffer): void;
  /** The reader's own dismissal, or the toast taking itself down after `undo` is pressed.
   *  Unknown or superseded ids are ignored rather than throwing — `action-toast.ts`'s
   *  `dismissAction`. */
  dismiss(id: string): void;
  subscribe(onChange: () => void): () => void;
  get(): ActionToastState;
}

export function createActionToastStore(): ActionToastStore {
  let state: ActionToastState = NO_ACTION_TOAST;
  const listeners = new Set<() => void>();
  let counter = 0;
  /** The one outstanding timer, if any. Cleared on every raise and every dismissal so a
   *  superseded or already-dismissed offer never doubles up its own teardown — the timer
   *  firing late is exactly what `dismissAction`'s id guard is for, and this is the other
   *  half: not relying on that guard where clearing costs nothing. */
  let timer: ReturnType<typeof setTimeout> | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function clearTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function dismiss(id: string): void {
    const next = dismissAction(state, id);
    if (next === state) return;
    clearTimer();
    state = next;
    notify();
  }

  return {
    raise(offer) {
      clearTimer();
      // A counter rather than a random id: two offers raised in the same millisecond still
      // differ, and it is what `errors/write-failure.ts`'s own store already does.
      const id = `action-toast-${(counter += 1)}`;
      state = raiseAction(id, offer);
      notify();
      timer = setTimeout(() => dismiss(id), ACTION_TOAST_DURATION_MS);
    },

    dismiss,

    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    get() {
      return state;
    },
  };
}

/** The app's one store, over the one write that raises it — `watch-marks.ts`'s `mark`. */
export const actionToasts = createActionToastStore();
