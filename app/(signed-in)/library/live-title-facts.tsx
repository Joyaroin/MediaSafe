"use client";

import { useEffect, useRef, useState } from "react";

import { ReferenceLine } from "@/errors/reference-line";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import type { LiveFacts } from "./live-facts";
import {
  titleCastAndCrewAction,
  titleLiveFactsAction,
  titleSynopsisAction,
  titleWatchProvidersAction,
  type Outcome,
} from "./title-detail-actions";

/**
 * The three live-only sections of title detail — synopsis, watch providers, cast and
 * crew. `docs/design/v1-surfaces.md` §7: *"one failed fetch must never take the screen,
 * and the mirrored half of the page works even when TMDB is down."* The mirrored half is
 * `ProgrammeNoteContent`, already on screen by the time either variant below renders;
 * their job is narrower — three independent outcomes, three independent failures, none of
 * which may touch the other two or the page around them.
 *
 * ── Two ways to arrive, one shared rendering (issue #218) ─────────────────────────────
 *
 * `LiveFactSection` below no longer fetches on its own account — it renders whatever
 * `initial: Outcome<T>` it is handed, and only makes a request of its own when a reader
 * clicks *Try again* on a section that failed. Two components feed it, through the three
 * fixed `*FactSection` wrappers further down (`SynopsisFactSection` and its two
 * siblings) — fixed rather than generic at that boundary because what crosses it is
 * `initial`, `kind` and `tmdbId` only, never a `render`/`fetcher` function:
 *
 * - `live-title-facts-streamed.tsx`'s `LiveTitleFactsStreamed` — a **Server Component**,
 *   used by the phone route and the unowned-title page, the two surfaces that are real
 *   page renders. It wraps each of the three reads in its own `<Suspense>`, so the page
 *   shell (poster, title, episodes) ships the instant the mirrored read is done, and each
 *   live section streams in independently as its own TMDB call resolves — the property
 *   `DESIGN.md`'s own Suspense section reserves for exactly this shape: *"the mechanism
 *   to reach for if a future surface grows a region with its own async boundary."*
 *
 * - `LiveTitleFactsClientFetch` below — used by the desktop pane and the Up next sheet,
 *   neither of which navigates, so neither has a page render to stream behind. It fetches
 *   once, on mount, through `titleLiveFactsAction` — one combined round trip for all
 *   three fields (concurrent on the server, `readLiveFacts` in `live-facts.ts`), not the
 *   three separate ones this used to fire before issue #218. The pane/sheet's own detail
 *   read stays untouched by this — `titleDetailAction` returns only the mirrored row, so
 *   the panel still appears the moment that fast, DB-only read lands, exactly as before;
 *   only the three live sections beneath it wait on TMDB, each showing the same quiet
 *   placeholder `LiveTitleFactsStreamed`'s `Suspense` fallbacks show elsewhere.
 *
 * Neither variant can make a page-navigating surface's read block a click-triggered one's,
 * or the reverse — they are two different mechanisms for the same constraint (*one failed,
 * or one slow, fetch must never cost the reader the rest of the page*), chosen per surface
 * because only one of the two surfaces has a page render to hang streaming off of.
 *
 * ── Three actions, not one ────────────────────────────────────────────────────────────
 *
 * `title-detail-actions.ts` explains why *retry* stays three separate actions even though
 * the first read above is now one call: a combined call either has everything or is one
 * failure covering all three, and *fails inline within its own section* only holds if a
 * failed credits fetch cannot take the synopsis down with it.
 */
