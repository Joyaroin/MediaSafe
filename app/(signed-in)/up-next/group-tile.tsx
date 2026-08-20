import Link from "next/link";
import { ViewTransition } from "react";

import { Poster } from "@/app/poster";
import { groupPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";

/**
 * One tile on the phone's five vertical groups (issue #138) — a poster, a name and a
 * year, and nothing else. The same three facts `up-next-tile.tsx` renders for a desktop
 * rail, and the same rule: **no count, no badge, no state label, no episode name** (§9).
 * Structurally the same shape as `UpNextEntry` and `LibraryStateGroupEntry` both carry,
 * which is why this takes that shape directly rather than five groups each mapping their
 * own row into a tile-shaped one first.
 *
 * ── A `Link`, not `SelectableEntry` ────────────────────────────────────────────────────
 *
 * `up-next-deck-row.tsx` gave the reason before this file existed and it still holds: this
 * surface is `lg:hidden` (`up-next-groups.tsx`) and its own group screens render at any
 * width with no desktop pane beside them, so there is no panel for a click to swap into —
 * reaching for `SelectableEntry` would put a route push behind a branch that never takes
 * the other side. **⚠️ There is no recording control here** — issue #138's own reversal —
 * so this tile's only job is getting a reader to the title, where the programme note has
 * every mark, abandon and rate control that opening a title always had.
 *
 * ── Fluid, not fixed ──────────────────────────────────────────────────────────────────
 *
 * `up-next-tile.tsx`'s `132px` is a horizontal rail's own measure; this tile sits in a
 * vertical grid instead (`home-group.tsx`, `group-screen.tsx`), so the poster is `w-full`
 * and the grid's own column width decides how large it renders. `width={132}` is passed to
 * `Poster` only to choose a CDN bucket, not to size anything on screen.
 *
 * ── `group-poster-{id}`, the morph's other half ───────────────────────────────────────
 *
 * Issue #141: the route this `Link` pushes lands on `title-detail-view.tsx`, which wraps
 * its own poster in the same `group-poster-{id}` name. Unlike the desktop rail's tile
 * (`up-next-tile.tsx`), this one never has to give the name up while selected — a route
 * push unmounts the whole page this tile lives on, so there is never a moment where this
 * tile and the phone route's hero poster are both on screen sharing it.
 */
const POSTER_CDN_WIDTH = 132;

/**
 * The one shape every group's row satisfies — `UpNextEntry` and
 * `LibraryStateGroupEntry` (`db/access.ts`) both carry more than this, and TypeScript
 * lets either stand in for it unchanged. Declared once here rather than inline at each of
 * this tile's three call sites (`home-group.tsx` twice over, `group-screen.tsx` once).
 */
export interface GroupTileEntry {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
}

export function GroupTile({
  entry,
  className,
  aboveFold = false,
}: {
  entry: GroupTileEntry;
  /**
   * The `<li>`'s own measure, when the caller's layout needs one. `group-screen.tsx` is a
   * grid and passes nothing — the cell decides. `home-group.tsx` is a flex track (#171)
   * and passes a fixed width, `shrink-0` and `snap-start`, because a track has no cells to
   * derive a width from. The split is `up-next-tile.tsx`'s, which fixes its own width for
   * the same reason.
   */
  className?: string;
  /** This tile is in its group's first visible row or run — `home-group.tsx` and
   *  `group-screen.tsx` each know their own (`app/poster.tsx`). */
  aboveFold?: boolean;
}) {
  return (
    <li className={className}>
      <Link
        href={`/library/${entry.libraryEntryId}`}
        className="pressable group block w-full text-left"
      >
        <ViewTransition name={groupPosterTransitionName(entry.libraryEntryId)}>
          <Poster
            posterPath={entry.posterPath}
            width={POSTER_CDN_WIDTH}
            className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110"
            aboveFold={aboveFold}
          />
        </ViewTransition>

        <p className="mt-2 line-clamp-2 text-item leading-snug text-text">
          {entry.titleName}
        </p>

        {/* No line at all for a title TMDB has not dated — `up-next-tile.tsx`'s own
            choice for the identical fact. */}
        {entry.releaseYear === null ? null : (
          <p className="code-line mt-1 text-dim" data-numeric>
            {entry.releaseYear}
          </p>
        )}
      </Link>
    </li>
  );
}
