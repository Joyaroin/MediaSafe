"use client";

import * as m from "motion/react-m";

import { snappy } from "@/app/motion";

/**
 * The chip's shape and its travelling selected fill — first built for the Library filter
 * bar (`library-filter-bar.tsx`) and pulled out from under it for issue #224, whose spec
 * (issue #215) requires the season selector to reuse *the chip register the Library
 * filter bar already uses, travelling selected fill and all*, in as many words: "a second
 * selector vocabulary on an adjacent surface is what the design system's one-register
 * rule exists to prevent." That sentence is the spec's own reasoning for the requirement,
 * not a rule documented under that name.
 *
 * What moved here is the shape every chip shares: a `32px` pill at a `16px` radius,
 * unselected as a filled `bg-raised` well with dim text hovering to full strength,
 * selected inverted to `text-ground` over `ChipGround`'s sliding fill. `library-filter-bar.tsx`
 * keeps its own *Watching* exception — the one chip whose unselected text is accent rather
 * than dim — local to itself, because that colour is a fact about a library state, not
 * about the register.
 */
export const CHIP_BASE =
  "relative flex h-8 shrink-0 items-center rounded-[var(--radius-6)] px-3.5 text-meta font-medium";

/** The unselected and selected treatments every chip shares. */
export function chipClassName(selected: boolean): string {
  if (selected) return `${CHIP_BASE} text-ground`;
  return `${CHIP_BASE} bg-raised text-dim transition-colors duration-[var(--dur-fast)] hover:text-ink`;
}

/**
 * The travelling fill. `snappy` and not `smooth`, for the reason `library-filter-bar.tsx`
 * gave it first: a chip is pressed directly, and a trace of overshoot is what makes a
 * direct manipulation feel answered rather than merely processed.
 *
 * `layoutId` is the caller's own rather than a constant here, so two chip rows mounted at
 * once — the Library filter bar and a season selector are two different surfaces, but
 * the desktop pane can show a season selector beside a phone route showing a different
 * one in another tab — never share a shared-layout group and slide into each other's
 * fill.
 */
export function ChipGround({ layoutId }: { layoutId: string }) {
  return (
    <m.span
      layoutId={layoutId}
      className="absolute inset-0 rounded-[var(--radius-6)] bg-ink"
      transition={snappy}
    />
  );
}
