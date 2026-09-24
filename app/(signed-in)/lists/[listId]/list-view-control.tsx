"use client";

import * as m from "motion/react-m";

import { snappy } from "@/app/motion";
import { LIST_VIEW_MODES, type ListViewMode } from "./list-view-mode";

/**
 * The view toggle — `kind-mode-control.tsx`'s control at a smaller measure, not a second
 * one. Identical shape: a fully-rounded `--raised` track at `p-[3px]`, a fully-rounded
 * `--ink` thumb that **slides** between the halves rather than blinking, and the same
 * `snappy` spring carrying it.
 *
 * Two differences, both measures rather than registers. It is `h-8` instead of `h-9` and
 * sized to its labels instead of `w-full`, because that control is the whole width of a
 * filter bar and this one sits beside a list's name in a heading row.
 *
 * Its own `layoutId`, for `KindModeControl`'s own reason: a shared one would animate this
 * thumb towards that control's if both were ever mounted at once.
 */
export function ListViewControl({
  value,
  onChange,
}: {
  readonly value: ListViewMode;
  readonly onChange: (mode: ListViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View"
      className="flex shrink-0 rounded-[var(--radius-full)] bg-raised p-[3px]"
    >
      {LIST_VIEW_MODES.map((mode) => {
        const selected = mode === value;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(mode)}
            className={`relative flex h-8 items-center justify-center rounded-[var(--radius-full)] px-3.5 text-meta font-medium transition-colors duration-[var(--dur-fast)] ${
              selected ? "text-ground" : "text-dim hover:text-text"
            }`}
          >
            {selected ? (
              <m.span
                layoutId="list-view-mode"
                className="absolute inset-0 rounded-[var(--radius-full)] bg-text"
                transition={snappy}
              />
            ) : null}
            <span className="relative z-10">{LABELS[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Finder's own two words. The control says what you get, not what the code calls it. */
const LABELS: Readonly<Record<ListViewMode, string>> = {
  icons: "Icons",
  list: "List",
};
