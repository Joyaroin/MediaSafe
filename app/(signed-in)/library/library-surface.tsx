"use client";

import { useMemo, useState } from "react";

import type { LibraryEntryRow } from "@/db/access";
import type { LibrarySort } from "@/db/library-sort";
import {
  type Chip,
  FilterField,
  LibraryChips,
  SortSelect,
  ZeroMatches,
} from "./library-filter-bar";
import { LibraryGrid } from "./library-grid";
import { LibraryHeading } from "./library-heading";
import { LibrarySelectionProvider } from "./library-selection";
import { ProgrammeNotePane } from "./programme-note";
import { UpNextRow } from "./up-next-row";

/**
 * The populated library's whole shell: TONIGHT above the bill (#100, `up-next-row.tsx`),
 * the heading bar's chips, filter field and sort select (#57, `library-filter-bar.tsx`),
 * the bill on the left, and the programme note on the right (#58, `DESIGN.md`'s
 * Never-Navigate-Away Rule). `library/page.tsx` still does the one server read and decides
 * whether the library is empty; this owns everything a reader can do once it is not.
 *
 * ── Two axes that narrow, one that selects, one that is a real navigation ────────────
 *
 * `entries` arrives already in the order `sort` asked for — decided in SQL
 * (`db/access.ts`), because `SPEC.md` §7 makes sort a URL fact worth linking to. The chip
 * and the filter-by-typing field are the opposite kind of state: they narrow `entries`
 * down client-side, without changing its order and without asking Postgres again — the
 * whole library is already on the wire. **Which entry is selected is a third, independent
 * piece of state** (#58): it never touches `visible`, and a filter that hides the selected
 * tile does not clear the pane — the pane is not reading the grid, it is reading an id.
 *
 * ── Zero matches lives here, not on the page; neither does "nothing selected" ─────────
 *
 * `entries.length === 0` is `page.tsx`'s branch: a genuinely empty library. This component
 * is never reached in that case, so it never needs a pane-less layout — `DESIGN.md`'s pane
 * exists to answer *"tell me about the entry I just clicked"*, and there is always at
 * least one entry here to click. `visible.length === 0` with `entries.length > 0` is a
 * different fact — the library is intact and the filter matched nothing — and
 * `DESIGN.md`'s States section asks for a third, distinct treatment for exactly that
 * difference. The pane renders through it regardless: narrowing the grid's view is not a
 * reason to forget which entry was already open.
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
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

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
    <LibrarySelectionProvider value={{ selectedEntryId, select: setSelectedEntryId }}>
      <main className="flex w-full flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <UpNextRow />

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
        </div>

        <ProgrammeNotePane />
      </main>
    </LibrarySelectionProvider>
  );
}
