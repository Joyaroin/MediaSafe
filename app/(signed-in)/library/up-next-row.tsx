"use client";

import { useEffect, useRef, useState } from "react";

import type { UpNextEntry } from "@/db/access";
import { ReadFailure } from "@/errors/read-failure";
import { listUpNextAction } from "./up-next-action";
import { UpNextGrid } from "./up-next-grid";

/**
 * TONIGHT — the desktop's answer to *what am I part-way through* (issue #100).
 *
 * `DESIGN.md`: *secondary to the grid beneath it,* and *bounded by the viewport, not a
 * scroller — no horizontal scroll, no fade, no arrow. The row simply ends.* This is the
 * one place that bound is drawn: `UpNextGrid` renders whatever `listUpNext` hands back,
 * and the clip (`max-height: 122px`, `overflow: hidden`) is what stops at one row.
 *
 * ── Its own fetch, its own failure — `AGENTS.md`'s blast-radius table ────────────────
 *
 * *One region failed to load → inline, replacing that region.* Reading Up next through
 * `listUpNextAction` rather than `library/page.tsx`'s server read is what keeps a failure
 * here from taking the bill down with it: the two are unrelated queries, and a reader
 * whose deck failed to load should still be able to browse the library underneath it.
 * The pattern is `programme-note.tsx`'s — a Server Action, caught, turned into a
 * `ReadFailure` with a reference id — for the identical reason that file gives: this row
 * never navigates, so there is no route-level `error.tsx` waiting for the throw.
 *
 * ── One load, not a live one ─────────────────────────────────────────────────────────
 *
 * The fetch runs once on mount and never again on its own. Marking a card watched
 * (`up-next-grid.tsx`) does not refetch this list — issue #100's own acceptance criteria
 * is that a title leaving *watching* is gone **on the next load**, not the instant it is
 * struck, which is also what keeps a card from disappearing out from under a cursor still
 * resting on it.
 *
 * ── Hidden below `lg` ─────────────────────────────────────────────────────────────────
 *
 * This is the *desktop* row (issue #100's own title). The phone's TONIGHT — one dominant
 * entry and a deck with no numeric cap — is a different component with a different shape
 * (`DESIGN.md`'s Phone section) and is not this ticket's to build; gating on `lg` keeps
 * this grid, which would read as a single cramped column below that width, off a surface
 * it was never designed for.
 */

/** The heading's id, so the grid can point `aria-labelledby` at it — the same device
 *  `library-heading.tsx`'s `LIBRARY_HEADING_ID` uses for the bill beneath this row. */
const UP_NEXT_HEADING_ID = "up-next-heading";

export function UpNextRow() {
  const [phase, setPhase] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "loaded"; readonly entries: readonly UpNextEntry[] }
    | { readonly kind: "failed"; readonly reference: string | null }
  >({ kind: "loading" });

  // The newest request's sequence number — the same guard `programme-note.tsx` uses,
  // load-bearing here too: `retry()` after a failure must not let a slower, earlier
  // answer land after the faster one it raced.
  const newestRequest = useRef(0);

  function fetchNow() {
    const request = ++newestRequest.current;
    listUpNextAction().then((outcome) => {
      if (request !== newestRequest.current) return;
      setPhase(
        outcome.ok
          ? { kind: "loaded", entries: outcome.value.entries }
          : { kind: "failed", reference: outcome.reference },
      );
    });
  }

  useEffect(() => {
    fetchNow();
  }, []);

  return (
    <section className="hidden border-b border-rule-bold lg:block">
      {/* `DESIGN.md`'s type table: "Desktop section heads (`Tonight` via `lg:text-bill-sm`,
          `The library`)" — the same step and colour `LibraryHeading` sets for the bill's
          own heading, so the two read as one family of section head. */}
      <h2
        id={UP_NEXT_HEADING_ID}
        className="bill-title px-6 pb-3 pt-4 lg:text-bill-sm text-stock"
      >
        Tonight
      </h2>

      {phase.kind === "loading" ? (
        <p role="status" className="code-line px-6 pb-5 text-stock-dim">
          Reading
        </p>
      ) : phase.kind === "failed" ? (
        <div className="px-6 pb-5">
          <ReadFailure reference={phase.reference} retry={fetchNow} />
        </div>
      ) : phase.entries.length === 0 ? (
        <NothingPartWayThrough />
      ) : (
        <UpNextGrid entries={phase.entries} headingId={UP_NEXT_HEADING_ID} />
      )}
    </section>
  );
}

/**
 * Zero entries, reached only from a `listUpNext` call that succeeded and found nothing —
 * issue #100's own acceptance criteria: *reads as caught up on everything, never as an
 * empty library.* `EmptyLibrary`'s centred, `text-bill-lg` treatment is the shape a
 * *library* with nothing in it gets; this is a secondary row over an intact library, so it
 * gets one quiet line at the same weight `programme-note.tsx`'s own idle state uses, not a
 * second empty-state headline competing with the bill underneath it.
 */
function NothingPartWayThrough() {
  return (
    <div className="px-6 pb-5">
      <p className="text-item text-stock-dim">You&rsquo;re caught up on everything.</p>
    </div>
  );
}
