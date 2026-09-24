"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { createLibraryBulkSelection } from "./bulk-selection";
import { BulkSelectionProviderTag } from "./bulk-selection-context";
import { SelectionActionBar } from "./selection-action-bar";
import { DESKTOP_BREAKPOINT } from "./selectable-entry";

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
 * ── Phone only, and the one honest way to say so here ────────────────────────────────
 *
 * The ticket asks for availability to be *decided by whether a selection provider sits
 * above the cell in the tree, not by a media query*, and the first half of that is exactly
 * what `bulk-selection-context.ts` gives every cell: it asks the tree, gets `null` on the
 * desktop, and holds no opinion about widths. **The second half cannot be honoured as
 * written, and this is the deviation.**
 *
 * `up-next/page.tsx` is the shape the ticket is describing — the phone's groups and the
 * desktop's rails are two separate subtrees, one behind `lg:hidden` and one behind
 * `hidden lg:block`, so the sheet's provider is mounted inside the phone's and the
 * desktop's tiles simply never meet it. The Library has no such pair. It is fixed
 * at one grid — *"the library tile and grid. Same component, same information. Column
 * count differs; nothing else does"* — and `library-grid.tsx` renders that one grid at
 * every width. There is nowhere to mount a provider that a desktop cell does not sit under,
 * short of rendering all 472 cells twice.
 *
 * So the decision is a media query, and it is **here, once**, at the same `1024px`
 * `selectable-entry.tsx` already owns — the constant is imported rather than retyped so
 * this cannot become the second copy of that number. Every cell below still reads
 * availability off the tree, which is the property the ticket's sentence is protecting: no
 * cell measures anything, and the desktop's programme note keeps the click it has always
 * had because there is no provider above it to take one.
 *
 * ── Crossing the breakpoint ends the mode ────────────────────────────────────────────
 *
 * Subscribed rather than read once, so a window dragged past `1024px` mid-selection is
 * answered rather than ignored. `selectable-entry.tsx` gives the reason for its own live
 * check — *resizing past the breakpoint mid-session changes which one a click does without
 * a reload* — and this is the same fact with more at stake: the action bar is `lg:hidden`,
 * so a selection left open past the breakpoint would be a mode with no way out of it.
 *
 * The server snapshot is `true` — *desktop, no selection* — because there is no viewport
 * to measure during a server render and a first paint that offers a hold it cannot honour
 * would be worse than one that offers nothing for a few milliseconds.
 */
function subscribeToDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_BREAKPOINT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_BREAKPOINT).matches,
    () => true,
  );
}

export function BulkSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selection] = useState(createLibraryBulkSelection);
  const desktop = useIsDesktop();

  useEffect(() => {
    // The store outlives the provider value going `null`, so an in-flight write and its
    // toast survive the resize exactly as `watch-marks.ts`'s records outlive their
    // surfaces. What does not survive is the mode: `end()` clears it, and every cell has
    // already stopped reading this store by the time this runs.
    if (desktop) selection.end();
  }, [desktop, selection]);

  const available = desktop ? null : selection;

  return (
    <BulkSelectionProviderTag value={available}>
      {children}
      <SelectionActionBar />
    </BulkSelectionProviderTag>
  );
}
