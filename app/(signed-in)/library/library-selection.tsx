"use client";

import { createContext, useContext } from "react";

/**
 * Which library entry the desktop programme note is showing, and how a tile changes it.
 *
 * `DESIGN.md`'s Never-Navigate-Away Rule: *selecting a candidate replaces the programme
 * note's contents and leaves the bill exactly where it was.* That is a claim about state,
 * not about routing — there is no URL segment for "which entry is selected" on desktop,
 * on purpose, so this is plain React context rather than a search param or a route.
 *
 * **Two surfaces are held to it, since issue #137** — the library bill and the desktop Up
 * next rails, which swap the same panel by the same rule. Neither provides it directly:
 * `programme-note-layout.tsx` owns the one `useState` and the pane together, so the state and
 * its only reader cannot come apart. It stays in this folder for the same reason that layout
 * does — the pane lives here.
 *
 * `null` is "nothing selected yet" — the pane's own resting state before a first click,
 * not an error and not the same as a failed read (`programme-note.tsx` keeps those
 * separate the same way every other read on this screen does).
 *
 * `select` also serves `library-entry-cell.tsx`'s `aria-current`: `DESIGN.md`'s Library
 * Tile component names *"the current entry carries `aria-current`"*, and knowing which
 * one that is needs this same value, so it is read here rather than duplicated.
 */
interface LibrarySelection {
  readonly selectedEntryId: string | null;
  select(entryId: string): void;
}

const LibrarySelectionContext = createContext<LibrarySelection | null>(null);

export const LibrarySelectionProvider = LibrarySelectionContext.Provider;

/**
 * `null` when there is no pane to select into. The guard is what makes a tile rendered
 * outside either provider a thrown sentence instead of a silent `undefined.select` the
 * first click would hit — and it earned its keep the moment there was a second provider
 * (#137), since a rail is a tile in a place `LibrarySurface` never wrapped.
 */
export function useLibrarySelection(): LibrarySelection {
  const context = useContext(LibrarySelectionContext);
  if (context === null) {
    throw new Error(
      "useLibrarySelection was called outside a LibrarySelectionProvider.",
    );
  }
  return context;
}
