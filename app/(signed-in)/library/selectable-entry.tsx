"use client";

import { useRouter } from "next/navigation";

import { carryPoster } from "@/app/poster-handoff-memory";
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
 * The third genuine divergence: on desktop, selecting an
 * entry replaces the programme note's contents and is **never a route change**
 * (the Never-Navigate-Away Rule); on the phone it is a pushed route. Both read
 * the same width the CSS breakpoints already key off — `≥1024px` is the
 * cutoff for "Desktop" — checked at the moment of the click rather than baked into a
 * server-rendered branch, so resizing past the breakpoint mid-session changes which one a
 * click does without a reload.
 *
 * ── The hold — issue #197, and this file's alone again since #250 ───────────────────
 *
 * `use-hold-to-select.ts` owns the timer, the slop and the swallowed click; this file owns
 * only what a landed tap or a swallowed click does next, which is the one part that
 * genuinely differs by surface. See that file for the gesture's own reasoning.
 *
 * ── The poster morph's source, since issue #303 ──────────────────────────────────────
 *
 * The grid cell carried no transition name before this, so the morph had no starting pair
 * on either entry path — a phone tap navigated with nothing to hand the destination, and a
 * desktop click called `select()` "by id alone", which is the very sentence
 * `library-selection.tsx` used to justify mounting the pane's poster nameless. Both are
 * reversed here in the one place both paths already pass through: `poster` and
 * `posterTransitionName` arrive from `library-entry-cell.tsx`, which stays a server
 * component and gains no new client boundary of its own.
 *
 * **A raw `viewTransitionName` style, not React's `<ViewTransition>`.** `masthead.tsx` and
 * `tab-bar.tsx` are this codebase's existing precedent for the plain CSS property, and it
 * is what keeps this component renderable under Vitest: `title-hero.test.ts`'s own
 * docblock records that the installed React does not export `ViewTransition` — Next
 * supplies it at build time — so a component that imports it cannot be rendered under this
 * suite. `tests/library-surface.test.ts` renders every one of the 472 cells this wraps, so
 * that property is worth keeping rather than trading for the component form `title-hero.tsx`,
 * `programme-note.tsx` and `up-next-episode-row.tsx` use — the browser's View Transition
 * API pairs on the CSS property alone and does not care which mechanism set it.
 * `titles/[entryId]/pending-poster.tsx` makes the identical trade for the identical
 * reason, one render test further down the same route.
 *
 * **Dropped while the desktop pane already holds the name.** The same rule
 * `up-next-episode-row.tsx`'s `RowFrame` keeps for its own row: a name can mark only one
 * on-screen element at a time, and the moment this entry is the one selected, the pane
 * beside the grid is showing that poster under the identical name.
 */
/**
 * The cutoff for "Desktop", and the same value every `lg:` Tailwind class
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
  poster,
  posterPath,
  posterTransitionName,
  children,
}: {
  /** Everything the selection store needs about this cell, and nothing else. */
  title: SelectableTitle;
  className: string;
  /** The poster block — `<Poster>` and its check badge — wrapped here rather than passed
   *  inside `children`, because this is the one part of the cell the morph needs to name. */
  poster: React.ReactNode;
  /** The same path `poster` was built from, handed over separately because the morph
   *  needs the raw value at the moment of a click and not the element built from it. */
  posterPath: string | null;
  posterTransitionName: string;
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
  // Whether the desktop pane is already showing this entry's poster under the same name —
  // the one case the grid's own copy has to let go of it, exactly as `up-next-episode-row.tsx`'s
  // `RowFrame` does for its row.
  const openInPane = title.libraryEntryId === selectedEntryId;

  const gesture = useHoldToSelect(bulk, title);

  function onClick(): void {
    if (gesture.consumeSwallowedClick()) return;

    if (bulk !== null && selecting) {
      bulk.toggle(title);
      return;
    }

    if (window.matchMedia(DESKTOP_BREAKPOINT).matches) {
      select(title.libraryEntryId, posterPath);
      return;
    }
    // The one surface in `nav-deeper.ts`'s list that opens a title without a `Link`:
    // desktop selects and the phone navigates, decided at the moment of the click, so
    carryPoster(title.libraryEntryId, posterPath);
    router.push(`/titles/${title.libraryEntryId}`);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      {...gesture.handlers}
      data-holding={gesture.holding ? "true" : undefined}
      data-landed={gesture.landed ? "true" : undefined}
      // Library Tile: *"the current entry carries `aria-current`."* `"true"`
      // rather than `"page"` — unlike the masthead's nav cells
      // (`nav-cells.tsx`), a selected tile does not mean the browser is on that page; on
      // desktop the URL never changes at all.
      aria-current={openInPane ? "true" : undefined}
      // Only while the mode is open, and `aria-pressed` rather than `aria-selected`: this
      // is a `button`, and `aria-selected` belongs to the roles that own a selection
      // (`option`, `tab`, `row`). Outside the mode the attribute is absent entirely, so a
      // cell does not announce itself as an unpressed toggle the rest of the time.
      aria-pressed={selecting ? selected : undefined}
      className={`${className}${bulk === null ? "" : ` ${HOLDABLE}`}${selected ? ` ${SELECTED}` : ""}`}
    >
      <div
        className="relative"
        // `viewTransitionClass` scopes the morph's spring to posters (#338) — dropped in
        // the same breath as the name when the pane already holds it, so there is never a
        // classed element with no name to pair it against.
        style={
          openInPane
            ? undefined
            : { viewTransitionName: posterTransitionName, viewTransitionClass: "poster" }
        }
      >
        {poster}
      </div>
      {children}
    </button>
  );
}
