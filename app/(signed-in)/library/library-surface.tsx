"use client";

import { useState } from "react";

import { LibrarySelectionProvider } from "./library-selection";
import { ProgrammeNotePane } from "./programme-note";

/**
 * The library's whole shell — the bill on the left, the programme note on the right —
 * and the one piece of client state issue #58 adds to a screen that was entirely server
 * rendered before it: which entry is selected. `library/page.tsx` still does all the
 * reading; this only owns where a click on a tile goes.
 *
 * ── `children` is the bill, server-rendered, untouched ────────────────────────────────
 *
 * `LibraryHeading` and `LibraryGrid` (or `EmptyLibrary`) are passed in rather than
 * rendered here, so the 472-row grid stays exactly what `library-grid.tsx` already
 * documents it as: a server component whose only client-side surface is the thin
 * `SelectableEntry` wrapper each cell's button sits inside. Wrapping this file around
 * them, instead of the reverse, is what keeps that true — a client component's props may
 * be server-rendered elements, and passing `children` is the whole trick.
 *
 * ── No pane over an empty library ─────────────────────────────────────────────────────
 *
 * `hasEntries` decides whether `ProgrammeNotePane` renders at all. An empty library has
 * nothing to select, and `DESIGN.md`'s pane exists to answer *"tell me about the entry I
 * just clicked"* — there is no such entry yet, and a pane sitting there anyway would be
 * reserved space for a feature with nothing to show, which `SPEC.md` §9 forbids on
 * exactly this screen.
 */
export function LibrarySurface({
  hasEntries,
  children,
}: {
  hasEntries: boolean;
  children: React.ReactNode;
}) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  return (
    <LibrarySelectionProvider value={{ selectedEntryId, select: setSelectedEntryId }}>
      <main className="flex w-full flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        {hasEntries ? <ProgrammeNotePane /> : null}
      </main>
    </LibrarySelectionProvider>
  );
}
