"use client";

import { useMemo, useState } from "react";

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
import { FilmGroups } from "./film-groups";
import { DEFAULT_KIND_MODE, type KindMode } from "./kind-mode";
import { KindModeControl } from "./kind-mode-control";
import { NothingOfThisKind } from "./nothing-of-this-kind";
import { useIsSelecting } from "./bulk-selection-context";
import { LibraryGrid } from "./library-grid";
import { LibraryHeading } from "./library-heading";
import { ListsRail } from "./lists-rail";

/**
 * The populated library's whole shell: the heading bar's chips, filter field and sort
 * select (#57, `library-filter-bar.tsx`), the bill on the left, and the programme note on
 * the right (#58, the Never-Navigate-Away Rule). `library/page.tsx` still does
 * the one server read and decides whether the library is empty; this owns everything a
 * reader can do once it is not.
 *
 * ── TONIGHT lived here once — issue #136 moved it out ────────────────────────────────
 *
 * Issue #100 put a desktop-only *Up next* row (`up-next-row.tsx`) above the bill, because
 * Up next was not a desktop destination of its own yet, explicitly.
 * #136 gave Up next a real desktop page (`sidebar.tsx`'s own destination, rendering
 * `(signed-in)/up-next/page.tsx`) and, with it, deleted the row: a reader who wants what
 * they are part-way through now has a page for it rather than a second, narrower copy of
 * the same read squeezed above the library grid. This component and
 * layout divergence 1 were amended in the same diff for the same reason.
 *
 * ── Two axes that narrow, one that selects, one that is a real navigation ────────────
 *
 * `entries` arrives already in the order `sort` asked for — decided in SQL
 * (`db/access.ts`), because sort is a URL fact worth linking to. The chip
 * and the filter-by-typing field are the opposite kind of state: they narrow `entries`
 * down client-side, without changing its order and without asking Postgres again — the
 * whole library is already on the wire. **Which entry is selected is a third, independent
 * piece of state** (#58): it never touches `visible`, and a filter that hides the selected
 * tile does not clear the pane — the pane is not reading the grid, it is reading an id.
 *
 * ── Zero matches lives here, not on the page; neither does "nothing selected" ─────────
 *
 * `entries.length === 0` is `page.tsx`'s branch: a genuinely empty library. This component
 * is never reached in that case, so it never needs a pane-less layout — the pane
 * exists to answer *"tell me about the entry I just clicked"*, and there is always at
 * least one entry here to click. `visible.length === 0` with `entries.length > 0` is a
 * different fact — the library is intact and the filter matched nothing — and
 * the States register asks for a third, distinct treatment for exactly that
 * difference. The pane renders through it regardless: narrowing the grid's view is not a
 * reason to forget which entry was already open.
 */
export function LibrarySurface({
  entries,
  sort,
  lists,
}: {
  entries: readonly LibraryEntryRow[];
  sort: LibrarySort;
  /** Issue #223: every list, for the phone-only rail above the grid. */
  lists: readonly ListSummary[];
}) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <BulkSelectionProvider>
        <LibraryColumn entries={entries} sort={sort} lists={lists} />
      </BulkSelectionProvider>
    </main>
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
 *
 * ── The Lists rail hides with the filter bar during selection — issue #223 ───────────
 *
 * `ListsRail` reads no selection state of its own; this component's one `useIsSelecting()`
 * read below covers it too, the same way it already covers the chips, the field and the
 * sort control. That is the same reason restated for a second control: a chip or a list
 * card pressed mid-selection would act on titles the selection can no longer show.
 */
function LibraryColumn({
  entries,
  sort,
  lists,
}: {
  entries: readonly LibraryEntryRow[];
  sort: LibrarySort;
  lists: readonly ListSummary[];
}) {
  // The boolean and not the snapshot: this component renders the whole grid under it, and
  // subscribing to every change would re-render all 472 cells on every tap
  // (`bulk-selection-context.ts`). It re-renders when the mode opens and when it closes.
  const selecting = useIsSelecting();
  const [mode, setMode] = useState<KindMode>(DEFAULT_KIND_MODE);
  const [chip, setChip] = useState<Chip>("all");
  const [filterText, setFilterText] = useState("");

  /**
   * Everything of the current kind, before the chip and the filter narrow it.
   *
   * Kept apart from `visible` below because the two answer different questions, and the
   * screen has to be able to tell them apart. *Nothing of this kind* is about this list
   * being empty; *nothing under that filter* is about this list being non-empty and the
   * narrowed one being empty. Computing only the second would leave no way to say which
   * of the two happened.
   */
  const ofThisKind = useMemo(
    () => entries.filter((entry) => entry.kind === mode),
    [entries, mode],
  );

  const visible = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    return ofThisKind.filter((entry) => {
      // The chips do not exist in Films mode — `FilmGroups` replaces them — so `chip` is
      // whatever it was left on in Shows mode and must not narrow anything here.
      if (mode === "show" && chip !== "all" && entry.state !== chip) return false;
      if (needle && !entry.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [ofThisKind, mode, chip, filterText]);

  function clearFilter() {
    setChip("all");
    setFilterText("");
  }

  /**
   * Switching mode clears the filter text along with the chip.
   *
   * The alternative — carrying a half-typed name across — lands the reader on the other
   * mode's screen already narrowed by something they typed about a different set of
   * titles, most often on *Nothing under that filter*. Nothing is lost: the field is right
   * there, and its content was about the screen they just left.
   */
  function changeMode(next: KindMode) {
    setMode(next);
    clearFilter();
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <LibraryHeading>
        {selecting ? null : (
          <>
            <KindModeControl value={mode} onChange={changeMode} />

            {/* Shows only. Two of the six chips describe being part-way through a run of
                episodes, which is not a thing a film can be, and Films mode
                shows all three of its states at once as groups instead. */}
            {mode === "show" ? <LibraryChips value={chip} onChange={setChip} /> : null}

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

      {selecting ? null : <ListsRail lists={lists} />}

      {/* The order of these three matters, and it is the order of the questions.
          *Is there anything of this kind at all* comes first, because a reader with no
          films has not filtered anything — telling them to clear a filter they never set
          is the confusion the rule is about. Only once there is something to narrow
          can narrowing to nothing mean anything. */}
      {ofThisKind.length === 0 ? (
        <NothingOfThisKind mode={mode} />
      ) : visible.length === 0 ? (
        <ZeroMatches onClear={clearFilter} />
      ) : mode === "film" ? (
        <FilmGroups entries={visible} />
      ) : (
        <LibraryGrid entries={visible} />
      )}
    </div>
  );
}
