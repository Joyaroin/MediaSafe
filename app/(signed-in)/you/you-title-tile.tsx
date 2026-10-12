import { PosterLink } from "@/app/(signed-in)/library/poster-link";

import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { Poster } from "@/app/poster";
import { posterGlowStyle } from "@/app/poster-tint";
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
 *
 * **`compact`** is *Shows you stopped*'s tile (issue #405, handoff §6): `96` by `144`, the
 * name kept — it is the link's accessible name — and the meta line dropped, because the
 * rail puts a *Start again* pill under each tile instead.
 */
const TILE_WIDTH = 132;
const TILE = "w-[132px]";
const COMPACT_WIDTH = 96;
const COMPACT_TILE = "w-[96px]";

export function YouTitleTile({
  entry,
  kind,
  aboveFold = false,
  compact = false,
}: {
  readonly entry: LibraryStateGroupEntry;
  readonly kind: TitleKind;
  readonly aboveFold?: boolean;
  readonly compact?: boolean;
}) {
  const meta = compact ? null : titleMetaLine({
    kind,
    releaseYear: entry.releaseYear,
    runtimeMins: entry.runtimeMins,
  });

  return (
    <PosterLink
      libraryEntryId={entry.libraryEntryId}
      posterPath={entry.posterPath}
      className={`pressable group block ${compact ? COMPACT_TILE : TILE} text-left`}
    >
      {/* The glow is the wrapper's, not the poster's: `.poster` already spends its
          `box-shadow` on the plate line (issue #363, `app/globals.css`). */}
      <div
        className={entry.posterColour === null ? undefined : "poster-glow"}
        style={posterGlowStyle(entry.posterColour)}
      >
        <Poster
          posterPath={entry.posterPath}
          name={entry.titleName}
          width={compact ? COMPACT_WIDTH : TILE_WIDTH}
          className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110"
          aboveFold={aboveFold}
        />
      </div>

      <p className={`${compact ? "mt-1.5 truncate" : "mt-2 line-clamp-2"} text-item leading-snug text-text`}>{entry.titleName}</p>

      {meta === null ? null : (
        <p className="code-line mt-1 text-dim" data-numeric>
          {meta}
        </p>
      )}
    </PosterLink>
  );
}
