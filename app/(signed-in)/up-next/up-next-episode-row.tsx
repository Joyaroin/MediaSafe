"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { ViewTransition } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { EpisodeStill } from "@/app/(signed-in)/library/episode-still";
import { useLibrarySelection } from "@/app/(signed-in)/library/library-selection";
import { railPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import { DESKTOP_BREAKPOINT } from "@/app/(signed-in)/library/selectable-entry";
import { carryPoster } from "@/app/poster-handoff-memory";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
  WatchSweep,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { watchMarks } from "@/app/(signed-in)/library/watch-marks";
import { PendingLine } from "@/app/pending-line";
import { posterSrc } from "@/app/poster";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import {
  isPendingEntry,
  type QueuedEpisode,
  type UpNextEntry,
  type UpNextPendingEntry,
  type UpNextRailEntry,
} from "@/db/access";
import {
  episodeCode,
  episodeMetaLine,
  remainingInWords,
} from "./episode-card-line";
import {
  cardPicture,
  queuedEpisodeFullName,
  useUpNextMark,
  type CardPicture,
  type UpNextMark,
} from "./up-next-mark";

/**
 * One row of Up next — the card, laid out sideways.
 *
 * `up-next-episode-card.tsx` is where this content was worked out and every rule about it
 * still holds: the code line, the one honest remainder `SPEC.md` §7 was amended for, the
 * held frame for a missing still, the label that names the episode in full. What changed
 * is the box. A `262px` card stacked four facts and cut the episode name; a full-width row
 * sets them on one line and cuts nothing.
 *
 * ── The press, and the divergence it preserves ────────────────────────────────────────
 *
 * `SPEC.md`'s divergence 3 — *desktop replaces the pane, phone pushes a route* — is
 * unchanged by this ticket and is the reason this component takes `press` rather than
 * deciding for itself:
 *
 * - **`"select"`** is the desktop rails' behaviour, out of `up-next-tile.tsx`: on `lg` and
 *   up a press swaps the programme note beside the list and never navigates; below it, the
 *   same element is an ordinary link to the title.
 * - **`"episode"`** is the phone card's, out of `up-next-episode-card.tsx`: a press opens
 *   the episode this row is actually naming. #274's rule, quoted there — *three things on
 *   this card have to agree about which episode it is* — is why the href reads the shown
 *   episode rather than the entry's.
 *
 * Neither is new. Both were already shipping; this is the one component that now draws
 * them, instead of two components that each drew one.
 */
export type RowPress = "select" | "episode";

export function UpNextEpisodeRow({
  entry,
  press,
  aboveFold = false,
}: {
  entry: UpNextEntry;
  press: RowPress;
  aboveFold?: boolean;
}) {
  if (entry.queue.episodes.length === 0) {
    return (
      <RowBody
        entry={entry}
        code={episodeCode(entry.seasonNo, entry.episodeNo)}
        episodeName={entry.episodeName}
        picture={cardPicture(watchMarks, entry)}
        airDate={entry.airDate}
        runtimeMins={entry.runtimeMins}
        remainingAfter={countAfterShown(entry.remaining, 0, false)}
        press={press}
        aboveFold={aboveFold}
        control={null}
        sweep={null}
      />
    );
  }

  return <MarkableRow entry={entry} press={press} aboveFold={aboveFold} />;
}

function MarkableRow({
  entry,
  press,
  aboveFold,
}: {
  entry: UpNextEntry;
  press: RowPress;
  aboveFold: boolean;
}) {
  const mark = useUpNextMark(entry);

  if (mark.finished) return null;

  const marked =
    mark.episode === null ? entry.queue.episodes.length : indexOf(entry, mark.episode);
  const spent = marked >= entry.queue.episodes.length;
  const showing = entry.queue.episodes[spent ? entry.queue.episodes.length - 1 : marked];

  return (
    <RowBody
      entry={entry}
      code={episodeCode(showing.seasonNo, showing.episodeNo)}
      episodeName={showing.episodeName}
      picture={mark.picture}
      airDate={marked === 0 ? entry.airDate : null}
      runtimeMins={marked === 0 ? entry.runtimeMins : null}
      remainingAfter={countAfterShown(entry.remaining, marked, spent)}
      press={press}
      aboveFold={aboveFold}
      control={<MarkControl mark={mark} />}
      sweep={mark.phase === "marking" ? <WatchSweep onSettled={mark.settle} /> : null}
    />
  );
}

function indexOf(entry: UpNextEntry, episode: QueuedEpisode): number {
  const at = entry.queue.episodes.findIndex(
    (one) => one.episodeId === episode.episodeId,
  );
  return at < 0 ? 0 : at;
}

function countAfterShown(remaining: number, marked: number, spent: boolean): number {
  const unwatched = Math.max(0, remaining - marked);
  return spent ? unwatched : Math.max(0, unwatched - 1);
}

/** The still's rendered width. Small enough that TMDB's `w300` bucket is the right ask at
 *  every density, which is what `EpisodeStill` resolves it to. */
export const ROW_STILL_WIDTH = 104;
const ROW = "relative flex min-h-[72px] items-center gap-3.5 py-2.5";

/**
 * Issue #306 — both row kinds are `m.li layout` rather than a bare `<li>`, so the row
 * *travels* when its position or size changes between renders instead of the browser
 * painting the new layout in one frame. A title finishing above this row removes that
 * `<li>` and every row below it reflows into the gap; a later render can put the row
 * itself first once it is the most recently watched. Both are the same fact to Motion —
 * a position that changed between two renders of an element it already knows — and
 * `layout` is what makes it measure the difference and interpolate rather than snap.
 *
 * No local `transition` and no reduced-motion branch: `app/motion-provider.tsx`'s root
 * `MotionConfig` supplies `smooth` to everything Motion animates and drops layout
 * animation under `reducedMotion="user"`, so the reorder resolves instantly there without
 * this file knowing the setting exists. The one thing this relies on that is not this
 * file's own — every render below still keys on `entry.libraryEntryId`, never a position,
 * which is what gives `layout` a stable identity to measure a move across at all.
 */
const STILL = "w-[104px] shrink-0 [--still-radius:8px]";

function RowBody({
  entry,
  code,
  episodeName,
  picture,
  airDate,
  runtimeMins,
  remainingAfter,
  press,
  aboveFold,
  control,
  sweep,
}: {
  entry: UpNextEntry;
  code: string;
  episodeName: string | null;
  picture: CardPicture;
  airDate: string | null;
  runtimeMins: number | null;
  remainingAfter: number;
  press: RowPress;
  aboveFold: boolean;
  control: React.ReactNode;
  sweep: React.ReactNode;
}) {
  const meta = episodeMetaLine({ airDate, runtimeMins });
  const label = `${entry.titleName} — ${code}${episodeName === null ? "" : `, ${episodeName}`}`;

  return (
    /* `relative` is the sweep's — `position: absolute; inset: 0`, and it must not take up
       flow space (`watch-mark-motion.tsx`). No `overflow-hidden` and no radius: the row is
       divided by `UpNextGroup`'s hairline rather than drawn as a card, so there is no
       corner for the wash to escape. */
    <m.li layout className={ROW}>
      <RowLink entry={entry} press={press} label={label}>
        <RowFrame entry={entry} picture={picture} aboveFold={aboveFold} />

        <div className="min-w-0 flex-1">
          <p className="label-line text-dim">{entry.titleName}</p>

          <p className="mt-[3px] flex flex-wrap items-baseline gap-x-2">
            <span className="bill-title text-bill-xs text-text">{code}</span>
            {/* The one count on this surface, and `SPEC.md` §7 was amended for it (#250).
                `data-numeric` is the tabular-figures hook, so a list of rows does not
                jitter as the numbers change width. */}
            <span className="code-line text-dim" data-numeric>
              {remainingInWords(remainingAfter)}
            </span>
            {meta === null ? null : (
              <span className="code-line text-dim" data-numeric>
                · {meta}
              </span>
            )}
          </p>

          {/* No line at all where TMDB has not named the episode, rather than the number a
              second time — `CONTEXT.md`'s *an episode is never referred to by number
              alone*, and the code line above has already said it once.

              `line-clamp-2` rather than the card's unbounded wrap: a row is a fixed-height
              thing beside a `104px` still, and a four-line synopsis-length episode name
              would make one row three times its neighbours. Two lines is the season list's
              own answer to the identical question (`programme-note-episodes.tsx`). */}
          {episodeName === null ? null : (
            <p className="mt-0.5 line-clamp-2 text-item leading-snug text-text">
              {episodeName}
            </p>
          )}
        </div>
      </RowLink>

      {control}
      {sweep}
    </m.li>
  );
}

/**
 * The row's destination, which is `press`'s whole job. The control is deliberately
 * **outside** this element in `RowBody` rather than nested in it — `SPEC.md`'s rule for
 * the season row, restated: a control inside a link is a control every press of which is
 * also a navigation, and the daily gesture is the one press that must never become one.
 */
function RowLink({
  entry,
  press,
  label,
  children,
}: {
  entry: UpNextEntry;
  press: RowPress;
  label: string;
  children: React.ReactNode;
}) {
  const { selectedEntryId, select } = useLibrarySelection();
  const selected = entry.libraryEntryId === selectedEntryId;

  function onSelectClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    // A ⌘-click, a Ctrl-click, a Shift-click or a middle button is a request about the
    // link, and it is answered by the link on both sides of the breakpoint.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (!window.matchMedia(DESKTOP_BREAKPOINT).matches) return;
    event.preventDefault();
    select(entry.libraryEntryId, entry.posterPath);
  }

  const shared = "pressable group flex min-w-0 flex-1 items-center gap-3.5 text-left";

  if (press === "select") {
    return (
      <Link
        href={`/titles/${entry.libraryEntryId}`}
        onClick={onSelectClick}
        aria-current={selected ? "true" : undefined}
        aria-label={entry.titleName}
        className={shared}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={`/titles/${entry.libraryEntryId}`}
      // Issue #303: the phone's own press. A plain `Link` needs no `preventDefault` to
      // carry the poster — this only has to run before the navigation it sits beside, and
      // React runs a click handler before the browser follows the anchor either way.
      onClick={() => carryPoster(entry.libraryEntryId, entry.posterPath)}
      aria-label={label}
      className={shared}
    >
      {children}
    </Link>
  );
}

function RowFrame({
  entry,
  picture,
  aboveFold,
}: {
  entry: UpNextEntry;
  picture: CardPicture;
  aboveFold: boolean;
}) {
  const { selectedEntryId } = useLibrarySelection();
  const selected = entry.libraryEntryId === selectedEntryId;

  const frame =
    picture.kind === "poster" ? (
      <div className={`still ${STILL}`}>
        {/* `app/poster.tsx`'s own reasoning, which ADR-0001 fixes: TMDB's CDN, never
            Vercel's metered optimiser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="block h-full w-full object-cover object-center"
          src={posterSrc(picture.path, ROW_STILL_WIDTH)}
          alt=""
          aria-hidden="true"
          loading={aboveFold ? "eager" : "lazy"}
          fetchPriority={aboveFold ? "high" : undefined}
          decoding="async"
        />
      </div>
    ) : (
      <EpisodeStill
        stillPath={picture.kind === "still" ? picture.path : null}
        width={ROW_STILL_WIDTH}
        className={STILL}
        aboveFold={aboveFold}
      />
    );

  /* The poster-to-hero transition, on both presses — issue #303 reverses what this said
     one ticket ago: *"The phone's row navigates to a different page and has nothing to
     share."* That was true while the phone title route's pending frame replaced the
     poster with bars before its own read resolved, which left no destination poster for
     this row's name to pair against even once minted. The pending frame carries a poster
     now (`app/poster-handoff-memory.ts`, read by `titles/[entryId]/pending-poster.tsx`),
     so the phone's row has something to share and gets the same wrapper the desktop's
     always had.

     **`!selected` is still load-bearing, and `up-next-tile.tsx` learned it first.** A view
     transition name may mark one on-screen element at a time, and the moment the pane
     beside this list is showing the poster it is holding the same name — so the row has to
     have let go by then. `selected` only ever answers true for a `press="select"` row: the
     phone's `press="episode"` rows render under a context no `select()` ever writes to
     from that surface, so this is the one branch either press was already testing rather
     than a second condition. */
  if (selected) return frame;
  return (
    <ViewTransition name={railPosterTransitionName(entry.libraryEntryId)}>
      {frame}
    </ViewTransition>
  );
}

const CHECK_HIT_BOX = `${RECORDING_HIT_BOX} ${IN_FLIGHT}`;

function MarkControl({ mark }: { mark: UpNextMark }) {
  const { episode, pending } = mark;

  /**
   * **No *Undo* here.** It was a text pill in this slot, offered for the length of one
   * visit after a mark. Up next has no hold panel to put the item in — every episode this
   * surface shows is the *next unwatched* one, so there is nothing on a row here to
   * rewatch or unwatch, and a panel with one item in it is a gesture nobody would find.
   *
   * A misfire on this screen is taken back where the episode lives: the title's season
   * list, whose rows hold all three acts behind a hold (`watch-menu.tsx`). That costs a
   * navigation, and it is the trade — the landing screen keeps one control and one
   * meaning, which is what it was rebuilt around.
   */
  /* A capped run that went dry, and a group whose episode has not aired — `UpNextQueue`'s
     own table has the cases. The slot offers nothing and the row keeps its height from
     `ROW`'s own floor. */
  if (episode === null) return null;

  return (
    <button
      type="button"
      onClick={mark.mark}
      disabled={pending}
      /* The row prints the code line but never the season word, so this label is the only
         thing that says in full which episode a press records. */
      aria-label={`Mark ${queuedEpisodeFullName(episode)} watched`}
      className={CHECK_HIT_BOX}
    >
      <span className={RECORDING_GLYPH}>
        <CheckmarkIcon className="h-4 w-4" />
      </span>
    </button>
  );
}

/**
 * The row a title has while its episodes are still arriving — `up-next-pending-card.tsx`'s
 * content at the row's own measure. `DESIGN.md` §9's treatment unaltered: everything above
 * the pending line is a fact the add already wrote and renders at full strength, and one
 * dim line is the only region genuinely still waiting.
 */
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
        className="pressable flex min-w-0 flex-1 items-center gap-3.5"
        /* The frame is `aria-hidden` and the pending line is a live region rather than a
           label, so this is the whole of what a screen reader hears for the link. */
        aria-label={`${entry.titleName} — episodes still arriving`}
      >
        {entry.posterPath === null ? (
          <EpisodeStill
            stillPath={null}
            width={ROW_STILL_WIDTH}
            className={STILL}
            aboveFold={aboveFold}
          />
        ) : (
          <div className={`still ${STILL}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="block h-full w-full object-cover object-center"
              src={posterSrc(entry.posterPath, ROW_STILL_WIDTH)}
              alt=""
              aria-hidden="true"
              loading={aboveFold ? "eager" : "lazy"}
              fetchPriority={aboveFold ? "high" : undefined}
              decoding="async"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="label-line text-dim">{entry.titleName}</p>
          <div className="mt-[3px]">
            <PendingLine />
          </div>
        </div>
      </Link>

      {/* The mark slot, empty — there is nothing to record against a title with no
          episodes, and `ROW`'s own floor is what keeps this row the height of the row it
          becomes when the mirror lands. */}
    </m.li>
  );
}

/** `up-next-episode-rail.tsx`'s own guard, re-exported so a caller that maps entries to
 *  rows does not have to import the type test from `db/access` separately. */
export { isPendingEntry, type UpNextRailEntry };
