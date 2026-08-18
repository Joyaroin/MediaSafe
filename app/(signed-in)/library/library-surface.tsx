"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { LIBRARY_STATES, type LibraryEntryRow, type LibraryState } from "@/db/access";
import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORTS,
  type LibrarySort,
} from "@/db/library-sort";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { LibraryGrid } from "./library-grid";
import { LibraryHeading } from "./library-heading";

/**
 * The populated library: the heading bar's chips, filter field and sort select
 * (`DESIGN.md`, *Chips (library filters)* and *Inputs / Fields*), and the grid or the
 * zero-match state underneath them.
 *
 * ── Two axes, and only one of them is a query ────────────────────────────────────────
 *
 * `entries` arrives already in the order `sort` asked for — that ordering is decided in
 * SQL (`db/access.ts`), because `SPEC.md` §7 makes sort state a URL fact worth linking to.
 * The chip and the filter-by-typing field are the opposite kind of state: they narrow
 * `entries` down without changing its order and without asking Postgres again, because
 * `SPEC.md` §7 gives that promise to sort alone — the whole library is already on the
 * wire, and 472 rows of text is not the read this ticket is worried about.
 *
 * That narrowing has to happen somewhere reactive to a keystroke, which is why this
 * component, `LibraryGrid` and every cell under it now hydrate — see the amendment on
 * `LibraryGrid`'s own comment for the trade this takes on top of #56's original one.
 *
 * ── Zero matches lives here, not on the page ─────────────────────────────────────────
 *
 * `entries.length === 0` is `page.tsx`'s branch: a genuinely empty library, reachable only
 * by a successful query that found nothing. This component is never reached in that case.
 * `visible.length === 0` with `entries.length > 0` is a different fact entirely — the
 * library is intact and the filter matched nothing — and `DESIGN.md`'s States section
 * asks for a third, distinct treatment for exactly that difference.
 */
export function LibrarySurface({
  entries,
  sort,
}: {
  entries: readonly LibraryEntryRow[];
  sort: LibrarySort;
}) {
  const [chip, setChip] = useState<Chip>("all");
  const [filterText, setFilterText] = useState("");

  const visible = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    return entries.filter((entry) => {
      if (chip !== "all" && entry.state !== chip) return false;
      if (needle && !entry.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [entries, chip, filterText]);

  function clearFilter() {
    setChip("all");
    setFilterText("");
  }

  return (
    <>
      <LibraryHeading>
        <LibraryChips value={chip} onChange={setChip} />
        <FilterField value={filterText} onChange={setFilterText} />
        <SortSelect value={sort} />
      </LibraryHeading>

      {visible.length === 0 ? (
        <ZeroMatches onClear={clearFilter} />
      ) : (
        <LibraryGrid entries={visible} />
      )}
    </>
  );
}

/** The six chips, `LibraryState` plus *All* — never a seventh, never reordered. */
type Chip = "all" | LibraryState;

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
 * `DESIGN.md`, Chips: *selected inverts to bone ground with ink text. Unselected is `ink`
 * with dim bone text, hovering to `ink-raised` with bone text. The Watching chip is the
 * one exception: its text is vermilion even when unselected, because vermilion always
 * means live.* One function rather than a lookup table, because there is exactly one
 * exception to name and a table would give it the same shape as five identical rows.
 */
function chipClassName(value: Chip, selected: boolean): string {
  if (selected) return "bg-stock px-3 py-1.5 text-ink code-line";
  if (value === "watching") {
    return "bg-ink px-3 py-1.5 text-signal code-line transition-colors hover:bg-ink-raised";
  }
  return "bg-ink px-3 py-1.5 text-stock-dim code-line transition-colors hover:bg-ink-raised hover:text-stock";
}

export function LibraryChips({
  value,
  onChange,
}: {
  value: Chip;
  onChange: (chip: Chip) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-px bg-rule"
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
          {chip.label}
        </button>
      ))}
    </div>
  );
}

/**
 * `DESIGN.md`, Inputs: *a `1px` `rule-bold` bordered row with a bar icon, `13rem` wide,
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
    <label className="ml-auto flex items-center gap-2 border border-rule-bold px-3 py-1.5 focus-within:border-signal">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-stock-dim" aria-hidden="true">
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
        className="w-52 bg-transparent text-item text-stock placeholder:text-stock-dim focus:outline-none"
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
 * than updating local state. That re-renders `page.tsx`, which re-runs `listLibraryEntries`
 * with the new `ORDER BY` and hands fresh, correctly-ordered `entries` back down — the
 * chip and the filter text are untouched, because they live in `LibrarySurface`, one level
 * below the re-render this causes.
 *
 * The default carries no query string at all: a reader who never touches this control
 * keeps a clean `/library`, and picking *Title A–Z* again — the only selection that can
 * follow a non-default one back to the default — removes `?sort=` rather than writing it
 * out.
 */
function SortSelect({ value }: { value: LibrarySort }) {
  const router = useRouter();
  const pathname = usePathname();

  function onChange(next: LibrarySort) {
    const query = next === DEFAULT_LIBRARY_SORT ? "" : `?sort=${next}`;
    router.push(`${pathname}${query}`);
  }

  return (
    <label className="flex items-center gap-2">
      <span className="code-line text-stock-dim">Sort</span>
      <span className="relative inline-flex items-center">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as LibrarySort)}
          aria-label="Sort the library"
          className="appearance-none border border-rule-bold bg-ink py-1.5 pl-3 pr-9 text-item text-stock focus:border-signal focus:outline-none"
        >
          {LIBRARY_SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 12 8"
          className="pointer-events-none absolute right-3 h-2 w-3 text-signal"
          aria-hidden="true"
        >
          <polygon points="0,0 12,0 6,8" fill="currentColor" />
        </svg>
      </span>
    </label>
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
    <section className="border-t border-rule px-6 py-16 text-center">
      <h2 className="bill-title text-bill-md text-stock">Nothing under that filter</h2>

      <p className="mx-auto mt-3 max-w-[60ch] text-note text-stock-dim">
        Your library still holds everything it did. Clear the filter to see it again.
      </p>

      <button type="button" onClick={onClear} className={`mt-5 ${GHOST_RECOVERY}`}>
        Clear the filter
      </button>
    </section>
  );
}
