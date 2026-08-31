"use client";

import Link from "next/link";
import { ViewTransition } from "react";

import { PendingLine } from "@/app/pending-line";
import { Poster } from "@/app/poster";
import { useLibrarySelection } from "@/app/(signed-in)/library/library-selection";
import { railPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import { DESKTOP_BREAKPOINT } from "@/app/(signed-in)/library/selectable-entry";
import { isPendingEntry, type UpNextRailEntry } from "@/db/access";

/**
 * One poster on a rail — issue #137, and the whole of what a rail is made of.
 *
 * `design/catalogue-wall.html`'s `.tile`, which is binding on appearance: a poster in full
 * colour at its own ratio, the title beneath it in plain body text over two lines at most,
 * and the year under that. **Not the display face**: the prototype's `.tname` carries no
 * `.disp` class, so the display face this codebase reaches for by default belongs to the
 * rail's heading and not to the titles under it — the artwork is the loudest thing on the
 * rail, and a wall of shouting names would compete with it.
 *
 * **No count, no badge, no state label, no episode name.** §9, and issue #137 restates it
 * for this surface specifically. The library is not a backlog to feel bad about, and every
 * fact a tile withholds is one click away in the panel it opens.
 *
 * ── A link to the title, and on the desktop a panel swap instead — issue #274 ─────────
 *
 * > **⚠️ This reverses what this file said until #274**, which was: *`select()` and nothing
 * > else — not `SelectableEntry`, which branches on the viewport.* The rails were
 * > desktop-only, so there was no phone click for a branch to serve. #268 makes *every tile
 * > and card on Up next opens the title's page* a rule about the whole tab rather than
 * > about the phone's two rails, and a tile that can only ever write selection state is the
 * > one surface that cannot obey it.
 *
 * The tile is now a **`Link` to `/library/{entryId}`** — the same mechanism the film card
 * on the phone's rail already had, so a film and a show behave the same way on the same
 * tab. Being a real anchor is the point rather than an implementation detail: it can be
 * middle-clicked, opened in a new tab, and read as a link by a screen reader, none of
 * which a `button` calling `router.push` can do.
 *
 * **On `lg` and up nothing navigates, and that is unchanged.** The click handler checks
 * `DESKTOP_BREAKPOINT` — `selectable-entry.tsx`'s constant, imported rather than a second
 * `1024px` literal — and on the desktop stops the link and calls `select()` instead. That
 * is `DESIGN.md`'s Never-Navigate-Away Rule and the whole reason the programme note pane
 * exists: **comparing two candidates costs nothing**, because the page never routes and so
 * never loses its place. The pane, the selection store and the pane's four-phase pending
 * machine are untouched; what went is the phone's *use* of them.
 *
 * The width is read at the moment of the click rather than baked into a server-rendered
 * branch, which is `selectable-entry.tsx`'s own reasoning: resizing past the breakpoint
 * mid-session changes which one a click does without a reload. A **modified** click —
 * ⌘, Ctrl, Shift, or anything but the primary button — is left to the browser on both
 * sides, because *open this in a new tab* is a request about a link and not about a pane.
 *
 * ── Selection is border weight, not colour ───────────────────────────────────────────
 *
 * The accent is reserved for recording a watch (#132), so a selected tile is a `ring-2` in
 * `text` around the poster and hover is brightness alone. `aria-current="true"` rather than
 * `"page"`, the same distinction `selectable-entry.tsx` draws and for the same reason: the
 * URL does not change, so the browser is not "on" this entry.
 *
 * ── The transition name lives here only while the tile owns it ───────────────────────
 *
 * Issue #141's morph pairs this poster with the pane's by giving both the same
 * `view-transition-name` (`rail-poster-{id}`, `programme-note.tsx`'s half of this). A
 * name can only ever mark one on-screen element at a time, so once this entry is
 * selected the tile drops it — the pane is the one showing that poster now — and picks
 * it back up the moment something else is selected, ready to be the next morph's start.
 * Without the drop, the instant a second tile is picked the pane would be mounting a
 * second `rail-poster-{id}` for the *first* tile's id while this one is still sitting on
 * screen holding the original, and the browser skips a transition it finds duplicated
 * rather than guessing which one wins.
 */

/**
 * The tile's width, and the one measure this surface fixes. Height is not set — the
 * `poster` utility's `2/3` ratio derives it, so a real poster is never cropped (#135).
 *
 * `132px` rather than the prototype's `104px`: the mock composes its desktop at roughly
 * `1102px` with a `336px` panel, where 104 is about a fifth of the main column. A real
 * desktop is wider and the panel is `420px`, so the prototype's *density* — five or so
 * whole tiles per rail, and the sixth showing that there is more — needs the larger number.
 * `app/poster.tsx`'s `bucketFor` turns it into TMDB's `w154`.
 */
const TILE_WIDTH = 132;
const TILE = "w-[132px]";
const POSTER_CLASS = "w-full transition duration-150 group-hover:brightness-110";

export function UpNextTile({
  entry,
  aboveFold = false,
}: {
  entry: UpNextRailEntry;
  /** This tile is in its rail's first visible run — `up-next-rail.tsx`'s to say
   *  (`app/poster.tsx`). */
  aboveFold?: boolean;
}) {
  const { selectedEntryId, select } = useLibrarySelection();
  const selected = entry.libraryEntryId === selectedEntryId;

  function onClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    // A ⌘-click, a Ctrl-click, a Shift-click or a middle button is a request about the
    // link, and it is answered by the link on both sides of the breakpoint.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (!window.matchMedia(DESKTOP_BREAKPOINT).matches) return;

    event.preventDefault();
    select(entry.libraryEntryId, entry.posterPath);
  }

  return (
    /* `snap-start`, which is half of *a scroll stops on whole posters* — the track carries
       the other half (`up-next-rail.tsx`). */
    <li className={`${TILE} shrink-0 snap-start`}>
      <Link
        href={`/library/${entry.libraryEntryId}`}
        onClick={onClick}
        aria-current={selected ? "true" : undefined}
        className="pressable group block w-full"
      >
        {selected ? (
          <Poster
            posterPath={entry.posterPath}
            width={TILE_WIDTH}
            className={`${POSTER_CLASS} ring-2 ring-text`}
            aboveFold={aboveFold}
          />
        ) : (
          <ViewTransition name={railPosterTransitionName(entry.libraryEntryId)}>
            <Poster
              posterPath={entry.posterPath}
              width={TILE_WIDTH}
              className={POSTER_CLASS}
              aboveFold={aboveFold}
            />
          </ViewTransition>
        )}

        <p className="mt-2 line-clamp-2 text-item leading-snug text-text">
          {entry.titleName}
        </p>

        {/* No line at all for a title TMDB has not dated, rather than a placeholder — the
            same choice `library-entry-cell.tsx` makes for the identical fact, and
            `app/poster.tsx` makes for artwork it does not have. */}
        {entry.releaseYear === null ? null : (
          <p className="code-line mt-1 text-dim" data-numeric>
            {entry.releaseYear}
          </p>
        )}

        {/* The pending tile's one dim line — issue #272, and `DESIGN.md` §9's treatment
            unaltered: `PendingLine`, at the placement this surface chooses, and nothing
            else. Everything above it is a fact the add already wrote and renders at full
            strength; this is the only region genuinely still waiting.

            **No skeleton and no shimmer**, and nothing here reserves a height for what has
            not arrived: the tile is one poster taller than nothing, exactly as it is when
            the mirror lands. */}
        {isPendingEntry(entry) ? (
          <div className="mt-1">
            <PendingLine />
          </div>
        ) : null}
      </Link>
    </li>
  );
}
