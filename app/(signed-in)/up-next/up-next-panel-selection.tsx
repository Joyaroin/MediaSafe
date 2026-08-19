"use client";

import { useState } from "react";

import { LibrarySelectionProvider } from "@/app/(signed-in)/library/library-selection";

/**
 * Which entry the programme note is showing on the **Up next** page — the second surface to
 * own that state, after `library-surface.tsx` (issue #137).
 *
 * The panel this feeds is the one the Library page already has, imported rather than copied:
 * `ProgrammeNotePane` reads `useLibrarySelection()` and nothing else, so a second surface
 * needs a second provider and no second panel. That is the whole of what #137 asks for when
 * it says *"the panel is the one that already exists on the Library page"* — one read, one
 * pane, one set of write callbacks, and no chance of the two surfaces disagreeing about what
 * a title's detail looks like.
 *
 * **Its own instance, not a shared one.** The two pages are separate routes, so nothing
 * survives between them anyway; what matters is that selection is per-page state and never
 * a URL fact — `library-selection.tsx`'s own docblock has the reasoning, and it holds here
 * for the same reason: this surface never navigates, so a rail's click has nowhere to be
 * recorded but here.
 *
 * A fragment provider, so `page.tsx`'s `<main>` keeps the rails column and the pane as its
 * own two flex children rather than gaining a wrapper between them.
 */
export function UpNextPanelSelection({ children }: { children: React.ReactNode }) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  return (
    <LibrarySelectionProvider
      value={{ selectedEntryId, select: setSelectedEntryId }}
    >
      {children}
    </LibrarySelectionProvider>
  );
}
