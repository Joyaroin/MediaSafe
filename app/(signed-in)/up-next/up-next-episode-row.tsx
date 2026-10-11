"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { carryPoster } from "@/app/poster-handoff-memory";
import {
  RECORDING_GLYPH_UP_NEXT,
  RECORDING_HIT_BOX,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { RECORDS_A_WATCH } from "@/app/accent-meaning";
import { exit, snappy } from "@/app/motion";
import { PendingLine } from "@/app/pending-line";
import { Poster } from "@/app/poster";
import { PosterProgressBar } from "@/app/poster-progress-bar";
import { posterTintStyle } from "@/app/poster-tint";
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
import {
  CARD,
  CARD_POSTER,
  CARD_POSTER_WIDTH,
  FEATURED_CARD,
  FEATURED_WASH,
} from "./up-next-card-styles";
import { FeaturedFrame } from "./up-next-featured-frame";
import {
  cardPicture,
  featuredPicture,
  queuedEpisodeFullName,
  seasonProgress,
  useUpNextMark,
  type CardPicture,
  type SeasonProgress,
  type UpNextMark,
} from "./up-next-mark";

/**
 * One card of Continue watching.
 *
 * `up-next-episode-card.tsx` is where this content was worked out and its rules still
 * hold: the code line, the one count, the label that names the episode in full, the title's
 * poster rather than the episode's still (#320), no air date or runtime (#321).
 *
 * ── A card, not a row — the UI overhaul ──────────────────────────────────────────────
 *
 * This was a hairline-divided row around a `104px` poster, about three and a half shows to
 * a phone screen. It is now Coming up's raised card (`up-next-card.tsx`) at a `56px`
 * poster — about seven — in a grid that widens to two and three columns on larger
 * screens. The episode name is clamped to one line to keep every card the same height.
 *
 * ── The mark holds, then advances ────────────────────────────────────────────────────
 *
 * A press records the episode at once (`watch-marks.ts`, optimistic as ever), and the card
 * then **holds** on the episode it just recorded for `HOLD_MS`: washed in the accent,
 * *Watched* where the name was, the check filled, *Undo* beside it. When the hold ends the
 * next episode slides in, or — if that was the last aired episode — the card leaves and the
 * cards below close the gap. `useUpNextMark`'s `held` is the episode being held, and the
 * store's own `marking` phase is the hold: nothing new is stored.
 *
 * ── Featured — issue #362 ────────────────────────────────────────────────────────────
 *
 * The show watched most recently is drawn wide (`featured`): its next episode's still,
 * the poster's tint behind it. It is the same component with the same key, so it keeps
 * every behaviour of a compact card — mark, hold, Undo, advance, leave — by construction,
 * and when it leaves the next card turns featured by a prop change that `layout` animates
 * rather than by a remount.
 */
export function UpNextEpisodeRow({
  entry,
  aboveFold = false,
  featured = false,
}: {
  entry: UpNextEntry;
  aboveFold?: boolean;
  featured?: boolean;
}) {
  if (entry.queue.episodes.length === 0) {
    return (
      <RowBody
        entry={entry}
        code={episodeCode(entry.seasonNo, entry.episodeNo)}
        episodeName={entry.episodeName}
        held={null}
        featured={featured}
        picture={featured ? featuredPicture(entry, null) : cardPicture(entry)}
        progress={seasonProgress(entry, null, 0)}
        remainingAfter={countAfterShown(entry.remaining, 0, false)}
        aboveFold={aboveFold}
        control={null}
      />
    );
  }

  return <MarkableRow entry={entry} aboveFold={aboveFold} featured={featured} />;
}

function MarkableRow({
  entry,
  aboveFold,
  featured,
}: {
  entry: UpNextEntry;
  aboveFold: boolean;
  featured: boolean;
}) {
  const mark = useUpNextMark(entry);

  useHold(mark.held?.episodeId ?? null, mark.settle);

  if (mark.finished && mark.held === null) return null;

  /* The episode on the card: the one being held while the hold lasts, otherwise the first
     unwatched one in the run (or the run's last, if a capped run has gone dry). */
  const shownAt =
    mark.held !== null
      ? indexOf(entry, mark.held)
      : mark.episode === null
        ? entry.queue.episodes.length
        : indexOf(entry, mark.episode);
  const spent = shownAt >= entry.queue.episodes.length;
  const showing =
    entry.queue.episodes[spent ? entry.queue.episodes.length - 1 : shownAt];
  /* How many of the run are marked: the held episode is one of them. */
  const marked = mark.held !== null ? shownAt + 1 : shownAt;

  return (
    <RowBody
      entry={entry}
      code={episodeCode(showing.seasonNo, showing.episodeNo)}
      episodeName={showing.episodeName}
      held={mark.held === null ? null : finishLine(finishFactsFor(entry, mark.held))}
      featured={featured}
      picture={featured ? featuredPicture(entry, showing) : mark.picture}
      progress={seasonProgress(entry, showing, marked)}
      remainingAfter={countAfterShown(entry.remaining, shownAt, spent)}
      aboveFold={aboveFold}
      control={
        mark.held !== null ? (
          <HeldControl
            onUndo={mark.undoable === null ? null : mark.undo}
            undoLabel={`Undo marking ${queuedEpisodeFullName(mark.held)} watched`}
          />
        ) : (
          <MarkControl
            mark={{
              ...mark,
              mark() {
                /* The pulse goes with the press, not the render: it is the one part of
                   the moment that cannot wait for the hold to draw. */
                if (mark.episode !== null && finishesSomething(entry, mark.episode)) {
                  finishPulse();
                }
                mark.mark();
              },
            }}
          />
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

export const ROW_POSTER_WIDTH = CARD_POSTER_WIDTH;

const ROW = CARD;

const POSTER = CARD_POSTER;

function RowBody({
  entry,
  code,
  episodeName,
  held,
  featured,
  picture,
  progress,
  remainingAfter,
  aboveFold,
  control,
}: {
  entry: UpNextEntry;
  code: string;
  episodeName: string | null;
  /** The line the card holds on after a mark — *Watched*, or a finish (#367) — or `null`
   *  while it is not holding. */
  held: string | null;
  featured: boolean;
  picture: CardPicture;
  progress: SeasonProgress;
  remainingAfter: number;
  aboveFold: boolean;
  control: React.ReactNode;
}) {
  const label = `${entry.titleName} — ${code}${episodeName === null ? "" : `, ${episodeName}`}`;
  /* The featured card's tint (#362), when the poster has a stored colour. Dropped while
     the card holds, so the hold's accent wash (`.watch-hold`) is what shows. */
  const tinted = featured && entry.posterColour !== null && held === null;
  const card = featured ? FEATURED_CARD : ROW;

  return (
    /* `layout`, so the cards below glide up when one leaves; `exit`, so the one leaving
       fades and shrinks rather than vanishing (`up-next-episode-rail.tsx`'s
       `AnimatePresence`). */
    <m.li
      layout
      exit={{ opacity: 0, scale: 0.96, transition: exit }}
      className={held ? `${card} watch-hold` : tinted ? `${card} poster-tint` : card}
      style={
        tinted
          ? { ...posterTintStyle(entry.posterColour), backgroundImage: FEATURED_WASH }
          : undefined
      }
      data-featured={featured ? "" : undefined}
    >
      <RowLink entry={entry} label={label} stacked={featured && picture.kind === "still"}>
        {featured ? (
          <FeaturedFrame picture={picture} progress={progress} name={entry.titleName} />
        ) : (
          <RowFrame picture={picture} progress={progress} aboveFold={aboveFold} />
        )}

        <div className="relative min-w-0 flex-1">
          <p
            className={
              featured
                ? "truncate text-item font-semibold text-text"
                : "truncate label-line text-dim"
            }
          >
            {entry.titleName}
          </p>

          {/* The episode lines are keyed on the code, so an advance is the old episode
              lifting out and the next one rising in — `popLayout`, so the two never stack
              and the card keeps its height. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={held !== null ? `${code}-held` : code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: exit }}
              transition={snappy}
            >
              <p className="mt-[3px] flex items-baseline gap-x-2">
                <span className="bill-title text-bill-xs text-text">{code}</span>
                {/* `data-numeric` is the tabular-figures hook, so a list of cards does not
                    jitter as the numbers change width. Absent at zero
                    (`remainingInWords`). */}
                {remainingAfter > 0 && held === null ? (
                  <span className="code-line text-dim" data-numeric>
                    {remainingInWords(remainingAfter)}
                  </span>
                ) : null}
              </p>

              {/* *Watched* while the card holds — the confirmation, in the accent's
                  records-a-watch ink. Otherwise the episode's name, or no line at all
                  where TMDB has not named it: an episode is never referred to by number
                  alone, and the code above has already said it once. */}
              {held !== null ? (
                <p
                  className={`mt-0.5 truncate text-item font-medium ${RECORDS_A_WATCH.ink}${
                    held === WATCHED ? "" : " finish-line"
                  }`}
                >
                  {held}
                </p>
              ) : episodeName === null ? null : (
                <p className="mt-0.5 truncate text-item leading-snug text-text">
                  {episodeName}
                </p>
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </RowLink>

      {control}
    </m.li>
  );
}

function RowLink({
  entry,
  label,
  stacked,
  children,
}: {
  entry: UpNextEntry;
  label: string;
  /** A featured card's still sits above the text on a phone (#362). */
  stacked: boolean;
  children: React.ReactNode;
}) {
  const shared = `pressable group flex min-w-0 flex-1 gap-3 text-left ${
    stacked ? "flex-col sm:flex-row sm:items-center" : "items-center"
  }`;

  return (
    <Link
      href={`/titles/${entry.libraryEntryId}`}
      onClick={(event) => carryPoster(entry.libraryEntryId, entry.posterPath, event.currentTarget)}
      aria-label={label}
      className={shared}
    >
      {children}
    </Link>
  );
}

function RowFrame({
  picture,
  progress,
  aboveFold,
}: {
  picture: CardPicture;
  progress: SeasonProgress;
  aboveFold: boolean;
}) {
  /* No morph name — the UI overhaul. The title page has a loading screen, and Next commits
     that first, so a list poster and the hero never land in the same commit and the morph
     could never form (Next's own `view-transitions.md`: "no pair forms"). The loading
     screen was kept and the morph dropped; the poster still travels as a picture
     (`carryPoster`), so the loading screen shows it at once. */
  return (
    <Poster
      posterPath={picture.kind === "poster" ? picture.path : null}
      width={ROW_POSTER_WIDTH}
      className={POSTER}
      aboveFold={aboveFold}
    >
      {/* The current season, aired episodes only (#364). It moves as the mark lands
          because `progress` is derived from the card's position. */}
      <PosterProgressBar progress={progress} />
    </Poster>
  );
}

/**
 * The check. Built on `RECORDING_HIT_BOX` and `IN_FLIGHT` like every recording control
 * (#304), so it presses with the loudest register and cannot be pressed twice in flight.
 */
const CHECK_HIT_BOX = `${RECORDING_HIT_BOX} ${IN_FLIGHT}`;

function MarkControl({ mark }: { mark: UpNextMark }) {
  const { episode, pending } = mark;

  /* A capped run that went dry — `UpNextQueue`'s own table has the case. The slot offers
     nothing and the card keeps its height from the poster. */
  if (episode === null) return null;

  return (
    <button
      type="button"
      onClick={mark.mark}
      disabled={pending}
      /* The card prints the code line but never the season word, so this label is the only
         thing that says in full which episode a press records. */
      aria-label={`Mark ${queuedEpisodeFullName(episode)} watched`}
      className={CHECK_HIT_BOX}
    >
      <span className={RECORDING_GLYPH_UP_NEXT}>
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
        /* The frame is `aria-hidden` and the pending line is a live region rather than a
           label, so this is the whole of what a screen reader hears for the link. */
        aria-label={`${entry.titleName} — episodes still arriving`}
      >
        {/* The same box `RowFrame` draws, so a pending card is exactly the height of the
            card it becomes once the mirror lands. */}
        <Poster
          posterPath={entry.posterPath}
          width={ROW_POSTER_WIDTH}
          className={POSTER}
          aboveFold={aboveFold}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate label-line text-dim">{entry.titleName}</p>
          <div className="mt-[3px]">
            <PendingLine />
          </div>
        </div>
      </Link>
    </m.li>
  );
}

export { isPendingEntry, type UpNextRailEntry };
