"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { carryPoster } from "@/app/poster-handoff-memory";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { RECORDS_A_WATCH } from "@/app/accent-meaning";
import { exit, snappy } from "@/app/motion";
import { PendingLine } from "@/app/pending-line";
import { Poster } from "@/app/poster";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import {
  isPendingEntry,
  type QueuedEpisode,
  type UpNextEntry,
  type UpNextPendingEntry,
  type UpNextRailEntry,
} from "@/db/access";
import { episodeCode, remainingInWords } from "./episode-card-line";
import { finishesSomething, finishFactsFor, finishLine, WATCHED } from "./finish-line";
import { finishPulse, HeldControl, useHold } from "./up-next-card";
import { ROW, ROW_POSTER, ROW_POSTER_WIDTH } from "./up-next-card-styles";
import {
  cardPicture,
  queuedEpisodeFullName,
  useUpNextMark,
  type CardPicture,
  type UpNextMark,
} from "./up-next-mark";

/**
 * One row of Tonight's *Also ready* — Charcoal, issue #400 (handoff §6, §8.1).
 *
 * `up-next-episode-card.tsx` is where this content was worked out and its rules still
 * hold: the code line, the one count, the label that names the episode in full, the title's
 * poster rather than the episode's still (#320), no air date or runtime (#321).
 *
 * ── A row again, at the handoff's measure ────────────────────────────────────────────
 *
 * `64px` (`68px` on a desktop), a `36` by `54` poster, the title at Row size, the code and
 * the episode's name on a Meta line under it, the tick at the end, a hairline between rows.
 * The UI overhaul's raised cards and the season bar on each poster go: the season's
 * progress is the featured episode's to show (`tonight-featured.tsx`), and a list of
 * cards each carrying a bar was seven bars saying one thing each.
 *
 * ── The mark holds, then advances ────────────────────────────────────────────────────
 *
 * A press records the episode at once (`watch-marks.ts`, optimistic as ever), and the row
 * then **holds** on the episode it just recorded for `HOLD_MS`: washed, *Watched* where
 * the name was, the tick filled, *Undo* beside it. When the hold ends the next episode
 * slides in, or — if that was the last aired episode — the row leaves and the rows below
 * close the gap. `useUpNextMark`'s `held` is the episode being held, and the store's own
 * `marking` phase is the hold: nothing new is stored.
 *
 * ── The featured episode is not a row any more ───────────────────────────────────────
 *
 * Until Charcoal it was this component drawn wide (#362). It is `TonightFeatured` now, a
 * block of its own over its artwork, reading the same store through the same hook — so a
 * mark, a hold, an Undo and an advance behave there exactly as here, by construction.
 */
export function UpNextEpisodeRow({
  entry,
  aboveFold = false,
}: {
  entry: UpNextEntry;
  aboveFold?: boolean;
}) {
  if (entry.queue.episodes.length === 0) {
    return (
      <RowBody
        entry={entry}
        code={episodeCode(entry.seasonNo, entry.episodeNo)}
        episodeName={entry.episodeName}
        held={null}
        picture={cardPicture(entry)}
        remainingAfter={countAfterShown(entry.remaining, 0, false)}
        aboveFold={aboveFold}
        control={null}
      />
    );
  }

  return <MarkableRow entry={entry} aboveFold={aboveFold} />;
}

/**
 * Which episode a markable entry is showing, and how far through its run it is — the one
 * reading the row and the featured block both draw from, so they cannot disagree.
 */
export function shownFor(
  entry: UpNextEntry,
  mark: Pick<UpNextMark, "held" | "episode">,
): {
  readonly showing: QueuedEpisode;
  /** How many of the run are marked: the held episode is one of them. */
  readonly marked: number;
  readonly remainingAfter: number;
} {
  /* The episode on the card: the one being held while the hold lasts, otherwise the first
     unwatched one in the run (or the run's last, if a capped run has gone dry). */
  const shownAt =
    mark.held !== null
      ? indexOf(entry, mark.held)
      : mark.episode === null
        ? entry.queue.episodes.length
        : indexOf(entry, mark.episode);
  const spent = shownAt >= entry.queue.episodes.length;
  return {
    showing: entry.queue.episodes[spent ? entry.queue.episodes.length - 1 : shownAt],
    marked: mark.held !== null ? shownAt + 1 : shownAt,
    remainingAfter: countAfterShown(entry.remaining, shownAt, spent),
  };
}

