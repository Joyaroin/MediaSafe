"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { useWatchMark } from "@/app/(signed-in)/library/use-watch-mark";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { RECORDS_A_WATCH } from "@/app/accent-meaning";
import { exit } from "@/app/motion";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { Poster } from "@/app/poster";
import type { LibraryStateGroupEntry } from "@/db/access";
import { finishPulse, HeldControl, useHold } from "./up-next-card";
import { CARD, CARD_POSTER, CARD_POSTER_WIDTH } from "./up-next-card-styles";
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
      <AnimatePresence initial={false}>
        {films.map((film, index) => (
          <FilmRow key={film.libraryEntryId} film={film} aboveFold={index < FIRST_RUN} />
        ))}
      </AnimatePresence>
    </UpNextGroup>
  );
}

const FIRST_RUN = 3;

/** A film card is an episode card's material and measure (`up-next-card-styles.ts`), so
 *  the two lists read as one. */
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

  const { watched, phase, pending, attempt, settle, undo } = useWatchMark({
    initialWatched: false,
    libraryEntryId: film.libraryEntryId,
    episodeId: null,
    titleName: film.titleName,
    inlineUndo: true,
  });

  /* The same hold as an episode card: the film stays, washed, with *Undo*, for `HOLD_MS`,
     then leaves the list. */
  const held = watched && phase === "marking";
  useHold(held ? film.libraryEntryId : null, settle);

  if (watched && phase === "settled") return null;

  return (
    <m.li
      layout
      exit={{ opacity: 0, scale: 0.96, transition: exit }}
      className={held ? `${CARD} watch-hold` : CARD}
    >
      <Link
        href={`/titles/${film.libraryEntryId}`}
        className="pressable group flex min-w-0 flex-1 items-center gap-3"
      >
        <Poster
          posterPath={film.posterPath}
          name={film.titleName}
          width={CARD_POSTER_WIDTH}
          className={`${CARD_POSTER} transition duration-[var(--dur-fast)] group-hover:brightness-110`}
          aboveFold={aboveFold}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-item leading-snug font-medium text-text">
            {film.titleName}
          </p>

          {/* No line at all for a film TMDB has neither dated nor timed, rather than a
              placeholder — `library-entry-cell.tsx` makes the same choice for the identical
              fact, and `app/poster.tsx` makes it for artwork it does not have. */}
          {held ? (
            /* A film's finish moment (#367) keeps *Watched* — there is no season and no
               show to have finished — but enters and pulses as the episode cards' do. */
            <p className={`finish-line mt-[3px] text-item font-medium ${RECORDS_A_WATCH.ink}`}>
              Watched
            </p>
          ) : meta === null ? null : (
            <p className="code-line mt-[3px] text-dim" data-numeric>
              {meta}
            </p>
          )}
        </div>
      </Link>

      {held ? (
        <HeldControl onUndo={undo} undoLabel={`Undo marking ${film.titleName} watched`} />
      ) : (
        <button
          type="button"
          onClick={() => {
            finishPulse();
            attempt();
          }}
          disabled={pending || watched}
          aria-label={`Mark ${film.titleName} watched`}
          className={`${RECORDING_HIT_BOX} ${IN_FLIGHT}`}
        >
          <span className={RECORDING_GLYPH}>
            <CheckmarkIcon className="h-4 w-4" />
          </span>
        </button>
      )}
    </m.li>
  );
}
