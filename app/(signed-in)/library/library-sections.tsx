"use client";

import Link from "next/link";
import { useState } from "react";

import type { LibrarySectionEntry, LibrarySectionSummary } from "@/db/access";
import { EMPTY_PANEL } from "@/app/buttons";
import { LibraryEntryCell } from "./library-entry-cell";
import {
  type LibrarySection,
  sectionHeading,
  sectionHref,
} from "./library-section";

/**
 * Library's sections (issue #552, spec "Library: sections"): one heading per state, the
 * entries' count, and one horizontally scrolling row of the section's first twelve posters.
 *
 * ── What it replaced ─────────────────────────────────────────────────────────────────
 *
 * Six status chips over one grid, and for Films a three-group grid (since deleted,
 * which refused to call a finished film *Watched* because a dropped film can have watches too).
 * Both are this now. A film that is finished is **Watched** on purpose — the reversal the
 * spec names — and a dropped film with a watch stays under Dropped, which is a section of
 * its own and is read first (`db/access.ts`'s `sectionWhere`).
 *
 * ── Empty sections are not drawn ─────────────────────────────────────────────────────
 *
 * A heading over nothing is a control with nothing to act on. A kind with no section at all
 * is `NothingOfThisKind`'s, and an empty library is `EmptyLibrary`'s; the caller
 * (`library-surface.tsx`) decides which, from the counts.
 *
 * ── No selection in a row ────────────────────────────────────────────────────────────
 *
 * Hold-to-select works only in a section's full grid. The sections are rendered outside the
 * `BulkSelectionProvider`, so a cell here is a plain button that opens the title: there is
 * no mode to hold into, and no action bar.
 *
 * ── Dropped is closed, on every visit ────────────────────────────────────────────────
 *
 * Its heading is a disclosure, and its state is plain component state: nothing stores it,
 * so a reload, or coming back from a title, finds it closed. Its count still opens the full
 * grid when it is closed.
 */
export function LibrarySections({
  sections,
}: {
  /** The sections of the one kind on screen, empty ones already left out. */
  sections: readonly LibrarySectionSummary[];
}) {
  return (
    <>
      {sections.map(({ section, count, entries }, index) => (
        <SectionBlock
          key={`${section.kind}-${section.slug}`}
          section={section}
          count={count}
          entries={entries}
          aboveFold={index === 0}
        />
      ))}
    </>
  );
}

function SectionBlock({
  section,
  count,
  entries,
  aboveFold,
}: {
  section: LibrarySection;
  count: number;
  entries: readonly LibrarySectionEntry[];
  aboveFold: boolean;
}) {
  const heading = sectionHeading(section);
  const headingId = `library-section-${section.kind}-${section.slug}`;
  const rowId = `${headingId}-row`;
  const collapsible = section.slug === "dropped";
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby={headingId} className="mt-6 first:mt-2">
      <div className="flex min-h-11 items-center justify-between gap-3 px-gutter lg:px-10">
        {/* The uppercase 11px `label-line` register the film groups used: these name a
            region of one screen, and a heading that competes with the screen title would
            read as several screens. */}
        <h2 id={headingId} className="label-line min-w-0 text-dim">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={rowId}
              onClick={() => setOpen((was) => !was)}
              className="flex min-h-11 items-center gap-1.5 text-left uppercase"
            >
              {heading}
              <Chevron className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
          ) : (
            heading
          )}
        </h2>

        {/* The count is the way into the full grid. Its name starts with what it shows. */}
        <Link
          href={sectionHref(section)}
          aria-label={`${count} in ${heading}, see all`}
          className="flex min-h-11 shrink-0 items-center gap-1 px-1 text-item font-medium text-text hover:text-dim"
          data-numeric
        >
          {count}
          <Chevron className="h-4 w-4" />
        </Link>
      </div>

      {collapsible && !open ? null : (
        <ol
          id={rowId}
          aria-labelledby={headingId}
          // Scrolls on both devices. The scrollbar is hidden on a phone, where a swipe is
          // the gesture, and left thin on a desktop, where a mouse wheel does not scroll
          // sideways and a bar is the way a row can be seen to scroll at all.
          className="stagger-rise flex snap-x scroll-px-gutter gap-x-3.5 overflow-x-auto px-gutter pt-2 pb-2 lg:scroll-px-10 [scrollbar-width:none] lg:px-10 lg:[scrollbar-width:thin] [&::-webkit-scrollbar]:hidden lg:[&::-webkit-scrollbar]:block"
        >
          {entries.map((entry, index) => (
            <LibraryEntryCell
              key={entry.libraryEntryId}
              entry={entry}
              aboveFold={aboveFold && index < 3}
              inRow
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function Chevron({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * A section's full grid with nothing in it — `/library?section=<slug>` for a section that is
 * empty, which is a successful read and a link a reader may have kept. Not the empty library
 * (`empty-library.tsx`: nothing stored at all) and not a failed read (`error.tsx`).
 */
export function EmptySection({ section }: { section: LibrarySection }) {
  const heading = sectionHeading(section);

  return (
    <section className={EMPTY_PANEL}>
      <h2 className="bill-title text-bill-md text-text">Nothing in {heading}</h2>

      <p className="mt-2 max-w-[60ch] text-item text-dim">
        No {section.kind === "film" ? "films" : "shows"} are in this section right now. Go back
        to see the rest of your library.
      </p>
    </section>
  );
}
