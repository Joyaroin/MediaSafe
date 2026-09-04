"use client";

import { useEffect, useRef, useState, ViewTransition } from "react";

import { TmdbAttribution } from "@/app/tmdb-attribution";
import { Poster } from "@/app/poster";
import type { LibraryState, TitleDetailRow } from "@/db/access";
import { ReadFailure } from "@/errors/read-failure";
import { useLibrarySelection } from "./library-selection";
import { LiveTitleFactsClientFetch, LiveTitleFactsProvider } from "./live-title-facts";
import { railPosterTransitionName } from "./poster-transition-name";
import { ProgrammeNoteContent } from "./programme-note-content";
import { titleDetailAction } from "./title-detail-actions";

/**
 * The programme note — the fixed panel `DESIGN.md` puts on the right of the desktop bill,
 * sticky to the top of the viewport, with its own internal scroll. Issue #58, and the
 * reason the two-pane layout was chosen at all: comparing candidates costs no navigation,
 * because this never routes anywhere. Selecting a tile (`library-entry-cell.tsx`) only
 * ever changes `useLibrarySelection()`'s value; this component is what turns that into a
 * read.
 *
 * `top-0`/`max-h-screen`, not an offset kept in step with a masthead: issue #136 removed
 * the desktop masthead this pane used to sit below (`sidebar.tsx` replaced it), so there
 * is nothing above this column on desktop to leave room for — the `[420px]` `aside` below
 * only ever renders past `lg`, which is exactly the width at which that is true.
 *
 * ── Four states, and why the reset is in render, not in an effect ────────────────────
 *
 * `idle` (nothing picked yet), `loading`, `loaded`, `failed` — the same discriminated
 * shape `search-surface.tsx` uses, for the reason that file gives: no state combination
 * left to invent. The one wrinkle here is that the pane's *identity* never changes
 * (unlike `LiveFactSection`, which is remounted per title by a `key`) — it is one
 * persistent instance that must reset its own phase every time `selectedEntryId` changes
 * underneath it. React's own guidance for exactly that shape is to compare against the
 * previous value **during render** and call `setState` synchronously right there, which
 * bails out and re-renders before anything commits — not inside `useEffect`, which is the
 * "cascading render" mistake `search-surface.tsx` already found and named. The effect
 * below only ever calls `setPhase` from inside `.then()`, same as `live-title-facts.tsx`.
 *
 * ── The morph, and why it has to start in the `loading` frame ────────────────────────
 *
 * Issue #141: the poster the reader pressed becomes this pane's poster, rather than one
 * disappearing and another appearing once the read resolves. That means the transition
 * name (`rail-poster-{id}`) has to move off the tile and onto this pane in the *same*
 * commit — `library-selection.tsx`'s `select` is what makes it one commit, wrapping the
 * write in `startTransition` so `<ViewTransition>` activates on it at all. Waiting for
 * `titleDetailAction` to answer before mounting anything named would split that into two
 * commits — the tile letting go in one, the pane picking up in a later, unrelated one —
 * and the browser has nothing to morph between an exit and a separate enter.
 *
 * So `loading` mounts the poster immediately, from `selectedPosterPath` — a fact the
 * tile already had in hand before it was ever pressed — while the rest of the note is
 * still `titleDetailAction`'s to answer. `loaded` hands the same name to
 * `ProgrammeNoteContent`'s own poster; same id, same image, so nothing visibly moves a
 * second time when the swap happens, only the row of facts beneath it appears.
 */
type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly detail: TitleDetailRow }
  | { readonly kind: "failed"; readonly reference: string | null };

function phaseFor(entryId: string | null): Phase {
  return entryId === null ? { kind: "idle" } : { kind: "loading" };
}

