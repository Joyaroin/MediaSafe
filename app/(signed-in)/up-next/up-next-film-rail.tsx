import Link from "next/link";

import { Poster } from "@/app/poster";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import type { LibraryStateGroupEntry } from "@/db/access";
import { RailSection, FIRST_RUN } from "./up-next-phone-rail";

/**
 * The landing screen's second rail — the films standing at Watchlist (#250).
 *
 * `listWatchlistFilms` is the membership and it is there rather than here: this file
 * decides the words and the measure, and knows nothing about what put a title on the rail.
 *
 * ── A card navigates, and carries no check ──────────────────────────────────────────
 *
 * The handoff draws a watched check on the film card. **It is not built**, and #250 is
 * explicit about why: *the mark is unchanged — no new marking path*. A film's watch is one
 * row rather than a run of episodes, so a check here would be a second marking path with
 * its own optimism, its own rollback and its own toast, standing beside the one this
 * ticket deliberately left alone. Recording a film stays where it already is, on the
 * title's own page.
 *
 * So the whole card is a link, which is also the ticket's own words — *a film card
 * navigates to the title* — and `SPEC.md`'s *a destination is a destination*. It is the
 * same route the deleted title sheet used to open over this screen, reached directly now
 * rather than through a sheet with no other caller.
 *
 * ── A server component, with nothing to hydrate ─────────────────────────────────────
 *
 * No `"use client"`: there is no mark, no selection and no scroll state on this rail. The
 * episode rail beside it needs a boundary and takes one; this one costs the bundle
 * nothing, which is the same split `library-grid.tsx` and `selectable-entry.tsx` already
 * draw.
 */
export function UpNextFilmRail({
  films,
}: {
  films: readonly LibraryStateGroupEntry[];
}) {
  if (films.length === 0) return null;

  return (
    <RailSection label="Films to watch">
      {films.map((film, index) => (
        <FilmCard key={film.libraryEntryId} film={film} aboveFold={index < FIRST_RUN} />
      ))}
    </RailSection>
  );
}

/**
 * The prototype's film card: a `2/3` poster at `132px`, the title under it, and the year
 * and runtime under that.
 *
 * `132px` is the desktop rail tile's measure (`up-next-tile.tsx`) rather than
 * the deleted groups' `116px`, because this is the number the handoff draws for a film card
 * on this rail. Height is not fixed — the `poster` utility's `2/3` derives it, so a real
 * poster is never cropped (#135).
 *
 * `items-start` on the track (`up-next-phone-rail.tsx`) is what keeps a two-line title from
 * dragging its neighbours' posters down: the cards top-align rather than stretching.
 */
const FILM_WIDTH = 132;
const FILM_CARD = "w-[132px] shrink-0 snap-start";

function FilmCard({
  film,
  aboveFold,
}: {
  film: LibraryStateGroupEntry;
  aboveFold: boolean;
}) {
  /**
   * `titleMetaLine`'s `year · runtime`, reused rather than re-cut. It is the line title
   * detail already prints for a film, so the same film reads the same way here and there —
   * and it already answers both absences by dropping the part it does not have rather than
   * placeholding it. `kind` is `"film"` by construction: `listWatchlistFilms` filters on
   * exactly that column, which is what makes the runtime half of the line reachable at all.
   */
  const meta = titleMetaLine({
    kind: "film",
    releaseYear: film.releaseYear,
    runtimeMins: film.runtimeMins,
  });

  return (
    <li className={FILM_CARD}>
      <Link href={`/library/${film.libraryEntryId}`} className="pressable group block">
        <Poster
          posterPath={film.posterPath}
          name={film.titleName}
          width={FILM_WIDTH}
          className="w-full transition duration-150 group-hover:brightness-110 [--poster-radius:12px]"
          aboveFold={aboveFold}
        />

        <p className="mt-[9px] line-clamp-2 text-item leading-snug font-medium text-text">
          {film.titleName}
        </p>

        {/* No line at all for a film TMDB has neither dated nor timed, rather than a
            placeholder — `library-entry-cell.tsx` makes the same choice for the identical
            fact, and `app/poster.tsx` makes it for artwork it does not have. */}
        {meta === null ? null : (
          <p className="code-line mt-[3px] text-dim" data-numeric>
            {meta}
          </p>
        )}
      </Link>
    </li>
  );
}
