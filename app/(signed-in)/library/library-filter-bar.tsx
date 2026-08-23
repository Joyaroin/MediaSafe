"use client";

import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";

import { snappy } from "@/app/motion";
import { LIBRARY_STATES, type LibraryState } from "@/db/access";
import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORTS,
  type LibrarySort,
} from "@/db/library-sort";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

/**
 * The library heading bar's controls — the chips, the filter-by-typing field, the sort
 * select, and the zero-match state they can produce (#57). Split out of
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
 * `SPEC.md` §7's words for each state, in the glossary's own order. A `Record` rather
 * than a parallel array: `db/access.ts`'s `LIBRARY_STATES` never grows a sixth entry by
 * design, but if it ever did, a missing key here is a type error at that line rather than
 * a chip silently rendering `undefined`.
 */
const CHIP_LABELS: Record<LibraryState, string> = {
  watching: "Watching",
  caught_up: "Caught up",
  finished: "Finished",
  watchlist: "Watchlist",
  abandoned: "Abandoned",
};

const CHIPS: { value: Chip; label: string }[] = [
  { value: "all", label: "All" },
  ...LIBRARY_STATES.map((state) => ({ value: state, label: CHIP_LABELS[state] })),
];

/**
 * `DESIGN.md`, Chips: *selected inverts to a `text`-coloured ground with `ground`-coloured
 * text. Unselected is `ground` with dim `text` text, hovering to `raised` with full-strength
 * text. The Watching chip is the one exception: its text is accent-coloured even when
 * unselected, because the accent always means live.* One function rather than a lookup
 * table, because there is exactly one exception to name and a table would give it the same
 * shape as five identical rows.
 */
/* The selected chip's ground is drawn by `<ChipGround />` below rather than by a
   `bg-ink` class, so every chip here is transparent-grounded and the same size whether it
   is selected or not. The fill is one element that slides between them.

   Turn 9 makes the chip a `32px` pill at a `16px` radius, and changes what unselected
   looks like: it used to be the page ground hovering to `--raised`, which worked when
   `--raised` was white and the ground was bone. In the linen palette `--raised` is
   *darker* than the ground, so an unselected chip is a filled well and a selected one is
   a darker fill still — the row reads as a set of objects rather than as labels that grow
   a background on hover. */
function chipClassName(value: Chip, selected: boolean): string {
  const base =
    "relative flex h-8 shrink-0 items-center rounded-2xl px-3.5 text-meta font-medium";
  if (selected) return `${base} text-ground`;
  if (value === "watching") {
    // The one exception, and it survives the redesign intact: Watching keeps its accent
    // label even unselected, because the accent always means live.
    return `${base} bg-raised text-accent transition-opacity duration-[var(--dur-fast)] hover:opacity-80`;
  }
  return `${base} bg-raised text-dim transition-colors duration-[var(--dur-fast)] hover:text-ink`;
}

/** The travelling fill. `snappy` and not `smooth`: a chip is pressed directly, and a
 *  trace of overshoot is what makes a direct manipulation feel answered rather than
 *  merely processed. It travels as a `16px`-radius pill since turn 9 — the shape moved,
 *  the shared-layout element did not. */
function ChipGround() {
  return (
    <motion.span
      layoutId="library-chip-selected"
      className="absolute inset-0 rounded-2xl bg-ink"
      transition={snappy}
    />
  );
}

