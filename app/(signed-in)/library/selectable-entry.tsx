"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { SelectableTitle } from "./bulk-selection";
import { useBulkSelection, useBulkSelectionView, useIsSelected } from "./bulk-selection-context";
import { useLibrarySelection } from "./library-selection";

/**
 * The thin client shell every one of the bill's 472 buttons sits inside — the one piece
 * of interactivity `library-grid.tsx` withheld until #58, and since #197 the one place the
 * hold that starts a selection is recognised.
 *
 * ── One handler, not a rewrite of the cell ────────────────────────────────────────────
 *
 * `library-entry-cell.tsx`'s own note on the button element predicted this shape: *"the
 * diff there is a handler, not a rewrite of the cell."* This is that handler, wrapping
 * `children` — the cell's existing, still server-rendered markup — rather than replacing
 * it. Composing a Server Component as a Client Component's `children` is what keeps the
 * poster, the title and the state line off the client bundle; only the button and its
 * handlers are here.
 *
 * ── Desktop selects; the phone route navigates ────────────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §5's third genuine divergence: on desktop, selecting an
 * entry replaces the programme note's contents and is **never a route change**
 * (`DESIGN.md`'s Never-Navigate-Away Rule); on the phone it is a pushed route. Both read
 * the same width the CSS breakpoints already key off — `≥1024px` is `DESIGN.md`'s own
 * cutoff for "Desktop" — checked at the moment of the click rather than baked into a
 * server-rendered branch, so resizing past the breakpoint mid-session changes which one a
 * click does without a reload.
 *
 * ── The hold, and the three ways it does not fire — issue #197 ───────────────────────
 *
 * A `pointerdown` starts a timer. Half a second later, with the finger still down and
 * still in the same place, the timer hands the title to the selection store and the mode
 * opens. It does **not** fire if the pointer goes up first (that is a tap), if the pointer
 * has travelled more than a few pixels (that is a scroll — a grid this long is scrolled far
 * more often than it is held), or if there is no selection provider above this cell at all,
 * which on the desktop is always (`bulk-selection-provider.tsx`).
 *
 * The click that ends a landed hold is swallowed. The browser sends one anyway when the
 * finger lifts, and without the guard every hold would immediately toggle back off the
 * title it had just selected — the gesture undoing itself.
 *
 * ── Why the press is CSS and not Motion ──────────────────────────────────────────────
 *
 * The same reason `globals.css` gives for `pressable` and for the grid's stagger: *a press
 * has no state a finger can catch it in mid-flight*, and 472 Motion components on the one
 * screen that renders the whole library is exactly the cost that reasoning exists to
 * avoid. `data-holding` compresses the cell over the hold's own half-second, and
 * `data-landed` plays the overshoot the ticket asks for — *the held cell scales under the
 * press, then springs into its selected state* — clearing itself on `animationend` rather
 * than on a second timer.
 */
/**
 * `DESIGN.md`'s own cutoff for "Desktop", and the same value every `lg:` Tailwind class
 * in this codebase compiles to. Named rather than inlined so there is exactly one place
 * to change if that value ever moves — the CSS classes would still need updating
 * separately, but at least this JS copy would no longer be a second, silent one.
 *
 * Exported since #197: `bulk-selection-provider.tsx` decides whether there is a selection
 * to join at the same breakpoint, and a second literal there would have been the silent
 * copy this constant exists to prevent.
 */
export const DESKTOP_BREAKPOINT = "(min-width: 1024px)";

/**
 * How long a finger has to stay down. `500ms` is the platform's own long-press — iOS and
 * Android both settle around it — and the ticket's *around half a second*. Shorter turns
 * a slow tap into a selection; longer and the reader lets go before anything happens and
 * concludes the gesture does not exist.
 */
const HOLD_MS = 500;

/**
 * How far the pointer may drift and still count as held. A finger resting on a phone moves
 * a few pixels on its own; a scroll moves many more, and a grid of 472 cells is scrolled
 * far more often than it is held.
 */
const HOLD_SLOP_PX = 10;

