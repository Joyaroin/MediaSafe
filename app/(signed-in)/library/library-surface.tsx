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
import { BulkSelectionProvider } from "./bulk-selection-provider";
import { useBulkSelectionView } from "./bulk-selection-context";
import { LibraryGrid } from "./library-grid";
import { LibraryHeading } from "./library-heading";
import { ProgrammeNoteLayout } from "./programme-note-layout";

/**
 * The populated library's whole shell: the heading bar's chips, filter field and sort
 * select (#57, `library-filter-bar.tsx`), the bill on the left, and the programme note on
 * the right (#58, `DESIGN.md`'s Never-Navigate-Away Rule). `library/page.tsx` still does
 * the one server read and decides whether the library is empty; this owns everything a
 * reader can do once it is not.
 *
 * ── TONIGHT lived here once — issue #136 moved it out ────────────────────────────────
 *
 * Issue #100 put a desktop-only *Up next* row (`up-next-row.tsx`) above the bill, because
 * Up next was not a desktop destination of its own yet — `SPEC.md` §7 said so explicitly.
 * #136 gave Up next a real desktop page (`sidebar.tsx`'s own destination, rendering
 * `(signed-in)/up-next/page.tsx`) and, with it, deleted the row: a reader who wants what
 * they are part-way through now has a page for it rather than a second, narrower copy of
 * the same read squeezed above the library grid. This component and `SPEC.md` §7's own
 * layout divergence 1 were amended in the same diff for the same reason.
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
  return (
    <ProgrammeNoteLayout>
      {/* Above every cell in the grid, and above the action bar it renders itself — issue
          #197. Inside `ProgrammeNoteLayout` rather than around it, because the bill is the
          only thing a selection is about; the programme note beside it keeps the click it
          has always had, and there is no provider over it to take one. */}
      <BulkSelectionProvider>
        <LibraryColumn entries={entries} sort={sort} />
      </BulkSelectionProvider>
    </ProgrammeNoteLayout>
  );
}

/**
 * The bill's own column: the filter bar, and the grid or its zero-matches state.
 *
 * Split out of `LibrarySurface` by #197 for one reason — it has to read the selection, and
 * a component cannot read a context it provides. The state and the markup are unchanged.
 *
 * ── The filter bar is hidden while selecting ─────────────────────────────────────────
 *
 * The ticket's reason, which is about correctness rather than clutter: *the Library's
 * filter bar is hidden for the duration, which makes it impossible to end up acting on
 * titles no longer on screen.* A chip pressed mid-selection would narrow `visible` under
 * the reader's hand and leave selected titles filed that they can no longer see — and the
 * store deliberately does not drop a title because the grid stopped showing it, since a
 * selection that silently shrinks is worse than one that cannot be narrowed.
 *
 * The **heading stays**, and only the controls under it go. `LibraryGrid` points
 * `aria-labelledby` at `LIBRARY_HEADING_ID`, and the empty library and the failure
 * boundary already render this heading childless, so a selection is a third caller of a
 * shape that exists rather than a fourth arrangement of the bar.
 *
 * `chip` and `filterText` live in this component rather than in the bar, so the filter
 * they describe survives the controls being taken away: the reader comes back after *Done*
 * to the grid they left, not to one that quietly reset itself while they were choosing.
 */
function LibraryColumn({
  entries,
  sort,
}: {
  entries: readonly LibraryEntryRow[];
  sort: LibrarySort;
}) {
  const selection = useBulkSelectionView();
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
    <div className="flex min-w-0 flex-1 flex-col">
      <LibraryHeading>
        {selection?.selecting ? null : (
          <>
            <LibraryChips value={chip} onChange={setChip} />

            {/* The filter field and the sort control share one row under the chips — turn
                9's shape, and the reason `LibraryHeading` is a column now. The field takes
                the width (`flex-1`) and the sort control sits at its end. */}
            <div className="mt-3 flex items-center gap-2.5">
              <FilterField value={filterText} onChange={setFilterText} />
              <SortSelect value={sort} />
            </div>
          </>
        )}
      </LibraryHeading>

      {visible.length === 0 ? (
        <ZeroMatches onClear={clearFilter} />
      ) : (
        <LibraryGrid entries={visible} />
      )}
    </div>
  );
}
