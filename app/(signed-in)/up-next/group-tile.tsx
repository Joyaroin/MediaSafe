"use client";

import Link from "next/link";
import { ViewTransition } from "react";

import { Poster } from "@/app/poster";
import type { SelectableTitle } from "@/app/(signed-in)/library/bulk-selection";
import {
  useBulkSelection,
  useIsSelected,
  useIsSelecting,
} from "@/app/(signed-in)/library/bulk-selection-context";
import { SelectionCheckBadge } from "@/app/(signed-in)/library/selection-check-badge";
import { HOLDABLE, SELECTED, useHoldToSelect } from "@/app/(signed-in)/library/use-hold-to-select";
import { groupPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import { useTitleSheet, type TitleSheetEntry } from "./title-sheet-context";

/** The CDN bucket a `116px` tile asks for, with room for the retina case — the tile grew
 *  from `104px` in the linen redesign (`home-group.tsx`), and both widths sit in the same
 *  `w154` bucket, so the number below did not have to move with it. */
const POSTER_CDN_WIDTH = 132;

/**
 * Re-exported under the tile's own name because `home-group.tsx` and `group-screen.tsx`
 * have always imported it from here. The shape lives with the context now — it is what a
 * tile hands the sheet, so the seam owns it.
 */
export type GroupTileEntry = TitleSheetEntry;

/**
 * One tile in a group, and **two things it can be** depending on where it is rendered.
 *
 * Inside a `TitleSheetProvider` — the phone's Up next tab — the tile is a button that
 * opens the title over the surface the reader is already on. Outside one — the group
 * screens at `/up-next/{group}`, which have no sheet — it stays the `Link` to the Library's
 * title-detail route that every tile used to be.
 *
 * That split is decided by whether the context is there, not by a media query, and that is
 * deliberate: `UpNextGroups` only ever renders inside `lg:hidden`, so "is there a sheet"
 * and "is this the phone" are the same question already answered by the tree. #136 deleted
 * the one `matchMedia` branch this build ever had, and this does not reintroduce one.
 *
 * **The tile drops its transition name while the sheet holds it.** `DESIGN.md` §8: a name
 * can only mark one on-screen element at a time, and unlike the phone route — which
 * replaced the page, taking the tile with it — the sheet sits *over* a tile that is still
 * mounted. Without the drop the browser finds `group-poster-{id}` on both and skips the
 * morph rather than choosing. The rail does exactly this for the desktop pane, for exactly
 * this reason.
 *
 * ── The hold, shared rather than re-derived — issue #198 ─────────────────────────────
 *
 * `use-hold-to-select.ts` owns the timer, the slop and the swallowed click — the same hook
 * `selectable-entry.tsx` runs, not a second copy of it. Nothing about that mechanism was
 * ever Library-specific: it is *the finger stayed still for `HOLD_MS`, within
 * `HOLD_SLOP_PX`*, and a group track exercises it against a press that can just as easily
 * turn into a horizontal flick. The same slop that protects a scroll protects a swipe; there
 * is no second gesture to write.
 *
 * What differs from a bill cell is what a landed tap does next, because this tile is
 * sometimes a `<Link>` and sometimes a sheet-opening `<button>`. Both need the browser's own
 * navigation suppressed on the two clicks the gesture claims — the swallowed one and a tap
 * while selecting — so `onClick` calls `preventDefault()` there rather than relying on
 * `type="button"` the way `selectable-entry.tsx` could.
 *
 * `useBulkSelection()`, `useIsSelecting()` and `useIsSelected()` all come from the Library's
 * `bulk-selection-context.ts` unmodified: availability is a fact about the tree exactly the
 * way #197 built it, and the tree above this tile is either `up-next-groups.tsx`'s
 * `BulkSelectionProvider` or `group-screen.tsx`'s — never both, never neither where the
 * gesture is meant to exist. The store, the action bar, the count and the exit rules are the
 * ones #197 shipped; nothing here reimplements any of them.
 */
export function GroupTile({
  entry,
  className,
  aboveFold = false,
  abandoned = false,
}: {
  entry: GroupTileEntry;
  className?: string;
  aboveFold?: boolean;
  /**
   * This tile is an abandoned title. Only the phone home's Abandoned group passes it,
   * and it passes it for every tile at once (`home-group.tsx`). Named for the state
   * rather than for the dim it produces, so this and `library-entry-cell.tsx` are visibly
   * one fact rendered twice.
   *
   * **The poster dims and the name does not**, which is deliberately *half* of
   * `library-entry-cell.tsx`'s pairing — that cell dims the poster and drops the name to
   * `--dim`, and its own docblock calls one-without-the-other a rendering fault. The
   * difference is that a library cell prints the word *Abandoned* on a state line and
   * this tile prints no state at all (§9: no count, no badge, no state label), so the
   * dimmed name there is a third signal beside a label that already said it, and here it
   * would be the only signal — an unexplained grey title in a group whose own heading is
   * the explanation. The heading does that work on this surface.
   */
  abandoned?: boolean;
}) {
  const sheet = useTitleSheet();
  const heldBySheet = sheet?.openEntryId === entry.libraryEntryId;

  const bulk = useBulkSelection();
  const selecting = useIsSelecting();
  const selected = useIsSelected(entry.libraryEntryId);

  /** Built once per render rather than at each of the gesture's two call sites — the store
   *  only ever asks for `libraryEntryId`, `titleId` and `name` together. */
  const title: SelectableTitle = {
    libraryEntryId: entry.libraryEntryId,
    titleId: entry.titleId,
    name: entry.titleName,
  };
  const gesture = useHoldToSelect(bulk, title);

  function onClick(event: React.MouseEvent<HTMLElement>): void {
    if (gesture.consumeSwallowedClick()) {
      event.preventDefault();
      return;
    }

    if (bulk !== null && selecting) {
      event.preventDefault();
      bulk.toggle(title);
      return;
    }

    if (sheet !== null) sheet.open(entry);
    // Outside a sheet this is a `<Link>`, whose own default navigation is left to run.
  }

  const holdHandlers = {
    onClick,
    ...gesture.handlers,
    "data-holding": gesture.holding ? "true" : undefined,
    "data-landed": gesture.landed ? "true" : undefined,
    "aria-pressed": selecting ? selected : undefined,
  };

  const tileClassName = `pressable group block w-full text-left${
    bulk === null ? "" : ` ${HOLDABLE}`
  }`;

  /* `[--poster-radius:14px]` rather than `rounded-[14px]`: both would be utilities and
       which one won would be decided by Tailwind's emit order, not by this class list
       (`globals.css`, the `poster` utility).

       The inset ring is turn 9's `box-shadow:inset 0 0 0 1px var(--hair)` on the tile's
       well.

       **The fill is knowingly not the handoff's.** Its token table says the well is
       `--hair`, which would put the ring on its own colour and make it invisible. The
       board disagrees with its own table — `.linen .well` is `#e4e2d6`, a step lighter
       than `--hair` (`#d5d2c3`) — and this keeps `poster`'s existing `--raised`
       (`#eeede7`), which is a further step lighter again. So this is not the board's
       colour either, and the difference is real rather than rounded away.

       It is the right trade because of what the pixels are: the handoff's own fidelity
       note says the wells are a prototype device and that real TMDB artwork fills these
       rectangles unchanged, so this fill is seen only by a title with no artwork at all.
       Against `--raised` the ring reads as drawn, and giving the `poster` utility a
       second fill for one surface would change the artwork-less well on every other
       surface in the app.

     ── The selected ring, since #198 ────────────────────────────────────────────────
     Drawn here rather than on the tile's outer element: a group tile has no padded card
     wrapping it the way a bill cell does, and `poster`'s own `overflow: hidden` is the one
     box on this tile that already clips to a corner radius (`selectable-entry.tsx`'s
     `SELECTED`). */
  const poster = (
    <Poster
      posterPath={entry.posterPath}
      width={POSTER_CDN_WIDTH}
      className={`w-full [--poster-radius:14px] shadow-[inset_0_0_0_1px_var(--color-hair)] transition duration-[var(--dur-fast)] group-hover:brightness-110 ${
        abandoned ? "opacity-55" : ""
      }${selected ? ` ${SELECTED}` : ""}`}
      aboveFold={aboveFold}
    />
  );

  const body = (
    <>
      {/* `relative` and nothing else: the check badge (#197, reused by #198) hangs off
          the poster's own corner rather than the tile's, and the wrapper carries no
          `overflow-hidden` of its own so the badge is free to sit half outside the
          poster's box. */}
      <div className="relative">
        {heldBySheet ? (
          poster
        ) : (
          <ViewTransition name={groupPosterTransitionName(entry.libraryEntryId)}>
            {poster}
          </ViewTransition>
        )}

        {/* Renders nothing at all outside a selection provider. */}
        <SelectionCheckBadge libraryEntryId={entry.libraryEntryId} />
      </div>

      <p className="mt-2.5 line-clamp-2 text-tile font-medium leading-[1.25] tracking-[-0.01em] text-ink">
        {entry.titleName}
      </p>
      {/* No line at all for a title TMDB has not dated — `up-next-tile.tsx`'s own
          choice for the identical fact. */}
      {entry.releaseYear === null ? null : (
        <p className="mt-0.5 text-meta leading-[1.3] text-dim" data-numeric>
          {entry.releaseYear}
        </p>
      )}
    </>
  );

  return (
    <li className={className}>
      {sheet === null ? (
        <Link
          href={`/library/${entry.libraryEntryId}`}
          className={tileClassName}
          {...holdHandlers}
        >
          {body}
        </Link>
      ) : (
        <button type="button" className={tileClassName} {...holdHandlers}>
          {body}
        </button>
      )}
    </li>
  );
}
