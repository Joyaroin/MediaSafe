"use client";

import { useState, useSyncExternalStore } from "react";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { actionToasts } from "./action-toast-store";
import { type RaisedAction } from "./action-toast";

/**
 * The action toast — issue #307. Framed like the dialogs since issue #357 (a hairline, not
 * the accent — the accent is for the one main action and for watches). Once the same `border-2 border-accent bg-ground` treatment
 * `errors/write-failure-toast.tsx` draws for a lost write, spent here for the opposite
 * event: a watch that landed, with one press to take it back before the offer times out.
 *
 * ── Top of the viewport, not the write-failure toast's corner ───────────────────────────
 *
 * The write-failure toast is bottom-right on desktop and full-bleed above the tab bar on
 * phone, and it can be on screen at the same time as this one — an unrelated write can be
 * lost while a watch just recorded is still offering its undo. Two independent `fixed`
 * containers anchored to the same corner would paint on top of each other rather than
 * stacking, which `errors/write-failure-toast.tsx` only avoids for failures *of its own*
 * by holding them in one flex column. This is a different component by design (this
 * file's own docblock in `action-toast.ts` has why), so it takes the opposite edge instead
 * of trying to share the first component's list.
 *
 * `role="status"`, not `role="alert"`: this reports something that already succeeded,
 * where the write-failure toast's `alert` is the result of something that did not.
 *
 * ── It arrives and leaves instead of blinking now — issue #438 ──────────────────────────
 *
 * `useRetainedOffer` below is `errors/write-failure-toast.tsx`'s own
 * `useRetainedFailures`, narrowed from a list to the one offer this store ever holds: the
 * store's `offer` goes straight to `null` on a dismissal, undo or timeout, and React's own
 * unmount cannot be told to wait for `action-toast-transition`'s exit — so this keeps the
 * previous offer rendered, with `data-leaving="true"`, until its own `transitionend`
 * reports the exit is actually over. A second mark replacing the first is unaffected: the
 * store never passes through `null` to do that, so the node is reused and only its content
 * changes, exactly as it already did.
 */
function useRetainedOffer(current: RaisedAction | null): {
  readonly retained: RaisedAction | null;
  readonly leaving: boolean;
  readonly settle: () => void;
} {
  const [retained, setRetained] = useState(current);
  // React's own "adjust state during rendering" shape, not an effect — the same reason
  // `useRetainedFailures` gives: a render that sees `current` turn non-null is the one
  // chance to capture it before a later render (or this same one, a tick later) might see
  // it already gone.
  if (current !== null && current !== retained) {
    setRetained(current);
  }

  return {
    retained,
    leaving: current === null && retained !== null,
    settle: () => setRetained(null),
  };
}

export function ActionToasts() {
  const state = useSyncExternalStore(
    actionToasts.subscribe,
    actionToasts.get,
    actionToasts.get,
  );
  const { retained: offer, leaving, settle } = useRetainedOffer(state.offer);

  if (offer === null) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4 lg:inset-x-auto lg:right-6 lg:top-6 lg:justify-end lg:px-0">
      <div
        role="status"
        data-leaving={leaving ? "true" : undefined}
        // `opacity` and `transform` finish together, off the same duration — gating on one
        // property name is what keeps `settle` from firing twice for the one exit, the
        // same guard `write-failure-toast.tsx`'s `onLeft` uses.
        onTransitionEnd={(event) => {
          if (leaving && event.target === event.currentTarget && event.propertyName === "opacity") {
            settle();
          }
        }}
        // `pointer-events-none` while leaving — issue #438's fix for a regression its own
        // retain-for-the-exit kept on screen: before this diff the node unmounted the
        // moment the store dropped the offer, so a second press had nothing left to land
        // on. Now the node (and its live Undo button) sits through the whole 140ms exit,
        // so without this a second press inside that window fires `offer.undo()` again —
        // `db/access.ts`'s `undoWatch` has no way to tell that apart from an intentional
        // second undo, and deletes a second watch silently.
        className={`action-toast-transition ${leaving ? "pointer-events-none" : "pointer-events-auto"} w-full rounded-[var(--radius-5)] border border-hair bg-ground p-4 shadow-[0_16px_40px_rgb(0_0_0/0.25)] lg:w-[420px]`}
      >
        {/* Named in full, both of them, the same restraint `write-failure-toast.tsx` keeps
            for the same reason: episodes have real names, and a sentence with
            one folded into it collides with its own punctuation. */}
        <p className="text-item text-text">{offer.title}</p>
        {offer.episode ? <p className="text-item text-dim">{offer.episode}</p> : null}

        <p className="mt-3 text-note leading-relaxed text-text">{offer.message ?? "Watched."}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              actionToasts.dismiss(offer.id);
              offer.undo();
            }}
            className={GHOST_RECOVERY}
          >
            Undo
          </button>

          {offer.also === undefined ? null : (
            <button
              type="button"
              onClick={() => {
                actionToasts.dismiss(offer.id);
                offer.also?.run();
              }}
              className={GHOST_RECOVERY}
            >
              {offer.also.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
