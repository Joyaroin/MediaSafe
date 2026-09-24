"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { useWatchMark } from "@/app/(signed-in)/library/use-watch-mark";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
  WatchSweep,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { Poster } from "@/app/poster";
import type { LibraryStateGroupEntry } from "@/db/access";
import { UpNextGroup } from "./up-next-group";

/**
 * The phone's films-to-watch group — the watchlist films, in a list rather than a rail.
 *
 * The name is kept while its callers and tests are; what it renders is `UpNextGroup`'s
 * vertical list, for the reason that file gives.
 *
 * A film row is a poster, a name, a meta line and the same one-tap check an episode row
 * carries, so a watchlist film can be logged without opening it first. Once the watch is
 * recorded the film is no longer on the watchlist, and the row leaves; the toast's Undo
 * takes the watch back.
 */
export function UpNextFilmRail({
  films,
}: {
  films: readonly LibraryStateGroupEntry[];
}) {
  if (films.length === 0) return null;

  return (
    <UpNextGroup label="Films to watch">
      {films.map((film, index) => (
        <FilmRow key={film.libraryEntryId} film={film} aboveFold={index < FIRST_RUN} />
      ))}
    </UpNextGroup>
  );
}

const FIRST_RUN = 3;

/** A poster at the row's own measure — `2/3`, so `48px` of width is `72px` of picture,
 *  which is what sets the row's height against the episode row's `72px` floor. */
const POSTER_WIDTH = 48;

function FilmRow({
  film,
  aboveFold,
}: {
  film: LibraryStateGroupEntry;
  aboveFold: boolean;
}) {
  const meta = titleMetaLine({
    kind: "film",
    releaseYear: film.releaseYear,
    runtimeMins: film.runtimeMins,
  });

  const { watched, phase, pending, attempt, settle } = useWatchMark({
    initialWatched: false,
    libraryEntryId: film.libraryEntryId,
    episodeId: null,
    titleName: film.titleName,
  });

  if (watched && phase === "settled") return null;

  return (
    <li className="relative flex min-h-[72px] items-center gap-3 py-2.5">
      <Link
        href={`/titles/${film.libraryEntryId}`}
        className="pressable group flex min-w-0 flex-1 items-center gap-3.5"
      >
        <Poster
          posterPath={film.posterPath}
          name={film.titleName}
          width={POSTER_WIDTH}
          className="w-12 shrink-0 transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-1)]"
          aboveFold={aboveFold}
        />

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-item leading-snug font-medium text-text">
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
        </div>
      </Link>

      <button
        type="button"
        onClick={attempt}
        disabled={pending || watched}
        aria-label={`Mark ${film.titleName} watched`}
        className={`${RECORDING_HIT_BOX} ${IN_FLIGHT}`}
      >
        <span className={RECORDING_GLYPH}>
          <CheckmarkIcon className="h-4 w-4" />
        </span>
      </button>

      {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
    </li>
  );
}
