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
 *
 * ── `selectedPosterPath`, and why it travels with the id ──────────────────────────────
 *
 * Issue #141: the pane's poster morphs out of the rail tile that opened it, and the
 * morph has to start in the same commit that deselects the tile — waiting for
 * `titleDetailAction` to resolve first would deselect the tile one commit, then mount
 * the pane's poster a separate commit later, which the browser sees as an exit and an
 * unrelated enter rather than one shared-element move. The tile already has this fact
 * in hand (`UpNextEntry.posterPath`) the moment it is pressed, so it is passed alongside
 * the id rather than re-read from the eventual `titleDetailAction` answer.
 *
 * A caller with no poster to hand over omits it, and the pane simply mounts its loading
 * poster nameless: no morph, the same plain swap this selection gave every candidate
 * before #141.
 *
 * **`selectable-entry.tsx` was that caller until issue #303**, which is the ticket that
 * gave the library grid a transition name to hand over in the first place — quoted here as
 * a reversal because this file's own reasoning was the citation for why it did not.
 */
interface LibrarySelection {
  readonly selectedEntryId: string | null;
  readonly selectedPosterPath: string | null;
  select(entryId: string, posterPath?: string | null): void;
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
