import type { ReactNode } from "react";

import type { LibraryState, TitleDetailRow } from "@/db/access";
import { ProgrammeNoteEpisodes } from "./programme-note-episodes";
import {
  PROGRAMME_NOTE_CARD,
  PROGRAMME_NOTE_CARD_PAD,
  PROGRAMME_NOTE_SECTION,
} from "./programme-note-section";
import { RemoveControl } from "./remove-control";
import { TitleHero } from "./title-hero";
import { UpNextRow } from "./up-next-row";

/**
 * One title, read properly — the content the desktop pane and the phone route both show,
 * word for word (issue #58). Topology is the only thing that differs between them: the
 * pane replaces itself in place, the phone pushes a route. Neither wraps this in
 * anything about *how it got here*; both wrap it in where it lives (`ProgrammeNotePane`'s
 * sticky aside, or the phone route's `<main>`).
 *
 * ── The order is the reading order — issue #228 ───────────────────────────────────────
 *
 * Title information and the synopsis, in one card with the poster; *Remove*; the up-next
 * episode, markable on its own row; the season chips and the episode list; and the
 * borrowed sections — watch providers, then cast — last. The old order ran nearly the
 * reverse of how often each is reached for. It does not any more: `UpNextRow` gives the
 * page's most reached-for action a fixed row that does not depend on which season the
 * chips below happen to be showing (`up-next-row.tsx`'s own docblock has the argument for
 * that one), and a film's mark is in the hero card, which is the whole of that page's
 * business in one block.
 *
 * ── What this page no longer offers ─────────────────────────────────────────────────
 *
 * **A rating.** `RatingControl` and its action are gone, for both kinds. `rateTitle` and
 * the `rating` column are not: the numbers already given are still stored, still counted
 * on the delete-account page, and still named on the remove-confirmation page as something
 * removal destroys. Nothing writes a new one.
 *
 * **Giving up on a title.** `AbandonControl` is gone from the hero and *Abandon* from the
 * library's selection bar. `abandoned_at`, the view's first branch and the `abandoned`
 * member of `LibraryState` all stay, so a title abandoned before the controls were retired
 * still reads *Abandoned*, and recording a watch still clears it. `title-hero.tsx` carries
 * the full statement of that.
 *
 * ── `onStateChange`, and the one write that still reports through it ─────────────────
 *
 * `FilmWatchRow` (`film-watch-row.tsx`), for the one state a film's watch can always land
 * on. It had two callers and now has one — `AbandonControl` was the other.
 *
 * `onStateChange` is this component's entire surface for a landed write: it patches
 * `detail.state` in place, in whichever component is holding this one's props
 * (`ProgrammeNotePane` here, the phone route in
 * `app/(signed-in)/titles/[entryId]/title-detail-view.tsx`). Nothing else about the title
 * changes when that write lands, so nothing else is re-read.
 *
 * The entry id travels with it: this component is never remounted on a title switch in the
 * pane, so a write still in flight when the caller moves on to a different entry must not
 * patch the one now on screen.
 *
 * ── `RemoveControl`, which reports nothing at all ───────────────────────────────────
 *
 * Issue #142's *Remove from library*, and the one control on this component that takes no
 * callback: it is a link to `titles/[entryId]/remove`, so a press leaves this surface
 * rather than changing anything on it. There is no landed write for it to patch, because
 * there is no write here to land — which is also why it needs no entry-id guard of the kind
 * `AbandonControl`'s docblock explains.
 *
 * It has a card to itself directly under the hero. It shared that card with the rating
 * until the rating went, and it keeps the position rather than moving: the card is where a
 * reader has learned to find it, and the alternative — putting a destructive action into
 * the hero beside *Add to list* — is exactly the adjacency `remove-control.tsx` argues
 * against. That file still carries why removal and the controls above it must not read as
 * the same thing even in passing: a different shape, and a different promise in the copy
 * underneath each. The reason removal belongs on this shared component rather than on the
 * phone route is that the desktop pane is title detail too — a title removable on one
 * device and permanent on the other would be the same feature having two answers.
 *
 * TMDB's attribution is not here — it is pinned to the foot of whichever surface holds
 * this component, outside this component's own scroll, which is a layout decision
 * belonging to the caller (`app/tmdb-attribution.tsx`'s own docblock says why).
 *
 * The poster's own docblock is `app/poster.tsx`; this component just supplies the width
 * it renders it at.
 *
 * ── `posterTransitionName`, the morph's second half ───────────────────────────────────
 *
 * Issue #141. Both callers hand this the same name the rail tile carries —
 * `rail-poster-{id}`, minted in `poster-transition-name.ts` — so this poster is what the
 * browser morphs that tile into, whether the tile's destination is the desktop pane
 * (`programme-note.tsx`'s `loading` frame, then this) or the title's own page on the phone
 * (`[entryId]/title-detail-view.tsx`).
 *
 * > **⚠️ This reverses what this file said until #275**, which was: *the two callers use
 * > different name families on purpose — the desktop pane and the phone route can both be
 * > showing the same title at once, and a name shared across them would pair the wrong two
 * > elements.* The phone had two destinations then, a sheet over `/up-next` and a route;
 * > #268 left it with one, so the second family had nothing left to keep apart.
 * > `poster-transition-name.ts` carries the argument in full.
 *
 * `key={posterTransitionName}` carries the same weight `programme-note.tsx`'s `Loading`
 * gives its own poster, for the identical reason: this component is never remounted on
 * a selection change (its own top docblock), so without a key React would patch one
 * `<ViewTransition>` fiber's `name` from the old id to the new one in place, which reads
 * to the browser as two boundaries claiming the old name for a commit rather than one
 * leaving and another arriving.
 *
 * ── The live facts are nodes, not data (issue #218) — and now there are three ────────
 *
 * This component does not fetch, or even know, how the live sections get their data — it
 * only knows where they sit in the layout. `titles/[entryId]/title-detail-body.tsx` hands
 * in Server Components built server-side and passed down as already-rendered elements
 * (React's own documented pattern for interleaving Server and Client Components); the
 * desktop pane hands in `<LiveTitleFactsClientFetch slot=… />` instead, since it has no
 * page render to stream behind (`live-title-facts.tsx`'s top docblock carries the full
 * reasoning for both). Either way this component is identical for both surfaces — issue
 * #58's own promise — because the difference lives entirely in what the caller passes, not
 * in anything here.
 *
 * **Three props rather than two**, because the synopsis moved into the hero's card and the
 * watch providers did not. A node can be placed once; two sections that no longer sit
 * together cannot arrive as one node. That is the same split, one section further on, that
 * separated `cast` from the other two.
 */
