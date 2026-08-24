"use client";

import { ViewTransition } from "react";

import { Poster } from "@/app/poster";
import type { LibraryState, TitleDetailRow } from "@/db/access";
import { AbandonControl } from "./abandon-control";
import { AddToListControl } from "./add-to-list-control";
import { STATE_LABELS } from "./library-state";
import { PROGRAMME_NOTE_CARD, PROGRAMME_NOTE_CARD_PAD } from "./programme-note-section";
import { watchProgress } from "./progress-remaining";
import { titleMetaLine } from "./title-meta-line";

/**
 * The head of title detail: the poster beside what you need to know, rather than above it.
 *
 * ── What moved, and why it is worth the restructure ─────────────────────────────────
 *
 * This screen used to open with a full-width poster and put *where the title stands* under
 * it, the progress two sections further down, and the next episode below that. On a phone
 * that is three scrolls to answer *am I behind on this*, which is the question the screen
 * exists for. The artwork is the least informative thing on it and it was taking the whole
 * first screenful.
 *
 * So the poster shrinks to a thumbnail and the space buys the three facts that were
 * scattered: the state, how far through you are, and the controls that change it.
 *
 * ── What sits under the pair ────────────────────────────────────────────────────────
 *
 * `AbandonControl` and *Add to list*. There was briefly a *Where this stands* button here
 * instead, opening a dialog offering *Mark everything watched* and *Give up on this*. It
 * went: the label read as a settings control on a screen that has no settings, and it put
 * the one state write anybody reaches for behind two presses to keep company with one
 * almost nobody does.
 *
 * **Marking a whole show watched in one press went with it**, and there is no other way to
 * do it — the season rows' *watched up to here* is the nearest thing, aimed at the last
 * episode. If that is worth having it wants a home of its own rather than a menu built
 * around it.
 *
 * ── The bar takes the accent, and the state word gives it up ────────────────────────
 *
 * `DESIGN.md` §0: one accent per screen, marking what is live. `STATE_LABELS` draws
 * *Watching* in the accent, and a bar drawn in it too would be two accented things inside
 * one block. The bar keeps it, because *how far through you are right now* is the most
 * literal reading of *live* on this page — and the word sits directly above the bar saying
 * the same thing, so it loses nothing by going quiet.
 *
 * ── The poster sizes off its container ──────────────────────────────────────────────
 *
 * This renders in three frames: the phone route at viewport width, the phone dialog at up
 * to 560px, and the desktop pane at 420px. A fixed poster width that suited the first
 * would crowd the third — 420px less the gutters leaves roughly 340px for a poster, a
 * title, a bar and two controls. `w-[34%]` with a cap keeps one component honest in all
 * three rather than branching on a breakpoint that cannot see the pane anyway.
 */
export function TitleHero({
  detail,
  posterTransitionName,
  onStateChange,
}: {
  detail: TitleDetailRow;
  posterTransitionName: string;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
}) {
  const state = STATE_LABELS[detail.state];
  const meta = titleMetaLine(detail);

  /**
   * The bar is a show's, and only where TMDB has mirrored episodes.
   *
   * A film has two positions and the word already says which — a bar that is empty or full
   * is a lot of pixels for a boolean. A show with no mirrored episodes is TMDB not having
   * them yet, and a bar at zero would report that as *nothing watched*, which is the
   * failure-looks-like-emptiness confusion `SPEC.md` §3 is written against.
   */
  const progress =
    detail.kind === "show" && detail.episodes.length > 0
      ? watchProgress(detail.episodes)
      : null;

  return (
    <section className={`${PROGRAMME_NOTE_CARD} ${PROGRAMME_NOTE_CARD_PAD}`}>
      <div className="flex items-start gap-4">
        <ViewTransition key={posterTransitionName} name={posterTransitionName}>
          {/* Still the hero poster of whichever surface holds this, so still `aboveFold`
              — smaller, but the first artwork the reader sees. */}
          <Poster
            posterPath={detail.posterPath}
            name={detail.name}
            width={140}
            className="w-[34%] max-w-[140px] shrink-0 [--poster-radius:12px]"
            aboveFold
          />
        </ViewTransition>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* `--dim`, not the accent — see the docblock. The word is still the state's own
              word from `STATE_LABELS`, uppercased by the label register rather than by a
              second copy of the string. */}
          <p className="label-line text-dim">{state.label}</p>

          <h2 className="bill-title mt-1 text-bill-lg text-ink">{detail.name}</h2>

          {meta === null ? null : (
            <p className="code-line mt-1.5 text-dim" data-numeric>
              {meta}
            </p>
          )}

          {progress === null ? null : (
            <WatchedBar watched={progress.watched} total={progress.total} />
          )}
        </div>
      </div>

      {/* The controls, under the pair rather than beside the title: at 420px there is no
          room for them on the poster's row, and a control that only fits on a phone is a
          control the pane would have to draw somewhere else.

          `AbandonControl` rather than a menu. There was briefly a *Where this stands*
          button here opening a dialog of state actions; it read as a settings control on a
          screen with no settings, and it put the one write anybody reaches for — giving up
          on something — behind two presses. This is the control that was here before the
          restructure, in the place the restructure gave it. */}
      <div className="mt-4">
        <AbandonControl
          libraryEntryId={detail.libraryEntryId}
          titleName={detail.name}
          abandoned={detail.state === "abandoned"}
          onChanged={onStateChange}
        />
      </div>

      {/* Keyed by `titleId` for its own docblock's reason: the desktop pane never remounts
          on a selection change, so this key is what gives every title a clean picker
          instead of state this component would have to reset by hand. */}
      <div className="mt-3">
        <AddToListControl key={detail.titleId} titleId={detail.titleId} titleName={detail.name} />
      </div>
    </section>
  );
}

/**
 * How far through, drawn.
 *
 * ── Why the bar is `aria-hidden` and the sentence is not ────────────────────────────
 *
 * The line beneath it — *"16 of 32 episodes watched"* — is the same fact in words, and it
 * is already the thing a screen reader should read. A `progressbar` role here would
 * announce the identical fact a second time as a percentage nobody wrote. The bar is
 * decoration *of* the sentence, so it is hidden and the sentence carries the meaning.
 *
 * `data-numeric` on the line for the reason every count in this application carries it:
 * the numeral set that keeps digits from jumping as they change.
 */
function WatchedBar({ watched, total }: { watched: number; total: number }) {
  // `total` is never zero here — the caller only builds this when there are episodes —
  // and the guard is kept anyway, because a division that cannot happen is one refactor
  // away from happening and `NaN%` is a bar that disappears rather than an error anyone
  // sees.
  const filled = total === 0 ? 0 : Math.round((watched / total) * 100);

  return (
    <div className="mt-3">
      <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-hair">
        <div className="h-full rounded-full bg-accent" style={{ width: `${filled}%` }} />
      </div>

      <p className="code-line mt-2 text-dim" data-numeric>
        {watched} of {total} episodes watched
      </p>
    </div>
  );
}
