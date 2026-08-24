import Link from "next/link";

import { Poster } from "@/app/poster";
import type { LibraryStateGroupEntry } from "@/db/access";

/**
 * One title on You's shows or films rail — issue #248. `up-next-tile.tsx`'s visual layout
 * (a poster, the name beneath it over two lines, the year under that), with a different
 * gesture: this rail has no side pane to swap, so the tile is a plain `Link` to the title's
 * own page (`lists-rail.tsx`'s pattern) rather than a selection.
 */
const TILE_WIDTH = 132;
const TILE = "w-[132px]";

export function YouTitleTile({
  entry,
  aboveFold = false,
}: {
  readonly entry: LibraryStateGroupEntry;
  readonly aboveFold?: boolean;
}) {
  return (
    <Link
      href={`/library/${entry.libraryEntryId}`}
      className={`pressable group block ${TILE} text-left`}
    >
      <Poster
        posterPath={entry.posterPath}
        width={TILE_WIDTH}
        className="w-full transition duration-150 group-hover:brightness-110"
        aboveFold={aboveFold}
      />

      <p className="mt-2 line-clamp-2 text-item leading-snug text-text">{entry.titleName}</p>

      {entry.releaseYear === null ? null : (
        <p className="code-line mt-1 text-dim" data-numeric>
          {entry.releaseYear}
        </p>
      )}
    </Link>
  );
}
