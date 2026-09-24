"use client";

import { CheckmarkIcon } from "./checkmark-icon";
import { ChipGround, chipClassName } from "./chip";
import { seasonHeading } from "./season-grouping";

/**
 * The season selector — issue #224. `chip.tsx`'s register exactly, chosen over a
 * treatment of its own for the reason the spec (issue #215) gives: "a second selector
 * vocabulary on an adjacent surface is what the design system's one-register rule exists
 * to prevent." That is the spec's own reasoning, quoted — no rule is documented
 * under that name (`chip.tsx`'s own docblock says so too, at the point it's first cited).
 *
 * `groupBySeason` already places season 0 after every real season, and `seasons` here is
 * that same order handed straight through — `SeasonList` is the one caller, and it is
 * also the one place that owns the live episode list this is grouped from, so there is no
 * second place a specials-last rule could drift from the row that renders it.
 *
 * ── `-mx-6 px-6`, not `library-filter-bar.tsx`'s `-mx-[22px] px-[22px]` ────────────────
 *
 * Both bleed a scrolling row to the edges of whatever pads their own surface, but the two
 * surfaces pad differently — `programme-note-content.tsx` wraps this in `px-6`, the
 * Library heading bar in `px-[22px]` — and Tailwind's own JIT scanner needs the literal
 * class string in source to keep it in the build, which rules out deriving one bleed from
 * the other at runtime with a shared, parameterised class name.
 */
const SEASON_CHIP_ROW =
  "-mx-6 mt-4 flex items-center gap-2 overflow-x-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function SeasonChips({
  seasons,
  finished,
  selected,
  onSelect,
  libraryEntryId,
}: {
  seasons: readonly number[];
  /** The seasons whose every episode is watched; their chips carry a tick. */
  finished: ReadonlySet<number>;
  selected: number;
  onSelect: (seasonNo: number) => void;
  /** Namespaces the travelling fill's `layoutId` (`chip.tsx`) to this title, so the
   *  desktop pane and a phone route open on a different show at the same time never
   *  share a shared-layout group. */
  libraryEntryId: string;
}) {
  return (
    <div
      className={SEASON_CHIP_ROW}
      role="group"
      aria-label="Choose a season"
    >
      {seasons.map((seasonNo) => (
        <button
          key={seasonNo}
          type="button"
          aria-pressed={seasonNo === selected}
          onClick={() => onSelect(seasonNo)}
          className={chipClassName(seasonNo === selected)}
        >
          {seasonNo === selected ? (
            <ChipGround layoutId={`season-chip-selected-${libraryEntryId}`} />
          ) : null}
          <span className="relative z-10 flex items-center gap-1.5">
            {seasonHeading(seasonNo)}
            {finished.has(seasonNo) ? (
              <>
                <CheckmarkIcon className="h-3 w-3" />
                <span className="sr-only">, watched</span>
              </>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
