import Link from "next/link";

import { Poster } from "@/app/poster";

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

export function GroupTile({ entry }: { entry: GroupTileEntry }) {
  return (
    <li>
      <Link href={`/library/${entry.libraryEntryId}`} className="group block w-full text-left">
        <Poster
          posterPath={entry.posterPath}
          width={POSTER_CDN_WIDTH}
          className="w-full transition duration-150 group-hover:brightness-110"
        />

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
