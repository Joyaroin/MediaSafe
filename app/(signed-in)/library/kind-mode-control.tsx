"use client";

import * as m from "motion/react-m";

import { snappy } from "@/app/motion";
import { KIND_MODES, type KindMode } from "./kind-mode";

/**
 * A true segmented control — a raised track with the selection sliding inside it.
 *
 * ── Why this is not two chips, which already exist ──────────────────────────────────
 *
 * `chip.tsx` would have carried this for free, and for a filter it would have been right.
 * A chip row says *narrow what you are looking at*, and every chip in it is independent —
 * the library's six, the season selector's. This is not that. Choosing Films **replaces
 * the screen**: the chips disappear, the flat grid becomes three headed groups, and the
 * empty state changes. A control that switches between two screens should not wear the
 * costume of a control that filters one.
 *
 * Radii here are per-surface measures rather than a ramp, and
 * that each needs a stated reason. The track is `9999px` and the thumb `9999px` inside a
 * `3px` inset — a pill inside a pill, which is what makes the travel legible. The reason
 * is the paragraph above: this had to read as a different *kind* of control than a chip,
 * and shape is the only thing that could say so at this size.
 *
 * ── No accent ───────────────────────────────────────────────────────────────────────
 *
 * The thumb is `--ink`, like the selected chip, and not the accent. §0's rule is one
 * accent per screen and the library already spends its on the Watching chip's live label.
 * The reference draws this thumb in its accent colour; taking that would have put three
 * accented things on one screen.
 */
export function KindModeControl({
  value,
  onChange,
}: {
  value: KindMode;
  onChange: (mode: KindMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Films or shows"
      className="mt-4 flex w-full rounded-[var(--radius-full)] bg-raised p-[3px]"
    >
      {KIND_MODES.map((mode) => {
        const selected = mode.value === value;

        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(mode.value)}
            className={`relative flex h-9 flex-1 items-center justify-center rounded-[var(--radius-full)] text-meta font-medium transition-colors duration-[var(--dur-fast)] ${
              selected ? "text-ground" : "text-dim hover:text-ink"
            }`}
          >
            {/* One element that slides between the two halves, the same device
                `ChipGround` uses — so the selection travels rather than blinking. Its own
                `layoutId`, because it must never animate towards a chip. */}
            {selected ? (
              <m.span
                layoutId="library-kind-mode"
                className="absolute inset-0 rounded-[var(--radius-full)] bg-ink"
                transition={snappy}
              />
            ) : null}
            <span className="relative z-10">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
