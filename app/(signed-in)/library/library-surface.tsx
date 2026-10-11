"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { SegmentedControl } from "@/app/segmented";
import { ListsPanel } from "@/app/(signed-in)/lists/lists-surface";
import type { LibraryEntryRow, ListSummary } from "@/db/access";
import type { LibrarySort } from "@/db/library-sort";
import {
  type Chip,
  FilterField,
  LibraryChips,
  SortSelect,
  ZeroMatches,
} from "./library-filter-bar";
import { BulkSelectionProvider } from "./bulk-selection-provider";
import { EmptyLibrary } from "./empty-library";
import { FilmGroups } from "./film-groups";
import { NothingOfThisKind } from "./nothing-of-this-kind";
import { useBulkSelection, useIsSelecting } from "./bulk-selection-context";
import { LibraryGrid } from "./library-grid";
import { LibraryHeading } from "./library-heading";
import {
  LIBRARY_VIEWS,
  defaultLibraryView,
  keepLibraryView,
  rememberedLibraryView,
  subscribeToLibraryView,
  type LibraryView,
} from "./library-view";

/**
 * Library — issue #357: everything a reader keeps, in three tabs. Shows and Films are the
 * grid; Lists is the lists screen, which used to be a destination of its own that a phone
 * could not reach until a list already existed.
 *
 * ── Which tab ────────────────────────────────────────────────────────────────────────
 *
 * A link can name one (`?view=lists`, where a list's back control leads); otherwise it is
 * the one this reader last chose on this device, rather than Shows on every visit.
 *
 * ── Two axes that narrow, one that is a real navigation ──────────────────────────────
 *
 * `entries` arrives already in the order `sort` asked for — decided in SQL, because sort is
 * a URL fact worth linking to. The chip and the filter field narrow `entries` client-side,
 * without changing its order and without asking Postgres again.
 *
 * ── Empty, zero matches, and nothing of this kind are three different facts ──────────
 *
 * An empty library, a kind with nothing in it, and a filter that matched nothing each get
 * their own treatment; none of them is ever a failed read, which throws past all three.
 *
 * ── The controls hide while selecting ────────────────────────────────────────────────
 *
 * A chip pressed mid-selection would narrow the grid under the reader's hand and leave
 * selected titles filed that they can no longer see, so the tabs, chips, filter and sort
 * all step aside until *Done*. `chip` and `filterText` live here rather than in the bar, so
 * the reader comes back to the grid they left.
 */
export function LibrarySurface({
  entries,
  sort,
  lists,
  initialView,
}: {
  entries: readonly LibraryEntryRow[];
  sort: LibrarySort;
  lists: readonly ListSummary[];
  /** The tab a link named, which wins over the remembered one for this visit. */
  initialView: LibraryView | null;
}) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <BulkSelectionProvider>
        <LibraryColumn entries={entries} sort={sort} lists={lists} initialView={initialView} />
      </BulkSelectionProvider>
    </main>
  );
}

function LibraryColumn({
  entries,
  sort,
  lists,
  initialView,
}: {
  entries: readonly LibraryEntryRow[];
  sort: LibrarySort;
  lists: readonly ListSummary[];
  initialView: LibraryView | null;
}) {
  const selecting = useIsSelecting();
  const bulk = useBulkSelection();

  const remembered = useSyncExternalStore(
    subscribeToLibraryView,
    rememberedLibraryView,
    defaultLibraryView,
  );
  const [linked, setLinked] = useState(initialView);
  const view = linked ?? remembered;

  const [chip, setChip] = useState<Chip>("all");
  const [filterText, setFilterText] = useState("");

  const ofThisKind = useMemo(
    () => (view === "lists" ? [] : entries.filter((entry) => entry.kind === view)),
    [entries, view],
  );

  const visible = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    return ofThisKind.filter((entry) => {
      // The chips are the show states; a film has only watched or not, and its groups
      // already say which.
      if (view === "show" && chip !== "all" && entry.state !== chip) return false;
      if (needle && !entry.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [ofThisKind, view, chip, filterText]);

  function clearFilter() {
    setChip("all");
    setFilterText("");
  }

  function choose(next: LibraryView) {
    keepLibraryView(next);
    setLinked(null);
    clearFilter();
  }

  const titleView = view !== "lists";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <LibraryHeading>
        {selecting ? null : (
          <>
            <LibraryTabs value={view} onChange={choose} />

            {titleView && entries.length > 0 ? (
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                {view === "show" ? (
                  <div className="min-w-0 lg:flex-1">
                    <LibraryChips value={chip} onChange={setChip} />
                  </div>
                ) : (
                  <div className="hidden lg:block lg:flex-1" />
                )}
                <div className="flex items-center gap-2.5 lg:w-[380px]">
                  <FilterField value={filterText} onChange={setFilterText} />
                  <SortSelect value={sort} />
                  {bulk === null ? null : (
                    <button
                      type="button"
                      onClick={() => bulk.begin()}
                      className={SECONDARY_BUTTON_COMPACT}
                    >
                      Select
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </LibraryHeading>

      {view === "lists" ? (
        <ListsPanel initial={lists} />
      ) : entries.length === 0 ? (
        <EmptyLibrary />
      ) : ofThisKind.length === 0 ? (
        <NothingOfThisKind mode={view} />
      ) : visible.length === 0 ? (
        <ZeroMatches onClear={clearFilter} />
      ) : view === "film" ? (
        <FilmGroups entries={visible} />
      ) : (
        <LibraryGrid entries={visible} />
      )}
    </div>
  );
}

/** Shows, Films, Lists — the one control that changes what Library is showing. */
function LibraryTabs({
  value,
  onChange,
}: {
  value: LibraryView;
  onChange: (view: LibraryView) => void;
}) {
  return (
    <SegmentedControl
      label="What to show"
      options={LIBRARY_VIEWS}
      value={value}
      onChange={onChange}
      layoutId="library-view"
      className="mt-4 w-full lg:max-w-[420px]"
    />
  );
}
