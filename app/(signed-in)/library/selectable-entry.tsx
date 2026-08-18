"use client";

import { useRouter } from "next/navigation";

import { useLibrarySelection } from "./library-selection";

/**
 * The thin client shell every one of the bill's 472 buttons sits inside — the one piece
 * of interactivity `library-grid.tsx` withheld until this ticket: *"Nothing in a cell
 * takes input until #58."*
 *
 * ── One handler, not a rewrite of the cell ────────────────────────────────────────────
 *
 * `library-entry-cell.tsx`'s own note on the button element predicted this shape: *"the
 * diff there is a handler, not a rewrite of the cell."* This is that handler, wrapping
 * `children` — the cell's existing, still server-rendered markup — rather than replacing
 * it. Composing a Server Component as a Client Component's `children` is what keeps the
 * plate, the title and the state line off the client bundle; only the button and its
 * `onClick` are here.
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
 */
export function SelectableEntry({
  entryId,
  className,
  children,
}: {
  entryId: string;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { selectedEntryId, select } = useLibrarySelection();

  function onClick() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      select(entryId);
      return;
    }
    router.push(`/library/${entryId}`);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      // `DESIGN.md`, Library Tile: *"the current entry carries `aria-current`."* `"true"`
      // rather than `"page"` — unlike the masthead's nav cells
      // (`nav-cells.tsx`), a selected tile does not mean the browser is on that page; on
      // desktop the URL never changes at all.
      aria-current={entryId === selectedEntryId ? "true" : undefined}
      className={className}
    >
      {children}
    </button>
  );
}
