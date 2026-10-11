"use client";

import * as m from "motion/react-m";
import type { ReactNode } from "react";

import { snappy } from "@/app/motion";
import { SELECTED, SELECTED_MARKER, UNSELECTED } from "@/app/selection";

/**
 * The chip — first built for the Library filter bar (`library-filter-bar.tsx`) and pulled
 * out from under it for issue #224, whose spec (issue #215) requires the season selector
 * to reuse *the chip register the Library filter bar already uses*: "a second selector
 * vocabulary on an adjacent surface is what the design system's one-register rule exists
 * to prevent."
 *
 * ── Charcoal, issue #397 ─────────────────────────────────────────────────────────────
 *
 * A `36px` pill, `raised`, its label `dim`; selected is *outlined* (`app/selection.ts`) —
 * the `1.5px` `text` line and the label in `text` at 600 — where it used to invert to a
 * solid `text` fill. The Watching chip's accent exception is gone with the accent: it
 * looks like every other chip (handoff §5.2).
 *
 * The pill draws `36px` inside a `44px` target, so it is two elements: the `<button>` is
 * the target, the face is a `<span>` inside it. That is also why this is a component now
 * rather than a class string — two callers each wrapping a face in a target is the drift
 * this file was extracted to stop.
 *
 * The selected line **travels**, as the fill did: one `layoutId` marker slides to the
 * pressed chip on `snappy`, the spring for a thing a finger just let go of. `layoutId` is
 * the caller's own, so two chip rows mounted at once never slide into each other.
 */
export const CHIP_FACE =
  "relative flex h-9 items-center gap-1.5 rounded-[var(--radius-full)] bg-raised px-3.5 text-item";

export function ChipButton({
  selected,
  onClick,
  layoutId,
  children,
}: {
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly layoutId: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex h-11 shrink-0 items-center"
    >
      <span className={`${CHIP_FACE} ${selected ? SELECTED : UNSELECTED}`}>
        {selected ? (
          <m.span
            layoutId={layoutId}
            className={`${SELECTED_MARKER} rounded-[var(--radius-full)]`}
            transition={snappy}
          />
        ) : null}
        {children}
      </span>
    </button>
  );
}
