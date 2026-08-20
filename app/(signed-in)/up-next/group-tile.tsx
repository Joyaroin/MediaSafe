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
  abandoned = false,
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
  return (
    <li className={className}>
      <Link
        href={`/library/${entry.libraryEntryId}`}
        className="pressable group block w-full text-left"
      >
        <ViewTransition name={groupPosterTransitionName(entry.libraryEntryId)}>
          {/* `[--poster-radius:14px]` rather than `rounded-[14px]`: both would be
              utilities and which one won would be decided by Tailwind's emit order, not
              by this class list (`globals.css`, the `poster` utility).

              The inset ring is turn 9's `box-shadow:inset 0 0 0 1px var(--hair)` on the
              tile's well.

              **The fill is knowingly not the handoff's.** Its token table says the well is
              `--hair`, which would put the ring on its own colour and make it invisible.
              The board disagrees with its own table — `.linen .well` is `#e4e2d6`, a step
              lighter than `--hair` (`#d5d2c3`) — and this keeps `poster`'s existing
              `--raised` (`#eeede7`), which is a further step lighter again. So this is
              not the board's colour either, and the difference is real rather than
              rounded away.

              It is the right trade because of what the pixels are: the handoff's own
              fidelity note says the wells are a prototype device and that real TMDB
              artwork fills these rectangles unchanged, so this fill is seen only by a
              title with no artwork at all. Against `--raised` the ring reads as drawn,
              and giving the `poster` utility a second fill for one surface would change
              the artwork-less well on every other surface in the app. */}
          <Poster
            posterPath={entry.posterPath}
            width={POSTER_CDN_WIDTH}
            className={`w-full [--poster-radius:14px] shadow-[inset_0_0_0_1px_var(--color-hair)] transition duration-[var(--dur-fast)] group-hover:brightness-110 ${
              abandoned ? "opacity-55" : ""
            }`}
            aboveFold={aboveFold}
          />
        </ViewTransition>

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
      </Link>
    </li>
  );
}
