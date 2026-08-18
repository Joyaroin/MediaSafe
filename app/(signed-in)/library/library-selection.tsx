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
 * `null` when there is no pane to select into — `library-entry-cell.tsx`'s only caller
 * outside the library route is nothing today, but the guard is what makes "used outside
 * `LibrarySurface`" a thrown sentence instead of a silent `undefined.select` a phone
 * click would otherwise hit.
 */
export function useLibrarySelection(): LibrarySelection {
  const context = useContext(LibrarySelectionContext);
  if (context === null) {
    throw new Error("useLibrarySelection was called outside LibrarySurface.");
  }
  return context;
}
