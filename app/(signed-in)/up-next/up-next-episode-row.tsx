"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { ViewTransition } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { railPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import { carryPoster } from "@/app/poster-handoff-memory";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
  WatchSweep,
} from "@/app/(signed-in)/library/watch-mark-motion";
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
 * still holds: the code line, the one honest remainder the rule was narrowed for, the
 * held frame for missing artwork, the label that names the episode in full. What changed
 * is the box. A `262px` card stacked four facts and cut the episode name; a full-width row
 * sets them on one line and cuts nothing.
 *
 * ── The frame draws the title's poster, not the episode's still — issue #320 ─────────
 *
 * Until #320 this row drew the episode's own still at `16:9` in a `104px` box — a wide
 * frame squeezed into a small one, which reads as a poster that has been cut off, and
 * whichever picture landed there travelled at the wrong shape into the title's own `2:3`
 * poster on the morph. The still is retired from this row entirely: `up-next-mark.ts`'s
 * `cardPicture` never names one any more, and the frame itself is now `Poster`'s own `2/3`
 * box rather than the `16:9` `still` utility, so the picture that travels is the same
 * picture at the same shape on both ends of the morph. The row is taller for it — a whole
 * poster is more picture than a cropped still — which is accepted deliberately.
 *
 * ── The meta line drops the air date and the runtime — issue #321 ────────────────────
 *
 * #250's card carried four facts beside the still: the code, the episode's name, the
 * remaining count and a last line joining an air date and a runtime. The date and the
 * runtime are noise on a surface reached to decide what to watch next, and are gone —
 * `episode-card-line.ts`'s `episodeMetaLine` and its own `airDateInWords` are deleted with
 * them, rather than left with no caller. The remaining count is not reopened: it is the one
 * count the rule was narrowed for (#250), on the grounds that *am I three from the end or
 * thirty* is the question this row exists to answer.
 *
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
        picture={cardPicture(entry)}
        remainingAfter={countAfterShown(entry.remaining, 0, false)}
        aboveFold={aboveFold}
        control={null}
        sweep={null}
      />
    );
  }

  return <MarkableRow entry={entry} aboveFold={aboveFold} />;
}

