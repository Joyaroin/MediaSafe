"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { EpisodeStill } from "@/app/(signed-in)/library/episode-still";
import {
  RECORDING_GLYPH,
  WatchSweep,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { watchMarks } from "@/app/(signed-in)/library/watch-marks";
import { posterSrc } from "@/app/poster";
import { GHOST_RECOVERY_COMPACT, IN_FLIGHT } from "@/errors/recovery-buttons";
import type { QueuedEpisode, UpNextEntry } from "@/db/access";
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
 * **The title's own page** — `/library/{entryId}`, and the same destination the film card
 * and the pending card already have. #250 was written expecting exactly this and settled
 * for the episode instead, because #253 gave an episode a page first; #274 puts the card
 * back where the ticket that built it meant it to go, so that every tile and every card on
 * this tab opens the same kind of place. The episode's page keeps its other two origins —
 * a season row and a deep link — and is not deleted.
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
        code={episodeCode(entry.seasonNo, entry.episodeNo)}
        episodeName={entry.episodeName}
        /**
         * `cardPicture` over the module-level store, rather than a still read straight off
         * the entry — one rule for every card (#269), even the one that can never move.
         *
         * This branch has no `useUpNextMark` and must not grow one: the hook rule at the
         * top of this file is why the branch exists at all. It does not need the
         * subscription either — a run that arrived empty has nothing markable in it, so
         * this card's position is nailed to zero and no press can change the answer. The
         * store is passed because the rule takes one, not because this call is watching it.
         */
        picture={cardPicture(watchMarks, entry)}
        airDate={entry.airDate}
        runtimeMins={entry.runtimeMins}
        remainingAfter={countAfterShown(entry.remaining, 0, false)}
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
      code={episodeCode(showing.seasonNo, showing.episodeNo)}
      episodeName={showing.episodeName}
      /**
       * The picture is `up-next-mark.ts`'s answer, asked and not decided (#269).
       *
       * **This reverses what this file did one ticket ago, and the reversal is the ticket.**
       * The air date and the runtime below are still the **entry's**, and still dropped the
       * moment the card advances, for #220's unchanged reason: `QueuedEpisode` carries
       * neither, so once the card has moved this surface does not know them, and
       * `episodeMetaLine` renders no line at all rather than the wrong one.
       *
       * The still used to be dropped with them, and a card that advanced went to the
       * `raised` ground — which held the card's shape and lost the artwork, on a card that
       * is mostly artwork. #269 keeps the drop and adds what takes its place: the title's
       * poster, in the still's own frame. The rule for which of the two, and for the title
       * that has neither, is in the module and is exercised with no DOM.
       */
      picture={mark.picture}
      airDate={marked === 0 ? entry.airDate : null}
      runtimeMins={marked === 0 ? entry.runtimeMins : null}
      remainingAfter={countAfterShown(entry.remaining, marked, spent)}
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
 * Named for what it computes rather than for the prop it fills. It used to be
 * `remainingAfter`, which read `remainingAfter={remainingAfter(entry.remaining, …)}` at
 * both call sites and put three near-identical names — the view's `remaining` field, this
 * function, and `CardBody`'s prop — within one expression of each other.
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
function countAfterShown(remaining: number, marked: number, spent: boolean): number {
  const unwatched = Math.max(0, remaining - marked);
  return spent ? unwatched : Math.max(0, unwatched - 1);
}

/** The card's fixed measure — the prototype's `262px`, and the one thing it fixes. The
 *  height follows from the still's ratio and the lines under it, so a long episode name
 *  makes a taller card rather than a truncated one.
 *
 *  Exported since #272: the pending card is the same box with a different filling, and a
 *  second `262px` written down beside this one is a rail that reflows the moment either
 *  number moves. */
export const CARD_WIDTH = 262;
export const CARD = "w-[262px] shrink-0 snap-start";
/** The frame's measure, stated once so the three states of `CardFrame` cannot come to
 *  differ in size — which is the whole of *the rail never reflows under a thumb*. */
export const FRAME = "w-full [--still-radius:0]";

/**
 * **The dead zone between the card's tap area and the recording control — issue #277.**
 *
 * The report: on Android a tap on a card sometimes appears to land on the check rather than
 * opening the card, so a reader records a watch they did not ask for. **It is second-hand
 * and it was never reproduced** — the owner does not have the device — so this ships as a
 * hardening that stands on its own merits and not as a fix, and `DESIGN.md` §7 says so in
 * those words. If the misfire survives this, it was not addressed here.
 *
 * What stands on its own merits: the link and the check were two targets **sharing an
 * edge**. The link's box ended exactly where the mark row began, and the check fills that
 * row's whole `44px`, so the boundary between *open this show* and *record a watch* was one
 * boundary pixel wide. Every platform's touch adjustment snaps a fat contact to the nearest
 * target, and two targets that touch give it nothing to snap *between*.
 *
 * **`4px`, and it is the card's own bottom padding rather than four new pixels.** The
 * link's text block ended in `pb-1`; that padding is gone and this margin is in its place,
 * so the link's box is `4px` shorter, the gap is `4px` tall, and every pixel of the rendered
 * card is where it was. That is `DESIGN.md` §6's bounding-rect guarantee and #250's *the
 * rail never reflows under a thumb*, and it is the reason the gap is exactly this size:
 * the card's height is fixed by its measure, so the only slack available is what the link
 * already spent on padding. Anything wider would have to come out of the `44px` control
 * — §6's floor, and the one direction a dead zone must never be paid for from — or out of
 * the card, which would move every card on the rail.
 */
const TAP_DEAD_ZONE = "mb-1";

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
  code,
  episodeName,
  picture,
  airDate,
  runtimeMins,
  remainingAfter,
  aboveFold,
  control,
  sweep,
}: {
  entry: UpNextEntry;
  code: string;
  episodeName: string | null;
  /** What goes in the frame — chosen by `up-next-mark.ts`, drawn by `CardFrame` below. */
  picture: CardPicture;
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

          **The title, not the episode — issue #274, reversing #250's own reversal.** #250
          was written expecting to link to the title until an episode had a page of its
          own; #253 built that page first, so the card went straight there, and the
          next-episodes card became the one thing on this tab that led somewhere other
          than a title. It leads to the title now: a show tile, a film tile and a card all
          open the same kind of place, which is what makes *one model for what a tap does*
          a claim about the whole tab rather than about two thirds of it. Everything
          MediaSafe holds about the show is on that page, the next episode included.

          **The episode's page is not deleted and does not lose a reader.** It keeps both
          of its other origins — a season row inside the title (`programme-note-episodes.tsx`)
          and a deep link — and the route is still keyed by both ids, so nothing about
          reaching it from there changes. What this card stops being is a *second* front
          door to one episode from a surface whose whole subject is titles.

          The card no longer takes an `episodeId` of its own. It existed to build the href
          above and nothing else — the episode being marked is `up-next-mark.ts`'s, read
          from the store by the branch that owns the control, and the code line beside this
          text is what names the episode to the reader. */}
      <Link
        href={`/library/${entry.libraryEntryId}`}
        /* **This press carried `scroll={false}` until issue #273**, because #254
           intercepted it into the layout's `@episode` slot: the landing screen was not
           replaced, it was still underneath, and Next scrolling it to the top would have
           cost the reader the place they were coming back to.

           The interception is deleted, so this navigation replaces the screen rather than
           covering it, and the prop would now be a lie about a page the reader has never
           seen — arriving on a title already scrolled to wherever the rail happened to be.
           An ordinary navigation goes to the top of the document, which is what the router
           does when nothing tells it otherwise. #274 retargets the href above and changes
           nothing about this: the destination moved, the reason the prop is absent did
           not. */
        className={`pressable block ${TAP_DEAD_ZONE}`}
        /* The still is `aria-hidden` and the code line is three tokens, so this label is
           what a screen reader hears for the link. `titleName` first, because the series
           is what a reader is choosing between. */
        aria-label={`${entry.titleName} — ${code}${episodeName === null ? "" : `, ${episodeName}`}`}
      >
        <CardFrame picture={picture} aboveFold={aboveFold} />

        <div className="px-[14px] pt-3">
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
 * The card's 16:9 frame, and the three things that can be in it — issue #269.
 *
 * **Which** of the three is `up-next-mark.ts`'s and arrives already decided; this function
 * only draws it. That split is the ticket: the rule is a consequence of which episode the
 * card is on, which is the one derivation that module owns and the one this suite has no
 * DOM to assert against.
 *
 * ── One frame, three fillings, one box ──────────────────────────────────────────────
 *
 * All three states are the same `still` utility at the same measure, so the card is
 * exactly the same size whether it draws a still, a poster or nothing — which is user
 * story 3's *tapping a checkmark does not make the rail jump under my thumb*, and is the
 * reason the poster is cropped into this frame rather than given its own `2/3` box.
 *
 * `--still-radius: 0` because the card already clips this frame at its own `16px` corner;
 * the utility's default `7px` would draw a notch inside it. Set through the variable
 * rather than as a competing class, for the reason `globals.css` gives beside both this
 * utility and `poster`.
 *
 * ── The poster is a plain `<img>` here rather than `Poster` ─────────────────────────
 *
 * `Poster`'s box is its own `2/3` ratio — a whole poster, uncropped — and what is wanted
 * is a centre crop of one into a broadcast-ratio frame. `you-list-card.tsx` reached the
 * same conclusion for its four square cells and this follows it exactly: `posterSrc` is
 * `app/poster.tsx`'s own CDN URL builder, exported for callers that need the URL rather
 * than the box, so the size ladder is not restated here.
 *
 * **And it draws no initials.** `Poster`'s missing-artwork fallback sets the title's
 * initials in the well, and that is right for a rail of posters where the poster is doing
 * the identifying. It is wrong here: a card names its series in real text directly beneath
 * this frame, and `DESIGN.md` §8's *the missing-artwork state is the frame, and nothing
 * inside it* is the rule for the still. `kind: "none"` is drawn by `EpisodeStill` with no
 * path, which is that rule unchanged — the space is held and nothing is put in it.
 */
