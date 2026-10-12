"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { useWatchMark } from "@/app/(signed-in)/library/use-watch-mark";
import { watchMarks, type WatchMarkView } from "@/app/(signed-in)/library/watch-marks";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
  WATCHED_TICK,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { exit, smooth } from "@/app/motion";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { Poster } from "@/app/poster";
import type { LibraryStateGroupEntry } from "@/db/access";
import { holdOverWhile } from "./hold-over";
import { finishPulse, HeldControl, useHold } from "./up-next-card";
import { ROW, ROW_POSTER, ROW_POSTER_WIDTH } from "./up-next-card-styles";
import { SWIPEABLE, SwipeWash, useFlightOnLeave } from "./up-next-episode-row";
import { useSwipeToMark } from "./use-swipe-to-mark";

/**
 * A film on Tonight's *Also ready* — Charcoal, issue #400. Films come after every show in
 * the list (`tonight-list.tsx`), which is the order the phone has always concatenated in.
 *
 * A film row is a poster, a name, a meta line and the same one-tap tick an episode row
 * carries, so a watchlist film can be logged without opening it first. Once the watch is
 * recorded the film is no longer on the watchlist, and the row leaves; the toast's Undo
 * takes the watch back. Its watched state is in the shared `watchMarks` store, which is
 * how the list knows which rows are still standing without asking this one
 * (`useFilmsStanding`).
 *
 * The motion is the episode row's (issue #407): the tick fills and pops with the ring
 * draining round it while *Undo* is offered, a lost write empties it slowly, and when the
 * hold ends the row closes as its poster travels to Library.
 */
export function FilmRow({
  film,
  aboveFold,
  ref,
}: {
  film: LibraryStateGroupEntry;
  aboveFold: boolean;
  /** `AnimatePresence`'s, so the row can be lifted out of the flow as it closes. */
  ref?: Ref<HTMLLIElement>;
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

  /* Watched and settled: the list has let this row go (`useFilmsStanding`), and this is it
     closing — tick filled, poster on its way to Library. */
  const leaving = watched && phase === "settled";

  /* Whether this row pressed — so a press that comes back unwatched was lost, and the tick
     rewinds rather than snapping empty. */
  const [pressed, setPressed] = useState(false);
  const lost = pressed && !watched && !pending;

  const link = useRef<HTMLAnchorElement>(null);
  useFlightOnLeave(link, leaving ? "/library" : null);

  function press(): void {
    finishPulse();
    setPressed(true);
    void holdOverWhile(attempt());
  }

  /* Swipe to mark (issue #408): the tick's press by another route, live when the tick is. */
  const swipe = useSwipeToMark({ enabled: !watched && !pending, onCommit: press });

  return (
    <m.li
      ref={ref}
      layout="position"
      transition={smooth}
      exit={{ opacity: 0, transition: exit }}
      className={`${held ? `${ROW} watch-hold` : ROW} ${SWIPEABLE}`}
      {...swipe.handlers}
    >
      <SwipeWash wash={swipe.wash} />
      <Link
        ref={link}
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
          {/* The meta line stays through the hold: the filled tick and its ring are the
              confirmation, as on an episode row (issue #407). */}
          {meta === null ? null : (
            <p className="mt-0.5 truncate text-meta text-dim" data-numeric>
              {meta}
            </p>
          )}
        </div>
      </Link>

      {held || leaving ? (
        <HeldControl
          onUndo={
            leaving
              ? null
              : () => {
                  setPressed(false);
                  void holdOverWhile(undo());
                }
          }
          undoLabel={`Undo marking ${film.titleName} watched`}
        />
      ) : (
        <button
          type="button"
          onClick={press}
          disabled={pending || watched}
          aria-label={`Mark ${film.titleName} watched`}
          className={`${RECORDING_HIT_BOX} ${IN_FLIGHT}`}
        >
          <span
            className={
              swipe.armed
                ? WATCHED_TICK
                : lost
                  ? `${RECORDING_GLYPH} tick-rewind`
                  : RECORDING_GLYPH
            }
          >
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
 * The films that still have a row — every film not yet watched and settled. Read from the
 * shared `watchMarks` store, so the list drops a film the moment its hold ends — which is
 * what lets `AnimatePresence` play the row closing (issue #407) — and its *See all N*
 * counts what is on screen, without the rows reporting upward.
 */
export function useFilmsStanding(
  films: readonly LibraryStateGroupEntry[],
): readonly LibraryStateGroupEntry[] {
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
  /* A string, for `useSyncExternalStore`'s reason: the standing *set* is what changes, and
     a fresh array per call would re-render for ever. */
  const read = useCallback(
    () =>
      films
        .filter((film) => {
          const view = watchMarks.read({ libraryEntryId: film.libraryEntryId, episodeId: null });
          return !(view !== null && view.watched && view.phase === "settled");
        })
        .map((film) => film.libraryEntryId)
        .join(","),
    [films],
  );
  const standing = useSyncExternalStore(subscribe, read, () =>
    films.map((film) => film.libraryEntryId).join(","),
  );
  return useMemo(() => {
    const live = new Set(standing === "" ? [] : standing.split(","));
    return films.filter((film) => live.has(film.libraryEntryId));
  }, [films, standing]);
}