export function ProgrammeNoteContent({
  detail,
  synopsis,
  watchProviders,
  cast,
  posterTransitionName,
  onStateChange,
}: {
  detail: TitleDetailRow;
  /**
   * The synopsis, drawn **inside the hero's card** — handed straight through to
   * `TitleHero`, which is the component that knows where in that card it goes. It carries
   * no card of its own; see `nested` in `live-title-facts.tsx`.
   */
  synopsis: ReactNode;
  /** The watch providers, in a card of their own below the hero. */
  watchProviders: ReactNode;
  /**
   * Cast, streamed separately, because it goes **last** — below the episode list rather
   * than under the hero with the other two.
   */
  cast: ReactNode;
  posterTransitionName: string;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
}) {
  // A film's `episodes` is always empty (`TitleDetailRow`'s own docblock), so this is
  // `undefined` for one there is never a fact to find.
  const upNext = detail.episodes.find((one) => one.upNext);

  /**
   * ── The order, and why it is this one ─────────────────────────────────────────────
   *
   * Hero — poster, state, progress, what the title *is*, and a film's one action — then
   * the control that destroys everything you own about it, then what to watch next, the
   * episodes, where to watch it, and the cast.
   *
   * The three streamed facts used to arrive as one node in that order. They are three
   * nodes now, placed by this file: the synopsis inside the hero, the providers below the
   * episodes, the cast last. Nothing about the streaming changed — each read always had
   * its own `Suspense` and always resolved independently; the group was an ordering, and
   * the ordering belongs here, in the thing that knows the order.
   *
   * **Watch providers moved down** when the synopsis moved up. They were a pair under the
   * hero and the pair is gone; of the two remaining borrowed sections, *where to watch it*
   * is worth more than the cast and less than the episode you are actually here for.
   *
   * Cast is last, because it is the section you scroll to out of curiosity rather than to
   * do something with.
   */
  return (
    <div className="arrive-panel px-4 py-5">
      <TitleHero
        detail={detail}
        synopsis={synopsis}
        posterTransitionName={posterTransitionName}
        onStateChange={onStateChange}
      />

      {/* *Remove from library*, directly under the hero.

          It used to sit at the foot, below the episode list, on the argument that it is
          reached for far less often than anything above it. **It keeps its warning and
          loses its scroll**: the scroll was doing real work — removal destroys your
          watches and nothing brings them back — but the guard that was always the real
          one is the confirmation `RemoveControl` already owns, and the distance was only
          ever a second line of defence.

          It had the rating for company in this card until the rating was retired. A
          one-control card is what that leaves, and it is the honest shape: the alternative
          is folding removal into the hero next to *Add to list*, which puts a destructive
          action in a group of additive ones. */}
      <section className={`${PROGRAMME_NOTE_SECTION} ${PROGRAMME_NOTE_CARD} ${PROGRAMME_NOTE_CARD_PAD}`}>
        <RemoveControl libraryEntryId={detail.libraryEntryId} titleName={detail.name} />
      </section>

      {/* The up-next episode, markable on its own row without picking a season first —
          issue #228, and `up-next-row.tsx`'s own docblock for why it is not simply the
          season list defaulting to the right season.

          It survives the hero's progress bar rather than being absorbed by it: the bar
          says *how far through*, and this names the specific episode and carries the
          control that marks it. A bar cannot do either.

          Absent whenever the title has none: unstarted-with-nothing-mirrored-yet reads the
          same as finished-to-the-edge-of-what-TMDB-has, and both are the honest absence of
          a fact rather than a guess. */}
      {upNext === undefined ? null : (
        <section className={`${PROGRAMME_NOTE_SECTION} ${PROGRAMME_NOTE_CARD} ${PROGRAMME_NOTE_CARD_PAD}`}>
          <UpNextRow
            episode={upNext}
            libraryEntryId={detail.libraryEntryId}
            titleName={detail.name}
          />
        </section>
      )}

      {/* The season chips and the full episode list, kept as they are. The screen this
          follows replaces them with a grid of episode numbers and one expanded card —
          which shows numbers where *an episode is never referred to by
          number alone*, and hides which episodes are watched behind a selection.

          **The card is a show's, not the page's.** A film's watched mark lives in the hero
          now (`film-watch-row.tsx`), so `ProgrammeNoteEpisodes` has nothing to draw for
          one — and a card wrapped around a component that renders nothing is an empty card,
          not an absent one. The guard is here rather than only inside that component
          because the card is this file's. */}
      {detail.kind === "film" ? null : (
        <section className={`${PROGRAMME_NOTE_SECTION} ${PROGRAMME_NOTE_CARD} ${PROGRAMME_NOTE_CARD_PAD}`}>
          <ProgrammeNoteEpisodes
            kind={detail.kind}
            episodes={detail.episodes}
            episodesPending={detail.episodesPending}
            libraryEntryId={detail.libraryEntryId}
            titleName={detail.name}
          />
        </section>
      )}

      {/* Where to watch it — its own card, streamed, and below the episodes since the
          synopsis took its place at the top. */}
      {watchProviders}

      {/* Cast, last of the borrowed facts and last of the cards: it is the section you
          scroll to out of curiosity rather than to do something with. */}
      {cast}

    </div>
  );
}