function CardFrame({
  picture,
  aboveFold,
}: {
  picture: CardPicture;
  aboveFold: boolean;
}) {
  if (picture.kind === "poster") {
    return (
      <div className={`still ${FRAME}`}>
        {/* `app/poster.tsx`'s own reasoning, which ADR-0001 fixes: TMDB's CDN, never
            Vercel's metered optimiser. `object-center` states the crop the ticket asks for
            rather than leaving it to the property's default. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="block h-full w-full object-cover object-center"
          src={posterSrc(picture.path, CARD_WIDTH)}
          alt=""
          aria-hidden="true"
          loading={aboveFold ? "eager" : "lazy"}
          fetchPriority={aboveFold ? "high" : undefined}
          decoding="async"
        />
      </div>
    );
  }

  /* `EpisodeStill` is #253's, shared rather than re-cut — one answer to *what does a still
     look like, and what happens when there isn't one*. `null` is the held frame: the ratio
     keeps the card's shape and the `raised` ground fills it, which is #245's user story 48
     and `DESIGN.md` §8's missing-artwork rule, both unchanged by #269. */
  return (
    <EpisodeStill
      stillPath={picture.kind === "still" ? picture.path : null}
      width={CARD_WIDTH}
      className={FRAME}
      aboveFold={aboveFold}
    />
  );
}

/**
 * The check, and its own reversal — the deleted Ongoing tile's mark slot at a card's
 * measure, and deliberately the same three cases in the same order.
 *
 * **It is a sibling of the link and it no longer touches it** (#277). `TAP_DEAD_ZONE`
 * above is the `4px` between the two boxes; this one is unchanged by it, because the
 * `44px` target is what the gap was drawn *around* rather than out of.
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
 *
 * `pressable` for the same reason `RECORDING_HIT_BOX` gained it in #270: recording a watch
 * is what this card is for, and it pressed flat. Both hit boxes carry it because both are
 * places the act happens, and the card's own `pressable` link (above) is a sibling of this
 * button rather than its parent, so the two presses never compound.
 *
 * **`[--press-register:1]` is #282's control register.** The card above stays on the quiet
 * default — it is a 262px surface and a grid of trampolines is the thing that register
 * exists to avoid — and this 44px hit box takes the loud one, so the sibling that records
 * the watch moves as much under a thumb as the sibling that opens the episode does. Both
 * branches below wear it, because `Undo` is the same act being taken back.
 */
const CHECK_HIT_BOX = `pressable [--press-register:1] group flex h-11 shrink-0 items-center justify-center ${IN_FLIGHT}`;

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
