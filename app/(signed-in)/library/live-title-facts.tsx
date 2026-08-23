"use client";

import { useRef, useState } from "react";

import { ReferenceLine } from "@/errors/reference-line";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import type { LiveFacts } from "./live-facts";
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
 * `ProgrammeNoteContent`, already on screen by the time this renders; this component's job
 * is narrower — three independent outcomes, three independent failures, none of which may
 * touch the other two or the page around them.
 *
 * ── `liveFacts` arrives resolved, not fetched here (issue #218) ──────────────────────
 *
 * This used to be three `useEffect`s, each firing its own Server Action once this
 * component mounted — the page painted, then made three round trips. `liveFacts` is now
 * read on the server, alongside (or ahead of) whatever page or pane is opening this title,
 * and handed down already resolved: `library/[entryId]/page.tsx` and
 * `titles/[kind]/[tmdbId]/page.tsx` call `readLiveFacts` directly; the desktop pane and the
 * Up next sheet get it bundled into `titleDetailAction`'s own response. Either way, this
 * component has never made a network request of its own — only a reader's own *Try again*
 * on a section that failed does that (`LiveFactSection` below).
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
  liveFacts,
}: {
  kind: TitleKind;
  tmdbId: number;
  liveFacts: LiveFacts;
}) {
  // Each section is keyed by the title it is showing, so selecting a different one
  // *remounts* the section rather than patching its state in place — a fresh mount seeds
  // itself from that title's own `liveFacts.*` outcome, with nothing to reconcile against
  // whatever the previous title's section last held.
  const forTitle = `${kind}:${tmdbId}`;

  return (
    <>
      <LiveFactSection
        key={`synopsis:${forTitle}`}
        heading="Synopsis"
        kind={kind}
        tmdbId={tmdbId}
        initial={liveFacts.synopsis}
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
        initial={liveFacts.watchProviders}
        fetcher={titleWatchProvidersAction}
        render={(providers) => <WatchProviders providers={providers} />}
      />

      <LiveFactSection
        key={`cast-crew:${forTitle}`}
        heading="Cast & crew"
        kind={kind}
        tmdbId={tmdbId}
        initial={liveFacts.castAndCrew}
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

function outcomeToPhase<T>(outcome: Outcome<T>): Phase<T> {
  return outcome.ok
    ? { kind: "loaded", value: outcome.value }
    : { kind: "failed", reference: outcome.reference };
}

/**
 * One live-only section's whole state machine — loading, loaded, or failed, entirely
 * independent of its siblings. Generic over what TMDB hands back, so the three sections
 * above are three call sites and not three near-duplicate components.
 *
 * `render` may return `null` (an empty synopsis, no watch providers listed in this
 * region): the section still renders nothing in that case, which is the honest answer to
 * *TMDB has this field and it is empty* — not a failure, and not worth a heading over
 * nothing.
 *
 * `initial` seeds `phase` at mount and nothing after — `LiveTitleFacts` keys this
 * component by title, so a new title is a new mount with its own `initial`, not a prop
 * change an existing instance would have to reconcile. `loading` is reached only from
 * `retry`, a reader's own action; there is no `useEffect` here at all, because there is no
 * longer a fetch this component makes on its own account.
 */
function LiveFactSection<T>({
  heading,
  kind,
  tmdbId,
  initial,
  fetcher,
  render,
}: {
  heading: string;
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<T>;
  fetcher: (kind: TitleKind, tmdbId: number) => Promise<Outcome<T>>;
  render: (value: T) => React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase<T>>(() => outcomeToPhase(initial));
  // The newest request's sequence number, so a slower answer to a retry the reader has
  // since re-triggered cannot land after a newer one already has — the same guard
  // `search-surface.tsx` uses for the same reason.
  const newestRequest = useRef(0);

  function retry() {
    const request = ++newestRequest.current;
    setPhase({ kind: "loading" });
    fetcher(kind, tmdbId).then((outcome) => {
      if (request !== newestRequest.current) return;
      setPhase(outcomeToPhase(outcome));
    });
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

/**
 * Issue #139 dropped the bordered chip this used to render each provider as — a card with
 * a border, on a surface whose new-world treatment has none. A plain line, joined by " · "
 * the same way `CastAndCrewLine` below already renders its own two rows, says the same
 * thing without drawing a box around each name.
 */
function WatchProviders({ providers }: { providers: readonly WatchProvider[] }) {
  if (providers.length === 0) {
    return <p className="text-item text-dim">Nothing listed for streaming.</p>;
  }

  return (
    <p className="text-item text-dim">{providers.map((provider) => provider.name).join(" · ")}</p>
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
