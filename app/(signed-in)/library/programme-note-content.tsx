import type { LibraryState, TitleDetailRow } from "@/db/access";
import { Plate } from "@/app/plate";
import { AbandonControl } from "./abandon-control";
import { LiveTitleFacts } from "./live-title-facts";
import { ProgrammeNoteEpisodes } from "./programme-note-episodes";
import { STATE_LABELS } from "./library-state";

/**
 * One title, read properly — the content the desktop pane and the phone route both show,
 * word for word (issue #58). Topology is the only thing that differs between them: the
 * pane replaces itself in place, the phone pushes a route. Neither wraps this in
 * anything about *how it got here*; both wrap it in where it lives (`ProgrammeNotePane`'s
 * sticky aside, or the phone route's `<main>`).
 *
 * ── The abandon control, and the one thing it may change ─────────────────────────────
 *
 * `AbandonControl` (issue #87) is the one hand-set state in the model, and `onStateChange`
 * is this component's entire surface for it: a successful write patches `detail.state` in
 * place, in whichever component is holding this one's props (`ProgrammeNotePane` here,
 * the phone route in `app/(signed-in)/library/[entryId]/page.tsx`). Nothing else about the
 * title changes when abandonment does, so nothing else is re-read.
 *
 * TMDB's attribution is not here — it is pinned to the foot of whichever surface holds
 * this component, outside this component's own scroll, which is a layout decision
 * belonging to the caller (`app/tmdb-attribution.tsx`'s own docblock says why). No rating
 * control either — build step 6, and issue #58 reserves no space for it.
 */
export function ProgrammeNoteContent({
  detail,
  onStateChange,
}: {
  detail: TitleDetailRow;
  onStateChange: (state: LibraryState) => void;
}) {
  const state = STATE_LABELS[detail.state];
  const meta = metaLine(detail);

  return (
    <div className="px-6 py-5">
      <Plate posterPath={detail.posterPath} className="aspect-[16/10] w-full" />

      <h2 className="bill-title mt-5 text-bill-xl">{detail.name}</h2>

      {meta === null ? null : (
        <p className="code-line mt-3 text-stock-dim" data-numeric>
          {meta}
        </p>
      )}

      <p className={`code-line mt-4 ${state.className}`}>{state.label}</p>

      <LiveTitleFacts kind={detail.kind} tmdbId={detail.tmdbId} />

      <ProgrammeNoteEpisodes kind={detail.kind} episodes={detail.episodes} />

      <AbandonControl
        libraryEntryId={detail.libraryEntryId}
        titleName={detail.name}
        abandoned={detail.state === "abandoned"}
        onChanged={onStateChange}
      />
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
