"use client";

import Link from "next/link";
import { ViewTransition } from "react";

import { Poster } from "@/app/poster";
import { groupPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import { useTitleSheet, type TitleSheetEntry } from "./title-sheet-context";

/** The CDN bucket a 104px tile asks for, doubled for the retina case. */
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
 */
export function GroupTile({
  entry,
  className,
  aboveFold = false,
}: {
  entry: GroupTileEntry;
  className?: string;
  aboveFold?: boolean;
}) {
  const sheet = useTitleSheet();
  const heldBySheet = sheet?.openEntryId === entry.libraryEntryId;

  const poster = (
    <Poster
      posterPath={entry.posterPath}
      width={POSTER_CDN_WIDTH}
      className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110"
      aboveFold={aboveFold}
    />
  );

  const body = (
    <>
      {heldBySheet ? (
        poster
      ) : (
        <ViewTransition name={groupPosterTransitionName(entry.libraryEntryId)}>
          {poster}
        </ViewTransition>
      )}
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
    </>
  );

  return (
    <li className={className}>
      {sheet === null ? (
        <Link
          href={`/library/${entry.libraryEntryId}`}
          className="pressable group block w-full text-left"
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => sheet.open(entry)}
          className="pressable group block w-full text-left"
        >
          {body}
        </button>
      )}
    </li>
  );
}
