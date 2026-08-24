"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { EpisodeStill } from "@/app/(signed-in)/library/episode-still";
import {
  RECORDING_GLYPH,
  WatchSweep,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { GHOST_RECOVERY_COMPACT, IN_FLIGHT } from "@/errors/recovery-buttons";
import type { QueuedEpisode, UpNextEntry } from "@/db/access";
import {
  episodeCode,
  episodeMetaLine,
  remainingInWords,
} from "./episode-card-line";
import { queuedEpisodeFullName, useUpNextMark, type UpNextMark } from "./up-next-mark";

/**
 * One card on the next-episodes rail — issue #250, and the landing screen's whole reason
 * for existing.
 *
 * `docs/design/prototypes/mediasafe-mobile.html`'s wide landscape card, which is binding
 * on appearance: a 16:9 still, the series name in the label register, the code line with
 * the remaining count beside it, the episode's own name, and a last row holding the air
 * date, the runtime and the check.
 *
 * ── Two components, and the split is a hook rule rather than a style ─────────────────
 *
 * A card whose run arrived **empty from the server** is a *coming back* entry: a caught-up
 * show whose next episode TMDB has dated in the future. It has an episode to announce and
 * nothing to mark, today or by any press — so it must not call `useUpNextMark` at all,
 * because that hook's `finished` would be `true` on the first render and the naive reading
 * of it takes the card off the rail. That is this ticket's own named failure: the rail
 * still rendering, still holding episodes, and quietly leaving shows out.
 *
 * Hooks cannot be called conditionally, so *whether to run the mark at all* has to be a
 * decision made **above** the component that runs it. Hence `UpNextEpisodeCard` — which
 * branches on a prop the server set and never changes — and `MarkableCard` beneath it,
 * which is only ever mounted for an entry that had something to mark. `stillOnRail` in
 * `up-next-mark.ts` is the same distinction written as the rail's own rule, and the two
 * agree by construction because both read `queue.episodes.length` and nothing else.
 *
 * ── What the card shows is the queue's episode, not the entry's ─────────────────────
 *
 * For a markable card they are the same fact read twice on the first render
 * (`db/access.ts`: the run *starts* at `library_entry_up_next`'s own episode). They part
 * company the moment a mark lands, and the queue is the one that moves — which is what
 * makes *the card holds its episode for the length of the sweep and only then advances*
 * true without this file owning any timing. All of that is `up-next-mark.ts`'s, unchanged
 * by #250: the wash on press, the advance on settle, instant un-marking, and the
 * reduced-motion branch that `globals.css` collapses. **No new marking path is
 * introduced.**
 *
 * ── Tapping the card ────────────────────────────────────────────────────────────────
 *
 * **Episode detail** — `library/[entryId]/episode/[episodeId]`. #250 was written expecting
 * to link to the title until an episode had a page of its own; #253 built that page first,
 * so the card goes straight there and the interim never happened.
 *
 * The check is a sibling of the link rather than a control inside it, so a thumb on the
 * check is never also a navigation — `SPEC.md`'s own rule for the season row's check, held
 * here.
 */
export function UpNextEpisodeCard({
  entry,
  aboveFold = false,
}: {
  entry: UpNextEntry;
  /** This card is in the rail's first visible run — the rail's to say
   *  (`library/episode-still.tsx`). */
  aboveFold?: boolean;
}) {
  if (entry.queue.episodes.length === 0) {
    /**
     * Nothing released to mark, and nothing the reader can do will change that on this
     * load. The card announces `library_entry_up_next`'s episode — the dated one that put
     * this title on *coming back* — with no control beside it, which is the handoff's own
     * *unreleased episode, no toggle* state.
     *
     * `remaining` is not adjusted: nothing has been marked, so the count of what is left
     * after this episode is the show's remainder less the one being offered.
     */
    return (
      <CardBody
        entry={entry}
        episodeId={entry.episodeId}
        code={episodeCode(entry.seasonNo, entry.episodeNo)}
        episodeName={entry.episodeName}
        stillPath={entry.stillPath}
        airDate={entry.airDate}
        runtimeMins={entry.runtimeMins}
        remainingAfter={remainingAfter(entry.remaining, 0, false)}
        aboveFold={aboveFold}
        control={null}
        sweep={null}
      />
    );
  }

  return <MarkableCard entry={entry} aboveFold={aboveFold} />;
}

/**
 * A card with a run behind it — every *ongoing* and *old friends* entry.
 *
 * It leaves the rail when its run is spent and nothing released is left, which is
 * `up-next-mark.ts`'s `finished`. In practice `up-next-episode-rail.tsx` gets there first:
 * it asks `stillOnRail` — the same rule, over the same store, in the same tick — and stops
 * rendering this card at all, so that the rail's heading goes with its last card rather
 * than standing over an empty track. The check below is therefore normally unreachable,
 * and it stays for the deleted Ongoing tile's reason: a card that renders a control it has
 * nothing to point at is worse than a redundant guard, because it would make this
 * component correct only for as long as every caller remembers to filter.
 */
function MarkableCard({
  entry,
  aboveFold,
}: {
  entry: UpNextEntry;
  aboveFold: boolean;
}) {
  const mark = useUpNextMark(entry);

  if (mark.finished) return null;

  /**
   * How many of this card's run the reader has marked since the page loaded.
   *
   * Derived from the queue rather than counted separately, so the count and the episode on
   * offer cannot come to disagree: `up-next-mark.ts` puts the card at the first episode
   * the store does not call watched, so the index of the episode on offer *is* the number
   * marked. A run with nothing left on offer has had all of it marked.
   */
  const marked =
    mark.episode === null ? entry.queue.episodes.length : indexOf(entry, mark.episode);

  /**
   * The episode the card draws, and the one case where it is not the one on offer.
   *
   * `episode === null` with `more` true is the cap showing through (`UpNextQueue`'s
   * table): the reader has marked `UP_NEXT_QUEUE_DEPTH` episodes of one show without this
   * page being loaded again, and the run has nothing further in it. The card then shows
   * **the last episode it recorded**, with no control — which is honest (it is an episode
   * this card really did offer, and the missing check says nothing more is on offer) where
   * the alternatives are not: collapsing the card would move every card after it under a
   * moving thumb, and leaving the rail would claim the show had finished, which
   * `db/access.ts` is at pains to make unreachable.
   */
  const spent = marked >= entry.queue.episodes.length;
  const showing = entry.queue.episodes[spent ? entry.queue.episodes.length - 1 : marked];

  return (
    <CardBody
      entry={entry}
      episodeId={showing.episodeId}
      code={episodeCode(showing.seasonNo, showing.episodeNo)}
      episodeName={showing.episodeName}
      /**
       * The **entry's** still, air date and runtime, and only while the card is still on
       * the head of its run.
       *
       * `QueuedEpisode` carries none of the three — #220 read four facts per queued episode
       * because a mark control needs a name and nothing else, and widening it would be a
       * second read of every show's next four episodes for metadata only ever correct for
       * the first of them. So once the card has advanced, the honest answer is that this
       * surface does not know.
       *
       * All three are dropped together rather than only the two text ones, and the still is
       * the one worth arguing: a frame from the episode just watched, sitting above the
       * name of the episode on offer, is a **wrong** picture rather than a missing one, and
       * a card is mostly picture. `EpisodeStill` holds the frame's measure and shows the
       * `raised` ground for it, `episodeMetaLine` renders no line at all — so the card
       * keeps its shape and says less, which is the direction this has to fail in.
       */
      stillPath={marked === 0 ? entry.stillPath : null}
      airDate={marked === 0 ? entry.airDate : null}
      runtimeMins={marked === 0 ? entry.runtimeMins : null}
      remainingAfter={remainingAfter(entry.remaining, marked, spent)}
      aboveFold={aboveFold}
      control={<MarkControl mark={mark} />}
      sweep={mark.phase === "marking" ? <WatchSweep onSettled={mark.settle} /> : null}
    />
  );
}

/** Where in its own run an episode sits. `-1` is impossible for an episode taken out of
 *  that run, and is clamped rather than trusted. */
function indexOf(entry: UpNextEntry, episode: QueuedEpisode): number {
  const at = entry.queue.episodes.findIndex(
    (one) => one.episodeId === episode.episodeId,
  );
  return at < 0 ? 0 : at;
}

/**
 * What is left of this show **after** the episode the card is drawing.
 *
 * `library_entry_remaining` counts every unwatched episode of the show (`db/views.ts`), so
 * the live remainder is that number less the marks made since the page loaded. Whether one
 * more comes off for the episode being drawn depends on which episode that is:
 *
 * - the card is on an episode it is **offering**, which is unwatched and therefore inside
 *   the remainder — so it is subtracted, and the line reads *what comes after this one*;
 * - the run is `spent` and the card is drawing the episode it last **recorded**, which is
 *   already out of the remainder — so nothing more comes off.
 *
 * Clamped at zero rather than allowed to go negative: the view is a server fact and the
 * marks are optimistic, so a rolled-back write or a watch recorded on another device can
 * briefly make the two disagree, and a negative remainder is the one answer that is
 * certainly wrong.
 */
function remainingAfter(remaining: number, marked: number, spent: boolean): number {
  const unwatched = Math.max(0, remaining - marked);
  return spent ? unwatched : Math.max(0, unwatched - 1);
}

/** The card's fixed measure — the prototype's `262px`, and the one thing it fixes. The
 *  height follows from the still's ratio and the lines under it, so a long episode name
 *  makes a taller card rather than a truncated one. */
const CARD_WIDTH = 262;
const CARD = "w-[262px] shrink-0 snap-start";

/**
 * The card, drawn once for both branches above.
 *
 * Extracted rather than written twice for the reason the deleted phone group section gave
 * and this inherits: the measures are load-bearing on each other, and a second copy of them
 * is a second card that sits wrong beside the first.
 *
 * ── The mark slot keeps its height whether or not there is a control ────────────────
 *
 * `min-h-11` on the last row is `episode-line.ts`'s `44px` floor, here for the identical
 * reason the deleted Ongoing tile's mark slot gave: **the card must not resize when it is
 * marked.** The
 * slot holds a mark control, its own reversal, and nothing at all — for a coming-back card
 * and for a capped run that went dry — and a row that collapsed on the third would move
 * every card after it in the track while a thumb was still on the screen.
 */
function CardBody({
  entry,
  episodeId,
  code,
  episodeName,
  stillPath,
  airDate,
  runtimeMins,
  remainingAfter,
  aboveFold,
  control,
  sweep,
}: {
  entry: UpNextEntry;
  /** The episode the card is drawing, which is what it links to — not `entry.episodeId`,
   *  which is only the head of the run and is stale the moment a mark lands. */
  episodeId: string;
  code: string;
  episodeName: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtimeMins: number | null;
  remainingAfter: number;
  aboveFold: boolean;
  /** The check, or `null` for a card with nothing released to mark. */
  control: React.ReactNode;
  /** The accent wash, mounted only while a mark is settling. */
  sweep: React.ReactNode;
}) {
  const meta = episodeMetaLine({ airDate, runtimeMins });

  return (
    /* `relative` is the sweep's, which is `position: absolute; inset: 0` and must not take
       up flow space (`watch-mark-motion.tsx`). `overflow-hidden` keeps both the still's
       corners and the wash inside the card's own radius.

       `snap-start` is the card's half of *a scroll comes to rest on a whole card* — the
       track carries the other half (`up-next-episode-rail.tsx`). */
    <li className={`${CARD} relative overflow-hidden rounded-2xl bg-raised`}>
      {/* The whole card bar the check. A `Link` rather than a button: this is a
          destination, and `SPEC.md`'s *a destination is a destination* is why a film card
          navigates too.

          **Episode detail, not the title.** #250 was written expecting to link to the
          title until an episode had a page of its own; #253 built that page first
          (`library/[entryId]/episode/[episodeId]`), so the card goes straight there — which
          is what the ticket asked for, one issue earlier than it expected. The route is
          keyed by both ids, so it is reached the same way from here and from a season
          row. */}
      <Link
        href={`/library/${entry.libraryEntryId}/episode/${episodeId}`}
        className="pressable block"
        /* The still is `aria-hidden` and the code line is three tokens, so this label is
           what a screen reader hears for the link. `titleName` first, because the series
           is what a reader is choosing between. */
        aria-label={`${entry.titleName} — ${code}${episodeName === null ? "" : `, ${episodeName}`}`}
      >
        {/* `EpisodeStill` is #253's, shared rather than re-cut — one answer to *what does
            a still look like, and what happens when there isn't one*. The `still` utility
            holds the 16:9 ratio, so an episode with no frame keeps the card's shape rather
            than collapsing it, which is #245's user story 48.

            `--still-radius: 0` because the card already clips this frame at its own `16px`
            corner; the utility's default `7px` would draw a notch inside it. Set through
            the variable rather than as a competing class, for the reason `globals.css`
            gives beside both this utility and `poster`. */}
        <EpisodeStill
          stillPath={stillPath}
          width={CARD_WIDTH}
          className="w-full [--still-radius:0]"
          aboveFold={aboveFold}
        />

        <div className="px-[14px] pt-3 pb-1">
          <p className="label-line text-dim">{entry.titleName}</p>

          <p className="mt-[7px] flex items-baseline gap-2">
            <span className="bill-title text-bill-xs text-text">{code}</span>
            {/* The one count on this surface, and `SPEC.md` §7 was amended for it (#250).
                `data-numeric` is the build's tabular-figures hook, so a rail of cards does
                not jitter as the numbers change width. */}
            <span className="code-line text-dim" data-numeric>
              {remainingInWords(remainingAfter)}
            </span>
          </p>

          {/* No line at all where TMDB has not named the episode, rather than the number a
              second time — `CONTEXT.md`'s *an episode is never referred to by number
              alone*, and the code line above has already said it once. */}
          {episodeName === null ? null : (
            <p className="mt-1 text-item leading-snug text-text">{episodeName}</p>
          )}
        </div>
      </Link>

      <div className="flex min-h-11 items-center justify-between gap-2 pr-2 pl-[14px]">
        {/* No `<p>` at all when the catalogue has neither the date nor the runtime — the
            row keeps its height from `min-h-11` regardless, so nothing moves. */}
        {meta === null ? (
          <span />
        ) : (
          <span className="code-line text-dim" data-numeric>
            {meta}
          </span>
        )}
        {control}
      </div>

      {sweep}
    </li>
  );
}

/**
 * The check, and its own reversal — the deleted Ongoing tile's mark slot at a card's
 * measure, and deliberately the same three cases in the same order.
 *
 * `RECORDING_GLYPH` and `GHOST_RECOVERY_COMPACT` are the episode row's own chip and glyph
 * reused rather than re-cut, so a reader meets one appearance for *record this* and one
 * for *take that back* wherever they are (`DESIGN.md` §10).
 *
 * The `44px` **height** is the whole target's floor and the `group` is load-bearing with
 * it, because `RECORDING_GLYPH` inverts on `group-hover:`.
 *
 * **Width is deliberately not in the shared string.** The check is a `44px` square and
 * *Undo* is a chip that is wider than one, and adding `w-auto` after a `size-11` at the
 * call site would be two utilities fighting over the same property — which Tailwind
 * resolves by the order it *emits* them in, not by the order they appear in the `class`
 * attribute. `app/globals.css`'s `--poster-radius` note is the same trap written down once
 * already. So each branch states its own width and neither has to win an argument.
 */
const CHECK_HIT_BOX = `group flex h-11 shrink-0 items-center justify-center ${IN_FLIGHT}`;

function MarkControl({ mark }: { mark: UpNextMark }) {
  const { episode, undoable, pending } = mark;

  if (undoable !== null) {
    return (
      <button
        type="button"
        onClick={mark.undo}
        aria-label={`Undo marking ${queuedEpisodeFullName(undoable)} watched`}
        className={`${CHECK_HIT_BOX} px-2`}
      >
        <span className={GHOST_RECOVERY_COMPACT}>Undo</span>
      </button>
    );
  }

  /* A capped run that went dry — `UpNextQueue`'s own table has the three cases, and this
     is the one that is a read catching up rather than a show finishing. The slot offers
     nothing and keeps its height. */
  if (episode === null) return null;

  return (
    <button
      type="button"
      onClick={mark.mark}
      disabled={pending}
      /* The card prints the code line but never the season word, so this label is the only
         thing that says in full which episode a press records. It is `season-grouping.ts`'s
         full name — the same words the toast would use if the write were lost, and the same
         rule the episode row's own control follows. */
      aria-label={`Mark ${queuedEpisodeFullName(episode)} watched`}
      className={`${CHECK_HIT_BOX} w-11`}
    >
      <span className={RECORDING_GLYPH}>
        <CheckmarkIcon className="h-4 w-4" />
      </span>
    </button>
  );
}
