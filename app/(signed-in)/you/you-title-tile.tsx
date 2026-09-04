import Link from "next/link";

import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { Poster } from "@/app/poster";
import type { LibraryStateGroupEntry } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";

/**
 * One title on You's shows or films rail — issue #248. `up-next-tile.tsx`'s visual layout
 * (a poster, the name beneath it over two lines, a meta line under that), with a different
 * gesture: this rail has no side pane to swap, so the tile is a plain `Link` to the title's
 * own page (`lists-rail.tsx`'s pattern) rather than a selection.
 *
 * The meta line is `titleMetaLine`'s own — issue #250's `up-next-film-rail.tsx` reads it
 * the same way — rather than a bare release year: `LibraryStateGroupEntry` carries
 * `runtimeMins` now, and a film rail that drops it back to *year only* would print less
 * than title detail already does for the identical film. `kind` comes from the caller
 * because the entry itself does not carry it — `listYouRails` (`db/access.ts`) already
 * spent that column deciding which of the two rails an entry belongs to.
 */
const TILE_WIDTH = 132;
const TILE = "w-[132px]";

export function YouTitleTile({
  entry,
  kind,
  aboveFold = false,
}: {
  readonly entry: LibraryStateGroupEntry;
  readonly kind: TitleKind;
  readonly aboveFold?: boolean;
}) {
  const meta = titleMetaLine({
    kind,
    releaseYear: entry.releaseYear,
    runtimeMins: entry.runtimeMins,
  });

  return (
    <Link
      href={`/titles/${entry.libraryEntryId}`}
      className={`pressable group block ${TILE} text-left`}
    >
      <Poster
        posterPath={entry.posterPath}
        name={entry.titleName}
        width={TILE_WIDTH}
        className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110"
        aboveFold={aboveFold}
      />

      <p className="mt-2 line-clamp-2 text-item leading-snug text-text">{entry.titleName}</p>

      {meta === null ? null : (
        <p className="code-line mt-1 text-dim" data-numeric>
          {meta}
        </p>
      )}
    </Link>
  );
}
