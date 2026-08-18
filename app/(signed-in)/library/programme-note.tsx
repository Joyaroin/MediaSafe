"use client";

import { useEffect, useRef, useState } from "react";

import { TmdbAttribution } from "@/app/tmdb-attribution";
import type { TitleDetailRow } from "@/db/access";
import { ReadFailure } from "@/errors/read-failure";
import { useLibrarySelection } from "./library-selection";
import { ProgrammeNoteContent } from "./programme-note-content";
import { titleDetailAction } from "./title-detail-actions";

/**
 * The programme note — the fixed panel `DESIGN.md` puts on the right of the desktop bill,
 * sticky below the masthead, with its own internal scroll. Issue #58, and the reason the
 * two-pane layout was chosen at all: comparing candidates costs no navigation, because
 * this never routes anywhere. Selecting a tile (`library-entry-cell.tsx`) only ever
 * changes `useLibrarySelection()`'s value; this component is what turns that into a read.
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
  const { selectedEntryId } = useLibrarySelection();

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
      className="hidden w-[420px] shrink-0 border-l border-rule-bold lg:block"
      aria-label="Programme note"
    >
      <div className="sticky top-[57px] flex max-h-[calc(100vh-57px)] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {phase.kind === "idle" ? <NothingSelected /> : null}
          {phase.kind === "loading" ? <Loading /> : null}
          {phase.kind === "failed" ? (
            <div className="px-6 py-5">
              <ReadFailure reference={phase.reference} retry={retry} />
            </div>
          ) : null}
          {phase.kind === "loaded" ? <ProgrammeNoteContent detail={phase.detail} /> : null}
        </div>

        {/* Pinned to the foot, outside the scroll, and shown only while borrowed data
            genuinely is: `docs/design/v1-surfaces.md` §7's obligation is that the notice
            is on screen *whenever borrowed data is* — not always, which would put it in
            front of an empty pane nobody has selected anything into yet. */}
        {phase.kind === "loaded" ? (
          <TmdbAttribution className="bg-ink px-6 py-3" />
        ) : null}
      </div>
    </aside>
  );
}

function NothingSelected() {
  return (
    <div className="px-6 py-5">
      <p className="max-w-[60ch] text-note leading-relaxed text-stock-dim">
        Select an entry from the bill to read it here.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="px-6 py-5">
      {/* `status`, not `alert`: metadata and episodes arriving is a normal moment of this
          page (`docs/design/v1-surfaces.md` §6), not an event worth interrupting anyone
          for. */}
      <p role="status" className="code-line text-stock-dim">
        Reading
      </p>
    </div>
  );
}
