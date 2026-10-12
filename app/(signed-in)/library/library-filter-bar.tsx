"use client";

import { usePathname, useRouter } from "next/navigation";

import { LIBRARY_STATES, type LibraryState } from "@/db/access";
import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORTS,
  type LibrarySort,
} from "@/db/library-sort";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { ChipButton } from "./chip";
import { EMPTY_PANEL, ICON_BUTTON } from "@/app/buttons";

/**
 * The library heading bar's controls — the chips, the sort control, and the zero-match
 * state the chips can produce (#57). The filter-by-typing field left with Charcoal (issue
 * #402): the boards draw the chips and a round sort button and nothing else, and the owner
 * chose to follow them. Split out of
 * `library-surface.tsx` rather than left inline there, for a reason that is not
 * stylistic: `library-surface.tsx` also renders `ProgrammeNotePane` (#58), which reaches
 * `tmdb/catalogue.ts` — marked `server-only` — through `title-detail-actions.ts`. That
 * sentinel throws on import outside Next's own build. This file has no such import in its
 * graph, which is what lets `tests/library-surface.test.ts` render these four components
 * directly, the same way `programme-note-episodes.tsx` stays renderable for the same
 * reason.
 */

/** The six chips, `LibraryState` plus *All* — never a seventh, never reordered. */
export type Chip = "all" | LibraryState;

/**
 * The words for each state, in the glossary's own order. A `Record` rather
 * than a parallel array: `db/access.ts`'s `LIBRARY_STATES` never grows a sixth entry by
 * design, but if it ever did, a missing key here is a type error at that line rather than
 * a chip silently rendering `undefined`.
 */
const CHIP_LABELS: Record<LibraryState, string> = {
  watching: "Watching",
  caught_up: "Caught up",
  finished: "Finished",
  watchlist: "Watchlist",
  abandoned: "Dropped",
};

const CHIPS: { value: Chip; label: string }[] = [
  { value: "all", label: "All" },
  ...LIBRARY_STATES.map((state) => ({ value: state, label: CHIP_LABELS[state] })),
];

/**
 * The chips — `chip.tsx`'s register, unchanged here. The Watching chip used to keep an
 * accent label even unselected, as `LIVE_EDGE_OF_THE_RECORD`; Charcoal has no accent hue,
 * and handoff §5.2 has it look like every other chip (issue #397).
 */
export function LibraryChips({
  value,
  onChange,
}: {
  value: Chip;
  onChange: (chip: Chip) => void;
}) {
  return (
    // Scrolls rather than wraps. Six chips do not fit a 390px screen and the boards do not
    // ask them to: the row runs under the sort button pinned at its right end and is
    // swiped. `pl-gutter` puts the first chip on the page gutter once the caller has bled
    // the row to the viewport's left edge (`library-surface.tsx`).
    <div
      className="flex items-center gap-2 overflow-x-auto pr-2 pl-gutter lg:pl-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter by where a title stands"
    >
      {CHIPS.map((chip) => (
        <ChipButton
          key={chip.value}
          selected={chip.value === value}
          onClick={() => onChange(chip.value)}
          layoutId="library-chip-selected"
        >
          {chip.label}
        </ChipButton>
      ))}
    </div>
  );
}

/**
 * The sort control — a round button with the up-and-down arrows on a phone, and the same
 * button with the current order written beside the arrows on a desktop (handoff §8.4).
 *
 * ── A native `<select>` under the face ───────────────────────────────────────────────
 *
 * The face is drawing only. A transparent `<select>` covers it, so a press opens the
 * platform's own picker — the wheel on a phone — and the control keeps the keyboard and
 * screen-reader behaviour it had as a visible select. The focus ring moves to the face
 * (`has-[select:focus-visible]`), because the element that holds focus cannot be seen.
 *
 * ── Why a selection here is a navigation and not a `setState` ────────────────────────
 *
 * Sort state lives in the URL, so choosing an order calls `router.push` rather
 * than updating local state. That re-renders `page.tsx`, which reads the library again at
 * the new `ORDER BY` and hands correctly-ordered `entries` back down — the chip is
 * untouched, because it lives in `LibrarySurface`, one level below the re-render this
 * causes.
 *
 * Since issue #219 that read may not reach Postgres at all: `sort` is part of the cache
 * key (`cache/tags.ts`), so each order is its own entry and switching back to one you have
 * already used is served from it. The order is still decided in SQL — four `ORDER BY`s in
 * `db/access.ts`, never a client-side re-sort — and every one of those entries carries the
 * same tag, so a write busts all four together.
 *
 * The default carries no query string at all: a reader who never touches this control
 * keeps a clean `/library`, and picking the default again removes `?sort=` rather than
 * writing it out.
 */
export function SortSelect({ value }: { value: LibrarySort }) {
  const router = useRouter();
  const pathname = usePathname();

  function onChange(next: LibrarySort) {
    const query = next === DEFAULT_LIBRARY_SORT ? "" : `?sort=${next}`;
    router.push(`${pathname}${query}`);
  }

  const current = LIBRARY_SORTS.find((one) => one.value === value)?.label ?? "";

  return (
    <span
      className={`${ICON_BUTTON} relative lg:w-auto lg:px-4 lg:text-item has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-text`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
      </svg>
      <span aria-hidden="true" className="hidden lg:inline">
        {current}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LibrarySort)}
        aria-label="Sort the library"
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {LIBRARY_SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * A filter that matched nothing — distinct from the genuinely empty library `page.tsx`
 * still owns, and from a read failure, which is `errors/read-failure.tsx` and never this.
 *
 * States: *centred, heading at `text-bill-md`, body at `text-note` capped at
 * `60ch`, ghost "Clear the filter" button. Reassures that the library is intact.* Same
 * shape as the empty library, one size down and one button treatment down — `GHOST_RECOVERY`
 * rather than `SOLID_RECOVERY`, because this is a step back, not the one primary action a
 * blank library offers.
 */
export function ZeroMatches({ onClear }: { onClear: () => void }) {
  return (
    <section className={EMPTY_PANEL}>
      {/* `text-bill-md`, one step under the empty library's `text-bill-lg` — the same
          panel a step down, because this is a filter coming up short rather than a library
          with nothing in it. Told apart from a failed read by the serif against the
          failure's Row-size sans (`errors/failure-treatment.ts`); `tests/library-surface.
          test.ts` asserts both. The colour is `text`. */}
      <h2 className="bill-title text-bill-md text-text">Nothing under that filter</h2>

      <p className="mt-2 max-w-[60ch] text-item text-dim">
        Your library still holds everything it did. Clear the filter to see it again.
      </p>

      <button type="button" onClick={onClear} className={`mt-4 ${GHOST_RECOVERY}`}>
        Clear the filter
      </button>
    </section>
  );
}
