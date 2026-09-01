"use client";

import { useSyncExternalStore } from "react";

import type { ListDetailTitleRow } from "@/db/access";
import { ListIconGrid } from "./list-icon-grid";
import { ListViewControl } from "./list-view-control";
import {
  defaultListViewMode,
  keepListViewMode,
  rememberedListViewMode,
  subscribeToListViewMode,
  type ListViewMode,
} from "./list-view-mode";
import { ReorderableTitleList } from "./reorderable-title-list";

/**
 * A list's titles, in whichever view the reader last chose — and the toggle that chooses.
 *
 * ── Why the first paint is always icons, even for a reader who chose rows ────────────
 *
 * The preference lives in `localStorage` (`list-view-mode.ts` has the argument for that
 * home over the two alternatives), which the server cannot read. So the server snapshot is
 * the default and the client's first commit swaps it, which means a reader who prefers
 * rows sees one frame of icons.
 *
 * That is the trade, taken deliberately, and the alternative was worse in both directions:
 * rendering nothing until the effect runs makes **every** reader wait for a blank list to
 * avoid one frame for some of them, and it is exactly `DESIGN.md` §9's *pending* treatment
 * spent on something that is not pending — the titles are already here, on the server, in
 * the props. Nothing about the content is uncertain; only the arrangement is.
 *
 * The day this needs to be right on the first frame is the day the preference moves to the
 * `user` row as a Better Auth `additionalFields` entry, where the server read that already
 * happens can carry it. `list-view-mode.ts` says why that is not today.
 */
export function ListDetailBody({
  listId,
  titles,
}: {
  readonly listId: string;
  readonly titles: readonly ListDetailTitleRow[];
}) {
  /* Read out of `localStorage` rather than held in state: the value lives outside React,
     and `useSyncExternalStore`'s server snapshot is the one form that lets the server and
     the client legitimately disagree about it. `list-view-mode.ts` has the rest. */
  const view = useSyncExternalStore(
    subscribeToListViewMode,
    rememberedListViewMode,
    defaultListViewMode,
  );

  function choose(mode: ListViewMode): void {
    keepListViewMode(mode);
  }

  return (
    <>
      {/* The toggle sits over the titles rather than in `BackToListsBar` with the list's
          name: the bar is chrome that every list route shares, and this control belongs to
          the one thing below it. `px-6` is the rows' own gutter, which is what the bar
          above and the attribution below both use. */}
      <div className="flex items-center justify-end px-6 pb-3">
        <ListViewControl value={view} onChange={choose} />
      </div>

      {view === "icons" ? (
        <ListIconGrid titles={titles} />
      ) : (
        /* The reordering surface. `list-icon-grid.tsx` records why the grid is not one
           yet, and that it is this pass's stated limit rather than an oversight. */
        <ReorderableTitleList listId={listId} initialTitles={titles} />
      )}
    </>
  );
}
