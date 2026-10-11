"use client";

import * as m from "motion/react-m";

import { snappy } from "./motion";
import { SELECTED, SELECTED_MARKER, UNSELECTED } from "./selection";

/**
 * The segmented control — handoff §6, issue #397. Three controls drew it three ways before
 * Charcoal (Library's Shows/Films/Lists, a list's Icons/List, Settings' Appearance), two of
 * them as a solid `text` thumb on a fully rounded track and the third as a row of chips.
 * This is the one shape all three take now.
 *
 * A `raised` track at `--radius-5` with `4px` inside it; each segment `44px` high at
 * `--radius-4` (the outer `16px` less the `4px` padding). The selected segment is
 * *outlined* (`app/selection.ts`), and its line travels between segments on `snappy`, the
 * way the thumb did — `layoutId` is the caller's, so two controls on one screen never
 * slide into each other.
 *
 * **Compact** is the Icons/List form that sits beside a heading: `36px` segments in a
 * `44px` track. A segment's hit area is stretched to the track's full height by a
 * `before:` box `4px` taller on each side, so the target stays `44px` where the segment
 * draws `36px` — the track is not a scroller, so nothing clips it.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
  layoutId,
  compact = false,
  className = "",
}: {
  /** The group's accessible name — *What to show*, *View*, *Appearance*. */
  readonly label: string;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly layoutId: string;
  readonly compact?: boolean;
  /** Width and placement only — `w-full`, a margin. The shape is this file's. */
  readonly className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-1 rounded-[var(--radius-5)] bg-raised p-1 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`relative flex flex-1 items-center justify-center rounded-[var(--radius-4)] ${
              compact
                ? "h-9 px-3.5 text-item before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
                : "h-11 px-4 text-note"
            } ${selected ? SELECTED : UNSELECTED}`}
          >
            {selected ? (
              <m.span
                layoutId={layoutId}
                className={`${SELECTED_MARKER} rounded-[var(--radius-4)]`}
                transition={snappy}
              />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
