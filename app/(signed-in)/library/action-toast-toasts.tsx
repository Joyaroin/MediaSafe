"use client";

import { useState, useSyncExternalStore } from "react";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import type { RaisedAction } from "./action-toast";
import { actionToasts } from "./action-toast-store";

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
 * ── It arrives and leaves rather than blinking — issue #472 ─────────────────────────────
 *
 * `action-toast-store.ts` holds at most one offer, replaced unconditionally on every
 * raise — never an intermediate `null` between an old offer and a new one. That is the
 * right rule for *what is current*, and the wrong shape for *what is on screen*: without
 * something here to hold the outgoing offer a moment longer, a second mark would swap
 * the DOM node's content out from under its own exit, and a dismissal (Undo, the
 * reader's own, or the six-second timer) would unmount it before `action-toast-transition`
 * (`app/globals.css`) ever got to run. `useRetainedOffer` below is that something — the
 * same split `errors/write-failure-toast.tsx`'s `useRetainedFailures` makes for the
 * write-failure toast, narrowed to one offer at a time rather than a list, because this
 * store only ever has one current offer to retain against.
 *
 * The two toasts a replacement briefly holds — the leaving one and the arriving one —
 * sit in the same CSS grid cell (`col-start-1 row-start-1`) rather than stacking in flow,
 * so the arriving toast appears exactly where the leaving one is still fading out of,
 * instead of pushing it aside.
 */
function useRetainedOffer(
  current: RaisedAction | null,
): {
  readonly retained: readonly RaisedAction[];
  readonly isLeaving: (id: string) => boolean;
  readonly settle: (id: string) => void;
} {
  const [retained, setRetained] = useState<readonly RaisedAction[]>(
    current === null ? [] : [current],
  );
  // Adjusted during rendering rather than in an effect, for the reason
  // `useRetainedFailures` gives for itself: an offer that both arrives and is dismissed
  // inside one tick still gets one render with it present, instead of an effect running
  // one paint late.
  const [previousCurrent, setPreviousCurrent] = useState(current);

  if (current !== previousCurrent) {
    setPreviousCurrent(current);
    const alreadyRetained = retained.some((offer) => offer.id === current?.id);
    if (current !== null && !alreadyRetained) {
      setRetained((previous) => [...previous, current]);
    }
  }

  const currentId = current?.id ?? null;

  return {
    retained,
    isLeaving: (id) => id !== currentId,
    settle: (id) => setRetained((previous) => previous.filter((offer) => offer.id !== id)),
  };
}

export function ActionToasts() {
  const state = useSyncExternalStore(
    actionToasts.subscribe,
    actionToasts.get,
    actionToasts.get,
  );
  const { retained, isLeaving, settle } = useRetainedOffer(state.offer);

  if (retained.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4 lg:inset-x-auto lg:right-6 lg:top-6 lg:justify-end lg:px-0">
      <div className="grid w-full lg:w-[420px]">
        {retained.map((offer) => (
          <ActionToast
            key={offer.id}
            offer={offer}
            leaving={isLeaving(offer.id)}
            onLeft={() => settle(offer.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ActionToast({
  offer,
  leaving,
  onLeft,
}: {
  readonly offer: RaisedAction;
  readonly leaving: boolean;
  /** The exit transition finished; this offer's own node can go now. */
  readonly onLeft: () => void;
}) {
  return (
    <div
      role="status"
      data-leaving={leaving ? "true" : undefined}
      // `opacity` and `transform` finish together, off the same duration — gating on one
      // property name is what keeps `onLeft` from firing twice for the one exit, exactly
      // as `errors/write-failure-toast.tsx`'s own `WriteFailureToast` does.
      onTransitionEnd={(event) => {
        if (leaving && event.target === event.currentTarget && event.propertyName === "opacity") {
          onLeft();
        }
      }}
      className="action-toast-transition pointer-events-auto col-start-1 row-start-1 w-full rounded-[var(--radius-5)] border border-hair bg-ground p-4 shadow-[0_16px_40px_rgb(0_0_0/0.25)]"
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
  );
}