function MarkableRow({
  entry,
  aboveFold,
}: {
  entry: UpNextEntry;
  aboveFold: boolean;
}) {
  const mark = useUpNextMark(entry);

  if (mark.finished) return null;

  const marked =
    mark.episode === null
      ? entry.queue.episodes.length
      : indexOf(entry, mark.episode);
  const spent = marked >= entry.queue.episodes.length;
  const showing =
    entry.queue.episodes[spent ? entry.queue.episodes.length - 1 : marked];

  return (
    <RowBody
      entry={entry}
      code={episodeCode(showing.seasonNo, showing.episodeNo)}
      episodeName={showing.episodeName}
      picture={mark.picture}
      remainingAfter={countAfterShown(entry.remaining, marked, spent)}
      aboveFold={aboveFold}
      control={<MarkControl mark={mark} />}
      sweep={
        mark.phase === "marking" ? <WatchSweep onSettled={mark.settle} /> : null
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

function countAfterShown(
  remaining: number,
  marked: number,
  spent: boolean,
): number {
  const unwatched = Math.max(0, remaining - marked);
  return spent ? unwatched : Math.max(0, unwatched - 1);
}

/**
 * The picture's rendered width — issue #320, and the one figure kept from the still it
 * replaces. The box's *ratio* was the defect (`16/9` cropped a `2/3` poster, `104px` wide),
 * not its width, so the width carries over unchanged and the box grows taller with the new
 * ratio rather than picking a new measure that has to be justified on its own.
 */
export const ROW_POSTER_WIDTH = 104;
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
/* #320 turned this row's picture from the episode's still into the title's poster, and
   #318 moved every radius onto the scale. Both, rather than either: the constant is the
   poster's, and the value it carries is the scale's own step for what used to be 8px. */
const POSTER = "w-[104px] shrink-0 [--poster-radius:var(--radius-1)]";

function RowBody({
  entry,
  code,
  episodeName,
  picture,
  remainingAfter,
  aboveFold,
  control,
  sweep,
}: {
  entry: UpNextEntry;
  code: string;
  episodeName: string | null;
  picture: CardPicture;
  remainingAfter: number;
  aboveFold: boolean;
  control: React.ReactNode;
  sweep: React.ReactNode;
}) {
  const label = `${entry.titleName} — ${code}${episodeName === null ? "" : `, ${episodeName}`}`;

  return (
    /* `relative` is the sweep's — `position: absolute; inset: 0`, and it must not take up
       flow space (`watch-mark-motion.tsx`). No `overflow-hidden` and no radius: the row is
       divided by `UpNextGroup`'s hairline rather than drawn as a card, so there is no
       corner for the wash to escape. */
    <m.li layout className={ROW}>
      <RowLink entry={entry} label={label}>
        <RowFrame entry={entry} picture={picture} aboveFold={aboveFold} />

        <div className="min-w-0 flex-1">
          <p className="label-line text-dim">{entry.titleName}</p>

          <p className="mt-[3px] flex flex-wrap items-baseline gap-x-2">
            <span className="bill-title text-bill-xs text-text">{code}</span>
            {/* The one count on this surface, and the rule was narrowed for it (#250).
                `data-numeric` is the tabular-figures hook, so a list of rows does not
                jitter as the numbers change width.

                The air date and the runtime used to close this line with a third span —
                deleted with `episodeMetaLine` (#321), rather than a placeholder. The
                line is a flex row, so nothing is left to close a gap over. */}
            <span className="code-line text-dim" data-numeric>
              {remainingInWords(remainingAfter)}
            </span>
          </p>

          {/* No line at all where TMDB has not named the episode, rather than the number a
              second time — *an episode is never referred to by number
              alone*, and the code line above has already said it once.

              `line-clamp-2` rather than the card's unbounded wrap: a row is a fixed-width
              thing beside a `104px` poster, and a four-line synopsis-length episode name
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
 * **outside** this element in `RowBody` rather than nested in it — the rule for
 * the season row, restated: a control inside a link is a control every press of which is
 * also a navigation, and the daily gesture is the one press that must never become one.
 */
function RowLink({
  entry,
  label,
  children,
}: {
  entry: UpNextEntry;
  label: string;
  children: React.ReactNode;
}) {
  const shared =
    "pressable group flex min-w-0 flex-1 items-center gap-3.5 text-left";

  return (
    <Link
      href={`/titles/${entry.libraryEntryId}`}
      // Issue #303. A plain `Link` needs no `preventDefault` to
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
  /**
   * The title's poster, at its own uncropped `2/3` — never the episode's still, which is
   * retired from this row entirely (#320, and `up-next-mark.ts`'s own docblock on
   * `cardPicture`). `picture.kind` is never `"still"` here in practice — nothing this row
   * reads still names one — so the only branch is *a poster, or the held frame `Poster`
   * draws for `null`*.
   *
   * `name` is deliberately withheld, unlike this list's other two rows
   * (`up-next-film-rail.tsx`, `upcoming-row.tsx`): this row is the still's own successor,
   * and the still drew no glyph, wordmark or apology for missing artwork
   * — a rule this ticket carries over rather than trades for `Poster`'s initials. Passing
   * `name` here would be a second, unasked-for visual change riding on the one this ticket
   * makes.
   */
  const frame = (
    <Poster
      posterPath={picture.kind === "poster" ? picture.path : null}
      width={ROW_POSTER_WIDTH}
      className={POSTER}
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
     always had. */
  return (
    // `default="poster"` assigns `view-transition-class` to the underlying node — issue
    // #338 — which is what scopes `app/globals.css`'s sampled-spring rule to posters and
    // leaves the masthead and tab-bar groups, which carry no class, out of it.
    <ViewTransition name={railPosterTransitionName(entry.libraryEntryId)} default="poster">
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
 * content at the row's own measure. The pending treatment unaltered: everything above
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
        {/* The same `2/3` box `RowFrame` draws for an ordinary row, `name` withheld for the
            same reason — this box shares `POSTER`/`ROW_POSTER_WIDTH` with it so a pending
            row is exactly the height of the row it becomes once the mirror lands. */}
        <Poster
          posterPath={entry.posterPath}
          width={ROW_POSTER_WIDTH}
          className={POSTER}
          aboveFold={aboveFold}
        />

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
