import type { LibraryState, TitleDetailRow } from "@/db/access";
import { Plate } from "@/app/plate";
import { AbandonControl } from "./abandon-control";
import { LiveTitleFacts } from "./live-title-facts";
import { ProgrammeNoteEpisodes } from "./programme-note-episodes";
import { RatingControl } from "./rating-control";
import { RemoveControl } from "./remove-control";
import { STATE_LABELS } from "./library-state";

/**
 * One title, read properly — the content the desktop pane and the phone route both show,
 * word for word (issue #58). Topology is the only thing that differs between them: the
 * pane replaces itself in place, the phone pushes a route. Neither wraps this in
 * anything about *how it got here*; both wrap it in where it lives (`ProgrammeNotePane`'s
 * sticky aside, or the phone route's `<main>`).
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
 * It is rendered **last, below the abandon control**, and the ordering is the ticket's
 * rather than an aesthetic choice: the two must sit near each other and must not read as
 * the same thing. `remove-control.tsx` carries how that difference is drawn, in shape and
 * in copy. The reason it belongs on this shared component rather than on the phone route is
 * that the desktop pane is title detail too — a title removable on one device and permanent
 * on the other would be the same feature having two answers.
 *
 * TMDB's attribution is not here — it is pinned to the foot of whichever surface holds
 * this component, outside this component's own scroll, which is a layout decision
 * belonging to the caller (`app/tmdb-attribution.tsx`'s own docblock says why).
 */
export function ProgrammeNoteContent({
  detail,
  onStateChange,
  onRated,
}: {
  detail: TitleDetailRow;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
  onRated: (libraryEntryId: string, rating: number) => void;
}) {
  const state = STATE_LABELS[detail.state];
  const meta = metaLine(detail);

  return (
    <div className="px-6 py-5">
      <Plate posterPath={detail.posterPath} className="aspect-[16/10] w-full" />

      <h2 className="bill-title mt-5 text-bill-xl">{detail.name}</h2>

      {meta === null ? null : (
        <p className="code-line mt-3 text-dim" data-numeric>
          {meta}
        </p>
      )}

      <p className={`code-line mt-4 ${state.className}`}>{state.label}</p>

      <LiveTitleFacts kind={detail.kind} tmdbId={detail.tmdbId} />

      {/* Where the prototype puts it: below the borrowed facts, above the abandon row,
          and identical for a film and a show — a rating is a fact about the title, and
          nothing about it asks whether the title has episodes. */}
      <RatingControl
        libraryEntryId={detail.libraryEntryId}
        titleName={detail.name}
        rating={detail.rating}
        onRated={onRated}
      />

      <ProgrammeNoteEpisodes
        kind={detail.kind}
        episodes={detail.episodes}
        libraryEntryId={detail.libraryEntryId}
        titleName={detail.name}
        state={detail.state}
        onStateChange={onStateChange}
      />

      <AbandonControl
        libraryEntryId={detail.libraryEntryId}
        titleName={detail.name}
        abandoned={detail.state === "abandoned"}
        onChanged={onStateChange}
      />

      <RemoveControl libraryEntryId={detail.libraryEntryId} titleName={detail.name} />
    </div>
  );
}

/**
 * The year, and for a film its runtime — never a network, which `library-entry-cell.tsx`
 * already explains the absence of: `title` mirrors no network column (ADR-0001), so a
 * line drawing one would be inventing a fact this application does not have.
 */
function metaLine(detail: TitleDetailRow): string | null {
  const parts: string[] = [];
  if (detail.releaseYear !== null) parts.push(String(detail.releaseYear));
  if (detail.kind === "film" && detail.runtimeMins !== null) {
    parts.push(`${detail.runtimeMins} min`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
