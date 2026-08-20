"use client";

import { startTransition, useState } from "react";

import { LibrarySelectionProvider } from "./library-selection";
import { ProgrammeNotePane } from "./programme-note";

/**
 * **A surface on the left, the programme note on the right, and which entry is open between
 * them** — `DESIGN.md`'s Never-Navigate-Away Rule as one component, so the two surfaces that
 * follow it cannot follow it differently.
 *
 * Extracted in #137, which is the ticket that made it two. The library bill has had this
 * shape since #58; the desktop Up next rails needed the same one — *"the panel is the one
 * that already exists on the Library page"* — and the three parts a caller would otherwise
 * have restated are all load-bearing:
 *
 *  - **The `<main>` and its axis.** `lg:flex-row` is what makes the pane a column beside the
 *    surface rather than a block under it, and `min-w-0` on the left child (the caller's,
 *    since only the caller knows what it wraps) is what stops a long title widening the page.
 *  - **The selection state.** One `useState` per page instance, never a URL segment: on
 *    desktop the URL does not change when a tile is picked, which is the whole point of the
 *    rule. `library-selection.tsx`'s docblock has the reasoning.
 *  - **The pane itself.** `ProgrammeNotePane` renders only past `lg` and reads nothing but
 *    the context above, so a second surface needs a second provider and no second pane.
 *
 * A caller passes the left-hand column as `children` and nothing else. It stays in the
 * `library/` folder because the pane it wraps does, and moving either would put the state
 * further from the one component that reads it.
 *
 * `select` wraps the state write in `startTransition` — issue #141's whole reason for
 * being here rather than staying the plain `setSelectedEntryId` it was before: a regular
 * `setState` never activates a `<ViewTransition>`, only a Transition does
 * (`programme-note.tsx`'s docblock has the rest of the morph).
 */
export function ProgrammeNoteLayout({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<{
    entryId: string;
    posterPath: string | null;
  } | null>(null);

  function select(entryId: string, posterPath: string | null = null) {
    startTransition(() => setSelection({ entryId, posterPath }));
  }

  return (
    <LibrarySelectionProvider
      value={{
        selectedEntryId: selection?.entryId ?? null,
        selectedPosterPath: selection?.posterPath ?? null,
        select,
      }}
    >
      <main className="flex w-full flex-1 flex-col lg:flex-row">
        {children}
        <ProgrammeNotePane />
      </main>
    </LibrarySelectionProvider>
  );
}
