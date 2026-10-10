"use client";

import { useState } from "react";

import { createLibraryBulkSelection } from "./bulk-selection";
import { BulkSelectionProviderTag } from "./bulk-selection-context";
import { SelectionActionBar } from "./selection-action-bar";

/**
 * The selection the Library's cells can join, and the bar it is acted on from — mounted
 * once per grid, above every cell in it.
 *
 * ── One store per grid, not one for the app ──────────────────────────────────────────
 *
 * `useState(createLibraryBulkSelection)` and not a module-level instance: `bulk-selection.ts`'s
 * closing docblock has the reasoning, and the short version is that a selection belongs to
 * one grid rather than to whichever surfaces happen to be showing the same thing — which
 * is the property that made `watchMarks` a singleton and does not hold here.
 *
 * The initialiser form matters. `useState(createLibraryBulkSelection())` would build a
 * fresh store on **every render** and throw all but the first away, which is a store the
 * cells keep re-subscribing to and a selection that survives exactly until the next
 * keystroke in the filter field.
 *
 * ── Every width — the UI overhaul ───────────────────────────────────────────────────
 *
 * This was phone only: a media query here handed the desktop `null`, on the grounds that
 * the desktop was for browsing and the phone for marking (issue #1, constraint 9). The
 * overhaul retired that split, and the desktop gets the same Select button and the same
 * action bar — click to toggle while selecting, shift-click for a range
 * (`selectable-entry.tsx`'s `rangeTo`). A hold still works with a mouse; it is simply not
 * how anyone will start it there.
 */
export function BulkSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selection] = useState(createLibraryBulkSelection);

  return (
    <BulkSelectionProviderTag value={selection}>
      {children}
      <SelectionActionBar />
    </BulkSelectionProviderTag>
  );
}
