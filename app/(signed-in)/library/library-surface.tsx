"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { SegmentedControl } from "@/app/segmented";
import { ListsPanel } from "@/app/(signed-in)/lists/lists-surface";
import type { LibrarySectionEntry, LibrarySectionSummary, ListOverview } from "@/db/access";
import type { LibrarySort } from "@/db/library-sort";
import { BulkSelectionProvider } from "./bulk-selection-provider";
import { EmptyLibrary } from "./empty-library";
import { EmptySection, LibrarySections } from "./library-sections";
import { NothingOfThisKind } from "./nothing-of-this-kind";
import { useIsSelecting } from "./bulk-selection-context";
import { LibraryGrid } from "./library-grid";
import { LibraryHeading } from "./library-heading";
import { type LibrarySection, sectionHeading, sectionsHref } from "./library-section";
import { SortSelect } from "./library-sort-select";
import {
  LIBRARY_VIEWS,
  defaultLibraryView,
  keepLibraryView,
  rememberedLibraryView,
  subscribeToLibraryView,
  type LibraryView,
} from "./library-view";

/**
 * Library — issue #357: everything a reader keeps, in three tabs. Shows and Films are
 * grouped into sections by where each title stands (issue #552); Lists is the lists screen.
 *
 * ── Which tab ────────────────────────────────────────────────────────────────────────
 *
 * A link can name one (`?view=lists`, where a list's back control leads); otherwise it is
 * the one this reader last chose on this device, rather than Shows on every visit. A link
 * to a section's grid names its kind too (`page.tsx` hands that over as `initialView`).
 *
 * ── Two screens, and only one of them selects ────────────────────────────────────────
 *
 * - **The sections** (`?section=` absent or unknown): each kind's non-empty sections, one
 *   row each (`library-sections.tsx`). There is no sort and no selection here.
 * - **A section's full grid** (`?section=<slug>`): that section's entries in its own order,
 *   the sort control, a back control, and hold-to-select with its action bar. Only this
 *   screen has a `BulkSelectionProvider`, which is what keeps the selection out of a row.
 *
 * `entries` arrive in the order the page's SQL gave them; nothing here sorts.
 *
 * ── Empty, nothing of this kind and an empty section are three different facts ───────
 *
 * An empty library, a kind with nothing in it, and a section with nothing in it each get
 * their own treatment; none of them is ever a failed read, which throws past all three.
 */
export type LibraryShown =
  | { readonly mode: "sections"; readonly sections: readonly LibrarySectionSummary[] }
  | {
      readonly mode: "section";
      readonly section: LibrarySection;
      readonly entries: readonly LibrarySectionEntry[];
      /** The reader's `?sort=`, or `null` for the section's own order. */
      readonly sort: LibrarySort | null;
    };

export function LibrarySurface({
  shown,
  libraryEmpty,
  lists,
  initialView,
}: {
  shown: LibraryShown;
  /** Nothing stored at all, in either kind — `page.tsx` reads it off the counts. */
  libraryEmpty: boolean;
  lists: readonly ListOverview[];
  /** The tab a link named, which wins over the remembered one for this visit. */
  initialView: LibraryView | null;
}) {
  return (
    <main className="flex w-full flex-1 flex-col">
      {shown.mode === "section" && !libraryEmpty ? (
        <BulkSelectionProvider>
          <SectionGrid
            section={shown.section}
            entries={shown.entries}
            sort={shown.sort}
          />
        </BulkSelectionProvider>
      ) : (
        <SectionsColumn
          sections={shown.mode === "sections" ? shown.sections : []}
          libraryEmpty={libraryEmpty}
          lists={lists}
          initialView={initialView}
        />
      )}
    </main>
  );
}

function SectionsColumn({
  sections,
  libraryEmpty,
  lists,
  initialView,
}: {
  sections: readonly LibrarySectionSummary[];
  libraryEmpty: boolean;
  lists: readonly ListOverview[];
  initialView: LibraryView | null;
}) {
  const remembered = useSyncExternalStore(
    subscribeToLibraryView,
    rememberedLibraryView,
    defaultLibraryView,
  );
  const [linked, setLinked] = useState(initialView);
  const view = linked ?? remembered;

  function choose(next: LibraryView) {
    keepLibraryView(next);
    setLinked(null);
  }

  // Empty sections are hidden, here and nowhere else: a section with a count of zero is a
  // successful read, and the page returns it so that this file can tell a kind with
  // nothing in it from an empty library.
  const ofThisKind = view === "lists" ? [] : sections.filter((one) => one.section.kind === view);
  const shownSections = ofThisKind.filter((one) => one.count > 0);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <LibraryHeading control={<LibraryTabs value={view} onChange={choose} />} />

      {view === "lists" ? (
        <ListsPanel initial={lists} />
      ) : libraryEmpty ? (
        <EmptyLibrary />
      ) : shownSections.length === 0 ? (
        <NothingOfThisKind mode={view} />
      ) : (
        <LibrarySections sections={shownSections} />
      )}
    </div>
  );
}

/**
 * A section's full grid. The back control and the sort step aside while a selection is open,
 * as the tabs did: a sort chosen mid-selection would reorder the grid under the reader's hand.
 */
function SectionGrid({
  section,
  entries,
  sort,
}: {
  section: LibrarySection;
  entries: readonly LibrarySectionEntry[];
  sort: LibrarySort | null;
}) {
  const selecting = useIsSelecting();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <LibraryHeading
        title={sectionHeading(section)}
        back={selecting ? null : <BackToLibrary kind={section.kind} />}
      >
        {!selecting ? (
          <div className="mt-2 flex items-center justify-end gap-2 lg:mt-4">
            <SortSelect section={section} value={sort} />
          </div>
        ) : null}
      </LibraryHeading>

      {entries.length === 0 ? <EmptySection section={section} /> : <LibraryGrid entries={entries} />}
    </div>
  );
}

/** Back to the sections, on the same kind's tab. */
function BackToLibrary({ kind }: { kind: LibrarySection["kind"] }) {
  return (
    <Link
      href={sectionsHref(kind)}
      className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-item font-medium text-dim hover:text-text"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m15 6-6 6 6 6" />
      </svg>
      Back to Library
    </Link>
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
      className="mt-4 w-full lg:mt-0 lg:w-[340px]"
    />
  );
}
