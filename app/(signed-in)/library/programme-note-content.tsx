import type { ReactNode } from "react";
import { ViewTransition } from "react";

import type { LibraryState, TitleDetailRow } from "@/db/access";
import { Poster } from "@/app/poster";
import { AbandonControl } from "./abandon-control";
import { AddToListControl } from "./add-to-list-control";
import { ProgrammeNoteEpisodes } from "./programme-note-episodes";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { progressLine, remainingLine } from "./progress-remaining";
import { RatingControl } from "./rating-control";
import { RemoveControl } from "./remove-control";
import { STATE_LABELS } from "./library-state";
import { titleMetaLine } from "./title-meta-line";
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
 * `rail-poster-{id}` from `programme-note.tsx`'s `loading` frame on desktop,
 * `group-poster-{id}` from the phone route's `GroupTile` — so this poster is what the
 * browser morphs the tile into. The two callers use different name families on purpose:
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
  posterTransitionName,
  onStateChange,
  onRated,
}: {
  detail: TitleDetailRow;
  liveFacts: ReactNode;
  posterTransitionName: string;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
  onRated: (libraryEntryId: string, rating: number) => void;
}) {
  const state = STATE_LABELS[detail.state];
  const meta = titleMetaLine(detail);
  // A film's `episodes` is always empty (`TitleDetailRow`'s own docblock), so this is
  // `undefined` for one there is never a fact to find.
  const upNext = detail.episodes.find((one) => one.upNext);

  return (
    <div className="px-6 py-5">
      {/* Full pane width — before #135 this was a `16/10` plate cropping whatever
          arrived. The `poster` utility's own `2/3` ratio derives the height from this
          width instead.

          This component renders in two frames of different widths (this docblock's own
          `onRated` section): the desktop pane is `programme-note.tsx`'s `w-[420px]` minus
          this wrapper's `px-6` (`372px`), the phone route is the full viewport minus the
          same padding. `382` covers a large phone (`430px` viewport) without measuring
          either frame at render time — both land in TMDB's `w500` bucket regardless, so a
          closer number would change nothing served, only how honest this one reads. */}
      <ViewTransition key={posterTransitionName} name={posterTransitionName}>
        {/* Always the hero poster of whichever surface holds this component — the desktop
            pane's selected entry or the phone route's whole page — so it is always the
            visible one, never a below-the-fold instance among many (`app/poster.tsx`). */}
        <Poster posterPath={detail.posterPath} width={382} className="w-full" aboveFold />
      </ViewTransition>

      {/* `text-ink`, added by the palette audit (#255) — the owned half of the same pair
          as `titles/[kind]/[tmdbId]/page.tsx`'s `h1`, and it had the same omission. */}
      <h2 className="bill-title mt-5 text-bill-xl text-ink">{detail.name}</h2>

      {meta === null ? null : (
        <p className="code-line mt-3 text-dim" data-numeric>
          {meta}
        </p>
      )}

      {/* Where the show stands, with the one control that can change it beside it —
          issue #228. The label is `STATE_LABELS`, exactly as it always was: nothing here
          lets a reader set *watching*, *caught up*, *finished* or *watchlist* by hand,
          because nothing anywhere does — the four are derived and `AbandonControl` is the
          one write this page has ever offered against the state line. It used to sit at
          the foot of the pane, below every episode; this is that same control, moved
          rather than replaced, so giving up on a long show costs no scrolling. */}
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <p className={`code-line ${state.className}`}>{state.label}</p>
        <AbandonControl
          libraryEntryId={detail.libraryEntryId}
          titleName={detail.name}
          abandoned={detail.state === "abandoned"}
          onChanged={onStateChange}
        />
      </div>

      {liveFacts}

      {/* Progress and remaining, shown for a show with episode data and nowhere else —
          `progress-remaining.ts`'s own docblock has the derivation. A film has no episodes
          to be either fact about, and an empty `episodes` for a show is TMDB not having
          mirrored anything yet (`ProgrammeNoteEpisodes`'s own "No episode data yet."),
          which "0 remaining" would misreport as caught up rather than as missing. */}
      {detail.kind === "show" && detail.episodes.length > 0 ? (
        <>
          <p className={`code-line text-dim ${PROGRAMME_NOTE_SECTION}`}>
            Progress — {progressLine(detail.episodes)}
          </p>
          <p className="code-line mt-1 text-dim">Remaining — {remainingLine(detail.episodes)}</p>
        </>
      ) : null}

      {/* The up-next episode, markable on its own row without picking a season first —
          issue #228, and `up-next-row.tsx`'s own docblock for why it is not simply the
          season list defaulting to the right season. Absent whenever the title has none:
          unstarted-with-nothing-mirrored-yet reads the same as finished-to-the-edge-of-what
          TMDB-has here, and both are the honest absence of a fact rather than a guess. */}
      {upNext === undefined ? null : (
        <UpNextRow episode={upNext} libraryEntryId={detail.libraryEntryId} titleName={detail.name} />
      )}

      <ProgrammeNoteEpisodes
        kind={detail.kind}
        episodes={detail.episodes}
        libraryEntryId={detail.libraryEntryId}
        titleName={detail.name}
        state={detail.state}
        onStateChange={onStateChange}
      />

      {/* Rating, *Add to list* and *Remove* — issue #228 moves all three below the
          episode list, in the order they already stood in relative to one another. Each
          is reached for far less often than anything above it, which is the whole of why
          the old order (this trio ahead of the episode list) ran nearly the reverse of how
          often each thing on this page is actually used. */}
      <RatingControl
        libraryEntryId={detail.libraryEntryId}
        titleName={detail.name}
        rating={detail.rating}
        onRated={onRated}
      />

      {/* Issue #147, keyed by `titleId` rather than `libraryEntryId` for the reason its
          own docblock gives: the desktop pane never remounts on a selection change, so
          this key is what gives every title a clean picker rather than five pieces of
          local state this component would otherwise have to reset by hand. */}
      <AddToListControl key={detail.titleId} titleId={detail.titleId} titleName={detail.name} />

      <RemoveControl libraryEntryId={detail.libraryEntryId} titleName={detail.name} />
    </div>
  );
}
