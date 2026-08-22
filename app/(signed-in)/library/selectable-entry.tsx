"use client";

import { useRouter } from "next/navigation";

import type { SelectableTitle } from "./bulk-selection";
import { useBulkSelection, useIsSelected, useIsSelecting } from "./bulk-selection-context";
import { useLibrarySelection } from "./library-selection";
import { HOLDABLE, SELECTED, useHoldToSelect } from "./use-hold-to-select";

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
 * ── The hold — issue #197, shared with `group-tile.tsx` since #198 ───────────────────
 *
 * `use-hold-to-select.ts` owns the timer, the slop and the swallowed click; this file owns
 * only what a landed tap or a swallowed click does next, which is the one part that
 * genuinely differs by surface. See that file for the gesture's own reasoning.
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
  // Two booleans rather than the whole snapshot: a cell only ever asks *is the mode open*
  // and *am I in it*, and both are compared by value, so a tap re-renders the cell whose
  // badge changed instead of all 472 of them (`bulk-selection-context.ts`).
  const selecting = useIsSelecting();
  const selected = useIsSelected(title.libraryEntryId);

  const gesture = useHoldToSelect(bulk, title);

  function onClick(): void {
    if (gesture.consumeSwallowedClick()) return;

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
      {...gesture.handlers}
      data-holding={gesture.holding ? "true" : undefined}
      data-landed={gesture.landed ? "true" : undefined}
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
