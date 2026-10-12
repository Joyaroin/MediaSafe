"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { useWatchMark } from "@/app/(signed-in)/library/use-watch-mark";
import { watchMarks, type WatchMarkView } from "@/app/(signed-in)/library/watch-marks";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { RECORDS_A_WATCH } from "@/app/accent-meaning";
import { exit } from "@/app/motion";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { Poster } from "@/app/poster";
import type { LibraryStateGroupEntry } from "@/db/access";
import { holdOverWhile } from "./hold-over";
import { finishPulse, HeldControl, useHold } from "./up-next-card";
import { ROW, ROW_POSTER, ROW_POSTER_WIDTH } from "./up-next-card-styles";

/**
 * A film on Tonight's *Also ready* — Charcoal, issue #400. Films come after every show in
 * the list (`tonight-list.tsx`), which is the order the phone has always concatenated in.
 *
 * A film row is a poster, a name, a meta line and the same one-tap tick an episode row
 * carries, so a watchlist film can be logged without opening it first. Once the watch is
 * recorded the film is no longer on the watchlist, and the row leaves; the toast's Undo
 * takes the watch back. Its watched state is in the shared `watchMarks` store, which is
 * how the list can count the rows still standing without asking this one
 * (`useFilmsStanding`).
 */
export function FilmRow({
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
      className={held ? `${ROW} watch-hold` : ROW}
    >
      <Link
        href={`/titles/${film.libraryEntryId}`}
        className="pressable group flex min-w-0 flex-1 items-center gap-3"
      >
        <Poster
          posterPath={film.posterPath}
          name={film.titleName}
          width={ROW_POSTER_WIDTH}
          className={`${ROW_POSTER} transition duration-[var(--dur-fast)] group-hover:brightness-110`}
          aboveFold={aboveFold}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-row font-semibold leading-tight text-text">
            {film.titleName}
          </p>

          {/* No line at all for a film TMDB has neither dated nor timed, rather than a
              placeholder — `library-entry-cell.tsx` makes the same choice for the identical
              fact, and `app/poster.tsx` makes it for artwork it does not have. */}
          {held ? (
            /* A film's finish moment (#367) keeps *Watched* — there is no season and no
               show to have finished — but enters and pulses as the episode cards' do. */
            <p className={`finish-line mt-0.5 text-meta font-medium ${RECORDS_A_WATCH.ink}`}>
              Watched
            </p>
          ) : meta === null ? null : (
            <p className="mt-0.5 truncate text-meta text-dim" data-numeric>
              {meta}
            </p>
          )}
        </div>
      </Link>

      {held ? (
        <HeldControl onUndo={() => void holdOverWhile(undo())} undoLabel={`Undo marking ${film.titleName} watched`} />
      ) : (
        <button
          type="button"
          onClick={() => {
            finishPulse();
            void holdOverWhile(attempt());
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

/** The seed every film row starts from — `FilmRow`'s own `initialWatched: false`. */
const UNWATCHED: WatchMarkView = { watched: false, watches: 0, phase: "unwatched", pending: false };

/**
 * How many of these films still have a row — every film not yet watched and settled, which
 * is exactly when `FilmRow` returns `null`. Read from the shared `watchMarks` store, so the
 * list's *See all N* counts what is on screen without the rows reporting upward.
 */
export function useFilmsStanding(films: readonly LibraryStateGroupEntry[]): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offs = films.map((film) =>
        watchMarks.subscribe({ libraryEntryId: film.libraryEntryId, episodeId: null }, UNWATCHED, onChange),
      );
      return () => {
        for (const off of offs) off();
      };
    },
    [films],
  );
  const read = useCallback(
    () =>
      films.filter((film) => {
        const view = watchMarks.read({ libraryEntryId: film.libraryEntryId, episodeId: null });
        return !(view !== null && view.watched && view.phase === "settled");
      }).length,
    [films],
  );
  return useSyncExternalStore(subscribe, read, () => films.length);
}

