"use client";

import type { ReactNode } from "react";

import { Poster } from "@/app/poster";
import type { LibraryState, TitleDetailRow } from "@/db/access";
import { AddToListControl } from "./add-to-list-control";
import { FilmWatchRow } from "./film-watch-row";
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
 * The synopsis, then a film's watched mark, then *Add to list*.
 *
 * **The synopsis is first because it is what the poster is a picture of.** It had a card
 * of its own directly below this one, which read as a separate section about a separate
 * thing; what it actually is, is the rest of the sentence the poster and the title start.
 * It is full-width under the pair rather than beside the poster on purpose: this component
 * renders at 420px in the pane, and the column beside the poster is roughly 200px of it
 * with the state, the name, the meta line and the progress bar already in it. Prose in
 * that column would set at about twenty characters a line.
 *
 * It arrives as a **node**, not as text — see `synopsis` on the props below.
 *
 * **A film's watched mark is here** rather than at the foot of the page
 * (`film-watch-row.tsx` has the argument). A show's stays in the episode list, where it is
 * one row of sixty rather than the only row there is.
 *
 * **What is no longer here: `AbandonControl`.** Giving up on a title is not a thing this
 * application offers any more — no control here, and no *Abandon* on the library's
 * selection bar. The state itself is not gone: a title abandoned before the controls were
 * retired still reads *Abandoned* on the line above, and recording a watch still clears it
 * (`CONTEXT.md`'s *"watching it again clears it"*, and `db/views.ts`'s first branch, both
 * unchanged). It is a state nothing new can enter, deliberately, rather than a state that
 * was deleted out from under the rows already in it.
 *
 * **Marking a whole show watched in one press** is still not offered anywhere — the season
 * rows' *watched up to here* is the nearest thing, aimed at the last episode. If that is
 * worth having it wants a home of its own.
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
  synopsis,
  posterTransitionName,
  onStateChange,
}: {
  detail: TitleDetailRow;
  /**
   * The synopsis section, already built by whichever surface holds this — streamed on the
   * phone route, read from the pane's one client fetch on desktop. A node rather than a
   * string for `ProgrammeNoteContent`'s reason: this component does not know, and must not
   * learn, how a live fact arrives. It knows where it goes.
   *
   * It draws no card of its own (`nested`, in `live-title-facts.tsx`) — it is already
   * inside this one.
   */
  synopsis: ReactNode;
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
        {/**
         * **The destination half of the morph, named the way every other half of it is —
         * issue #305.**
         *
         * This was a React `<ViewTransition name={…}>`, and it was the only participant in
         * the morph that was one. Every other half is a plain `view-transition-name` in a
         * `style` — the library grid cell (`selectable-entry.tsx`), the Up next row
         * (`up-next-episode-row.tsx`) and the pending frame's poster
         * (`titles/[entryId]/pending-poster.tsx`). React only applies its own name for a
         * transition it is tracking on both sides, so paired against a raw name it applied
         * nothing, and the browser saw an old snapshot with no new half to travel to.
         *
         * **That made the morph depend on the pending frame committing.** Opening a title
         * cold renders the pending frame first, so the chain was grid → pending → content
         * and the raw-named pending poster bridged the two, pairing on the second
         * transition. Opening one whose payload the router already holds — go back, open it
         * again — resolves in a single commit, the bridge never renders, and the morph was
         * skipped. Measured directly: cold records two transitions and pairs; warm records
         * one, `{hasOld: true, hasNew: false}`. CI takes the single-commit path every time,
         * which is why the browser suite failed there against a build that morphed
         * perfectly by hand.
         *
         * A raw name here makes the morph one mechanism rather than two, and it no longer
         * depends on how many commits a navigation happens to take.
         *
         * **The duplicate-name hazard is already handled and is not reopened.** Two
         * elements carrying one `view-transition-name` at once makes the browser skip the
         * whole transition, and on the desktop the grid and this pane can show the same
         * entry together — which is exactly why `selectable-entry.tsx` drops its own name
         * when `openInPane`. That guard is what keeps this safe, and it predates this
         * change.
         */}
        <div style={{ viewTransitionName: posterTransitionName }}>
          {/* Still the hero poster of whichever surface holds this, so still `aboveFold`
              — smaller, but the first artwork the reader sees. */}
          <Poster
            posterPath={detail.posterPath}
            name={detail.name}
            width={140}
            className="w-[34%] max-w-[140px] shrink-0 [--poster-radius:12px]"
            aboveFold
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* `--dim`, not the accent — see the docblock. The word is still the state's own
              word from `STATE_LABELS`, uppercased by the label register rather than by a
              second copy of the string. */}
          <p className="label-line text-dim">{state.label}</p>

          {/**
           * **The way out of the one state nothing can enter.** `CONTEXT.md`: *watching it
           * again clears it* — and until this batch that sentence was printed on the
           * library cell, which was the only place a reader ever met it. The cell became a
           * poster column with room for the state word alone, and rather than let the fact
           * go with the line, it moves here: the page a reader opens when they want to do
           * something about it, and the page carrying the control that does it.
           *
           * Abandoned only. Every other state has a control on this page that speaks for
           * itself; this is the one whose exit is a side effect of an unrelated act, and
           * so the one that has to be said in words.
           */}
          {detail.state === "abandoned" ? (
            <p className="mt-1 text-item text-dim">Watching it again clears this.</p>
          ) : null}

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

      {/* The synopsis, full-width under the pair — see the docblock for why it is not in
          the poster's column. It brings its own `mt-5` and renders nothing at all when
          TMDB has no overview for this title, so an absent synopsis leaves no gap. */}
      {synopsis}

      {/* A film's one action, in the card with the state it changes. A show has an episode
          list for this and does not draw it here — `film-watch-row.tsx`.

          Keyed by entry: this component is not remounted on a selection change in the
          desktop pane, and the row seeds its own `watched` from `state` at mount. Without
          the key a new film would inherit the previous one's mark. */}
      {detail.kind === "film" ? (
        <div className="mt-4">
          <FilmWatchRow
            key={detail.libraryEntryId}
            libraryEntryId={detail.libraryEntryId}
            titleName={detail.name}
            state={detail.state}
            onStateChange={onStateChange}
          />
        </div>
      ) : null}

      {/* The one control under the pair, rather than beside the title: at 420px there is no
          room for it on the poster's row, and a control that only fits on a phone is a
          control the pane would have to draw somewhere else.

          Keyed by `titleId` for its own docblock's reason: the desktop pane never remounts
          on a selection change, so this key is what gives every title a clean picker
          instead of state this component would have to reset by hand. */}
      <div className="mt-4">
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
