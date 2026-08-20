"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

import {
  NO_SELECTION,
  type BulkSelection,
  type BulkSelectionView,
} from "./bulk-selection";

/**
 * The seam between a library cell and the selection it can join — **and nothing else**.
 *
 * ── Availability is a fact about the tree ────────────────────────────────────────────
 *
 * Issue #197: *availability is decided by whether a selection provider sits above the cell
 * in the tree, not by a media query.* So `useBulkSelection()` answers `null` outside a
 * provider and a cell rendered there is exactly the cell it was before this ticket — no
 * hold, no badge, no toggle. That is the same nullable shape `up-next/title-sheet-context.ts`
 * uses and the opposite of `useLibrarySelection`, which throws: a library cell outside the
 * programme note's provider is a mistake with no correct fallback, and a library cell
 * outside *this* one is the ordinary desktop case.
 *
 * ── Why the context is not in the provider's file ────────────────────────────────────
 *
 * `title-sheet-context.ts`'s reason, and it bites the same way here: the provider imports
 * `bulk-selection.ts`, which reaches `lists/actions.ts` and through it `db/access.ts` and
 * `server-only`. A cell needs to know *whether there is a selection and how to join it*
 * and nothing about how a list is written, so keeping the two apart is what stops
 * `library-entry-cell.tsx` — and `library/loading.tsx` behind it — from transitively
 * importing the database.
 *
 * ── The four readers, and why they are hooks rather than raw context ─────────────────
 *
 * Every reader of an external store has to go through `useSyncExternalStore`, and every
 * one of them has the same awkwardness to handle: the store may not be there, and a hook
 * cannot be called conditionally. Writing that out at three call sites would be three
 * chances to get the fallbacks wrong, so it is written once, here.
 */

const NOTHING_SUBSCRIBED = () => () => {};
const NOTHING_SELECTED = () => NO_SELECTION;

const BulkSelectionContext = createContext<BulkSelection | null>(null);

export const BulkSelectionProviderTag = BulkSelectionContext.Provider;

/** The selection this cell can join, or `null` where there is none — the desktop. */
export function useBulkSelection(): BulkSelection | null {
  return useContext(BulkSelectionContext);
}

/**
 * What the selection currently holds, or `null` where there is none.
 *
 * The `NO_SELECTION` fallbacks are never rendered — a `null` context returns early below —
 * but they have to be *stable identities* rather than fresh objects, because
 * `useSyncExternalStore` compares snapshots by identity and would otherwise re-render for
 * ever on the desktop, where nothing is selecting at all.
 */
export function useBulkSelectionView(): BulkSelectionView | null {
  const selection = useContext(BulkSelectionContext);
  const view = useSyncExternalStore(
    selection?.subscribe ?? NOTHING_SUBSCRIBED,
    selection?.read ?? NOTHING_SELECTED,
    NOTHING_SELECTED,
  );
  return selection === null ? null : view;
}

/**
 * Whether the mode is open — a **boolean**, and that is the whole point.
 *
 * Every cell needs this (a tap toggles rather than navigates) and so does the column above
 * them (the filter bar goes). Reading it off `useBulkSelectionView` instead would hand
 * both the whole snapshot, which `apply()` replaces on **every** change — so one tap would
 * re-render all 472 cells and the grid around them, which is precisely the cost
 * `useIsSelected` below exists to avoid. A boolean is compared by value, so a tap
 * re-renders the two cells whose badges changed and nothing else.
 */
export function useIsSelecting(): boolean {
  const selection = useContext(BulkSelectionContext);
  return useSyncExternalStore(
    selection?.subscribe ?? NOTHING_SUBSCRIBED,
    () => selection?.read().selecting ?? false,
    () => false,
  );
}

/**
 * Whether this cell is in the selection.
 *
 * Separate from `useBulkSelectionView` and not derived from it at the call site: this
 * answers a **boolean**, which `useSyncExternalStore` compares by value, so 471 unselected
 * cells re-render zero times when the 472nd is tapped. Handing every cell the whole
 * snapshot would re-render all of them on every tap, which is the difference between a
 * selection that feels instant on a phone and one that does not.
 */
export function useIsSelected(libraryEntryId: string): boolean {
  const selection = useContext(BulkSelectionContext);
  return useSyncExternalStore(
    selection?.subscribe ?? NOTHING_SUBSCRIBED,
    () => selection?.isSelected(libraryEntryId) ?? false,
    () => false,
  );
}
