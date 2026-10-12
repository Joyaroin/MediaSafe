"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { pulse } from "@/app/haptics";
import {
  lastPaintable,
  newlyFilled,
  paintedThrough,
  paintStartsOn,
  type PaintEpisode,
  type PaintRow,
} from "./paint-to-mark";
import { useHoldGesture, type HoldGesture } from "./use-hold-to-select";

/**
 * Paint to mark — the binding (issue #408, handoff §11.3). `paint-to-mark.ts` holds every
 * decision; this is the pointer.
 *
 * - **The hold** is `useHoldGesture`'s, the long-press shared with hold to select —
 *   `HOLD_MS` and `HOLD_SLOP_PX`, never copied. A short hold, or one that drifts past the
 *   slop before it lands, is an ordinary tap or scroll: nothing here has touched the
 *   pointer yet, so the list scrolls and the tick's own tap records one episode.
 * - **Once it lands** the tick takes the pointer (`setPointerCapture`) and the list stops
 *   scrolling for this finger: a non-passive `touchmove` listener on the tick refuses the
 *   browser's scroll. The finger has not passed the slop yet, so no scroll has begun to be
 *   refused mid-flight. Every row's position is measured once, here — nothing scrolls for
 *   the rest of the stroke.
 * - **Moving** fills or empties ticks by `paintedThrough`, one short vibration per move
 *   that fills.
 * - **Letting go** hands the stroke to `onStroke`; a cancelled pointer records nothing.
 *
 * `start` is the Up next episode's index in `episodes`, or `null` when the list has none to
 * start from — and then there is no hold at all.
 */
export function usePaintToMark({
  episodes,
  today,
  list,
  onStroke,
}: {
  readonly episodes: readonly PaintEpisode[];
  readonly today: string;
  /** The list whose children are the rows, in `episodes`' order. */
  readonly list: RefObject<HTMLElement | null>;
  /** The stroke ended on purpose: `start` through `through`, both indices into `episodes`. */
  readonly onStroke: (start: number, through: number) => void;
}): {
  readonly start: number | null;
  /** How far the stroke in progress reaches, or `null` while there is none. */
  readonly through: number | null;
  readonly hold: HoldGesture;
  readonly handlers: HoldGesture["handlers"];
} {
  const found = episodes.findIndex(paintStartsOn);
  const start = found < 0 ? null : found;

  const [through, setThrough] = useState<number | null>(null);
  const pointer = useRef<{ readonly id: number; readonly element: HTMLElement } | null>(null);
  const stroke = useRef<{
    readonly start: number;
    readonly last: number;
    readonly rows: readonly PaintRow[];
    readonly element: HTMLElement;
    through: number;
  } | null>(null);

  const hold = useHoldGesture(
    start === null
      ? null
      : () => {
          const held = pointer.current;
          const rows = list.current;
          if (held === null || rows === null) return;

          held.element.setPointerCapture(held.id);
          held.element.addEventListener("touchmove", refuseScroll, { passive: false });
          stroke.current = {
            start,
            last: lastPaintable(episodes, start, today),
            rows: Array.from(rows.children, (row) => {
              const box = row.getBoundingClientRect();
              return { top: box.top, bottom: box.bottom };
            }),
            element: held.element,
            through: start,
          };
          setThrough(start);
          pulse();
        },
  );

  function end(): { readonly start: number; readonly through: number } | null {
    const ended = stroke.current;
    if (ended === null) return null;
    stroke.current = null;
    ended.element.removeEventListener("touchmove", refuseScroll);
    setThrough(null);
    return { start: ended.start, through: ended.through };
  }

  // A list re-rendered away under a stroke — a route left mid-gesture — takes the
  // listener with it.
  useEffect(
    () => () => {
      stroke.current?.element.removeEventListener("touchmove", refuseScroll);
    },
    [],
  );

  return {
    start,
    through,
    hold,
    handlers: {
      ...hold.handlers,
      onPointerDown(event) {
        pointer.current = { id: event.pointerId, element: event.currentTarget as HTMLElement };
        hold.handlers.onPointerDown(event);
      },
      onPointerMove(event) {
        const live = stroke.current;
        if (live === null) {
          hold.handlers.onPointerMove(event);
          return;
        }
        if (event.pointerId !== pointer.current?.id) return;
        const next = paintedThrough(live.rows, live.start, live.last, event.clientY);
        if (next === live.through) return;
        if (newlyFilled(live.through, next) > 0) pulse();
        live.through = next;
        setThrough(next);
      },
      onPointerUp() {
        hold.handlers.onPointerUp();
        const ended = end();
        if (ended !== null) onStroke(ended.start, ended.through);
      },
      onPointerCancel() {
        hold.handlers.onPointerCancel();
        end();
      },
      onPointerLeave() {
        // A captured stroke leaves the tick on its first row down; that is the gesture.
        if (stroke.current === null) hold.handlers.onPointerLeave();
      },
    },
  };
}

function refuseScroll(event: TouchEvent): void {
  event.preventDefault();
}
