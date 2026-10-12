"use client";

import { useEffect } from "react";

import { UndoRing } from "@/app/(signed-in)/up-next/up-next-card";
import { UNDO_WINDOW_MS } from "@/app/(signed-in)/up-next/up-next-mark";
import { SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { episodeCount, strokeSummary } from "./paint-to-mark";

/**
 * The bar a painted stroke leaves at the foot of the screen — issue #408 (handoff §11.3):
 * *4 episodes marked* and a quiet *Undo* that reverses the whole stroke in one write. It
 * stays for the Undo window, `UNDO_WINDOW_MS` — the same six seconds a mark's *Undo* is
 * offered on Tonight, read from there rather than restated — with the same ring draining for
 * exactly that long, and then leaves.
 *
 * Where the selection action bar and the write-failure toast sit: above the tab bar on a
 * phone, a floating panel at the corner on a desktop. A `status` region, so the count is
 * read out once as it arrives.
 *
 * `onUndo` and `onDone` are the caller's — the stroke's write and its Undo are the
 * store's (`watch-marks.ts`), and this only offers them.
 */
export function PaintStrokeBar({
  count,
  onUndo,
  onDone,
}: {
  readonly count: number;
  readonly onUndo: () => void;
  /** The window closed: the bar leaves. */
  readonly onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="status"
      data-paint-stroke=""
      className="arrive fixed inset-x-3 bottom-[calc(var(--tab-bar-height)+12px)] z-40 flex h-14 items-center justify-between gap-3 rounded-[var(--radius-5)] bg-raised pr-1.5 pl-4 plate-line lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[360px]"
    >
      <span className="flex min-w-0 items-center gap-2.5 text-note font-semibold text-text">
        <span className="relative size-[22px] shrink-0">
          <UndoRing outset={0} shownMs={UNDO_WINDOW_MS} />
        </span>
        <span className="truncate" data-numeric>
          {strokeSummary(count)}
        </span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        aria-label={`Undo marking ${episodeCount(count)} watched`}
        className={SECONDARY_BUTTON_COMPACT}
      >
        Undo
      </button>
    </div>
  );
}