export function ProgrammeNotePane() {
  const { selectedEntryId, selectedPosterPath } = useLibrarySelection();

  const [trackedEntryId, setTrackedEntryId] = useState(selectedEntryId);
  const [phase, setPhase] = useState<Phase>(() => phaseFor(selectedEntryId));

  if (selectedEntryId !== trackedEntryId) {
    setTrackedEntryId(selectedEntryId);
    setPhase(phaseFor(selectedEntryId));
  }

  // The newest request's sequence number — the same guard `search-surface.tsx` and
  // `live-title-facts.tsx` use, and load-bearing in exactly the same way: selecting two
  // titles quickly must not let the slower answer land after the faster, later one.
  const newestRequest = useRef(0);

  function fetchNow(entryId: string) {
    const request = ++newestRequest.current;
    titleDetailAction(entryId).then((outcome) => {
      if (request !== newestRequest.current) return;
      setPhase(
        outcome.ok
          ? { kind: "loaded", detail: outcome.value }
          : { kind: "failed", reference: outcome.reference },
      );
    });
  }

  useEffect(() => {
    if (selectedEntryId !== null) fetchNow(selectedEntryId);
  }, [selectedEntryId]);

  function retry() {
    if (selectedEntryId === null) return;
    setPhase({ kind: "loading" });
    fetchNow(selectedEntryId);
  }

  return (
    <aside
      className="hidden w-[420px] shrink-0 border-l border-hair lg:block"
      aria-label="Programme note"
    >
      <div className="sticky top-0 flex max-h-screen flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {phase.kind === "idle" ? <NothingSelected /> : null}
          {phase.kind === "loading" && selectedEntryId !== null ? (
            <Loading
              posterPath={selectedPosterPath}
              transitionName={railPosterTransitionName(selectedEntryId)}
            />
          ) : null}
          {phase.kind === "failed" ? (
            <div className="px-6 py-5">
              <ReadFailure reference={phase.reference} retry={retry} />
            </div>
          ) : null}
          {phase.kind === "loaded" ? (
            /* The provider owns the one fetch; the three slots below read it. Keyed by
               title so a selection change remounts it rather than reconciling an earlier
               title's answer into the new one. */
            <LiveTitleFactsProvider
              key={`${phase.detail.kind}:${phase.detail.tmdbId}`}
              kind={phase.detail.kind}
              tmdbId={phase.detail.tmdbId}
            >
            <ProgrammeNoteContent
              detail={phase.detail}
              synopsis={
                <LiveTitleFactsClientFetch
                  kind={phase.detail.kind}
                  tmdbId={phase.detail.tmdbId}
                  slot="synopsis"
                />
              }
              watchProviders={
                <LiveTitleFactsClientFetch
                  kind={phase.detail.kind}
                  tmdbId={phase.detail.tmdbId}
                  slot="providers"
                />
              }
              cast={
                <LiveTitleFactsClientFetch
                  kind={phase.detail.kind}
                  tmdbId={phase.detail.tmdbId}
                  slot="cast"
                />
              }
              posterTransitionName={railPosterTransitionName(phase.detail.libraryEntryId)}
              onStateChange={(libraryEntryId: string, state: LibraryState) =>
                setPhase((prev) =>
                  // A write started against the entry this pane had selected when it was
                  // pressed can still land after the reader has moved to a different one
                  // — this pane never navigates, so nothing unmounts it in between. The
                  // guard is what keeps that stale answer from patching whatever is on
                  // screen now.
                  prev.kind === "loaded" && prev.detail.libraryEntryId === libraryEntryId
                    ? { kind: "loaded", detail: { ...prev.detail, state } }
                    : prev,
                )
              }
            />
            </LiveTitleFactsProvider>
          ) : null}
        </div>

        {/* Pinned to the foot, outside the scroll, and shown only while borrowed data
            genuinely is: `docs/design/v1-surfaces.md` §7's obligation is that the notice
            is on screen *whenever borrowed data is* — not always, which would put it in
            front of an empty pane nobody has selected anything into yet. */}
        {phase.kind === "loaded" ? (
          <TmdbAttribution className="bg-ground px-6 py-3" />
        ) : null}
      </div>
    </aside>
  );
}

function NothingSelected() {
  return (
    <div className="px-6 py-5">
      <p className="max-w-[60ch] text-note leading-relaxed text-dim">
        Select an entry from the bill to read it here.
      </p>
    </div>
  );
}

/**
 * The poster arrives with `loading`, not with `loaded` — issue #141's morph needs it on
 * screen, under this same `transitionName`, in the very commit that lets the tile go
 * (`ProgrammeNotePane`'s own docblock has the reasoning). `posterPath` is
 * `selectedPosterPath`, not a read — the pane has no title yet at this phase, only the
 * fact the tile already knew.
 *
 * `key={transitionName}` is load-bearing, not decoration: this pane never remounts
 * between two selections (`ProgrammeNotePane`'s own docblock — same instance, phase
 * reset in place), so without a key React reuses the same `<ViewTransition>` fiber and
 * only patches its `name` prop from the old id to the new one. React treats that as one
 * boundary quietly renamed, not an old one leaving and a new one arriving, and reports
 * two boundaries answering to the old name for the length of that commit — confirmed
 * against a throwaway probe route before landing this, per the issue's own instruction
 * to verify rather than assume. The key forces the swap React's own
 * [View Transitions guide](https://react.dev/reference/react/ViewTransition) assumes:
 * old fiber unmounts under its old name, a fresh one mounts under the new.
 */
function Loading({
  posterPath,
  transitionName,
}: {
  posterPath: string | null;
  transitionName: string;
}) {
  return (
    <div className="px-6 py-5">
      {/* `default` assigns `view-transition-class` to the underlying node (issue #338),
          which is what scopes `app/globals.css`'s sampled-spring rule to posters. */}
      <ViewTransition key={transitionName} name={transitionName} default="poster">
        {/* Always the pane's one poster, already known selected before this even mounts
            (`useLibrarySelection`'s own `selectedPosterPath`) — the two-pane surface this
            ticket's own wording names as already knowing its poster is visible. */}
        <Poster posterPath={posterPath} width={382} className="w-full" aboveFold />
      </ViewTransition>

      {/* `status`, not `alert`: metadata and episodes arriving is a normal moment of this
          page (`docs/design/v1-surfaces.md` §6), not an event worth interrupting anyone
          for. */}
      <p role="status" className="code-line mt-5 text-dim">
        Reading
      </p>
    </div>
  );
}
