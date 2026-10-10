"use client";

import { useEffect, useRef } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { RECORDS_A_WATCH } from "@/app/accent-meaning";
import { beginHoldOver } from "./hold-over";

/**
 * **How long a card holds after a mark** — the UI overhaul's *longer pause*.
 *
 * The mark used to be a `200ms` sweep, after which the card had already moved on to the
 * next episode: the confirmation was over before the thumb had left the glass. The hold
 * keeps the card on the episode just recorded, washed in the accent (`.watch-hold`), with
 * *Watched* where the episode's name was and *Undo* beside the check, and then the next
 * episode slides in. Long enough to read, short enough that catching up on five shows is
 * not a wait.
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
 * Solid is `RECORDS_A_WATCH`'s own form, and that is exactly what it says here: a watch now
 * exists because of a press on this card.
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
          className="pressable [--press-register:1] label-line flex h-8 items-center rounded-[var(--radius-full)] bg-ground px-3 text-text transition-colors duration-[var(--dur-fast)] hover:bg-hair"
        >
          Undo
        </button>
      )}
      <span className="flex h-11 w-11 items-center justify-center" aria-hidden>
        <span
          className={`flex items-center justify-center rounded-[var(--radius-full)] p-1 check-pop ${RECORDS_A_WATCH.solid}`}
        >
          <CheckmarkIcon className="h-4 w-4" />
        </span>
      </span>
    </div>
  );
}
