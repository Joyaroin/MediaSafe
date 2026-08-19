"use client";

import { useEffect, useRef, useState } from "react";

import { ReferenceLine } from "@/errors/reference-line";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import {
  titleCastAndCrewAction,
  titleSynopsisAction,
  titleWatchProvidersAction,
  type Outcome,
} from "./title-detail-actions";

/**
 * The three live-only sections of title detail — synopsis, watch providers, cast and
 * crew. `docs/design/v1-surfaces.md` §7: *"one failed fetch must never take the screen,
 * and the mirrored half of the page works even when TMDB is down."* The mirrored half is
 * `ProgrammeNoteContent`, already on screen by the time this mounts; this component's job
 * is narrower — three independent fetches, three independent failures, none of which may
 * touch the other two or the page around them.
 *
 * ── Three actions, not one ────────────────────────────────────────────────────────────
 *
 * `title-detail-actions.ts` explains why: a combined call either has everything or is one
 * failure covering all three, and *fails inline within its own section* only holds if a
 * failed credits fetch cannot take the synopsis down with it.
 */
export function LiveTitleFacts({
  kind,
  tmdbId,
}: {
  kind: TitleKind;
  tmdbId: number;
}) {
  // Each section is keyed by the title it is showing, so selecting a different one
  // *remounts* the section rather than an effect resetting it in place — React's own
  // pattern for "this state belongs to identity X and must not survive X changing". A
  // fresh mount starts at `{ kind: "loading" }` for free, with nothing synchronously
  // re-setting it, which is what keeps `useEffect` below clean of the exact mistake
  // `search-surface.tsx` already found and named: *setting state synchronously in an
  // effect body is a cascading render.*
  const forTitle = `${kind}:${tmdbId}`;

  return (
    <>
      <LiveFactSection
        key={`synopsis:${forTitle}`}
        heading="Synopsis"
        kind={kind}
        tmdbId={tmdbId}
        fetcher={titleSynopsisAction}
        render={(overview) =>
          overview === null ? null : (
            <p className="max-w-[68ch] text-note leading-relaxed text-dim">
              {overview}
            </p>
          )
        }
      />

      <LiveFactSection
        key={`providers:${forTitle}`}
        // `CONTEXT.md`'s glossary is "Watch provider", and lists "where to watch"
        // itself in that entry's own `_Avoid_` line — this is the term, not a
        // paraphrase of it.
        heading="Watch providers"
        kind={kind}
        tmdbId={tmdbId}
        fetcher={titleWatchProvidersAction}
        render={(providers) => <WatchProviders providers={providers} />}
      />

      <LiveFactSection
        key={`cast-crew:${forTitle}`}
        heading="Cast & crew"
        kind={kind}
        tmdbId={tmdbId}
        fetcher={titleCastAndCrewAction}
        render={(credit) => <CastAndCrewLine credit={credit} />}
      />
    </>
  );
}

type Phase<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly value: T }
  | { readonly kind: "failed"; readonly reference: string | null };

/**
 * One live-only section's whole state machine — loading, loaded, or failed, entirely
 * independent of its siblings. Generic over what TMDB hands back, so the three sections
 * above are three call sites and not three near-duplicate components.
 *
 * `render` may return `null` (an empty synopsis, no watch providers listed in this
 * region): the section still renders nothing in that case, which is the honest answer to
 * *TMDB has this field and it is empty* — not a failure, and not worth a heading over
 * nothing.
 */
function LiveFactSection<T>({
  heading,
  kind,
  tmdbId,
  fetcher,
  render,
}: {
  heading: string;
  kind: TitleKind;
  tmdbId: number;
  fetcher: (kind: TitleKind, tmdbId: number) => Promise<Outcome<T>>;
  render: (value: T) => React.ReactNode;
}) {
  // Starts at `loading` because `LiveTitleFacts` keys this component by title — a new
  // title is a new mount, not a prop change, so there is no earlier title's `loaded`
  // value for this initial state to leak.
  const [phase, setPhase] = useState<Phase<T>>({ kind: "loading" });
  // The newest request's sequence number, so a slower answer to a title the reader has
  // since moved on from cannot land after a newer one already has — the same guard
  // `search-surface.tsx` uses for the same reason.
  const newestRequest = useRef(0);

  function fetchNow() {
    const request = ++newestRequest.current;
    fetcher(kind, tmdbId).then((outcome) => {
      if (request !== newestRequest.current) return;
      setPhase(
        outcome.ok
          ? { kind: "loaded", value: outcome.value }
          : { kind: "failed", reference: outcome.reference },
      );
    });
  }

  // `fetchNow` only sets state inside the `.then()` callback — never synchronously in the
  // effect body itself, which is the shape the mount above avoids for a reason:
  // synchronous `setState` inside an effect is a cascading render, and `search-surface.tsx`
  // already found and named this exact trap. Deps are what they look like: this section's
  // whole identity, and a new mount (via the `key` above) covers the case they'd otherwise
  // exist to catch.
  useEffect(fetchNow, [kind, tmdbId, fetcher]);

  /** *Try again* is a reader's own action, not an effect — a synchronous `setPhase` here
   *  is not the pattern the lint rule above is about. */
  function retry() {
    setPhase({ kind: "loading" });
    fetchNow();
  }

  if (phase.kind === "loading") {
    // Quiet, per `docs/design/v1-surfaces.md` §6's "loading" row for this screen: metadata
    // and episodes arriving is a normal moment of this page, not an event.
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <p role="status" className="code-line text-dim">
          {heading}
        </p>
      </div>
    );
  }

  if (phase.kind === "failed") {
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <p className="code-line text-dim">{heading}</p>
        <p className="mt-3 max-w-[62ch] text-note text-text">
          This did not load. Nothing else on this page did either — the rest of it is not
          affected.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button type="button" onClick={retry} className={GHOST_RECOVERY}>
            Try again
          </button>
          {phase.reference === null ? null : <ReferenceLine reference={phase.reference} />}
        </div>
      </div>
    );
  }

  const content = render(phase.value);
  if (content === null) return null;

  return (
    <div className={PROGRAMME_NOTE_SECTION}>
      <p className="code-line text-dim">{heading}</p>
      <div className="mt-3">{content}</div>
    </div>
  );
}

function WatchProviders({ providers }: { providers: readonly WatchProvider[] }) {
  if (providers.length === 0) {
    return <p className="text-item text-dim">Nothing listed for streaming.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {providers.map((provider) => (
        <li key={provider.id} className="code-line border border-hair px-3 py-1.5">
          {provider.name}
        </li>
      ))}
    </ul>
  );
}

function CastAndCrewLine({ credit }: { credit: CastAndCrew }) {
  if (credit.cast.length === 0 && credit.crew.length === 0) {
    return <p className="text-item text-dim">Nothing listed.</p>;
  }

  return (
    <div className="space-y-3">
      {credit.crew.length === 0 ? null : (
        <p className="text-item text-dim">
          {credit.crew.map((one) => `${one.name} (${one.job})`).join(" · ")}
        </p>
      )}
      {credit.cast.length === 0 ? null : (
        <p className="text-item text-dim">
          {credit.cast.map((one) => one.name).join(" · ")}
        </p>
      )}
    </div>
  );
}