/**
 * What a cell that can be held has to give up, and it is all about the browser's own
 * answers to a long press.
 *
 * `select-none` stops the text-selection drag over the title. `-webkit-touch-callout` is
 * the one that matters on the device this feature is for: a long press on an `<img>` in
 * iOS Safari raises *Save Image* / *Copy*, and the poster is an `<img>` — so without this
 * the ticket's headline gesture opens a system sheet over the cell it was meant to select.
 * Inherited by the poster from here rather than set on the poster, so `app/poster.tsx`
 * stays a component that knows nothing about selection.
 *
 * Both are added **only where the gesture exists**. On the desktop a reader can still
 * select a title's text and still right-click its artwork, exactly as before.
 */
const HOLDABLE = "select-none [-webkit-touch-callout:none]";

/**
 * `DESIGN.md`'s accent, drawn as an inset ring rather than a border — `globals.css`'s
 * `field-well` has the reasoning and it is the same here: a `2px` border occupies layout,
 * so adding one would move a selected cell's contents by two pixels against its
 * neighbours' and make the grid twitch on every tap. An inset shadow costs no space.
 *
 * It is clipped to the card's `18px` radius by the `li`'s own `overflow-hidden`
 * (`library-entry-cell.tsx`), so the ring follows the corner without restating the radius.
 * The one shadow in an app whose docblocks say there are none is not a lift — there is no
 * blur and no offset; it is a line that had to be drawn inside the box.
 */
const SELECTED = "shadow-[inset_0_0_0_2px_var(--color-accent)]";

export function SelectableEntry({
  title,
  className,
  children,
}: {
  /** Everything the selection store needs about this cell, and nothing else. */
  title: SelectableTitle;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { selectedEntryId, select } = useLibrarySelection();
  const bulk = useBulkSelection();
  const bulkView = useBulkSelectionView();
  const selected = useIsSelected(title.libraryEntryId);

  const [holding, setHolding] = useState(false);
  const [landed, setLanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** The hold landed and the browser's own click has not been swallowed yet. */
  const swallowClick = useRef(false);

  const selecting = bulkView?.selecting ?? false;

  function cancelHold(): void {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
    setHolding(false);
  }

  // A cell can be unmounted mid-hold by the filter field narrowing the grid under the
  // reader's finger. Without this the timer still fires, into a store that is still very
  // much alive, and a title the reader can no longer see joins the selection.
  useEffect(() => cancelHold, []);

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    if (bulk === null) return;
    swallowClick.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      origin.current = null;
      swallowClick.current = true;
      setHolding(false);
      setLanded(true);
      bulk.hold(title);
    }, HOLD_MS);
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>): void {
    const from = origin.current;
    if (from === null) return;
    if (
      Math.abs(event.clientX - from.x) <= HOLD_SLOP_PX &&
      Math.abs(event.clientY - from.y) <= HOLD_SLOP_PX
    ) {
      return;
    }
    cancelHold();
  }

  function onClick(): void {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }

    if (bulk !== null && selecting) {
      bulk.toggle(title);
      return;
    }

    if (window.matchMedia(DESKTOP_BREAKPOINT).matches) {
      select(title.libraryEntryId);
      return;
    }
    router.push(`/library/${title.libraryEntryId}`);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      // A long press on a phone otherwise raises the text-selection callout over the tile
      // the reader is holding, which is the browser answering a gesture this app has just
      // claimed. Suppressed only where the gesture exists.
      onContextMenu={bulk === null ? undefined : (event) => event.preventDefault()}
      // `currentTarget === target` only: the check badge inside this button plays its own
      // arrival, and an `animationend` bubbling up from it would clear this one's overshoot
      // part-way through.
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) setLanded(false);
      }}
      data-holding={holding ? "true" : undefined}
      data-landed={landed ? "true" : undefined}
      // `DESIGN.md`, Library Tile: *"the current entry carries `aria-current`."* `"true"`
      // rather than `"page"` — unlike the masthead's nav cells
      // (`nav-cells.tsx`), a selected tile does not mean the browser is on that page; on
      // desktop the URL never changes at all.
      aria-current={title.libraryEntryId === selectedEntryId ? "true" : undefined}
      // Only while the mode is open, and `aria-pressed` rather than `aria-selected`: this
      // is a `button`, and `aria-selected` belongs to the roles that own a selection
      // (`option`, `tab`, `row`). Outside the mode the attribute is absent entirely, so a
      // cell does not announce itself as an unpressed toggle the rest of the time.
      aria-pressed={selecting ? selected : undefined}
      className={`${className}${bulk === null ? "" : ` ${HOLDABLE}`}${selected ? ` ${SELECTED}` : ""}`}
    >
      {children}
    </button>
  );
}
