"use client";

import { ViewTransition } from "react";

import { Poster } from "@/app/poster";
import { useLibrarySelection } from "@/app/(signed-in)/library/library-selection";
import { railPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import type { UpNextEntry } from "@/db/access";

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
 * ── Clicking swaps the panel; it is never a navigation ────────────────────────────────
 *
 * `select()` from `library-selection.tsx` and nothing else — not `SelectableEntry`, which
 * branches on the viewport to push `/library/{id}` on a phone. The rails are desktop-only
 * (`page.tsx` renders nothing of them below `lg`), so there is no phone click for that
 * branch to serve, and reaching for it would put a route push behind a button that can
 * never be pressed at a width where it applies. **Comparing two candidates costs nothing**
 * is the property: the page never routes, so it never loses its place.
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
  entry: UpNextEntry;
  /** This tile is in its rail's first visible run — `up-next-rail.tsx`'s to say
   *  (`app/poster.tsx`). */
  aboveFold?: boolean;
}) {
  const { selectedEntryId, select } = useLibrarySelection();
  const selected = entry.libraryEntryId === selectedEntryId;

  return (
    /* `snap-start`, which is half of *a scroll stops on whole posters* — the track carries
       the other half (`up-next-rail.tsx`). */
    <li className={`${TILE} shrink-0 snap-start`}>
      <button
        type="button"
        onClick={() => select(entry.libraryEntryId, entry.posterPath)}
        aria-current={selected ? "true" : undefined}
        className="pressable group block w-full text-left"
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
      </button>
    </li>
  );
}
