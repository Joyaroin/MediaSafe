import type { ReactNode } from "react";

import type { LibraryState, TitleDetailRow } from "@/db/access";
import { ProgrammeNoteEpisodes } from "./programme-note-episodes";
import {
  PROGRAMME_NOTE_CARD,
  PROGRAMME_NOTE_CARD_PAD,
  PROGRAMME_NOTE_SECTION,
} from "./programme-note-section";
import { RatingControl } from "./rating-control";
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
 * Title information; where the show stands, with the one control that can change it beside
 * it; progress and remaining; the up-next episode, markable on its own row; the season
 * chips and the episode list; then rating, *Add to list* and *Remove*, in that order, below
 * everything a reader came here more often to reach. The old order ran nearly the reverse
 * of how often each is reached for — giving up on a sixty-episode show meant scrolling
 * sixty episodes first, because the abandon control sat below all of them. It does not any
 * more: `AbandonControl` moved beside the state line, and `UpNextRow` gives the page's most
 * reached-for action a fixed row that does not depend on which season the chips below
 * happen to be showing (`up-next-row.tsx`'s own docblock has the argument for that one).
 *
 * ── `onStateChange`, and the two writes that report through it ───────────────────────
 *
 * `AbandonControl` (issue #87) is the one hand-set state in the model; `ProgrammeNoteEpisodes`'s
 * film row (issue #90) is the other caller, for the one state a film's watch can always
 * land on. Either way `onStateChange` is this component's entire surface for a landed
 * write: it patches `detail.state` in place, in whichever component is holding this one's
 * props (`ProgrammeNotePane` here, the phone route in
 * `app/(signed-in)/library/[entryId]/page.tsx`). Nothing else about the title changes when
 * either write lands, so nothing else is re-read.
 *
 * The entry id travels with both — `AbandonControl`'s own docblock explains why: this
 * component is never remounted on a title switch, so a write still in flight when the
 * caller moves on to a different entry must not patch the one now on screen.
 *
 * ── `onRated`, the second patch of the same kind ─────────────────────────────────────
 *
 * `RatingControl` (issue #113) reports a landed rating the way the two writes above
 * report a landed state, and for the same reason: this component is handed its title, it
 * does not own it, so the copy that has to change lives in the caller. It is a separate
 * prop rather than a widening of `onStateChange` because a rating is not a state — the
 * five states are derived and a rating is stored, and one callback carrying both would
 * be the first place in this codebase to blur that.
 *
 * The rating is on title detail and nowhere else — `SPEC.md` §7 — which is why this
 * component is the only one in the repository that imports `RatingControl`, and why the
 * grid's read does not carry a rating for a tile to accidentally draw.
 *
 * ── `RemoveControl`, which reports nothing at all ───────────────────────────────────
 *
 * Issue #142's *Remove from library*, and the one control on this component that takes no
 * callback: it is a link to `library/[entryId]/remove`, so a press leaves this surface
 * rather than changing anything on it. There is no landed write for it to patch, because
 * there is no write here to land — which is also why it needs no entry-id guard of the kind
 * `AbandonControl`'s docblock explains.
 *
 * It is rendered **last of all**, below rating and list membership rather than beside the
 * abandon control the way it once sat — issue #228 moves *that* control up next to the
 * state line, on the reasoning that it is reached for far more often than removal is. The
 * two no longer share a row, but `remove-control.tsx` still carries why they must not read
 * as the same thing even in passing — a different shape, and a different promise in the
 * copy underneath each. The reason removal belongs on this shared component rather than on
 * the phone route is that the desktop pane is title detail too — a title removable on one
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
 * Issue #141. Each caller hands this the same name its own source tile carries —
 * `rail-poster-{id}` from `programme-note.tsx`'s `loading` frame on desktop, and
 * `group-poster-{id}` from the phone route, whose source tile #250 deleted (see
 * `poster-transition-name.ts`: that family has a destination and no source until something
 * mints the name again) — so this poster is what the browser morphs the tile into where
 * there is still a tile to morph. The two callers use different name families on purpose:
 * the desktop pane and the phone route can both be showing the same title at once (a
 * reader on desktop who also opens the phone route in another tab), and a name shared
 * across them would pair the wrong two elements.
 *
 * `key={posterTransitionName}` carries the same weight `programme-note.tsx`'s `Loading`
 * gives its own poster, for the identical reason: this component is never remounted on
 * a selection change (its own top docblock), so without a key React would patch one
 * `<ViewTransition>` fiber's `name` from the old id to the new one in place, which reads
 * to the browser as two boundaries claiming the old name for a commit rather than one
 * leaving and another arriving.
 *
 * ── `liveFacts` is a node, not data (issue #218) ──────────────────────────────────────
 *
 * This component does not fetch, or even know, how the three live sections get their
 * data — it only knows where they sit in the layout. `library/[entryId]/page.tsx` and
 * `titles/[kind]/[tmdbId]/page.tsx` hand in `<LiveTitleFactsStreamed userId kind tmdbId />`, a
 * Server Component built server-side and passed down as an already-rendered element
 * (React's own documented pattern for interleaving Server and Client Components); the
 * desktop pane and the Up next sheet hand in `<LiveTitleFactsClientFetch kind tmdbId />`
 * instead, since neither has a page render to stream the first behind
 * (`live-title-facts.tsx`'s top docblock carries the full reasoning for both). Either way
 * this component is identical for all four surfaces — issue #58's own promise — because
 * the difference lives entirely in what the caller passes, not in anything here.
 */
export function ProgrammeNoteContent({
  detail,
  liveFacts,
  cast,
  posterTransitionName,
  onStateChange,
  onRated,
}: {
  detail: TitleDetailRow;
  /** The synopsis and the watch providers, streamed — see `live-title-facts-streamed.tsx`. */
  liveFacts: ReactNode;
  /**
   * Cast, streamed separately, because it goes **last** — after the rating rather than
   * under the hero with the other two. One node could only put all three together.
   */
  cast: ReactNode;
  posterTransitionName: string;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
  onRated: (libraryEntryId: string, rating: number) => void;
}) {
  // A film's `episodes` is always empty (`TitleDetailRow`'s own docblock), so this is
  // `undefined` for one there is never a fact to find.
  const upNext = detail.episodes.find((one) => one.upNext);

  /**
   * ── The order, and why it is this one ─────────────────────────────────────────────
   *
   * Hero, then the two things you *own* about the title — your rating, and the control
   * that destroys everything you own about it — then what the title is, where to watch
   * it, what to watch next, the episodes, and the cast.
   *
   * The three streamed facts used to arrive as one node in that order. Cast belongs at the
   * bottom and the other two at the top, so the group is now two nodes — `liveFacts` and
   * `cast`. Nothing about the streaming changed: each read always had its own `Suspense`
   * and always resolved independently; the group was an ordering, and the ordering now
   * belongs to this file, which is the thing that knows the order.
   *
   * Cast is last, because it is the section you scroll to out of curiosity rather than to
   * do something with.
   */
  return (
    <div className="px-4 py-5">
      <TitleHero
        detail={detail}
        posterTransitionName={posterTransitionName}
        onStateChange={onStateChange}
      />

      {/* Your rating and *Remove from library*, directly under the hero.
          
          Both used to sit at the foot, below the episode list, on the argument that each
          is reached for far less often than anything above it. The rating is genuinely
          one of the few things MediaSafe *owns* about a title — everything between here
          and the episodes is borrowed — and burying it under sixty episode rows made the
          one owned fact the hardest thing on the page to reach.

          **Remove keeps its warning and loses its scroll.** The scroll was doing real
          work: it destroys your watches and your rating and nothing brings them back.
          What replaces that is the confirmation `RemoveControl` already owns, which is
          the guard that was always the real one — the distance was only ever a second
          line of defence, and it cost the rating its place. */}
      <section className={`${PROGRAMME_NOTE_SECTION} ${PROGRAMME_NOTE_CARD} ${PROGRAMME_NOTE_CARD_PAD}`}>
        <RatingControl
          libraryEntryId={detail.libraryEntryId}
          titleName={detail.name}
          rating={detail.rating}
          onRated={onRated}
        />

        <div className="mt-5">
          <RemoveControl libraryEntryId={detail.libraryEntryId} titleName={detail.name} />
        </div>
      </section>

      {/* Synopsis and watch providers — each its own card, each streamed. */}
      {liveFacts}

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
          which shows numbers where `CONTEXT.md` says *an episode is never referred to by
          number alone*, and hides which episodes are watched behind a selection. */}
      <section className={`${PROGRAMME_NOTE_SECTION} ${PROGRAMME_NOTE_CARD} ${PROGRAMME_NOTE_CARD_PAD}`}>
        <ProgrammeNoteEpisodes
          kind={detail.kind}
          episodes={detail.episodes}
          libraryEntryId={detail.libraryEntryId}
          titleName={detail.name}
          state={detail.state}
          onStateChange={onStateChange}
        />
      </section>

      {/* Cast, last of the borrowed facts and last of the cards: it is the section you
          scroll to out of curiosity rather than to do something with. */}
      {cast}

    </div>
  );
}
