"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { WATCHED_TICK } from "@/app/(signed-in)/library/watch-mark-motion";
import { PILL_TARGET, SECONDARY_PILL } from "@/app/buttons";
import { beginHoldOver } from "./hold-over";

/**
 * **How long a card holds after a mark** — the UI overhaul's *longer pause*.
 *
 * The mark used to be a `200ms` sweep, after which the card had already moved on to the
 * next episode: the confirmation was over before the thumb had left the glass. The hold
 * keeps the card on the episode just recorded, its check filled and *Undo* beside it with
 * a ring draining for the length of the hold (issue #407), and then the next episode rolls
 * in. Long enough to read, short enough that catching up on five shows is not a wait.
 *
 * It is a timer and not an animation's end: the hold is where *Undo* lives, and a reader
 * who has asked for reduced motion still needs the time to press it.
 */
export const HOLD_MS = 1_200;

/**
 * Ends the hold after `HOLD_MS`. Keyed on `holding` alone, so a re-render during the hold
 * does not restart the clock; `onDone` is read at the moment the timer fires.
 */
export function useHold(holding: string | null, onDone: () => void): void {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (holding === null) return;
    /* Watching stays as it was for the length of the hold (`hold-over.tsx`), so a server
       render that no longer has this card cannot take it away mid-hold. */
    const release = beginHoldOver();
    const timer = setTimeout(() => done.current(), HOLD_MS);
    return () => {
      clearTimeout(timer);
      release();
    };
  }, [holding]);
}

/**
 * The finish moment's haptic — issue #367. A short pulse where the browser has
 * `navigator.vibrate` (Android's Chrome and Firefox; Safari has none, and gets the line
 * alone). Not motion, so it fires under reduced motion too.
 */
const FINISH_PULSE_MS = 30;

export function finishPulse(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(FINISH_PULSE_MS);
}

/**
 * The control slot while a card holds: *Undo*, and the check filled solid.
 *
 * The check is drawn, not offered — it is a `span`, not a disabled button. The next episode
 * is not on the card yet, so there is nothing a second press could knowingly record.
 *
 * Solid is `RECORDS_A_WATCH`'s own form, through `WATCHED_TICK`, and that is exactly what it
 * says here: a watch now exists because of a press on this card. It pops once as it fills
 * (`check-pop`), and while *Undo* is on offer the ring drains around it (`UndoRing`) —
 * handoff §11.2's *Mark from a row*, issue #407. With no *Undo* (a row leaving the list) it
 * is the filled tick alone.
 */
export function HeldControl({
  onUndo,
  undoLabel,
}: {
  readonly onUndo: (() => void) | null;
  readonly undoLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {onUndo === null ? null : (
        <button
          type="button"
          onClick={onUndo}
          aria-label={undoLabel}
          // The quiet pill — `32px` drawn inside a `44px` target (issue #397).
          className={`pressable [--press-register:1] ${PILL_TARGET}`}
        >
          <span className={SECONDARY_PILL}>Undo</span>
        </button>
      )}
      <span className="flex h-11 w-11 items-center justify-center" aria-hidden>
        <span className="relative">
          <span className={`check-pop ${WATCHED_TICK}`}>
            <CheckmarkIcon className="h-4 w-4" />
          </span>
          {onUndo === null ? null : <UndoRing outset={6} />}
        </span>
      </span>
    </div>
  );
}

/**
 * The ring that drains around a filled tick for exactly as long as *Undo* is on screen —
 * handoff §11.2, issue #407. *Undo* is on screen for the mark hold, so the ring's time is
 * `HOLD_MS` itself, handed to `globals.css`'s `undo-ring` as `--undo-shown` rather than
 * restated: the ring and the hold are one number. It mounts with the hold, so it starts
 * when the hold's timer does.
 *
 * `outset` is how far outside the tick the ring is drawn. Under reduced motion there is no
 * ring; *Undo* stays for the same time.
 */
export function UndoRing({ outset }: { readonly outset: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      className="undo-ring absolute overflow-visible text-text"
      style={{ inset: -outset, "--undo-shown": `${HOLD_MS}ms` } as CSSProperties}
    >
      <circle
        cx="50"
        cy="50"
        r="49"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
      />
    </svg>
  );
}