export function LibraryChips({
  value,
  onChange,
}: {
  value: Chip;
  onChange: (chip: Chip) => void;
}) {
  return (
    // Scrolls rather than wraps. Six chips do not fit a 390px screen and turn 9 does not
    // ask them to: the row runs off the edge and is swiped, the same device the Up next
    // tracks use. `-mx-[22px] px-[22px]` lets it bleed to the viewport edges while the
    // first chip still starts on the page gutter.
    <div
      className="-mx-[22px] mt-4 flex items-center gap-2 overflow-x-auto px-[22px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter by where a title stands"
    >
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          aria-pressed={chip.value === value}
          onClick={() => onChange(chip.value)}
          className={chipClassName(chip.value, chip.value === value)}
        >
          {chip.value === value ? <ChipGround /> : null}
          <span className="relative z-10">{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * `DESIGN.md`, Inputs: *a `1px` `hair` bordered row with a bar icon, `13rem` wide,
 * transparent ground, bone text at `text-item`, dim bone placeholder reading "Filter your
 * library".* The same treatment as the search screen's field, and — per `CONTEXT.md` and
 * `SPEC.md` §4 — never its copy: this one narrows the library you already have, and the
 * word for that is *filter*, never *search*.
 */
export function FilterField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    // `flex-1`, not `ml-auto`: turn 9 gives this field the width of the row and puts the
    // sort control beside it, where it used to be pushed to the right of a wrapping bar.
    // `40px` here against the search field's `44px` — the handoff sets this one shorter
    // on purpose, because it sits in a row of controls rather than being the screen's
    // single field.
    <label className="field-well flex h-10 flex-1 items-center gap-2.5 px-3.5">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-dim" aria-hidden="true">
        <rect x="2" y="5" width="20" height="2.5" fill="currentColor" />
        <rect x="5" y="10.75" width="14" height="2.5" fill="currentColor" />
        <rect x="9" y="16.5" width="6" height="2.5" fill="currentColor" />
      </svg>
      <input
        // `text`, not `search` — the same reason the search screen's field gives: WebKit
        // draws its own clear control inside `type="search"`, and that circle is not one
        // this world has.
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Filter your library"
        autoComplete="off"
        aria-label="Filter your library"
        className="w-full min-w-0 bg-transparent text-item text-ink placeholder:text-dim focus:outline-none"
      />
    </label>
  );
}

/**
 * `DESIGN.md`, Inputs: *the same bordered treatment at `text-item`, with the native arrow
 * removed and replaced by a solid vermilion triangle — the one place vermilion marks an
 * affordance rather than a state.*
 *
 * ── Why a selection here is a navigation and not a `setState` ────────────────────────
 *
 * `SPEC.md` §7 puts sort state in the URL, so choosing an order calls `router.push` rather
 * than updating local state. That re-renders `page.tsx`, which reads the library again at
 * the new `ORDER BY` and hands correctly-ordered `entries` back down — the chip and the
 * filter text are untouched, because they live in `LibrarySurface`, one level below the
 * re-render this causes.
 *
 * Since issue #219 that read may not reach Postgres at all: `sort` is part of the cache
 * key (`cache/tags.ts`), so each order is its own entry and switching back to one you have
 * already used is served from it. The order is still decided in SQL — four `ORDER BY`s in
 * `db/access.ts`, never a client-side re-sort — and every one of those entries carries the
 * same tag, so a write busts all four together.
 *
 * The default carries no query string at all: a reader who never touches this control
 * keeps a clean `/library`, and picking *Title A–Z* again — the only selection that can
 * follow a non-default one back to the default — removes `?sort=` rather than writing it
 * out.
 */
export function SortSelect({ value }: { value: LibrarySort }) {
  const router = useRouter();
  const pathname = usePathname();

  function onChange(next: LibrarySort) {
    const query = next === DEFAULT_LIBRARY_SORT ? "" : `?sort=${next}`;
    router.push(`${pathname}${query}`);
  }

  return (
    // The visible `Sort` word is gone: turn 9 draws this as the *value* plus the caret,
    // which is what a native platform control looks like and what the mock shows. The
    // word survives where it was doing the real work — `aria-label` on the `select`,
    // which is what a screen reader announces and which never carried the visible text
    // anyway.
    <span className="relative inline-flex shrink-0 items-center">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LibrarySort)}
        aria-label="Sort the library"
        className="field-well h-10 appearance-none pr-8 pl-3 text-item text-dim focus:outline-none"
      >
        {LIBRARY_SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </select>
      {/* The solid vermilion triangle survives the redesign unchanged — turn 9 keeps it,
          and it is the one place the accent marks an affordance rather than a state. */}
      <svg
        viewBox="0 0 12 8"
        className="pointer-events-none absolute right-3 h-1.5 w-[9px] text-accent"
        aria-hidden="true"
      >
        <polygon points="0,0 12,0 6,8" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * A filter that matched nothing — distinct from the genuinely empty library `page.tsx`
 * still owns, and from a read failure, which is `errors/read-failure.tsx` and never this.
 *
 * `DESIGN.md`, States: *centred, heading at `text-bill-md`, body at `text-note` capped at
 * `60ch`, ghost "Clear the filter" button. Reassures that the library is intact.* Same
 * shape as the empty library, one size down and one button treatment down — `GHOST_RECOVERY`
 * rather than `SOLID_RECOVERY`, because this is a step back, not the one primary action a
 * blank library offers.
 */
export function ZeroMatches({ onClear }: { onClear: () => void }) {
  return (
    <section className="px-6 py-16 text-center">
      {/* The type step is deliberately untouched. `text-bill-md` is the step this shares
          with the read-failure headline, and sharing it is the point — the two are told
          apart by colour and by the failure's accent rule, never by size
          (`errors/failure-treatment.ts`, and `tests/library-surface.test.ts` asserts it).
          The handoff asks these states to be restyled *to the token set only*, so the
          colour moves to `--ink` and the size stays where the relationship needs it. */}
      <h2 className="bill-title text-bill-md text-ink">Nothing under that filter</h2>

      <p className="mx-auto mt-3 max-w-[60ch] text-item text-dim">
        Your library still holds everything it did. Clear the filter to see it again.
      </p>

      <button type="button" onClick={onClear} className={`mt-5 ${GHOST_RECOVERY}`}>
        Clear the filter
      </button>
    </section>
  );
}