export function LiveTitleFactsClientFetch({
  kind,
  tmdbId,
}: {
  kind: TitleKind;
  tmdbId: number;
}) {
  const [liveFacts, setLiveFacts] = useState<LiveFacts | null>(null);
  // The newest request's sequence number, so a slower answer to a title the reader has
  // since moved on from cannot land after a newer one already has — the same guard
  // `search-surface.tsx` and `programme-note.tsx` use for the same reason.
  const newestRequest = useRef(0);

  // Only ever sets state inside the `.then()` callback, never synchronously in the effect
  // body — the shape `search-surface.tsx` names the alternative to as a cascading render.
  // Deps are this component's whole identity; a title switch remounts it (this component
  // is keyed by title at its call site in `programme-note.tsx`/`title-sheet.tsx`), so
  // there is no earlier title's answer for this effect to reconcile against.
  useEffect(() => {
    const request = ++newestRequest.current;
    titleLiveFactsAction(kind, tmdbId).then((facts) => {
      if (request !== newestRequest.current) return;
      setLiveFacts(facts);
    });
  }, [kind, tmdbId]);

  if (liveFacts === null) {
    return (
      <>
        <LiveFactPlaceholder heading="Synopsis" />
        <LiveFactPlaceholder heading="Watch providers" />
        <LiveFactPlaceholder heading="Cast & crew" />
      </>
    );
  }

  return (
    <>
      <SynopsisFactSection kind={kind} tmdbId={tmdbId} initial={liveFacts.synopsis} />
      <WatchProvidersFactSection kind={kind} tmdbId={tmdbId} initial={liveFacts.watchProviders} />
      <CastAndCrewFactSection kind={kind} tmdbId={tmdbId} initial={liveFacts.castAndCrew} />
    </>
  );
}

/**
 * The three sections, each a fixed (non-generic) instantiation of `LiveFactSection` below
 * — `heading`, `fetcher` and `render` hard-coded rather than threaded in. Exported so
 * `live-title-facts-streamed.tsx`'s three async Server Components can each render one
 * directly, handing it nothing but `initial` (a plain `Outcome<T>`, already resolved) and
 * `kind`/`tmdbId` — all three serialisable across the server/client boundary. A `render`
 * or `fetcher` function is not: passing one as a prop from a Server Component would need
 * it to cross the network, which is why it lives inside this client module instead of
 * being threaded in from outside it.
 */
export function SynopsisFactSection({
  kind,
  tmdbId,
  initial,
}: {
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<string | null>;
}) {
  return (
    <LiveFactSection
      heading="Synopsis"
      kind={kind}
      tmdbId={tmdbId}
      initial={initial}
      fetcher={titleSynopsisAction}
      render={(overview) =>
        overview === null ? null : (
          <p className="max-w-[68ch] text-note leading-relaxed text-dim">{overview}</p>
        )
      }
    />
  );
}

export function WatchProvidersFactSection({
  kind,
  tmdbId,
  initial,
}: {
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<readonly WatchProvider[]>;
}) {
  return (
    <LiveFactSection
      // `CONTEXT.md`'s glossary is "Watch provider", and lists "where to watch" itself in
      // that entry's own `_Avoid_` line — this is the term, not a paraphrase of it.
      heading="Watch providers"
      kind={kind}
      tmdbId={tmdbId}
      initial={initial}
      fetcher={titleWatchProvidersAction}
      render={(providers) => <WatchProviders providers={providers} />}
    />
  );
}

export function CastAndCrewFactSection({
  kind,
  tmdbId,
  initial,
}: {
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<CastAndCrew>;
}) {
  return (
    <LiveFactSection
      heading="Cast & crew"
      kind={kind}
      tmdbId={tmdbId}
      initial={initial}
      fetcher={titleCastAndCrewAction}
      render={(credit) => <CastAndCrewLine credit={credit} />}
    />
  );
}

/** The pending placeholder for one section — `LiveTitleFactsClientFetch`'s own wait for
 *  its one combined fetch, and `LiveTitleFactsStreamed`'s `Suspense` fallback for each of
 *  its three. Same markup either way, so a reader cannot tell which mechanism is behind a
 *  given title from the loading frame alone. */
export function LiveFactPlaceholder({ heading }: { heading: string }) {
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
 * `initial` seeds `phase` at mount and nothing after — every caller keys this component
 * (or the component that owns it) by title, so a new title is a new mount with its own
 * `initial`, not a prop change an existing instance would have to reconcile. `loading` is
 * reached only from `retry`, a reader's own action; there is no `useEffect` here at all,
 * because there is no longer a fetch this component makes on its own account.
 *
 * Exported: `live-title-facts-streamed.tsx`'s three async Server Components each render
 * one of these, seeded from their own `Suspense`-awaited outcome, so retry — and the
 * inline-failure markup below — is identical whichever of the two mechanisms this
 * component's `LiveTitleFactsClientFetch`/`LiveTitleFactsStreamed` docblock describes.
 */
export function LiveFactSection<T>({
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
    return <LiveFactPlaceholder heading={heading} />;
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