/**
 * The tick's accessible name — handoff §8.1: it names the title and, for an episode, the
 * episode. The row prints the code but never the season word, so this is the only thing
 * that says in full which episode a press records.
 */
export function markLabel(titleName: string, episode: QueuedEpisode | null): string {
  return episode === null
    ? `Mark ${titleName} watched`
    : `Mark ${titleName}, ${queuedEpisodeFullName(episode)}, watched`;
}

/** The press, with the finish pulse that goes with it rather than with the render. */
export function pressWithPulse(entry: UpNextEntry, mark: UpNextMark): UpNextMark {
  return {
    ...mark,
    mark() {
      if (mark.episode !== null && finishesSomething(entry, mark.episode)) {
        finishPulse();
      }
      mark.mark();
    },
  };
}

function MarkableRow({ entry, aboveFold }: { entry: UpNextEntry; aboveFold: boolean }) {
  const mark = useUpNextMark(entry);

  useHold(mark.held?.episodeId ?? null, mark.settle);

  if (mark.finished && mark.held === null) return null;

  const { showing, remainingAfter } = shownFor(entry, mark);

  return (
    <RowBody
      entry={entry}
      code={episodeCode(showing.seasonNo, showing.episodeNo)}
      episodeName={showing.episodeName}
      held={mark.held === null ? null : finishLine(finishFactsFor(entry, mark.held))}
      picture={mark.picture}
      remainingAfter={remainingAfter}
      aboveFold={aboveFold}
      control={
        mark.held !== null ? (
          <HeldControl
            onUndo={mark.undoable === null ? null : mark.undo}
            undoLabel={`Undo marking ${queuedEpisodeFullName(mark.held)} watched`}
          />
        ) : (
          <MarkControl titleName={entry.titleName} mark={pressWithPulse(entry, mark)} />
        )
      }
    />
  );
}

function indexOf(entry: UpNextEntry, episode: QueuedEpisode): number {
  const at = entry.queue.episodes.findIndex(
    (one) => one.episodeId === episode.episodeId,
  );
  return at < 0 ? 0 : at;
}

/**
 * What is left after the episode on the card. `remaining` counts the Up next episode and
 * the aired episodes after it (`upNextRead`); every episode before `shown` in the run has
 * been marked from this card since the page loaded, and the one on the card is not *after*
 * itself — unless the run is spent, when the card is showing nothing new.
 */
function countAfterShown(
  remaining: number,
  shown: number,
  spent: boolean,
): number {
  const unwatched = Math.max(0, remaining - shown);
  return spent ? unwatched : Math.max(0, unwatched - 1);
}

function RowBody({
  entry,
  code,
  episodeName,
  held,
  picture,
  remainingAfter,
  aboveFold,
  control,
}: {
  entry: UpNextEntry;
  code: string;
  episodeName: string | null;
  /** The line the row holds on after a mark — *Watched*, or a finish (#367) — or `null`
   *  while it is not holding. */
  held: string | null;
  picture: CardPicture;
  remainingAfter: number;
  aboveFold: boolean;
  control: React.ReactNode;
}) {
  const label = `${entry.titleName} — ${code}${episodeName === null ? "" : `, ${episodeName}`}`;

  return (
    /* `layout`, so the rows below glide up when one leaves; `exit`, so the one leaving
       fades rather than vanishing (`tonight-list.tsx`'s `AnimatePresence`). */
    <m.li
      layout
      exit={{ opacity: 0, scale: 0.96, transition: exit }}
      className={held ? `${ROW} watch-hold` : ROW}
    >
      <Link
        href={`/titles/${entry.libraryEntryId}`}
        onClick={(event) => carryPoster(entry.libraryEntryId, entry.posterPath, event.currentTarget)}
        aria-label={label}
        className="pressable group relative flex min-w-0 flex-1 items-center gap-3"
      >
        {/* No morph name — the UI overhaul. The title page has a loading screen, and Next
            commits that first, so a list poster and the hero never land in the same commit
            and the morph could never form. The poster still travels as a picture
            (`carryPoster`), so the loading screen shows it at once. */}
        <Poster
          posterPath={picture.kind === "poster" ? picture.path : null}
          name={entry.titleName}
          width={ROW_POSTER_WIDTH}
          className={ROW_POSTER}
          aboveFold={aboveFold}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-row font-semibold leading-tight text-text">
            {entry.titleName}
          </p>

          {/* The episode line is keyed on the code, so an advance is the old episode lifting
              out and the next one rising in — `popLayout`, so the two never stack and the
              row keeps its height. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <m.p
              key={held !== null ? `${code}-held` : code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: exit }}
              transition={snappy}
              className="mt-0.5 flex min-w-0 items-baseline gap-x-2 text-meta"
            >
              {held !== null ? (
                /* *Watched* while the row holds — the confirmation, in the records-a-watch
                   ink. A finish line (#367) pulses as it enters. */
                <span
                  className={`truncate font-medium ${RECORDS_A_WATCH.ink}${
                    held === WATCHED ? "" : " finish-line"
                  }`}
                >
                  {held}
                </span>
              ) : (
                <>
                  {/* The code, then the episode's name where TMDB has one: an episode is
                      never referred to by number alone, and the code has said it once. */}
                  <span className="truncate text-dim">
                    {episodeName === null ? code : `${code} · ${episodeName}`}
                  </span>
                  {/* `data-numeric` is the tabular-figures hook. Absent at zero
                      (`remainingInWords`). */}
                  {remainingAfter > 0 ? (
                    <span className="shrink-0 text-dim" data-numeric>
                      {remainingInWords(remainingAfter)}
                    </span>
                  ) : null}
                </>
              )}
            </m.p>
          </AnimatePresence>
        </div>
      </Link>

      {control}
    </m.li>
  );
}

/**
 * The tick. Built on `RECORDING_HIT_BOX` and `IN_FLIGHT` like every recording control
 * (#304), so it presses with the loudest register and cannot be pressed twice in flight.
 * The not-watched face (`RECORDING_GLYPH`): the Up next ring is the featured episode's.
 */
const CHECK_HIT_BOX = `${RECORDING_HIT_BOX} ${IN_FLIGHT}`;

function MarkControl({ titleName, mark }: { titleName: string; mark: UpNextMark }) {
  const { episode, pending } = mark;

  /* A capped run that went dry — `UpNextQueue`'s own table has the case. The slot offers
     nothing and the row keeps its height from the poster. */
  if (episode === null) return null;

  return (
    <button
      type="button"
      onClick={mark.mark}
      disabled={pending}
      aria-label={markLabel(titleName, episode)}
      className={CHECK_HIT_BOX}
    >
      <span className={RECORDING_GLYPH}>
        <CheckmarkIcon className="h-4 w-4" />
      </span>
    </button>
  );
}

export function UpNextPendingRow({
  entry,
  aboveFold = false,
}: {
  entry: UpNextPendingEntry;
  aboveFold?: boolean;
}) {
  return (
    <m.li layout className={ROW}>
      <Link
        href={`/titles/${entry.libraryEntryId}`}
        className="pressable flex min-w-0 flex-1 items-center gap-3"
        /* The poster is `aria-hidden` and the pending line is a live region rather than a
           label, so this is the whole of what a screen reader hears for the link. */
        aria-label={`${entry.titleName} — episodes still arriving`}
      >
        {/* The same box the episode row draws, so a pending row is exactly the height of
            the row it becomes once the mirror lands. */}
        <Poster
          posterPath={entry.posterPath}
          name={entry.titleName}
          width={ROW_POSTER_WIDTH}
          className={ROW_POSTER}
          aboveFold={aboveFold}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-row font-semibold leading-tight text-text">
            {entry.titleName}
          </p>
          <div className="mt-0.5">
            <PendingLine />
          </div>
        </div>
      </Link>
    </m.li>
  );
}

export { isPendingEntry, type UpNextRailEntry };
